import { useRef } from "react";
import { Animated, PanResponder } from "react-native";

// Glisser-pour-fermer des feuilles du bas (demande Kylian) : on suit le doigt
// vers le bas, on ferme au-delà du seuil (distance OU vitesse), sinon retour
// élastique. Seuil de prise volontairement vertical pour laisser vivre les
// taps et les champs de saisie à l'intérieur.
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 0.8;
const EXIT_DISTANCE = 640;

export function useSheetDrag(onClose: () => void) {
  const translateY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

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
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > CLOSE_DISTANCE || gesture.vy > CLOSE_VELOCITY) {
          Animated.timing(translateY, {
            toValue: EXIT_DISTANCE,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            closeRef.current();
            translateY.setValue(0);
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return {
    panHandlers: panResponder.panHandlers,
    dragStyle: { transform: [{ translateY }] },
  };
}
