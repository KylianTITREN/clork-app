import { useEffect, useRef } from "react";
import { Animated, Easing, PanResponder } from "react-native";

// Glisser-pour-fermer des feuilles du bas (demande Kylian) : on suit le doigt
// vers le bas, on ferme au-delà du seuil (distance OU vitesse), sinon retour
// élastique. Seuil de prise volontairement vertical pour laisser vivre les
// taps et les champs de saisie à l'intérieur.
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 0.8;
const EXIT_DISTANCE = 640;

// Entrée/sortie : le voile FOND pendant que la feuille GLISSE. Avec
// l'animation `slide` du Modal RN, le voile était translaté avec la feuille —
// le noir « montait » du bas au lieu d'assombrir la scène en place.
const BACKDROP_IN_MS = 200;
const BACKDROP_OUT_MS = 160;
const SHEET_IN_MS = 280;
const SHEET_OUT_MS = 180;

type SheetDragOptions = {
  /**
   * La feuille pilote elle-même son entrée (Modal en `animationType="none"`).
   * Reste à false pour les feuilles encore portées par le slide natif du Modal,
   * sinon l'entrée jouerait deux fois.
   */
  animateIn?: boolean;
};

export function useSheetDrag(onClose: () => void, { animateIn = false }: SheetDragOptions = {}) {
  const translateY = useRef(new Animated.Value(animateIn ? EXIT_DISTANCE : 0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Une seule sortie possible : sans garde, un glisser suivi d'un tap sur le
  // voile déclencherait deux fois onClose pendant l'animation.
  const isClosingRef = useRef(false);

  useEffect(() => {
    const entrance: Animated.CompositeAnimation[] = [
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: BACKDROP_IN_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ];
    if (animateIn) {
      entrance.push(
        Animated.timing(translateY, {
          toValue: 0,
          duration: SHEET_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      );
    }
    Animated.parallel(entrance).start();
  }, [animateIn, backdropOpacity, translateY]);

  // Ne lit que des refs et des Animated.Value : la capture par les
  // PanResponder (créés une seule fois) reste valide à chaque rendu.
  function closeWithAnimation() {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: EXIT_DISTANCE,
        duration: SHEET_OUT_MS,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: BACKDROP_OUT_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      closeRef.current();
      isClosingRef.current = false;
      translateY.setValue(0);
    });
  }

  function handleRelease(gesture: { dy: number; vy: number }) {
    if (gesture.dy > CLOSE_DISTANCE || gesture.vy > CLOSE_VELOCITY) {
      closeWithAnimation();
    } else {
      Animated.spring(translateY, { toValue: 0, friction: 8, useNativeDriver: true }).start();
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      // Variante CAPTURE : sans elle, un doigt posé sur un bouton/champ de la
      // feuille donne le geste à l'enfant et le glisser ne démarre jamais.
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => handleRelease(gesture),
    }),
  ).current;

  // Zone de préhension (grabber élargi) : claim dès le TOUCHER — c'est la
  // méthode fiable, la négociation move-capture restant un plan B sur le corps.
  const grabberResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => handleRelease(gesture),
    }),
  ).current;

  return {
    panHandlers: panResponder.panHandlers,
    grabberHandlers: grabberResponder.panHandlers,
    dragStyle: { transform: [{ translateY }] },
    /** Opacité du voile — à poser sur l'Animated.View de fond (fondu). */
    backdropStyle: { opacity: backdropOpacity },
    /** Fermeture animée : bouton ✕, tap sur le voile, retour matériel. */
    requestClose: closeWithAnimation,
  };
}
