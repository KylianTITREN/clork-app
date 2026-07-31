// Le scanner de documents iOS (VisionKit) laisse enchaîner autant de pages
// qu'on veut — Apple n'expose aucune limite, `maxNumDocuments` ne vaut que
// pour Android. On ne peut donc pas brider la capture ; on rend la suite
// claire : quand plusieurs pages reviennent, c'est l'utilisatrice qui dit
// laquelle lire, au lieu de garder la première en silence.

import { Ionicons } from "@expo/vector-icons";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pressOpacity } from "@/components/ui/press";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

type PageChoiceSheetProps = {
  pages: string[];
  onPick: (uri: string) => void;
  onCancel: () => void;
};

export function PageChoiceSheet({ pages, onPick, onCancel }: PageChoiceSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: insets.top + spacing.md },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Annuler"
            onPress={onCancel}
            hitSlop={10}
            style={({ pressed }) => [
              styles.close,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? pressOpacity.control : 1,
              },
            ]}
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>
              {pages.length} photos scannées
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Laquelle contient ton planning ? On n'en lit qu'une.
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {pages.map((uri, index) => (
            <Pressable
              key={uri}
              accessibilityRole="button"
              accessibilityLabel={`Utiliser la photo ${index + 1}`}
              onPress={() => onPick(uri)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? pressOpacity.surface : 1,
                },
              ]}
            >
              <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
              <View style={styles.cardFooter}>
                <Text style={[styles.cardLabel, { color: colors.text }]}>
                  Photo {index + 1}
                  {index === pages.length - 1 ? " · la plus récente" : ""}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 2 },
  title: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  subtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  preview: {
    width: "100%",
    height: 190,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  cardLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
});
