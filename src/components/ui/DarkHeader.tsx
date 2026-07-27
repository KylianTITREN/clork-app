import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, useThemeColors } from "@/constants/tokens";

// Header sombre v2 : fond encre #17150E, arrondi bas 36px, contenu sous la
// safe area. Utilisé par l'accueil, le profil et l'écran de connexion.
type DarkHeaderProps = PropsWithChildren<{
  style?: ViewStyle;
}>;

export function DarkHeader({ children, style }: DarkHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.ink, paddingTop: insets.top + spacing.sm },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
