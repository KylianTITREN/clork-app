// Bottom-sheet « Nouveau type » (maquette v2) : l'utilisateur crée un type de
// créneau personnalisé (nom + payé/non payé) proposé ensuite partout où l'on
// choisit un type de journée. Exporte aussi TypeChipsRow, la rangée de chips
// de type partagée (types standards + persos + chip pointillée « + Autre… »)
// pour garder le même langage visuel dans l'éditeur de jour et le wizard.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { pressOpacity } from "@/components/ui/press";
import { useSheetDrag } from "@/components/ui/useSheetDrag";
import { createCustomType, type CustomShiftType } from "@/lib/custom-types-service";

const SHEET_TOP_RADIUS = 20;
const BACKDROP_COLOR = "rgba(23,21,14,0.4)";

// --- Rangée de chips de type (standards + persos + « + Autre… ») ---------------

export type TypeChipOption = {
  /** Clé de rendu stable (type natif ou `custom-<id>`). */
  key: string;
  label: string;
  selected: boolean;
  onPress: () => void;
};

type TypeChipsRowProps = {
  options: TypeChipOption[];
  /** Ouvre la feuille « Nouveau type » (chip pointillée « + Autre… »). */
  onAddPress: () => void;
};

/**
 * Chips de type à sélection ENCRE (même langage que ChoiceChips) suivies de la
 * chip pointillée « + Autre… » qui crée un type personnalisé.
 */
export function TypeChipsRow({ options, onAddPress }: TypeChipsRowProps) {
  const colors = useThemeColors();

  return (
    <View style={styles.chipsRow}>
      {options.map(({ key, label, selected, onPress }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => {
            // Choisir un type est une décision : on la confirme au doigt.
            void Haptics.selectionAsync();
            onPress();
          }}
          style={({ pressed }) => [
            styles.chip,
            selected
              ? { backgroundColor: colors.ink, borderColor: colors.ink }
              : { backgroundColor: colors.surface, borderColor: colors.border },
            { opacity: pressed ? pressOpacity.control : 1 },
          ]}
        >
          <Text
            style={[
              styles.chipLabel,
              selected
                ? [styles.chipLabelSelected, { color: colors.onInk }]
                : { color: colors.textSoft },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Créer un type personnalisé"
        onPress={onAddPress}
        style={({ pressed }) => [
          styles.chip,
          styles.addChip,
          { borderColor: colors.border, opacity: pressed ? pressOpacity.control : 1 },
        ]}
      >
        <Text style={[styles.chipLabel, { color: colors.textMuted }]}>+ Autre…</Text>
      </Pressable>
    </View>
  );
}

// --- Feuille « Nouveau type » ---------------------------------------------------

type TypeSheetProps = {
  onClose: () => void;
  /** Type créé en base — au parent de le sélectionner et de fermer la feuille. */
  onCreated: (customType: CustomShiftType) => void;
};

export function TypeSheet({ onClose, onCreated }: TypeSheetProps) {
  const colors = useThemeColors();
  // animateIn : la feuille pilote son entrée (Modal en `none`) pour que le
  // voile puisse fondre au lieu de monter avec elle.
  const { panHandlers, grabberHandlers, dragStyle, backdropStyle, requestClose } = useSheetDrag(
    onClose,
    { animateIn: true },
  );
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const trimmedName = name.trim();

  async function handleCreate() {
    if (!trimmedName || isCreating) return;
    setIsCreating(true);
    try {
      const created = await createCustomType(trimmedName, isPaid);
      // Le type est écrit en base : on le signale au doigt avant de rendre
      // la main au parent (qui sélectionne le type et ferme la feuille).
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(created);
    } catch (error) {
      Alert.alert(
        "Création impossible",
        error instanceof Error ? error.message : "Erreur inconnue — réessaie.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    // `animationType="none"` : l'entrée est jouée ici (voile en fondu, feuille
    // qui glisse) — le slide natif déplaçait le voile avec la feuille.
    <Modal visible transparent animationType="none" onRequestClose={requestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {/* Voile pur décor : la zone tappable est le `backdrop` au-dessus. */}
        <Animated.View style={[styles.backdropFill, backdropStyle]} pointerEvents="none" />
        <Pressable
          style={styles.backdrop}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />

        <Animated.View
          {...panHandlers}
          style={[
            styles.sheet,
            dragStyle,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <View {...grabberHandlers} style={styles.grabZone}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>Nouveau type</Text>
            <Pressable
              onPress={requestClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? pressOpacity.control : 1,
                },
              ]}
            >
              <Ionicons name="close" size={16} color={colors.text} />
            </Pressable>
          </View>

          {/* Nom du type */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Nom du type</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="Astreinte"
              placeholderTextColor={colors.textDisabled}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
          </View>

          {/* Rangée toggle payé / non payé */}
          <View
            style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Compte dans les heures payées
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                Désactivé : affiché sans durée, comme Repos
              </Text>
            </View>
            <Switch
              value={isPaid}
              onValueChange={setIsPaid}
              trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
            />
          </View>

          {/* Encart info */}
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[styles.infoDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.infoText, { color: colors.textSoft }]}>
              Ajouté à tes types — proposé partout et reconnu au scan.
            </Text>
          </View>

          <Button
            label="Créer le type"
            onPress={handleCreate}
            disabled={!trimmedName}
            isLoading={isCreating}
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdropFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BACKDROP_COLOR,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: SHEET_TOP_RADIUS,
    borderTopRightRadius: SHEET_TOP_RADIUS,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: 14,
    overflow: "hidden",
  },
  grabZone: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: radius.pill,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typeScale.body,
    fontFamily: fonts.medium,
    minHeight: 52,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md - 2,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  rowSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 17,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md - 2,
  },
  infoDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  infoText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 17,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  chipLabelSelected: {
    fontFamily: fonts.semiBold,
  },
  addChip: {
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
});
