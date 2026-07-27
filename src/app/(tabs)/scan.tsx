// Wizard « Ajouter mes horaires » v2 (maquette 4b) — modal plein écran :
//   Étape 1/2 · méthode  : Scanner (carte primaire) / Ajouter à la main /
//                          Photo existante / J'ai reçu un code (+ badge quota)
//   Étape 2/2 · vérifier : récap « Tout est bon ? » (cocher = à revoir) puis
//                          correction card-by-card « Vérifie tes jours »
//   Succès : confettis discrets + stats + actions.
// Le pipeline (compression → upload → extraction serveur → polling) et les
// helpers (ciblage, drafts, corrections) restent ceux de scan-service.

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import DocumentScanner from "react-native-document-scanner-plugin";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProcessingView, type ProcessingStep } from "@/components/scan/ProcessingView";
import { RecapStep, type WizardDay } from "@/components/scan/RecapStep";
import { ReviewStep } from "@/components/scan/ReviewStep";
import { SuccessView } from "@/components/scan/SuccessView";
import { ShiftEditorModal, type EditorTarget } from "@/components/week/ShiftEditorModal";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { WizardFrame } from "@/components/ui/WizardFrame";
import {
  fonts,
  letterSpacing,
  radius,
  softShadow,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import type { ExtractionEmployee, PlanningExtraction } from "@/lib/extraction-types";
import { addDays, isoDate, mondayOf, weekLabel } from "@/lib/dates";
import {
  applyDefaultBreak,
  applyWeekStart,
  createScan,
  diffDrafts,
  fetchScanRowIds,
  findPendingValidation,
  findTargetEmployee,
  hasResolvedDates,
  logScanCorrections,
  markScanValidated,
  meetingDraftsFromNotes,
  prepareImage,
  saveShifts,
  startExtraction,
  toDraftShifts,
  undoImport,
  uploadScanPhoto,
  validateDraft,
  waitForExtraction,
  type DraftShift,
  type PendingScan,
} from "@/lib/scan-service";
import { ensurePermission, exportWeek } from "@/lib/calendar-export";
import { fetchPlan, isPremiumPlan, showPremiumGate, usePlan } from "@/lib/plan-service";
import { DEFAULT_PRESETS, loadPresets, type ShiftPreset } from "@/lib/preset-service";
import { claimShare, createShare, recordClaimedRow } from "@/lib/share-service";
import { supabase } from "@/lib/supabase";
import type { Profile, Shift } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

type WizardContext = {
  scanId: string;
  extraction: PlanningExtraction;
  target: ExtractionEmployee;
  rowIds: Map<number, string>;
  drafts: DraftShift[];
  baseline: DraftShift[];
  days: WizardDay[];
  checked: ReadonlySet<string>;
};

type WizardState =
  | { step: "method" }
  | { step: "manual" }
  | { step: "code" }
  | { step: "processing"; processingStep: ProcessingStep }
  | { step: "pickWeek"; scanId: string; extraction: PlanningExtraction }
  | { step: "pickTarget"; scanId: string; extraction: PlanningExtraction }
  | { step: "recap"; ctx: WizardContext }
  | { step: "review"; ctx: WizardContext; queue: string[]; queueIndex: number }
  | {
      step: "success";
      savedIds: string[];
      slotCount: number;
      totalHours: number;
      monday: string;
      scanId: string | null;
    };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: "images",
  quality: 1,
  exif: false,
};

// --- Ajout manuel (maquette « Ajouter à la main ») ---------------------------

type ManualType = "work" | "off" | "cp" | "training" | "meeting";
type ManualMode = "single" | "range";

const MANUAL_TYPES: readonly { value: ManualType; label: string }[] = [
  { value: "work", label: "Travail" },
  { value: "off", label: "Repos" },
  { value: "cp", label: "CP" },
  { value: "training", label: "Formation" },
  { value: "meeting", label: "Réunion" },
];

// Garde-fou multi-jours (même règle que ShiftEditorModal) : jamais plus de 31.
const MAX_RANGE_DAYS = 31;

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < MAX_RANGE_DAYS) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

const CARD_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const RANGE_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});

function cardDateLabel(iso: string): string {
  return CARD_DATE_FORMATTER.format(new Date(`${iso}T12:00:00`));
}

/** « du 12 au 20 août » (mois élidé au départ si identique), sinon « du 28 juillet au 3 août ». */
function manualRangeLabel(from: string, to: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const fromLabel = sameMonth
    ? String(Number(from.slice(8, 10)))
    : RANGE_DATE_FORMATTER.format(new Date(`${from}T12:00:00`));
  return `du ${fromLabel} au ${RANGE_DATE_FORMATTER.format(new Date(`${to}T12:00:00`))}`;
}

