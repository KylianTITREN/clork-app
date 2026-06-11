import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { spacing, typeScale, useThemeColors } from "@/constants/tokens";

// Vue Semaine — construite en phase 4 (calendrier, totaux, édition).
// Pour l'instant : état vide qui oriente vers le scan.
export default function WeekScreen() {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Ma semaine</Text>
      </View>
      <View style={styles.empty}>
        <Ionicons name="calendar-clear-outline" size={56} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Aucun horaire pour l'instant
        </Text>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          Scanne le planning affiché au magasin depuis l'onglet Scanner : tes
          horaires apparaîtront ici.
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
