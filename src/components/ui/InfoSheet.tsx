// Feuille du bas générique v2 (même langage que la porte Premium) : icône
// carrée accent, titre, texte, CTA + « Plus tard », glisser-pour-fermer.

import { Ionicons } from "@expo/vector-icons";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { useSheetDrag } from "@/components/ui/useSheetDrag";
import {
  fonts,
  letterSpacing,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

type InfoSheetProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  ctaLabel: string;
  onCta: () => void;
  onClose: () => void;
};

export function InfoSheet({ icon, title, text, ctaLabel, onCta, onClose }: InfoSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { panHandlers, grabberHandlers, dragStyle } = useSheetDrag(onClose);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdropFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
      />
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        {...panHandlers}
        style={[
          styles.sheet,
          dragStyle,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View {...grabberHandlers} style={styles.grabZone}>
          <View style={[styles.grabber, { backgroundColor: colors.surfaceMuted }]} />
        </View>
        <View style={[styles.iconBadge, { backgroundColor: colors.accent }]}>
          <Ionicons name={icon} size={22} color={colors.onAccent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>{text}</Text>
        <Button
          label={ctaLabel}
          style={{ alignSelf: "stretch" }}
          onPress={() => {
            onClose();
            onCta();
          }}
        />
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={[styles.later, { color: colors.textMuted }]}>Plus tard</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(23,21,14,0.4)",
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  grabZone: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 10,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  text: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  later: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
    paddingVertical: spacing.xs,
  },
});
