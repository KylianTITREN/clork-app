// Splash « Hello v2 » (maquette 4h) : plein écran ENCRE, le mot « hello »
// dont le o EST le logo — cadran mordu qui pop en spring, aiguille qui fait
// un tour complet (−293° → 67°, même position visuelle au départ et à
// l'arrivée) — bokeh de confettis aux couleurs des thèmes, puis les textes
// et le bouton « Découvrir ». Joue UNE fois au premier lancement de la
// v2.0.0 (clé de campagne), rejouable en easter egg via triggerUpdateSplash()
// (tirage élastique sur l'accueil) — et n'existe QUE sur la 2.0.0 : en
// 2.0.x+ le splash comme l'easter egg disparaissent (demande Kylian).
// Pont host/trigger sur le même motif que PremiumGateSheet/plan-service.

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated as RNAnimated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { fonts, useThemeColors } from "@/constants/tokens";

// --- Campagne : uniquement la 2.0.0 -------------------------------------------
const CAMPAIGN_KEY = "clork.splash-campaign";
const CAMPAIGN_VERSION = "2.0.0";
const IS_SPLASH_VERSION = (Constants.expoConfig?.version ?? "") === CAMPAIGN_VERSION;

// --- Chronologie (ms) — timings de la maquette 4h ------------------------------
const LETTER_DELAYS = [150, 250, 350, 450] as const; // h·e·l·l (v2up 400 ms)
const LETTER_RISE_MS = 400;
const LOGO_DELAY = 700; // le o pop en spring…
const LOGO_POP_MS = 700; // …cubic-bezier(.34,1.56,.64,1)
const HAND_DELAY = 1200;
const HAND_SWEEP_MS = 1100; // tour complet, cubic-bezier(.22,1,.36,1)
const HAND_FROM_DEG = -293;
const HAND_TO_DEG = 67;
const TEXT_DELAYS = { line1: 2200, line2: 2500, cta: 2850, version: 3050 } as const;
const TEXT_RISE_MS = 500;
const CONFETTI_POP_MS = 500;
const EXIT_MS = 250;
const RISE_FROM = 16; // translateY de départ (v2up)

// --- Le o-logo (42 px, géométrie de la maquette) --------------------------------
const O_SIZE = 42;
// Encoche : triangle de demi-base 12 pointant du centre vers 3h.
const NOTCH_PATH = `M ${O_SIZE / 2} ${O_SIZE / 2} L ${O_SIZE} ${O_SIZE / 2 - 12} L ${O_SIZE} ${O_SIZE / 2 + 12} Z`;
// Aiguille : barre crème 3×26 cerclée d'encre (2 px), pivot au centre du cadran.
const HAND_W = 3;
const HAND_LEN = 26;
const HAND_RING = 2;

// --- Bokeh : les pastels des thèmes de l'app (maquette + 2 bonus discrets) -----
type ConfettiSpec = {
  size: number;
  color: string;
  square?: boolean;
  rotate?: number;
  delay: number;
  opacity?: number;
  position: ViewStyle;
};
const CONFETTI: ConfettiSpec[] = [
  { size: 9, color: "#FFD877", square: true, delay: 1900, position: { top: -16, left: -22 } },
  { size: 8, color: "#FBC7DB", delay: 2000, position: { top: 6, right: -26 } },
  { size: 7, color: "#A9DCEF", delay: 2100, position: { bottom: -10, left: -14 } },
  {
    size: 9,
    color: "#7BC79C",
    square: true,
    rotate: 20,
    delay: 2050,
    position: { bottom: 8, right: -18 },
  },
  // Bonus « amuse-toi » : deux poussières plus discrètes, en retrait.
  { size: 5, color: "#FFD877", delay: 2350, opacity: 0.65, position: { top: -30, right: 14 } },
  { size: 5, color: "#FBC7DB", delay: 2450, opacity: 0.55, position: { bottom: -24, left: 30 } },
];

// --- Textes (maquette) ----------------------------------------------------------
const LINE1_BEFORE = "Bienvenue dans la ";
const LINE1_STRONG = "nouvelle version";
const LINE1_AFTER = " de Clork.";
const LINE2 = "Have fun & good work now !";
const CTA_LABEL = "Découvrir";
const VERSION_LABEL = `v${CAMPAIGN_VERSION}`;

// --- Pont host ⇄ déclencheur (même motif que plan-service) ---------------------
let splashListener: (() => void) | null = null;

