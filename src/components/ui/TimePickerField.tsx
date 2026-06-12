import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, radius, softShadow, spacing, typeScale, useThemeColors } from "@/constants/tokens";

type TimePickerFieldProps = {
  value: string | null; // "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
  /** Style compact pour les cartes pastel (fond translucide, encre). */
  compact?: boolean;
};

function toDate(value: string | null): Date {
  const d = new Date();
  if (value) {
    const [h, m] = value.split(":").map(Number);
    d.setHours(h || 9, m || 0, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Sélecteur d'heure natif (roue iOS / horloge Android) derrière une pilule. */
export function TimePickerField({
  value,
  onChange,
  placeholder = "--:--",
  compact = false,
}: TimePickerFieldProps) {
  const colors = useThemeColors();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => toDate(value));

  function open() {
    setDraft(toDate(value));
    setIsOpen(true);
  }

  function confirm() {
    onChange(toHHMM(draft));
    setIsOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={open}
        style={[
          styles.pill,
          compact
            ? styles.pillCompact
            : [{ backgroundColor: colors.surface }, softShadow],
        ]}
      >
        <Text
          style={[
            styles.value,
            { color: value ? (compact ? "#26210E" : colors.text) : colors.textMuted },
          ]}
        >
          {value ?? placeholder}
        </Text>
      </Pressable>

      {isOpen ? (
        Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
            <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />
            <View style={[styles.sheet, { backgroundColor: colors.surface }, softShadow]}>
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                minuteInterval={5}
                onChange={(_, date) => date && setDraft(date)}
                locale="fr-FR"
              />
              <Pressable onPress={confirm} style={[styles.confirm, { backgroundColor: colors.accent }]}>
                <Text style={[styles.confirmLabel, { color: colors.text }]}>Valider</Text>
              </Pressable>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={draft}
            mode="time"
            display="clock"
            onChange={(event, date) => {
              setIsOpen(false);
              if (event.type === "set" && date) onChange(toHHMM(date));
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
    minWidth: 88,
    alignItems: "center",
  },
  pillCompact: {
    backgroundColor: "rgba(255,255,255,0.7)",
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
