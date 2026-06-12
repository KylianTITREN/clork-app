import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProcessingView, type ProcessingStep } from "@/components/scan/ProcessingView";
import { ValidationView } from "@/components/scan/ValidationView";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import type { ExtractionEmployee, PlanningExtraction } from "@/lib/extraction-types";
import { addDays, mondayOf, weekLabel } from "@/lib/dates";
import {
  applyWeekStart,
  createScan,
  fetchScanRowIds,
  findPendingValidation,
  findTargetEmployee,
  hasResolvedDates,
  markScanValidated,
  prepareImage,
  saveShifts,
  startExtraction,
  uploadScanPhoto,
  validateDraft,
  waitForExtraction,
  type DraftShift,
  type PendingScan,
} from "@/lib/scan-service";
import { claimShare, createShare, recordClaimedRow } from "@/lib/share-service";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

type ScanState =
  | { step: "idle" }
  | { step: "processing"; processingStep: ProcessingStep }
  // Le planning n'imprime pas ses dates : on demande le lundi de la semaine.
  | { step: "pickWeek"; scanId: string; extraction: PlanningExtraction }
  | {
      step: "validate";
      scanId: string;
      extraction: PlanningExtraction;
      target: ExtractionEmployee | null;
      rowIds: Map<number, string>;
      breakPrefs: { minutes: number; thresholdHours: number };
    };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: "images",
  quality: 1,
  exif: false,
};

