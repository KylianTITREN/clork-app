import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import {
  fonts,
  shiftTypeColor,
  shiftTypeLabel,
  typeScale,
  useThemeColors,
  type ShiftType,
} from "@/constants/tokens";

// Ligne jour v2 — uniforme partout (accueil, semaine, récap wizard, suivis) :
// carré date 48px (jour 10.5 au-dessus, chiffre 17/700), une barre verticale
// colorée par créneau (primaire = travail, violet = réunion, gris = repos),
// horaire + libellé, durée payée à droite, chevron. Multi-créneaux : barres
// empilées dans la même carte. Repos : carte estompée (opacity .65).
// Jour non lu par le scan : « À compléter » en pointillé.

export type DayRowSlot = {
  start: string; // "HH:MM"
  end: string;
  type: ShiftType;
  /** Libellé à droite du créneau : « 7,5h » / « Réunion · 2h ». */
  paidLabel?: string;
};

type DayRowProps = {
  /** Libellé court du jour (« LUN ») + numéro (« 27 »). */
  dayLabel: string;
  dayNumber: string;
  slots: DayRowSlot[];
  /** off = repos estompé ; todo = « À compléter » pointillé. */
  status?: "work" | "off" | "todo";
  onPress?: () => void;
  /** Masque le chevron (listes en lecture seule — mode conjoint). */
  readOnly?: boolean;
  style?: ViewStyle;
};

const REST_BAR = "#C9C5B8";

export function DayRow({
  dayLabel,
  dayNumber,
  slots,
  status = "work",
  onPress,
  readOnly = false,
  style,
}: DayRowProps) {
  const colors = useThemeColors();
  const isOff = status === "off";
  const isTodo = status === "todo";

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: isOff ? 0.65 : 1,
        },
        isTodo && [styles.cardTodo, { borderColor: colors.textDisabled }],
        pressed && onPress ? styles.pressed : null,
        style,
      ]}
    >
      <View style={[styles.dateSquare, { backgroundColor: colors.background }]}>
        <Text style={[styles.dateDay, { color: colors.textMuted }]}>{dayLabel}</Text>
        <Text style={[styles.dateNumber, { color: colors.text }]}>{dayNumber}</Text>
      </View>

      <View style={styles.body}>
        {isTodo ? (
          <Text style={[styles.todoLabel, { color: colors.textMuted }]}>À compléter</Text>
        ) : isOff || slots.length === 0 ? (
          <View style={styles.slotRow}>
            <View style={[styles.slotBar, { backgroundColor: REST_BAR }]} />
            <Text style={[styles.restLabel, { color: colors.textMuted }]}>Repos</Text>
          </View>
        ) : (
          slots.map((slot, index) => (
            <View key={`${slot.start}-${index}`} style={styles.slotRow}>
              <View
                style={[styles.slotBar, { backgroundColor: shiftTypeColor[slot.type] }]}
              />
              <Text style={[styles.slotTime, { color: colors.text }]}>
                {slot.start} – {slot.end}
              </Text>
              <Text
                style={[
                  styles.slotMeta,
                  {
                    color:
                      slot.type === "work" ? colors.textMuted : shiftTypeColor[slot.type],
                  },
                ]}
              >
                {slot.paidLabel ?? shiftTypeLabel[slot.type]}
              </Text>
            </View>
          ))
        )}
      </View>

      {!readOnly && (
        <Text style={[styles.chevron, { color: isOff ? "#D5D1C4" : colors.textDisabled }]}>
          ›
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardTodo: {
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.85,
  },
  dateSquare: {
    width: 48,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  dateDay: {
    fontSize: 10.5,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
  },
  dateNumber: {
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: 5,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slotBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  slotTime: {
    flex: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  slotMeta: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
  },
  restLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  todoLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    fontStyle: "italic",
  },
  chevron: {
    alignSelf: "center",
    fontSize: 16,
    fontFamily: fonts.semiBold,
  },
});
