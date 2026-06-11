import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { spacing, typeScale, useThemeColors } from "@/constants/tokens";

// Flow scan — construit en phase 3 (capture → extraction → validation).
export default function ScanScreen() {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Scanner</Text>
      </View>
      <View style={styles.empty}>
        <Ionicons name="camera-outline" size={56} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Bientôt là</Text>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          Prends le planning en photo, l'IA lit tes horaires et tu valides.
          Cette étape arrive dans la prochaine phase.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    fontSize: typeScale.title,
    fontWeight: "800",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: typeScale.heading,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: typeScale.body,
    textAlign: "center",
    lineHeight: 22,
  },
});
