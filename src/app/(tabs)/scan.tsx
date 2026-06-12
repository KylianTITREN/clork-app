import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProcessingView, type ProcessingStep } from "@/components/scan/ProcessingView";
import { ValidationView } from "@/components/scan/ValidationView";
import { radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import type { ExtractionEmployee, PlanningExtraction } from "@/lib/extraction-types";
import {
  createScan,
  findTargetEmployee,
  prepareImage,
  runExtraction,
  saveExtractionResult,
  saveShifts,
  uploadScanPhoto,
  validateDraft,
  type DraftShift,
} from "@/lib/scan-service";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";

type ScanState =
  | { step: "idle" }
  | { step: "processing"; processingStep: ProcessingStep }
  | {
      step: "validate";
      extraction: PlanningExtraction;
      target: ExtractionEmployee | null;
      rowIds: Map<number, string>;
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

  const userId = session?.user.id;

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
      const extraction = await runExtraction(image.base64);

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
      const rowIds = await saveExtractionResult(scanId, extraction);

      const profile = await loadProfile(userId);
      const target = findTargetEmployee(
        extraction.employees,
        profile?.employee_aliases ?? [],
        profile?.display_name ?? "",
      );

      setState({ step: "validate", extraction, target, rowIds });
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

  async function handleSave(drafts: DraftShift[], target: ExtractionEmployee) {
    if (!userId || state.step !== "validate") return;
    const problem = drafts.map(validateDraft).find((p) => p !== null);
    if (problem) {
      Alert.alert("Horaire invalide", problem + " (format attendu : HH:MM)");
      return;
    }
    setIsSaving(true);
    try {
      const scanRowId = state.rowIds.get(target.row_index) ?? null;
      const count = await saveShifts(userId, drafts, scanRowId);
      setIsSaving(false);
      setState({ step: "idle" });
      Alert.alert(
        "C'est dans ton calendrier ✅",
        `${count} créneau${count > 1 ? "x" : ""} enregistré${count > 1 ? "s" : ""}.`,
        [{ text: "Voir ma semaine", onPress: () => router.navigate("/(tabs)") }],
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

  if (state.step === "validate") {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ValidationView
          extraction={state.extraction}
          initialTarget={state.target}
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
    fontWeight: "800",
  },
  subtitle: {
    fontSize: typeScale.body,
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
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  actionLabelSecondary: {
    fontSize: typeScale.body,
    fontWeight: "700",
  },
});
