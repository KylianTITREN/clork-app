import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { pressOpacity } from "@/components/ui/press";
import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { dateToTime, timeToDate } from "@/lib/dates";

type TimePickerFieldProps = {
  value: string | null; // "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
  /** Libellé du champ (« Début », « Fin », « Débute à ») pour card/row. */
  label?: string;
  /**
   * Variantes v2 :
   * - pill (défaut) : pilule blanche bordée, chiffres bold ;
   * - card : carte centrée, libellé au-dessus du chiffre géant (Début/Fin) ;
   * - row : rangée pleine largeur, libellé à gauche, heure à droite (Débute à).
   */
  variant?: "pill" | "card" | "row";
};

/** Sélecteur d'heure natif (roue iOS / horloge Android) derrière un champ v2. */
export function TimePickerField({
  value,
  onChange,
  placeholder = "--:--",
  label,
  variant = "pill",
}: TimePickerFieldProps) {
  const colors = useThemeColors();
  const [isOpen, setIsOpen] = useState(false);
  // timeToDate/dateToTime partagés : la copie locale faisait `setHours(h || 9)`
  // et remontait donc 00:30 à 09:30 (minuit est falsy).
  const [draft, setDraft] = useState<Date>(() => timeToDate(value));

  function open() {
    setDraft(timeToDate(value));
    setIsOpen(true);
  }

  function confirm() {
    void Haptics.selectionAsync();
    onChange(dateToTime(draft));
    setIsOpen(false);
  }

  const surfaceStyle = { backgroundColor: colors.surface, borderColor: colors.border };
  const valueColor = value ? colors.text : colors.textDisabled;

  return (
    <>
      {variant === "card" ? (
        <Pressable
          onPress={open}
          style={({ pressed }) => [
            styles.card,
            surfaceStyle,
            { opacity: pressed ? pressOpacity.surface : 1 },
          ]}
        >
          {label ? (
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
          ) : null}
          <Text style={[styles.cardValue, { color: valueColor }]}>{value ?? placeholder}</Text>
        </Pressable>
      ) : variant === "row" ? (
        <Pressable
          onPress={open}
          style={({ pressed }) => [
            styles.rowField,
            surfaceStyle,
            { opacity: pressed ? pressOpacity.surface : 1 },
          ]}
        >
          {label ? (
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
          ) : null}
          <View style={styles.rowValueBox}>
            <Text style={[styles.rowValue, { color: valueColor }]}>{value ?? placeholder}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.textDisabled} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={open}
          style={({ pressed }) => [
            styles.pill,
            surfaceStyle,
            { opacity: pressed ? pressOpacity.surface : 1 },
          ]}
        >
          <Text style={[styles.pillValue, { color: valueColor }]}>{value ?? placeholder}</Text>
        </Pressable>
      )}

      {isOpen ? (
        Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
            <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />
            <View
              style={[
                styles.sheet,
                { backgroundColor: colors.surface, borderColor: colors.border },
                softShadow,
              ]}
            >
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                minuteInterval={5}
                onChange={(_, date) => date && setDraft(date)}
                locale="fr-FR"
              />
              <Button label="Valider" onPress={confirm} />
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={draft}
            mode="time"
            display="clock"
            onChange={(event, date) => {
              setIsOpen(false);
              if (event.type === "set" && date) {
                void Haptics.selectionAsync();
                onChange(dateToTime(date));
              }
            }}
          />
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  pill: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minWidth: 88,
    alignItems: "center",
  },
  pillValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 2,
  },
  cardValue: {
    fontSize: 24,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  rowField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  rowValueBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  rowValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xxl,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
