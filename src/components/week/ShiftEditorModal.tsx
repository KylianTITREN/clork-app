import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import {
  radius,
  shiftTypeColor,
  shiftTypeLabel,
  spacing,
  typeScale,
  useThemeColors,
  type ShiftType,
} from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/types";

const DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const TYPES: ShiftType[] = ["work", "off", "rh", "cp", "leave", "meeting"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type EditorTarget =
  | { mode: "edit"; shift: Shift }
  | { mode: "create"; date: string; userId: string };

type ShiftEditorModalProps = {
  target: EditorTarget | null;
  onClose: (didChange: boolean) => void;
};

function toLocalTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ShiftEditorModal({ target, onClose }: ShiftEditorModalProps) {
  const colors = useThemeColors();
  const [type, setType] = useState<ShiftType>("work");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pause, setPause] = useState("0");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    if (target.mode === "edit") {
      setType(target.shift.type);
      setStart(toLocalTime(target.shift.start_at));
      setEnd(toLocalTime(target.shift.end_at));
      setPause(String(target.shift.break_minutes));
      setNote(target.shift.note ?? "");
    } else {
      setType("work");
      setStart("");
      setEnd("");
      setPause("0");
      setNote("");
    }
  }, [target]);

  if (!target) return null;

  const date = target.mode === "edit" ? target.shift.date : target.date;
  const needsTimes = type === "work" || type === "meeting";

  async function handleSave() {
    if (!target) return;
    if (needsTimes) {
      if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
        Alert.alert("Horaire invalide", "Format attendu : HH:MM (ex 09:30).");
        return;
      }
      if (end <= start) {
        Alert.alert("Horaire invalide", "La fin doit être après le début.");
        return;
      }
    }
    setIsSaving(true);
    const payload = {
      date,
      start_at: needsTimes ? new Date(`${date}T${start}:00`).toISOString() : null,
      end_at: needsTimes ? new Date(`${date}T${end}:00`).toISOString() : null,
      type,
      break_minutes: Math.min(480, Math.max(0, parseInt(pause, 10) || 0)),
      note: note.trim() || null,
      is_edited: true,
    };
    const result =
      target.mode === "edit"
        ? await supabase.from("shifts").update(payload).eq("id", target.shift.id)
        : await supabase
            .from("shifts")
            .insert({ ...payload, user_id: target.userId, source: "manual" });
    setIsSaving(false);
    if (result.error) {
      Alert.alert("Enregistrement impossible", result.error.message);
      return;
    }
    onClose(true);
  }

  async function handleDelete() {
    if (!target || target.mode !== "edit") return;
    Alert.alert("Supprimer ce créneau ?", "Cette action est définitive.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("shifts").delete().eq("id", target.shift.id);
          if (error) {
            Alert.alert("Suppression impossible", error.message);
          } else {
            onClose(true);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropTouch} onPress={() => onClose(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <Text style={[styles.title, { color: colors.text }]}>
              {target.mode === "edit" ? "Modifier" : "Ajouter"} ·{" "}
              {DAY_FORMATTER.format(new Date(`${date}T12:00:00`))}
            </Text>

            <View style={styles.typeRow}>
              {TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  style={[
                    styles.typeChip,
                    { backgroundColor: type === t ? shiftTypeColor[t] : colors.surfaceMuted },
                  ]}
                >
                  <Text style={[styles.typeLabel, { color: type === t ? "#FFF" : colors.textMuted }]}>
                    {shiftTypeLabel[t]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {needsTimes ? (
              <View style={styles.timesRow}>
                <TextInput
                  value={start}
                  onChangeText={setStart}
                  placeholder="09:00"
                  placeholderTextColor={colors.textMuted}
                  maxLength={5}
                  style={[styles.timeInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
                <Text style={{ color: colors.textMuted }}>→</Text>
                <TextInput
                  value={end}
                  onChangeText={setEnd}
                  placeholder="17:30"
                  placeholderTextColor={colors.textMuted}
                  maxLength={5}
                  style={[styles.timeInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
                <TextInput
                  value={pause}
                  onChangeText={setPause}
                  placeholder="0"
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textMuted}
                  maxLength={3}
                  style={[styles.timeInput, styles.pauseInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
                <Text style={[styles.pauseSuffix, { color: colors.textMuted }]}>min de pause</Text>
              </View>
            ) : null}

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note (optionnelle)"
              placeholderTextColor={colors.textMuted}
              style={[styles.noteInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            />

            <Button label="Enregistrer" onPress={handleSave} isLoading={isSaving} />
            {target.mode === "edit" ? (
              <Button label="Supprimer" variant="danger" onPress={handleDelete} />
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "80%",
  },
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typeScale.heading,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  typeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  typeLabel: {
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typeScale.body,
    fontWeight: "700",
    minWidth: 84,
    textAlign: "center",
  },
  pauseInput: {
    minWidth: 64,
  },
  pauseSuffix: {
    fontSize: typeScale.caption,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typeScale.body,
  },
});