// Encart contextuel quand le type ne demande pas d'horaires.
const MANUAL_NOTICE_WORDING: Record<Exclude<ManualType, "work">, { noun: string; label: string }> = {
  off: { noun: "un repos", label: "Repos" },
  cp: { noun: "un congé", label: "CP" },
  training: { noun: "une formation", label: "Formation" },
  meeting: { noun: "une réunion", label: "Réunion" },
};

function manualTypeNotice(type: Exclude<ManualType, "work">, count: number): string {
  const { noun, label } = MANUAL_NOTICE_WORDING[type];
  const effect =
    count > 1
      ? `les ${count} jours passeront en ${label} d'un coup`
      : `ce jour passera directement en ${label}`;
  return `Pas d'horaires à saisir pour ${noun} — ${effect}.`;
}

// Quota de scans du plan gratuit : 1 / 30 jours (compte), 1 / 7 jours (invité).
const SCAN_QUOTA = 1;
const FREE_SCAN_WINDOW_DAYS = 30;
const GUEST_SCAN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type ManualDateCardProps = {
  label: string;
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  minimumDate?: string;
};

/** Grande carte date de la maquette (« DU · mer 12 août ») sur le picker natif. */
function ManualDateCard({ label, value, onChange, minimumDate }: ManualDateCardProps) {
  const colors = useThemeColors();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => new Date(`${value}T12:00:00`));

  function open() {
    setDraft(new Date(`${value}T12:00:00`));
    setIsOpen(true);
  }

  function confirm() {
    onChange(isoDate(draft));
    setIsOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        style={[styles.dateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.dateCardLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text
          style={[styles.dateCardValue, { color: colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {cardDateLabel(value)}
        </Text>
      </Pressable>

      {isOpen ? (
        Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
            <Pressable style={styles.dateBackdrop} onPress={() => setIsOpen(false)} />
            <View
              style={[
                styles.dateSheet,
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
              if (event.type === "set" && date) onChange(isoDate(date));
            }}
          />
        )
      ) : null}
    </>
  );
}

function paidOf(draft: DraftShift): number {
  if (draft.durationHours != null) return draft.durationHours;
  if (!draft.start || !draft.end) return 0;
  const [sh, sm] = draft.start.split(":").map(Number);
  const [eh, em] = draft.end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

export default function AddWizardScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const [state, setState] = useState<WizardState>({ step: "method" });
  const [isSaving, setIsSaving] = useState(false);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [manualDate, setManualDate] = useState<string>(isoDate(new Date()));
  const [manualEndDate, setManualEndDate] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState<ManualMode>("single");
  const [manualType, setManualType] = useState<ManualType>("work");
  const [manualPresets, setManualPresets] = useState<ShiftPreset[]>(DEFAULT_PRESETS);
  const [manualPresetId, setManualPresetId] = useState<string | null>(null);
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [pickWeekChoice, setPickWeekChoice] = useState<string>(mondayOf(new Date()));

  const userId = session?.user.id;
  const plan = usePlan();
  const isGuest = session?.user.is_anonymous ?? false;

  // Scan extrait pendant que l'app était fermée : proposé à la reprise.
  useFocusEffect(
    useCallback(() => {
      if (!userId || state.step !== "method") return;
      findPendingValidation(userId).then(setPendingScan);
    }, [userId, state.step]),
  );

  // Créneaux types rechargés à chaque entrée dans « Ajouter à la main » :
  // une modif dans Profil → Créneaux types doit être reflétée ici.
  useEffect(() => {
    if (state.step !== "manual") return;
    loadPresets().then(setManualPresets);
  }, [state.step]);

  // Quota réel du sous-titre (« 1 scan restant ce mois. ») — best-effort :
  // si la requête échoue, on garde le libellé statique actuel.
  useEffect(() => {
    if (!userId || state.step !== "method" || isPremiumPlan(plan)) return;
    let cancelled = false;
    const windowDays = isGuest ? GUEST_SCAN_WINDOW_DAYS : FREE_SCAN_WINDOW_DAYS;
    const since = new Date(Date.now() - windowDays * DAY_MS).toISOString();
    (async () => {
      try {
        const { count, error } = await supabase
          .from("scans")
          .select("id", { count: "exact", head: true })
          .eq("uploader_id", userId)
          .gte("created_at", since);
        if (cancelled || error) return;
        setScansLeft(Math.max(0, SCAN_QUOTA - (count ?? 0)));
      } catch {
        // silencieux : le sous-titre retombe sur le libellé statique
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, state.step, plan, isGuest]);

  function closeWizard() {
    if (router.canGoBack()) router.back();
    else router.navigate("/(tabs)");
  }

  async function loadProfile(id: string): Promise<Profile | null> {
    const { data } = await supabase.from("profiles").select("*").eq("id", id).single<Profile>();
    return data;
  }

  // --- Construction du contexte de vérification ------------------------------
  async function buildContext(
    scanId: string,
    extraction: PlanningExtraction,
    target: ExtractionEmployee,
  ): Promise<WizardContext> {
    if (!userId) throw new Error("Session expirée");
    const rowIds = await fetchScanRowIds(scanId).catch(() => new Map<number, string>());
    const profile = await loadProfile(userId);
    const breakPrefs = {
      minutes: profile?.break_default_minutes ?? 0,
      thresholdHours: profile?.break_threshold_hours ?? 6,
      startTime: profile?.break_start_default?.slice(0, 5) ?? null,
    };
    const drafts = [
      ...applyDefaultBreak(toDraftShifts(target), breakPrefs),
      ...meetingDraftsFromNotes(extraction),
    ];
    const weekStart = extraction.week_start as string;
    const days: WizardDay[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const sourceDay = target.days.find((d) => d.date === date);
      const draftIndexes = drafts
        .map((d, index) => (d.date === date ? index : -1))
        .filter((i2) => i2 !== -1);
      const status: WizardDay["status"] =
        sourceDay?.status === "unknown"
          ? "todo"
          : draftIndexes.some((i2) => drafts[i2].start != null)
            ? "work"
            : "off";
      return { date, index: i, status, draftIndexes };
    });
    // Les jours non lus sont cochés d'office (à revoir).
    const checked = new Set(days.filter((d) => d.status === "todo").map((d) => d.date));
    return { scanId, extraction, target, rowIds, drafts, baseline: drafts, days, checked };
  }

  async function enterValidation(scanId: string, extraction: PlanningExtraction) {
    if (!userId) return;
    if (!hasResolvedDates(extraction)) {
      setPickWeekChoice(mondayOf(new Date()));
      setState({ step: "pickWeek", scanId, extraction });
      return;
    }
    const profile = await loadProfile(userId);
    const target = findTargetEmployee(
      extraction.employees,
      profile?.employee_aliases ?? [],
      profile?.display_name ?? "",
    );
    if (!target) {
      setState({ step: "pickTarget", scanId, extraction });
      return;
    }
    const ctx = await buildContext(scanId, extraction, target);
    setState({ step: "recap", ctx });
  }

  async function resumePendingScan(pending: PendingScan) {
    try {
      setPendingScan(null);
      await enterValidation(pending.id, pending.raw_extraction);
    } catch (error) {
      Alert.alert("Reprise impossible", error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  // --- Capture / import ------------------------------------------------------
  async function pickImage(source: "camera" | "library") {
    if (source === "camera") {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert("Caméra refusée", "Autorise la caméra dans Réglages pour scanner le planning.");
        return;
      }
      // Scanner de documents natif (VisionKit iOS / ML Kit Android) :
      // bords, perspective, contraste — la photo arrive « à plat ».
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
    // Import galerie : photo souvent tournée → auto-redressement serveur+local.
    await processPhoto(asset.uri, asset.width, asset.height, true);
  }

  async function processPhoto(uri: string, width?: number, height?: number, autoOrient = false) {
    if (!userId) return;
    try {
      setState({ step: "processing", processingStep: "compress" });
      const image = await prepareImage(uri, width, height, autoOrient);

      setState({ step: "processing", processingStep: "upload" });
      const scanId = await createScan(userId);
      await uploadScanPhoto(userId, scanId, image.base64);

      setState({ step: "processing", processingStep: "extract" });
      await startExtraction(scanId, image.base64);
      const extraction = await waitForExtraction(scanId);

      if (extraction.photo_quality === "unusable") {
        await supabase.from("scans").update({ status: "failed" }).eq("id", scanId);
        setState({ step: "method" });
        Alert.alert(
          "Photo illisible 📷",
          "Le planning n'est pas assez net pour une lecture fiable. Rapproche-toi, évite les reflets et cadre tout le tableau, puis reprends la photo.",
        );
        return;
      }

      setState({ step: "processing", processingStep: "save" });
      await enterValidation(scanId, extraction);
    } catch (error) {
      setState({ step: "method" });
      Alert.alert("Scan échoué", error instanceof Error ? error.message : "Erreur inconnue — réessaie.");
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
      Alert.alert("Code refusé", error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsJoining(false);
    }
  }

  // --- Enregistrement --------------------------------------------------------
  async function saveDays(ctx: WizardContext, allowedDates: ReadonlySet<string>) {
    if (!userId) return;
    const drafts = ctx.drafts.filter((d) => d.include && allowedDates.has(d.date));
    const problem = drafts.map(validateDraft).find((p) => p !== null);
    if (problem) {
      Alert.alert("Horaire invalide", problem + " (format attendu : HH:MM)");
      return;
    }
    setIsSaving(true);
    try {
      const scanRowId = ctx.rowIds.get(ctx.target.row_index) ?? null;
      const savedIds = await saveShifts(userId, drafts, scanRowId);
      // Trace les erreurs de lecture de l'IA (best-effort, jamais bloquant).
      void logScanCorrections(userId, ctx.scanId, scanRowId, diffDrafts(ctx.baseline, ctx.drafts));
      await markScanValidated(ctx.scanId); // sans effet (RLS) sur un scan partagé, voulu
      if (scanRowId) {
        await recordClaimedRow(ctx.scanId, scanRowId);
      }
      const totalHours = drafts
        .filter((d) => d.type === "work" || d.type === "meeting" || d.type === "training")
        .reduce((acc, d) => acc + paidOf(d), 0);
      setState({
        step: "success",
        savedIds,
        slotCount: savedIds.length,
        totalHours,
        monday: ctx.extraction.week_start as string,
        scanId: ctx.scanId,
      });
    } catch (error) {
      Alert.alert("Enregistrement échoué", error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setIsSaving(false);
    }
  }

  // --- Ajout manuel ----------------------------------------------------------
  function openManualStep() {
    setManualDate(isoDate(new Date()));
    setManualEndDate(null);
    setManualMode("single");
    setManualType("work");
    setManualPresetId(null);
    setState({ step: "manual" });
  }

  function handleManualStartChange(next: string) {
    setManualDate(next);
    // La fin doit rester après le début (plage cohérente).
    if (manualEndDate && manualEndDate <= next) setManualEndDate(addDays(next, 1));
  }

  // Écrit directement en base, comme ShiftEditorModal en mode create :
  // une ligne shifts par date, horaires du créneau type si Travail.
  async function saveManualDays() {
    if (!userId) return;
    const dates =
      manualMode === "range" && manualEndDate && manualEndDate > manualDate
        ? datesBetween(manualDate, manualEndDate)
        : [manualDate];
    const preset =
      manualType === "work"
        ? (manualPresets.find((p) => p.id === manualPresetId) ?? null)
        : null;
    if (manualType === "work" && !preset) {
      Alert.alert("Choisis un créneau", "Sélectionne un de tes créneaux types pour les horaires.");
      return;
    }
    setIsSaving(true);
    try {
      const rows = dates.map((day) => ({
        user_id: userId,
        source: "manual",
        date: day,
        type: manualType,
        start_at: preset ? new Date(`${day}T${preset.start}:00`).toISOString() : null,
        end_at: preset ? new Date(`${day}T${preset.end}:00`).toISOString() : null,
        break_minutes: preset ? preset.breakMinutes : 0,
        break_start: null,
        note: null,
        period: preset?.period ?? null,
        is_edited: true,
      }));
      const { error } = await supabase.from("shifts").insert(rows);
      if (error) {
        Alert.alert("Enregistrement impossible", error.message);
        return;
      }
      router.navigate("/(tabs)");
    } finally {
      setIsSaving(false);
    }
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
          `Ouvre l'app → Ajouter → « J'ai reçu un code » et saisis : ${code.toUpperCase()}`,
      });
    } catch (error) {
      Alert.alert("Partage impossible", error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  async function handleExportWeek(monday: string) {
    if (!userId) return;
    if (!isPremiumPlan(await fetchPlan())) {
      showPremiumGate("L'export vers ton calendrier");
      return;
    }
    try {
      const granted = await ensurePermission();
      if (!granted) {
        Alert.alert("Accès calendrier refusé", "Autorise l'accès au calendrier dans Réglages.");
        return;
      }
      const { data: saved } = await supabase
        .from("shifts")
        .select("*")
        .eq("user_id", userId)
        .gte("date", monday)
        .lte("date", addDays(monday, 6));
      const exported = await exportWeek(monday, (saved as Shift[]) ?? []);
      Alert.alert("Exporté ✅", `${exported} événement${exported > 1 ? "s" : ""} dans le calendrier « Clork ».`);
    } catch (error) {
      Alert.alert("Export échoué", error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  function confirmUndoImport(shiftIds: string[]) {
    if (shiftIds.length === 0) return;
    Alert.alert(
      "Annuler cet import ?",
      `Les ${shiftIds.length} créneau${shiftIds.length > 1 ? "x" : ""} qui viennent d'être ajoutés seront retirés de ton planning.`,
      [
        { text: "Garder", style: "cancel" },
        {
          text: "Annuler l'import",
          style: "destructive",
          onPress: async () => {
            try {
              await undoImport(shiftIds);
              setState({ step: "method" });
              Alert.alert("Import annulé", "Les créneaux ont été retirés. Tu peux re-scanner le planning.");
            } catch (error) {
              Alert.alert("Annulation impossible", error instanceof Error ? error.message : "Erreur inconnue");
            }
          },
        },
      ],
    );
  }

  // --- Édition d'un jour (mode draft du ShiftEditorModal) --------------------
  function editDraft(ctx: WizardContext, draftIndex: number) {
    setEditorTarget({ mode: "draft", draft: ctx.drafts[draftIndex], index: draftIndex });
  }

  function fillTodoDay(ctx: WizardContext, date: string) {
    // Jour non lu : on crée un brouillon vide et on l'édite.
    const blank: DraftShift = {
      date,
      type: "work",
      start: "09:00",
      end: "17:00",
      durationHours: null,
      breakStart: null,
      period: null,
      note: null,
      fromHandwriting: false,
      highlighted: false,
      include: true,
    };
    const drafts = [...ctx.drafts, blank];
    const days = ctx.days.map((d) =>
      d.date === date ? { ...d, status: "work" as const, draftIndexes: [...d.draftIndexes, drafts.length - 1] } : d,
    );
    const nextCtx = { ...ctx, drafts, days };
    if (state.step === "review") setState({ ...state, ctx: nextCtx });
    else if (state.step === "recap") setState({ step: "recap", ctx: nextCtx });
    setEditorTarget({ mode: "draft", draft: blank, index: drafts.length - 1 });
  }

  function applyDraftEdit(index: number, next: DraftShift) {
    setState((current) => {
      if (current.step !== "recap" && current.step !== "review") return current;
      const drafts = current.ctx.drafts.map((d, i) => (i === index ? next : d));
      const days = current.ctx.days.map((day) =>
        day.draftIndexes.includes(index) && next.include && next.start
          ? { ...day, status: day.status === "todo" ? ("work" as const) : day.status }
          : day,
      );
      const ctx = { ...current.ctx, drafts, days };
      return current.step === "recap" ? { step: "recap", ctx } : { ...current, ctx };
    });
  }

  // --- Rendus par étape ------------------------------------------------------

  if (state.step === "processing") {
    return (
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ProcessingView currentStep={state.processingStep} />
      </SafeAreaView>
    );
  }

  if (state.step === "success") {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SuccessView
          slotCount={state.slotCount}
          totalHours={state.totalHours}
          onSeeWeek={() => router.navigate("/(tabs)")}
          onExport={() => handleExportWeek(state.monday)}
          onShare={() => state.scanId && handleShare(state.scanId)}
          onUndo={() => confirmUndoImport(state.savedIds)}
        />
      </SafeAreaView>
    );
  }

  if (state.step === "pickWeek") {
    const thisMonday = mondayOf(new Date());
    const options = [
      { monday: addDays(thisMonday, -7), label: "Semaine dernière" },
      { monday: thisMonday, label: "Cette semaine" },
      { monday: addDays(thisMonday, 7), label: "Semaine prochaine" },
      { monday: addDays(thisMonday, 14), label: "Dans 2 semaines" },
    ];
    return (
      <WizardFrame step={2} totalSteps={2} onClose={() => setState({ step: "method" })} closeIcon="back">
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>C'est pour quelle semaine ?</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textMuted }]}>
            Le planning n'imprime pas ses dates — choisis la semaine concernée.
          </Text>
          {options.map((option) => {
            const selected = pickWeekChoice === option.monday;
            return (
              <Pressable
                key={option.monday}
                onPress={() => setPickWeekChoice(option.monday)}
                style={[
                  styles.radioCard,
                  selected
                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.radioText}>
                  <Text
                    style={[styles.radioLabel, { color: selected ? colors.onAccent : colors.text }]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.radioDates,
                      { color: selected ? colors.onAccent : colors.textMuted, opacity: selected ? 0.85 : 1 },
                    ]}
                  >
                    {weekLabel(option.monday)}
                  </Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.onAccent} /> : null}
              </Pressable>
            );
          })}
          <Button
            label="Continuer"
            onPress={() => {
              const resolved = applyWeekStart(state.extraction, pickWeekChoice);
              void enterValidation(state.scanId, resolved);
            }}
          />
        </ScrollView>
      </WizardFrame>
    );
  }

  if (state.step === "pickTarget") {
    return (
      <WizardFrame step={2} totalSteps={2} onClose={() => setState({ step: "method" })} closeIcon="back">
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>C'est quelle ligne, toi ?</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textMuted }]}>
            On n'a pas reconnu ton nom sur le planning — choisis ta ligne.
          </Text>
          {state.extraction.employees.map((employee) => (
            <Pressable
              key={employee.row_index}
              onPress={async () => {
                const ctx = await buildContext(state.scanId, state.extraction, employee);
                setState({ step: "recap", ctx });
              }}
              style={[styles.radioCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.radioText}>
                <Text style={[styles.radioLabel, { color: colors.text }]}>{employee.name}</Text>
                <Text style={[styles.radioDates, { color: colors.textMuted }]}>
                  {employee.total_hours != null ? `${employee.total_hours}h sur le planning` : "—"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
            </Pressable>
          ))}
        </ScrollView>
      </WizardFrame>
    );
  }

  if (state.step === "recap" || state.step === "review") {
    const ctx = state.ctx;
    const readHours = ctx.drafts
      .filter((d) => d.include && (d.type === "work" || d.type === "meeting" || d.type === "training"))
      .reduce((acc, d) => acc + paidOf(d), 0);
    return (
      <WizardFrame
        step={2}
        totalSteps={2}
        onClose={() =>
          state.step === "review" ? setState({ step: "recap", ctx }) : setState({ step: "method" })
        }
        closeIcon="back"
      >
        {state.step === "recap" ? (
          <RecapStep
            days={ctx.days}
            drafts={ctx.drafts}
            checked={ctx.checked}
            readHours={readHours}
            isSaving={isSaving}
            onToggle={(date) => {
              const checked = new Set(ctx.checked);
              if (checked.has(date)) checked.delete(date);
              else checked.add(date);
              setState({ step: "recap", ctx: { ...ctx, checked } });
            }}
            onCorrect={() => {
              const queue = ctx.days.filter((d) => ctx.checked.has(d.date)).map((d) => d.date);
              if (queue.length > 0) setState({ step: "review", ctx, queue, queueIndex: 0 });
            }}
            onValidate={() => {
              // 0 coché → tout ; sinon uniquement les jours NON cochés (les
              // cochés ne sont pas importés — corrigeables plus tard).
              const allowed =
                ctx.checked.size === 0
                  ? new Set(ctx.days.map((d) => d.date))
                  : new Set(ctx.days.filter((d) => !ctx.checked.has(d.date)).map((d) => d.date));
              void saveDays(ctx, allowed);
            }}
          />
        ) : (
          <ReviewStep
            days={ctx.days}
            drafts={ctx.drafts}
            queue={state.queue}
            queueIndex={state.queueIndex}
            onEditSlot={(index) => editDraft(ctx, index)}
            onFillDay={(date) => fillTodoDay(ctx, date)}
            onApprove={() => {
              if (state.queueIndex + 1 < state.queue.length) {
                setState({ ...state, queueIndex: state.queueIndex + 1 });
              } else {
                // File terminée : tout est vérifié → on enregistre tout.
                void saveDays(ctx, new Set(ctx.days.map((d) => d.date)));
              }
            }}
          />
        )}
        {editorTarget ? (
          <ShiftEditorModal
            target={editorTarget}
            onClose={() => setEditorTarget(null)}
            onDraftSave={(index, next) => {
              applyDraftEdit(index, next);
              setEditorTarget(null);
            }}
          />
        ) : null}
      </WizardFrame>
    );
  }

  if (state.step === "manual") {
    const isWork = manualType === "work";
    const dayCount =
      manualMode === "range" && manualEndDate && manualEndDate > manualDate
        ? datesBetween(manualDate, manualEndDate).length
        : 1;
    const typeLabel = MANUAL_TYPES.find((t) => t.value === manualType)?.label ?? "";
    const recapValue =
      manualMode === "range" && manualEndDate && dayCount > 1
        ? `${typeLabel} · ${manualRangeLabel(manualDate, manualEndDate)} · ${dayCount} jours`
        : `${typeLabel} · ${cardDateLabel(manualDate)}`;
    return (
      <WizardFrame step={1} totalSteps={2} onClose={() => setState({ step: "method" })} closeIcon="back">
        <ScrollView
          contentContainerStyle={[styles.stepContent, styles.stepContentFill]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.stepTitle, { color: colors.text }]}>Ajouter à la main</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textMuted }]}>
            Un jour ou une suite de jours
          </Text>

          {/* QUAND ? — un jour ou une plage */}
          <View style={styles.manualLabelRow}>
            <Text style={[styles.manualSectionLabel, { color: colors.textMuted }]}>Quand ?</Text>
            <Segmented
              options={[
                { value: "single", label: "Un jour" },
                { value: "range", label: "Plusieurs jours" },
              ]}
              value={manualMode}
              onChange={(mode) => {
                setManualMode(mode);
                if (mode === "range" && (!manualEndDate || manualEndDate <= manualDate)) {
                  setManualEndDate(addDays(manualDate, 1));
                }
              }}
            />
          </View>
          {manualMode === "range" ? (
            <>
              <View style={styles.dateRow}>
                <ManualDateCard label="Du" value={manualDate} onChange={handleManualStartChange} />
                <Ionicons name="arrow-forward" size={16} color={colors.textDisabled} />
                <ManualDateCard
                  label="Au"
                  value={manualEndDate ?? addDays(manualDate, 1)}
                  onChange={setManualEndDate}
                  minimumDate={addDays(manualDate, 1)}
                />
              </View>
              <Text style={[styles.dayCount, { color: colors.accent }]}>
                {dayCount} jour{dayCount > 1 ? "s" : ""}
              </Text>
            </>
          ) : (
            <View style={styles.dateRow}>
              <ManualDateCard label="Le" value={manualDate} onChange={handleManualStartChange} />
            </View>
          )}

          {/* C'EST QUOI ? — type du/des jour(s) */}
          <Text style={[styles.manualSectionLabel, { color: colors.textMuted }]}>C'est quoi ?</Text>
          <View style={styles.typeChipRow}>
            {MANUAL_TYPES.map((option) => {
              const selected = option.value === manualType;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setManualType(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.typeChip,
                    selected
                      ? { backgroundColor: colors.accent, borderColor: colors.accent }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipLabel,
                      selected
                        ? [styles.typeChipLabelSelected, { color: colors.onAccent }]
                        : { color: colors.textSoft },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
                </Pressable>
              );
            })}
          </View>

          {/* Encart contextuel : pas d'horaires pour les types non travaillés */}
          {!isWork ? (
            <View style={[styles.noticeCard, { backgroundColor: colors.accentMuted }]}>
              <View style={[styles.noticeDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.noticeText, { color: colors.accentDeep }]}>
                {manualTypeNotice(manualType, dayCount)}
              </Text>
            </View>
          ) : null}

          {/* Créneaux types : actifs si Travail, grisés sinon */}
          <View style={[styles.presetBox, { borderColor: colors.border }]}>
            <Text style={[styles.presetBoxLabel, { color: colors.textDisabled }]}>
              Si Travail : tes créneaux types apparaissent ici
            </Text>
            <View style={[styles.presetPillRow, !isWork && styles.presetPillRowDisabled]}>
              {manualPresets.map((preset) => {
                const selected = isWork && manualPresetId === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    disabled={!isWork}
                    onPress={() => setManualPresetId(preset.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: !isWork }}
                    style={[
                      styles.presetPill,
                      selected
                        ? { backgroundColor: colors.accent, borderColor: colors.accent }
                        : { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.presetPillLabel,
                        { color: selected ? colors.onAccent : colors.text },
                      ]}
                    >
                      {preset.start}–{preset.end}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Récap */}
          <View style={[styles.recapRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.recapLabel, { color: colors.textMuted }]}>Récap</Text>
            <Text
              style={[styles.recapValue, { color: colors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {recapValue}
            </Text>
          </View>

          <View style={styles.flexSpacer} />
          <Button
            label={dayCount > 1 ? `Ajouter ces ${dayCount} jours` : "Ajouter ce jour"}
            onPress={saveManualDays}
            isLoading={isSaving}
          />
          <Button label="Annuler" variant="ghost" onPress={() => setState({ step: "method" })} />
        </ScrollView>
      </WizardFrame>
    );
  }

  if (state.step === "code") {
    return (
      <WizardFrame step={1} totalSteps={2} onClose={() => setState({ step: "method" })} closeIcon="back">
        <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.stepTitle, { color: colors.text }]}>J'ai reçu un code</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textMuted }]}>
            Un·e collègue a déjà scanné le planning ? Récupère tes horaires sans re-scanner.
          </Text>
          <TextInput
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="A3F2B1C4"
            placeholderTextColor={colors.textDisabled}
            style={[
              styles.codeInput,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
          <Button label="Récupérer mes horaires" onPress={handleJoin} isLoading={isJoining} />
        </ScrollView>
      </WizardFrame>
    );
  }

  // --- Étape 1 : méthode -----------------------------------------------------
  const quotaLabel = isPremiumPlan(plan)
    ? "Scans illimités. Tout est modifiable après."
    : scansLeft != null
      ? `${scansLeft} scan restant ${isGuest ? "cette semaine" : "ce mois"}. Tout est modifiable après.`
      : isGuest
        ? "1 scan par semaine en mode invité. Tout est modifiable après."
        : "1 scan par mois. Tout est modifiable après.";
  return (
    <WizardFrame step={1} totalSteps={2} onClose={closeWizard}>
      <ScrollView
        contentContainerStyle={[styles.stepContent, styles.stepContentFill]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.stepTitle, { color: colors.text }]}>
          Comment ajouter{"\n"}tes horaires ?
        </Text>
        <Text style={[styles.stepSubtitle, { color: colors.textMuted }]}>{quotaLabel}</Text>

        {pendingScan ? (
          <Pressable
            onPress={() => resumePendingScan(pendingScan)}
            style={[styles.pendingCard, { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.accentDeep} />
            <View style={styles.pendingText}>
              <Text style={[styles.pendingTitle, { color: colors.accentDeep }]}>
                Un scan t'attend
              </Text>
              <Text style={[styles.pendingSub, { color: colors.accentDeep, opacity: 0.8 }]}>
                {pendingScan.week_start
                  ? `Semaine du ${new Date(`${pendingScan.week_start}T12:00:00`).toLocaleDateString("fr-FR")} — `
                  : ""}
                reprends la validation.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.accentDeep} />
          </Pressable>
        ) : null}

        {/* Carte primaire : scanner */}
        <View style={[styles.scanCard, { backgroundColor: colors.accent }]}>
          <View style={[styles.scanIcon, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <Ionicons name="scan-outline" size={22} color={colors.onAccent} />
          </View>
          <Text style={[styles.scanTitle, { color: colors.onAccent }]}>Scanner le planning</Text>
          <Text style={[styles.scanSubtitle, { color: colors.onAccent, opacity: 0.85 }]}>
            La lecture couvre toute l'équipe en 30 secondes, ratures et notes comprises.
          </Text>
          <Pressable
            onPress={() => pickImage("camera")}
            style={({ pressed }) => [
              styles.scanCta,
              { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.4)" },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.scanCtaLabel, { color: colors.onAccent }]}>C'est parti →</Text>
          </Pressable>
        </View>

        {/* Ajouter à la main */}
        <Pressable
          onPress={openManualStep}
          style={({ pressed }) => [
            styles.manualEntry,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.manualEntryText}>
            <Text style={[styles.manualEntryTitle, { color: colors.text }]}>Ajouter à la main</Text>
            <Text style={[styles.manualEntrySub, { color: colors.textMuted }]}>
              Un jour, un congé, une plage de dates
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
        </Pressable>

        {/* Pilules épinglées en bas de l'écran (maquette : margin-top auto) */}
        <View style={styles.flexSpacer} />
        <View style={styles.pillRow}>
          <Pressable
            onPress={() => pickImage("library")}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.pillLabel, { color: colors.text }]}>Photo existante</Text>
          </Pressable>
          <Pressable
            onPress={() => setState({ step: "code" })}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.pillLabel, { color: colors.text }]}>J'ai reçu un code</Text>
          </Pressable>
        </View>
      </ScrollView>
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  stepContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm + 2,
  },
  stepTitle: {
    fontSize: typeScale.title,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.title,
    marginTop: spacing.sm,
  },
  stepSubtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    marginBottom: spacing.sm,
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: 12,
  },
  pendingText: { flex: 1, gap: 1 },
  pendingTitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
  },
  pendingSub: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  scanCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 8,
  },
  scanIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  scanTitle: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.heading,
  },
  scanSubtitle: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
    lineHeight: 19,
  },
  scanCta: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 6,
  },
  scanCtaLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  manualEntry: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
    gap: 10,
  },
  manualEntryText: { flex: 1, gap: 2 },
  manualEntryTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  manualEntrySub: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 13,
  },
  pillLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.semiBold,
  },
  radioCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md,
  },
  radioText: { flex: 1, gap: 2 },
  radioLabel: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  radioDates: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
  },
  // --- Ajouter à la main (écran plein maquette) ---
  stepContentFill: {
    flexGrow: 1,
  },
  flexSpacer: {
    flexGrow: 1,
  },
  manualLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  manualSectionLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  dateCard: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md - 2,
  },
  dateCardLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dateCardValue: {
    fontSize: 22,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  dateBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  dateSheet: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xxl,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dayCount: {
    textAlign: "center",
    fontSize: typeScale.caption,
    fontFamily: fonts.bold,
  },
  typeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minHeight: 44,
    justifyContent: "center",
  },
  typeChipLabel: {
    fontSize: typeScale.bodySm,
    fontFamily: fonts.medium,
  },
  typeChipLabelSelected: {
    fontFamily: fonts.semiBold,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noticeText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  presetBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  presetBoxLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  presetPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  presetPillRowDisabled: {
    opacity: 0.4,
  },
  presetPill: {
    flexGrow: 1,
    flexBasis: "28%",
    alignItems: "center",
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  presetPillLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
  },
  recapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  recapLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  recapValue: {
    flexShrink: 1,
    fontSize: typeScale.bodySm,
    fontFamily: fonts.bold,
  },
  codeInput: {
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: 3,
    textAlign: "center",
  },
});