/** Rejoue le splash (easter egg) — 2.0.0 seulement, sans toucher la clé. */
export function triggerUpdateSplash(): void {
  if (!IS_SPLASH_VERSION) return;
  splashListener?.();
}

/**
 * Host monté une fois dans le layout (tabs). Au montage : si l'app est en
 * 2.0.0 et que la campagne n'a pas été vue, joue le splash puis marque la clé.
 */
export function UpdateSplashHost() {
  const [visible, setVisible] = useState(false);
  // Vrai uniquement pour la lecture « première fois » : elle seule écrit la clé.
  const [isCampaignRun, setIsCampaignRun] = useState(false);

  useEffect(() => {
    splashListener = () => setVisible(true);
    return () => {
      splashListener = null;
    };
  }, []);

  useEffect(() => {
    if (!IS_SPLASH_VERSION) return;
    AsyncStorage.getItem(CAMPAIGN_KEY)
      .then((seen) => {
        if (seen !== CAMPAIGN_VERSION) {
          setIsCampaignRun(true);
          setVisible(true);
        }
      })
      .catch(() => {
        // Stockage illisible : ne pas bloquer l'accueil pour un splash.
      });
  }, []);

  const handleDone = useCallback(() => {
    setVisible(false);
    if (isCampaignRun) {
      setIsCampaignRun(false);
      AsyncStorage.setItem(CAMPAIGN_KEY, CAMPAIGN_VERSION).catch(() => {});
    }
  }, [isCampaignRun]);

  if (!visible) return null;
  return <UpdateSplash onDone={handleDone} />;
}

// --- Scène ----------------------------------------------------------------------
type UpdateSplashProps = {
  onDone: () => void;
};

function UpdateSplash({ onDone }: UpdateSplashProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  // Réduction des animations (réglage système) : tout affiché d'emblée.
  const isReduced = useReducedMotion();
  const isClosing = useRef(false);

  const rootOpacity = useSharedValue(1);
  // Le o : progression 0→1 (scale + rotation −40°→0, la courbe dépasse 1 pour
  // reproduire le rebond 1.18/0.94 des keyframes CSS).
  const logoPop = useSharedValue(isReduced ? 1 : 0);
  const handDeg = useSharedValue(isReduced ? HAND_TO_DEG : HAND_FROM_DEG);

  useEffect(() => {
    if (isReduced) return;
    logoPop.value = withDelay(
      LOGO_DELAY,
      withTiming(1, { duration: LOGO_POP_MS, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
    );
    handDeg.value = withDelay(
      HAND_DELAY,
      withTiming(HAND_TO_DEG, {
        duration: HAND_SWEEP_MS,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      }),
    );
  }, [isReduced, logoPop, handDeg]);

  const close = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    if (isReduced) {
      onDone();
      return;
    }
    rootOpacity.value = withTiming(
      0,
      { duration: EXIT_MS, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(onDone)();
      },
    );
  }, [isReduced, onDone, rootOpacity]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoPop.value <= 0 ? 0 : 1,
    transform: [{ scale: logoPop.value }, { rotate: `${-40 * (1 - logoPop.value)}deg` }],
  }));
  const handStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${handDeg.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.root, { backgroundColor: colors.ink }, rootStyle]}>
      {/* Le fond reste cliquable (fermeture de secours), le CTA est la voie royale. */}
      <Pressable style={styles.pressArea} onPress={close} accessibilityLabel="Fermer">
        <View style={styles.scene}>
          {/* « hello » + bokeh ancrés sur le mot, comme la maquette. */}
          <View style={styles.wordWrap}>
            {CONFETTI.map((spec, index) => (
              <ConfettiDot key={index} spec={spec} isReduced={isReduced} />
            ))}
            <View style={styles.wordRow}>
              {["h", "e", "l", "l"].map((letter, index) => (
                <RiseIn
                  key={index}
                  delay={LETTER_DELAYS[index]}
                  duration={LETTER_RISE_MS}
                  isReduced={isReduced}
                >
                  <Text style={[styles.letter, { color: colors.onInk }]}>{letter}</Text>
                </RiseIn>
              ))}
              {/* Le o-logo : cadran mordu + aiguille (tour complet). */}
              <Animated.View style={[styles.oLogo, logoStyle]}>
                <Svg width={O_SIZE} height={O_SIZE} viewBox={`0 0 ${O_SIZE} ${O_SIZE}`}>
                  <Circle cx={O_SIZE / 2} cy={O_SIZE / 2} r={O_SIZE / 2} fill={colors.accent} />
                  <Path d={NOTCH_PATH} fill={colors.ink} />
                </Svg>
                <Animated.View style={[styles.handWrap, handStyle]}>
                  <View style={[styles.handRing, { backgroundColor: colors.ink }]}>
                    <View style={[styles.handBar, { backgroundColor: colors.onInk }]} />
                  </View>
                </Animated.View>
              </Animated.View>
            </View>
          </View>

          <RiseIn delay={TEXT_DELAYS.line1} duration={TEXT_RISE_MS} isReduced={isReduced}>
            <Text style={styles.line1}>
              {LINE1_BEFORE}
              <Text style={[styles.line1Strong, { color: colors.onInk }]}>{LINE1_STRONG}</Text>
              {LINE1_AFTER}
            </Text>
          </RiseIn>
          <RiseIn delay={TEXT_DELAYS.line2} duration={TEXT_RISE_MS} isReduced={isReduced}>
            <Text style={[styles.line2, { color: colors.accentSoft }]}>{LINE2}</Text>
          </RiseIn>
          <RiseIn delay={TEXT_DELAYS.cta} duration={TEXT_RISE_MS} isReduced={isReduced}>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.ctaLabel}>{CTA_LABEL}</Text>
            </Pressable>
          </RiseIn>
          <RiseIn delay={TEXT_DELAYS.version} duration={TEXT_RISE_MS} isReduced={isReduced}>
            <Text style={styles.version}>{VERSION_LABEL}</Text>
          </RiseIn>
        </View>
        {/* Coussin bas : garde la composition centrée au-dessus de la home bar. */}
        <View style={{ height: insets.bottom }} />
      </Pressable>
    </Animated.View>
  );
}

