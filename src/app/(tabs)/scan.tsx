import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DocumentScanner from "react-native-document-scanner-plugin";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ProcessingView, type ProcessingStep } from "@/components/scan/ProcessingView";
import { ShiftEditorModal, type EditorTarget } from "@/components/week/ShiftEditorModal";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { ValidationView } from "@/components/scan/ValidationView";
import { fonts, radius, softShadow, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import type { ExtractionEmployee, PlanningExtraction } from "@/lib/extraction-types";
import { addDays, isoDate, mondayOf, weekLabel } from "@/lib/dates";
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
  undoImport,
  uploadScanPhoto,
  validateDraft,
  waitForExtraction,
  type DraftShift,
  type PendingScan,
} from "@/lib/scan-service";
import { ensurePermission, exportWeek } from "@/lib/calendar-export";
import { fetchPlan, isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import { claimShare, createShare, recordClaimedRow } from "@/lib/share-service";
import { supabase } from "@/lib/supabase";
import type { Profile, Shift } from "@/lib/types";
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
      breakPrefs: { minutes: number; thresholdHours: number; startTime: string | null };
    };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: "images",
  quality: 1,
  exif: false,
};

export default function ScanScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [state, setState] = useState<ScanState>({ step: "idle" });
  const [isSaving, setIsSaving] = useState(false);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  // Ajout manuel : date choisie + éditeur de créneau (presets, multi-jours…).
  const [manualDate, setManualDate] = useState<string>(isoDate(new Date()));
  const [manualEndDate, setManualEndDate] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);

  const userId = session?.user.id;
  const plan = usePlan();
  const isGuest = session?.user.is_anonymous ?? false;

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
        startTime: profile?.break_start_default?.slice(0, 5) ?? null,
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
      // Scanner de documents natif (VisionKit iOS / ML Kit Android) :
      // détection des bords, redressement de perspective, contraste — la photo
      // arrive « à plat » à l'extraction.
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 95,
      });
      if (status !== "success" || !scannedImages || scannedImages.length === 0) return;
      await processPhoto(scannedImages[0]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    await processPhoto(asset.uri, asset.width, asset.height);
  }

  async function processPhoto(uri: string, width?: number, height?: number) {
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
    if (!isPremiumPlan(await fetchPlan())) {
      showPremiumGate("Le partage de planning par code");
      return;
    }
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

  function confirmUndoImport(shiftIds: string[]) {
    if (shiftIds.length === 0) return;
    Alert.alert(
      "Annuler cet import ?",
      `Les ${shiftIds.length} créneau${shiftIds.length > 1 ? "x" : ""} qui viennent d'être ajoutés seront retirés de ton planning. ` +
        "Un éventuel export vers ton calendrier n'est pas annulé.",
      [
        { text: "Garder", style: "cancel" },
        {
          text: "Annuler l'import",
          style: "destructive",
          onPress: async () => {
            try {
              await undoImport(shiftIds);
              Alert.alert("Import annulé", "Les créneaux ont été retirés. Tu peux re-scanner le planning.");
            } catch (error) {
              Alert.alert(
                "Annulation impossible",
                error instanceof Error ? error.message : "Erreur inconnue",
              );
            }
          },
        },
      ],
    );
  }

  async function handleSave(drafts: DraftShift[], target: ExtractionEmployee, exportToCalendar: boolean) {
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
      const savedIds = await saveShifts(userId, drafts, scanRowId);
      const count = savedIds.length;
      await markScanValidated(scanId); // sans effet (RLS) sur un scan partagé, voulu
      if (scanRowId) {
        await recordClaimedRow(scanId, scanRowId);
      }
      // Export calendrier optionnel : la semaine vient d'être écrite en base.
      let exportNote = "";
      if (exportToCalendar && !isPremiumPlan(await fetchPlan())) {
        exportNote = "\nL'export calendrier est une fonction Premium (code : Profil → Compte).";
      } else if (exportToCalendar && drafts.length > 0) {
        try {
          const granted = await ensurePermission();
          if (granted) {
            const monday = mondayOf(new Date(`${drafts[0].date}T12:00:00`));
            const { data: saved } = await supabase
              .from("shifts")
              .select("*")
              .eq("user_id", userId)
              .gte("date", monday)
              .lte("date", addDays(monday, 6));
            const exported = await exportWeek(monday, (saved as Shift[]) ?? []);
            exportNote = `\n${exported} événement${exported > 1 ? "s" : ""} exporté${exported > 1 ? "s" : ""} vers ton calendrier.`;
          }
        } catch {
          exportNote = "\nL'export calendrier a échoué — réessaie depuis le Planning.";
        }
      }
      setIsSaving(false);
      setState({ step: "idle" });
      Alert.alert(
        "C'est enregistré ✅",
        `${count} créneau${count > 1 ? "x" : ""} enregistré${count > 1 ? "s" : ""}.` + exportNote,
        [
          { text: "Annuler l'import", style: "destructive", onPress: () => confirmUndoImport(savedIds) },
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
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ProcessingView currentStep={state.processingStep} />
      </SafeAreaView>
    );
  }

  if (state.step === "pickWeek") {
    const thisMonday = mondayOf(new Date());
    const candidates = [-7, 0, 7, 14].map((offset) => addDays(thisMonday, offset));
    return (
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
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
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
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
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.idleContainer, { paddingBottom: insets.bottom + 64 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: colors.textMuted }]}>Ajouter</Text>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]}>Remplis ta semaine</Text>
            {!isPremiumPlan(plan) ? (
              <View style={[styles.quotaPill, { backgroundColor: colors.surfaceMuted }]}>
                <Ionicons name="flash-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.quotaPillText, { color: colors.textMuted }]}>
                  {isGuest ? "1 scan/semaine" : "1 scan/mois"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {pendingScan ? (
          <Pressable
            onPress={() => resumePendingScan(pendingScan)}
            style={({ pressed }) => [
              styles.pendingBanner,
              { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
              softShadow,
            ]}
          >
            <View style={[styles.iconCircle, styles.iconCircleSmall, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
            </View>
            <View style={styles.pendingTextBox}>
              <Text style={[styles.pendingTitle, { color: colors.text }]}>
                Un scan t'attend ✨
              </Text>
              <Text style={[styles.pendingText, { color: colors.textMuted }]}>
                {pendingScan.week_start
                  ? `Semaine du ${new Date(`${pendingScan.week_start}T12:00:00`).toLocaleDateString("fr-FR")} — `
                  : ""}
                appuie pour le valider
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.accent} />
          </Pressable>
        ) : null}

        {/* Action principale : grande carte caméra */}
        <Pressable
          onPress={() => pickImage("camera")}
          style={({ pressed }) => [
            styles.cameraCard,
            { backgroundColor: colors.accent, transform: [{ scale: pressed ? 0.98 : 1 }] },
            softShadow,
          ]}
        >
          <View style={styles.cameraIconCircle}>
            <Ionicons name="camera" size={32} color={colors.onAccent} />
          </View>
          <View style={styles.cameraTextBox}>
            <Text style={[styles.cameraTitle, { color: colors.onAccent }]}>Scanner le planning</Text>
            <Text style={[styles.cameraSubtitle, { color: colors.onAccent, opacity: 0.75 }]}>
              L'IA lit toute l'équipe en 30 s — tu valides ✨
            </Text>
          </View>
          <View style={styles.cameraArrow}>
            <Ionicons name="arrow-forward" size={20} color={colors.accent} />
          </View>
        </Pressable>

        {/* Action secondaire : rangée galerie */}
        <Pressable
          onPress={() => pickImage("library")}
          style={({ pressed }) => [
            styles.rowCard,
            { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
            softShadow,
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.shiftMeetingSoft }]}>
            <Ionicons name="images" size={22} color={colors.shiftMeeting} />
          </View>
          <View style={styles.rowTextBox}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Importer de la galerie</Text>
            <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
              Une photo déjà prise du planning
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Ajout manuel : un jour précis ou une plage, sans défiler le planning */}
        <View style={[styles.rowCard, styles.joinCard, { backgroundColor: colors.surface }, softShadow]}>
          <View style={styles.joinHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="create" size={22} color={colors.accent} />
            </View>
            <View style={styles.rowTextBox}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Ajouter un créneau</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                À la main — presets, congés, plage de dates
              </Text>
            </View>
          </View>
          <View style={styles.manualDatesRow}>
            <View style={styles.manualDateBox}>
              <Text style={[styles.manualDateLabel, { color: colors.textMuted }]}>Du</Text>
              <DatePickerField value={manualDate} onChange={setManualDate} />
            </View>
            <View style={styles.manualDateBox}>
              <Text style={[styles.manualDateLabel, { color: colors.textMuted }]}>
                Au (optionnel)
              </Text>
              <View style={styles.manualEndRow}>
                <DatePickerField
                  value={manualEndDate}
                  onChange={setManualEndDate}
                  placeholder="--/--"
                  minimumDate={addDays(manualDate, 1)}
                />
                {manualEndDate ? (
                  <Pressable onPress={() => setManualEndDate(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
          <Pressable
            onPress={() =>
              userId &&
              setEditorTarget({
                mode: "create",
                date: manualDate,
                userId,
                endDate: manualEndDate && manualEndDate > manualDate ? manualEndDate : undefined,
              })
            }
            style={[styles.manualButton, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="add" size={18} color={colors.onAccent} />
            <Text style={[styles.manualButtonLabel, { color: colors.onAccent }]}>
              Ajouter manuellement
            </Text>
          </Pressable>
        </View>

        {/* Code collègue */}
        <View style={[styles.rowCard, styles.joinCard, { backgroundColor: colors.surface }, softShadow]}>
          <View style={styles.joinHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.shiftRhSoft }]}>
              <Ionicons name="people" size={22} color={colors.shiftRh} />
            </View>
            <View style={styles.rowTextBox}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Code d'un·e collègue</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                Récupère tes horaires sans re-scanner
              </Text>
            </View>
          </View>
          <View style={styles.joinRow}>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="A3F2B1C4"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                styles.joinInput,
                { backgroundColor: colors.surfaceMuted, color: colors.text },
              ]}
            />
            <Pressable
              onPress={handleJoin}
              disabled={isJoining || !joinCode.trim()}
              style={[
                styles.joinButton,
                { backgroundColor: colors.accent, opacity: isJoining || !joinCode.trim() ? 0.4 : 1 },
              ]}
            >
              <Ionicons name="arrow-forward" size={20} color={colors.onAccent} />
            </Pressable>
          </View>
        </View>

      </ScrollView>

      <ShiftEditorModal
        target={editorTarget}
        onClose={(didChange) => {
          setEditorTarget(null);
          if (didChange) {
            Alert.alert("Ajouté ✅", "Retrouve le créneau dans ton Planning.", [
              { text: "Voir", onPress: () => router.navigate("/(tabs)") },
              { text: "OK" },
            ]);
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  quotaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  quotaPillText: {
    fontSize: 11,
    fontFamily: fonts.extraBold,
  },
  divider: {
    height: 1,
    borderRadius: 1,
    marginHorizontal: spacing.xl,
    marginVertical: spacing.xs,
  },
  manualDatesRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  manualDateBox: {
    flex: 1,
    gap: spacing.xs,
  },
  manualDateLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  manualEndRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  manualButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  manualButtonLabel: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
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
    fontFamily: fonts.bold,
  },
  idleContainer: {
    // flexGrow (et non flex:1) : remplit l'écran mais laisse le contenu
    // grandir au-delà — sinon le ScrollView se fige dès que ça dépasse
    // (ex : bannière « scan à valider » en haut).
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  kicker: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pendingTextBox: {
    flex: 1,
    gap: 2,
  },
  pendingTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  pendingText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleSmall: {
    width: 38,
    height: 38,
  },
  cameraCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  cameraIconCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: "rgba(38,33,14,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraTextBox: {
    flex: 1,
    gap: 2,
  },
  cameraTitle: {
    fontSize: typeScale.heading,
    fontFamily: fonts.black,
  },
  cameraSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  cameraArrow: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowTextBox: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.extraBold,
  },
  rowSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  joinCard: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.md,
  },
  joinHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  joinRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  joinInput: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: 2,
  },
  joinButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tipsRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: "auto",
    paddingBottom: spacing.md,
  },
  tipChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  tipText: {
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
});
