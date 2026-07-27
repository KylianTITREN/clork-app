import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import {
  fonts,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";

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

/** Sélecteur de date natif (roue iOS / calendrier Android) derrière une pilule v2. */
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
      <Pressable
        onPress={open}
        style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.value, { color: value ? colors.text : colors.textDisabled }]}>
          {value ? LABEL_FORMATTER.format(new Date(`${value}T12:00:00`)) : placeholder}
        </Text>
      </Pressable>

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
                mode="date"
                display="inline"
                minimumDate={minimumDate ? new Date(`${minimumDate}T00:00:00`) : undefined}
                onChange={(_, date) => date && setDraft(date)}
                locale="fr-FR"
              />
              <Button label="Valider" onPress={confirm} />
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
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minWidth: 110,
    alignItems: "center",
  },
  value: {
    fontSize: typeScale.body,
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