// --- Teaser du tirage (façon fantôme Snapchat) ----------------------------------
// Monté dans l'accueil, branché sur le MÊME Animated.Value RN que le repli du
// hero : pendant l'étirement élastique le o-logo apparaît, l'aiguille suit le
// doigt et boucle son tour PILE au seuil de déclenchement (−110) — où le
// listener de l'accueil lance le splash. 2.0.0 seulement, comme le reste.
const TEASER_SIZE = 60;
const TEASER_NOTCH = `M ${TEASER_SIZE / 2} ${TEASER_SIZE / 2} L ${TEASER_SIZE} ${TEASER_SIZE / 2 - 17} L ${TEASER_SIZE} ${TEASER_SIZE / 2 + 17} Z`;
const TEASER_HAND_W = 4;
const TEASER_HAND_LEN = 37;
const TEASER_HAND_RING = 3;
// Début d'apparition / seuil (aligné sur SPLASH_PULL_TRIGGER de l'accueil).
const TEASER_START = -24;
const TEASER_FULL = -110;

export function PullSplashTeaser({
  scrollY,
  topOffset,
}: {
  scrollY: RNAnimated.Value;
  topOffset: number;
}) {
  const colors = useThemeColors();
  if (!IS_SPLASH_VERSION) return null;

  const opacity = scrollY.interpolate({
    inputRange: [TEASER_FULL, TEASER_START, 0],
    outputRange: [1, 0, 0],
    extrapolate: "clamp",
  });
  const scale = scrollY.interpolate({
    inputRange: [TEASER_FULL, TEASER_START],
    outputRange: [1, 0.35],
    extrapolate: "clamp",
  });
  // Descend doucement dans l'espace révélé quand on tire plus fort que le seuil.
  const translateY = scrollY.interpolate({
    inputRange: [TEASER_FULL - 80, TEASER_START],
    outputRange: [22, -6],
    extrapolate: "clamp",
  });
  // Un tour complet du doigt : −293° au repos → 67° pile au seuil (comme le splash).
  const handRotate = scrollY.interpolate({
    inputRange: [TEASER_FULL, TEASER_START],
    outputRange: ["67deg", "-293deg"],
    extrapolate: "clamp",
  });

  const ringSize = TEASER_HAND_W + 2 * TEASER_HAND_RING;
  return (
    <RNAnimated.View
      pointerEvents="none"
      style={[
        styles.teaser,
        { top: topOffset, opacity, transform: [{ translateY }, { scale }] },
      ]}
    >
      <View style={styles.teaserLogo}>
        <Svg width={TEASER_SIZE} height={TEASER_SIZE} viewBox={`0 0 ${TEASER_SIZE} ${TEASER_SIZE}`}>
          <Circle
            cx={TEASER_SIZE / 2}
            cy={TEASER_SIZE / 2}
            r={TEASER_SIZE / 2}
            fill={colors.accent}
          />
          <Path d={TEASER_NOTCH} fill={colors.background} />
        </Svg>
        <RNAnimated.View
          style={{
            position: "absolute",
            left: TEASER_SIZE / 2 - ringSize / 2,
            bottom: TEASER_SIZE / 2,
            width: ringSize,
            height: TEASER_HAND_LEN + 2 * TEASER_HAND_RING,
            transformOrigin: "50% 100%",
            transform: [{ rotate: handRotate }],
          }}
        >
          <View
            style={{
              flex: 1,
              alignItems: "center",
              borderRadius: ringSize / 2,
              backgroundColor: colors.background,
            }}
          >
            <View
              style={{
                width: TEASER_HAND_W,
                height: TEASER_HAND_LEN,
                borderRadius: TEASER_HAND_W / 2,
                backgroundColor: colors.ink,
                marginTop: TEASER_HAND_RING,
              }}
            />
          </View>
        </RNAnimated.View>
      </View>
    </RNAnimated.View>
  );
}

