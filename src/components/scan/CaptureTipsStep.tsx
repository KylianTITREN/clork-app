import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

// Conseils de prise de vue, juste avant l'appareil photo. Ils ne sont pas
// décoratifs : le décalage d'une ligne à l'autre — chacune héritant des
// horaires de sa voisine — vient presque toujours d'une photo prise en biais.
// Quatre puces lues en trois secondes, pas une page d'aide.

type Tip = {
  icon: keyof typeof Ionicons.glyphMap;
  lead: string;
  text: string;
};

const TIPS: readonly Tip[] = [
  {
    icon: "documents-outline",
    lead: "Bien à plat.",
    text: "Sur une table, sans pli ni courbure.",
  },
  {
    icon: "phone-portrait-outline",
    lead: "Téléphone parallèle.",
    text: "Juste au-dessus de la feuille : de biais, les lignes se décalent.",
  },
  {
    icon: "sunny-outline",
    lead: "Lumière régulière.",
    text: "Ni ton ombre sur le papier, ni reflet.",
  },
  {
    icon: "scan-outline",
    lead: "Tout le tableau.",
    text: "Cadre serré, jusqu'à la colonne des totaux.",
  },
];

type CaptureTipsStepProps = {
  /** Message d'entrée (photo précédente illisible, lecture jetée…). */
  notice: string | null;
  onCamera: () => void;
  onLibrary: () => void;
};

export function CaptureTipsStep({ notice, onCamera, onLibrary }: CaptureTipsStepProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>Prends la photo</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Trois secondes de cadrage évitent des horaires faux.
        </Text>

        {notice ? (
          <View
            style={[
              styles.notice,
              { backgroundColor: colors.shiftCpSoft, borderColor: colors.shiftCp },
            ]}
          >
            <Ionicons name="camera-outline" size={18} color={colors.shiftCp} />
            <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          </View>
        ) : null}

        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
            Pour une lecture fiable
          </Text>
          {TIPS.map((tip) => (
            <View key={tip.icon} style={styles.tipRow}>
              <View style={[styles.tipIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name={tip.icon} size={16} color={colors.accentDeep} />
              </View>
              <Text style={[styles.tipText, { color: colors.textSoft }]}>
                <Text style={[styles.tipLead, { color: colors.text }]}>{tip.lead}</Text>{" "}
                {tip.text}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Coussin bas : les CTA ne collent jamais au bord de l'écran */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button label="Prendre une photo" onPress={onCamera} />
        <Button label="Choisir dans la galerie" variant="secondary" onPress={onLibrary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginBottom: spacing.xs,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 12,
  },
  cardLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  tipIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tipText: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    lineHeight: 19,
  },
  tipLead: {
    fontFamily: fonts.bold,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
});