export default function ScanScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const [state, setState] = useState<ScanState>({ step: "idle" });
  const [isSaving, setIsSaving] = useState(false);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const userId = session?.user.id;

  // Un scan extrait pendant que l'app était fermée attend d'être validé.
  useFocusEffect(
    useCallback(() => {
      if (!userId || state.step !== "idle") return;
      findPendingValidation(userId).then(setPendingScan);
    }, [userId, state.step]),
  );

  // Entrée commune vers la validation (scan frais ou repris) ; passe par le
  // choix du lundi si le planning n'imprime pas ses dates.
  async function enterValidation(scanId: string, extraction: PlanningExtraction) {
    if (!userId) return;
    if (!hasResolvedDates(extraction)) {
      setState({ step: "pickWeek", scanId, extraction });
      return;
    }
    const rowIds = await fetchScanRowIds(scanId);
    const profile = await loadProfile(userId);
    const target = findTargetEmployee(
      extraction.employees,
      profile?.employee_aliases ?? [],
      profile?.display_name ?? "",
    );
    setState({
      step: "validate",
      scanId,
      extraction,
      target,
      rowIds,
      breakPrefs: {
        minutes: profile?.break_default_minutes ?? 0,
        thresholdHours: profile?.break_threshold_hours ?? 6,
      },
    });
  }

  async function resumePendingScan(pending: PendingScan) {
    try {
      setPendingScan(null);
      await enterValidation(pending.id, pending.raw_extraction);
    } catch (error) {
      Alert.alert(
        "Reprise impossible",
        error instanceof Error ? error.message : "Erreur inconnue",
      );
    }
  }

  async function pickImage(source: "camera" | "library") {
    if (source === "camera") {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert("Caméra refusée", "Autorise la caméra dans Réglages pour scanner le planning.");
        return;
      }
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    await processPhoto(asset.uri, asset.width, asset.height);
  }

  async function processPhoto(uri: string, width: number, height: number) {
    if (!userId) return;
    try {
      setState({ step: "processing", processingStep: "compress" });
      const image = await prepareImage(uri, width, height);

      setState({ step: "processing", processingStep: "upload" });
      const scanId = await createScan(userId);
      await uploadScanPhoto(userId, scanId, image.base64);

      setState({ step: "processing", processingStep: "extract" });
      await startExtraction(scanId, image.base64);
      // L'extraction tourne côté serveur : même si l'app est fermée ici, le
      // résultat sera proposé à la reprise (bannière « scan à valider »).
      const extraction = await waitForExtraction(scanId);

      if (extraction.photo_quality === "unusable") {
        await supabase.from("scans").update({ status: "failed" }).eq("id", scanId);
        setState({ step: "idle" });
        Alert.alert(
          "Photo illisible 📷",
          "Le planning n'est pas assez net pour une lecture fiable. Rapproche-toi, évite les reflets et cadre tout le tableau, puis reprends la photo.",
        );
        return;
      }

      setState({ step: "processing", processingStep: "save" });
      await enterValidation(scanId, extraction);
    } catch (error) {
      setState({ step: "idle" });
      Alert.alert(
        "Scan échoué",
        error instanceof Error ? error.message : "Erreur inconnue — réessaie.",
      );
    }
  }

  async function loadProfile(id: string): Promise<Profile | null> {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single<Profile>();
    return data;
  }

  async function handleShare(scanId: string) {
    try {
      const code = await createShare(scanId);
      await Share.share({
        message:
          `Récupère tes horaires sur Clork sans re-scanner le planning ! ` +
          `Ouvre l'app → Scanner → « J'ai reçu un code » et saisis : ${code.toUpperCase()}`,
      });
    } catch (error) {
      Alert.alert(
        "Partage impossible",
        error instanceof Error ? error.message : "Erreur inconnue",
      );
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setIsJoining(true);
    try {
      const claimed = await claimShare(joinCode);
      setJoinCode("");
      await enterValidation(claimed.scanId, claimed.extraction);
    } catch (error) {
      Alert.alert(
        "Code refusé",
        error instanceof Error ? error.message : "Erreur inconnue",
      );
    } finally {
      setIsJoining(false);
    }
  }

  async function handleSave(drafts: DraftShift[], target: ExtractionEmployee) {
    if (!userId || state.step !== "validate") return;
    const problem = drafts.map(validateDraft).find((p) => p !== null);
    if (problem) {
      Alert.alert("Horaire invalide", problem + " (format attendu : HH:MM)");
      return;
    }
    setIsSaving(true);
    try {
      const scanId = state.scanId;
      const scanRowId = state.rowIds.get(target.row_index) ?? null;
      const count = await saveShifts(userId, drafts, scanRowId);
      await markScanValidated(scanId); // sans effet (RLS) sur un scan partagé, voulu
      if (scanRowId) {
        await recordClaimedRow(scanId, scanRowId);
      }
      setIsSaving(false);
      setState({ step: "idle" });
      Alert.alert(
        "C'est dans ton calendrier ✅",
        `${count} créneau${count > 1 ? "x" : ""} enregistré${count > 1 ? "s" : ""}.`,
        [
          { text: "Partager aux collègues", onPress: () => handleShare(scanId) },
          { text: "Voir ma semaine", onPress: () => router.navigate("/(tabs)") },
        ],
      );
    } catch (error) {
      setIsSaving(false);
      Alert.alert(
        "Enregistrement échoué",
        error instanceof Error ? error.message : "Erreur inconnue",
      );
    }
  }

  if (state.step === "processing") {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ProcessingView currentStep={state.processingStep} />
      </SafeAreaView>
    );
  }

  if (state.step === "pickWeek") {
    const thisMonday = mondayOf(new Date());
    const candidates = [-7, 0, 7, 14].map((offset) => addDays(thisMonday, offset));
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.pickWeek}>
          <Text style={[styles.title, { color: colors.text }]}>
            Ce planning commence quand ?
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            La période n'est pas imprimée sur la photo. Choisis le lundi de la
            semaine concernée :
          </Text>
          {candidates.map((monday, index) => (
            <Pressable
              key={monday}
              onPress={async () => {
                const resolved = applyWeekStart(state.extraction, monday);
                await supabase
                  .from("scans")
                  .update({
                    week_start: monday,
                    week_end: addDays(monday, 6),
                    raw_extraction: resolved,
                  })
                  .eq("id", state.scanId);
                await enterValidation(state.scanId, resolved);
              }}
              style={({ pressed }) => [
                styles.weekOption,
                {
                  backgroundColor: index === 1 ? colors.accent : colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.weekOptionLabel,
                  { color: index === 1 ? "#FFF" : colors.text },
                ]}
              >
                {index === 0 ? "Semaine dernière" : index === 1 ? "Cette semaine" : index === 2 ? "Semaine prochaine" : "Dans 2 semaines"}
                {"  ·  "}
                {weekLabel(monday)}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (state.step === "validate") {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ValidationView
          extraction={state.extraction}
          initialTarget={state.target}
          breakPrefs={state.breakPrefs}
          isSaving={isSaving}
          onSave={handleSave}
          onRetake={() => setState({ step: "idle" })}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Scanner</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Cadre tout le tableau, bien à plat, sans reflet.
        </Text>
      </View>

      {pendingScan ? (
        <Pressable
          onPress={() => resumePendingScan(pendingScan)}
          style={[styles.pendingBanner, { backgroundColor: colors.surfaceMuted, borderColor: colors.accent }]}
        >
          <Ionicons name="document-text-outline" size={22} color={colors.accent} />
          <Text style={[styles.pendingText, { color: colors.text }]}>
            Un scan extrait t'attend
            {pendingScan.week_start
              ? ` (semaine du ${new Date(`${pendingScan.week_start}T12:00:00`).toLocaleDateString("fr-FR")})`
              : ""}{" "}
            — appuie pour le valider.
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.accent} />
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => pickImage("camera")}
          style={({ pressed }) => [
            styles.actionCard,
            { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Ionicons name="camera" size={44} color="#FFF" />
          <Text style={styles.actionLabelPrimary}>Prendre le planning en photo</Text>
        </Pressable>

        <Pressable
          onPress={() => pickImage("library")}
          style={({ pressed }) => [
            styles.actionCard,
            styles.actionCardSecondary,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="images-outline" size={32} color={colors.accent} />
          <Text style={[styles.actionLabelSecondary, { color: colors.text }]}>
            Choisir dans la galerie
          </Text>
        </Pressable>

        <View style={[styles.joinCard, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.joinTitle, { color: colors.text }]}>
            Une collègue a déjà scanné ? 🤝
          </Text>
          <View style={styles.joinRow}>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Code reçu (ex: A3F2B1C4)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                styles.joinInput,
                { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
              ]}
            />
            <Pressable
              onPress={handleJoin}
              disabled={isJoining || !joinCode.trim()}
              style={[
                styles.joinButton,
                { backgroundColor: colors.accent, opacity: isJoining || !joinCode.trim() ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: typeScale.title,
    fontFamily: fonts.black,
  },
  subtitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.semiBold,
  },
  pickWeek: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  weekOption: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  weekOptionLabel: {
    fontSize: typeScale.body,
    fontWeight: "700",
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pendingText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  actions: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
  },
  actionCardSecondary: {
    borderWidth: 1,
    paddingVertical: spacing.lg,
  },
  actionLabelPrimary: {
    color: "#FFF",
    fontSize: typeScale.heading,
    fontFamily: fonts.extraBold,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  actionLabelSecondary: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  joinCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  joinTitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  joinRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  joinInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  joinButton: {
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
});