// --- Sous-composants animés ------------------------------------------------------

/** v2up : fade + translateY 16→0, ease-out. */
function RiseIn({
  delay,
  duration,
  isReduced,
  children,
}: {
  delay: number;
  duration: number;
  isReduced: boolean;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(isReduced ? 1 : 0);

  useEffect(() => {
    if (isReduced) return;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [isReduced, delay, duration, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: RISE_FROM * (1 - progress.value) }],
  }));

  return <Animated.View style={animated}>{children}</Animated.View>;
}

/** v2conf : pop scale 0→1.25→1 + fade, puis flottement discret (bokeh vivant). */
function ConfettiDot({ spec, isReduced }: { spec: ConfettiSpec; isReduced: boolean }) {
  const pop = useSharedValue(isReduced ? 1 : 0);
  const float = useSharedValue(0);

  useEffect(() => {
    if (isReduced) return;
    pop.value = withDelay(
      spec.delay,
      withSequence(
        withTiming(1.25, { duration: CONFETTI_POP_MS * 0.7, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: CONFETTI_POP_MS * 0.3 }),
      ),
    );
    float.value = withDelay(
      spec.delay + CONFETTI_POP_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [isReduced, spec.delay, pop, float]);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(pop.value, 1) * (spec.opacity ?? 1),
    transform: [
      { translateY: interpolate(float.value, [0, 1], [1.5, -1.5]) },
      { scale: pop.value },
      { rotate: `${spec.rotate ?? 0}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        spec.position,
        {
          width: spec.size,
          height: spec.size,
          borderRadius: spec.square ? 3 : spec.size / 2,
          backgroundColor: spec.color,
        },
        animated,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Au-dessus de tout le contenu de l'app (hors modales natives).
    zIndex: 9999,
    elevation: 24,
  },
  pressArea: {
    flex: 1,
  },
  scene: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 26,
  },
  wordWrap: {
    marginBottom: 4,
  },
  wordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  letter: {
    fontSize: 56,
    fontFamily: fonts.bold,
    letterSpacing: -2,
  },
  oLogo: {
    width: O_SIZE,
    height: O_SIZE,
    marginHorizontal: 4,
  },
  handWrap: {
    // Pivote autour du centre du cadran (origine = base de la barre).
    position: "absolute",
    left: O_SIZE / 2 - (HAND_W + 2 * HAND_RING) / 2,
    bottom: O_SIZE / 2,
    width: HAND_W + 2 * HAND_RING,
    height: HAND_LEN + 2 * HAND_RING,
    transformOrigin: "50% 100%",
  },
  handRing: {
    flex: 1,
    borderRadius: (HAND_W + 2 * HAND_RING) / 2,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: HAND_RING,
  },
  handBar: {
    width: HAND_W,
    height: HAND_LEN,
    borderRadius: HAND_W / 2,
  },
  confetti: {
    position: "absolute",
  },
  teaser: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 40,
  },
  teaserLogo: {
    width: TEASER_SIZE,
    height: TEASER_SIZE,
  },
  line1: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: "rgba(247,246,242,0.75)",
    textAlign: "center",
    lineHeight: 22,
  },
  line1Strong: {
    fontFamily: fonts.bold,
  },
  line2: {
    fontSize: 14.5,
    fontFamily: fonts.bold,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 46,
    marginTop: 12,
  },
  ctaLabel: {
    fontSize: 14.5,
    fontFamily: fonts.semiBold,
    color: "#FFFFFF",
  },
  version: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: "rgba(247,246,242,0.35)",
  },
});
