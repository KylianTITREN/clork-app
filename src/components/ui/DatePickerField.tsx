import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, radius, softShadow, spacing, typeScale, useThemeColors } from "@/constants/tokens";

type DatePickerFieldProps = {
  value: string | null; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: string; // "YYYY-MM-DD"
};

function toDate(value: string | null, fallback: string | undefined): Date {
  const source = value ?? fallback;
  return source ? new Date(`${source}T12:00:00`) : new Date();
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const LABEL_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Sélecteur de date natif (roue iOS / calendrier Android) derrière une pilule. */
export function DatePickerField({
  value,
  onChange,
  placeholder = "Choisir…",
  minimumDate,
}: DatePickerFieldProps) {
  const colors = useThemeColors();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => toDate(value, minimumDate));

  function open() {
    setDraft(toDate(value, minimumDate));
    setIsOpen(true);
  }

  function confirm() {
    onChange(toIso(draft));
    setIsOpen(false);
  }

  return (
    <>
      <Pressable onPress={open} style={[styles.pill, { backgroundColor: colors.surface }, softShadow]}>
        <Text style={[styles.value, { color: value ? colors.text : colors.textMuted }]}>
          {value ? LABEL_FORMATTER.format(new Date(`${value}T12:00:00`)) : placeholder}
        </Text>
      </Pressable>

      {isOpen ? (
        Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
            <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />
            <View style={[styles.sheet, { backgroundColor: colors.surface }, softShadow]}>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                minimumDate={minimumDate ? new Date(`${minimumDate}T00:00:00`) : undefined}
                onChange={(_, date) => date && setDraft(date)}
                locale="fr-FR"
              />
              <Pressable onPress={confirm} style={[styles.confirm, { backgroundColor: colors.accent }]}>
                <Text style={[styles.confirmLabel, { color: colors.onAccent }]}>Valider</Text>
              </Pressable>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={draft}
            mode="date"
            display="calendar"
            minimumDate={minimumDate ? new Date(`${minimumDate}T00:00:00`) : undefined}
            onChange={(event, date) => {
              setIsOpen(false);
              if (event.type === "set" && date) onChange(toIso(date));
            }}
          />
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 110,
    alignItems: "center",
  },
  value: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
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
    padding: spacing.md,
    gap: spacing.sm,
  },
  confirm: {
    borderRadius: radius.pill,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
  },
  confirmLabel: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
});
