// Mon magasin (v2) — rattachement Clork Pro + horaires d'ouverture.
// Trois états d'adhésion : aucun magasin (enseigne + numéro de magasin, avec le
// code d'invitation en repli), en attente (la responsable doit confirmer la ligne
// du planning), confirmée (nom reconnu + renvoi vers les réglages de notification
// — alerte à la publication et envoi par e-mail, qui vivent dans Notifications).
// La carte « Horaires du magasin » (déduction ouvre/ferme sur l'accueil) est
// présente dans les trois états.
//
// Le rattachement automatique par le carnet d'équipe (adresse pré-autorisée par
// la responsable) se joue ailleurs, à l'ouverture de l'app : cet écran n'a rien
// à en dire, il montre simplement l'adhésion telle qu'elle est.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SubPageHeader } from "@/components/profile/SubPageHeader";
import { Button } from "@/components/ui/Button";
import { pressOpacity } from "@/components/ui/press";
import { fonts, radius, spacing, typeScale, useThemeColors } from "@/constants/tokens";
import {
  getMyStore,
  joinStore,
  joinStoreByNumber,
  listOrganizations,
  type MyStore,
  type StoreOrganization,
} from "@/lib/store-service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

import { TimeSettingPill } from "./planning";

/** Longueur du code d'équipe distribué par la responsable. */
const JOIN_CODE_LENGTH = 6;
/** Longueur maximale d'un numéro de magasin, alignée sur la RPC. */
const STORE_NUMBER_MAX_LENGTH = 20;

/** Carte blanche v2 : titre + sous-titre DANS la carte. */
function SettingsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

export default function StoreSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();

  const userId = session?.user.id;

  // --- Adhésion au magasin ---
  const [membership, setMembership] = useState<MyStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  // Saisie principale : enseigne + numéro de magasin, celui qu'elle lit sur ses
  // documents. Le code d'invitation reste en repli, replié par défaut.
  const [organizations, setOrganizations] = useState<StoreOrganization[]>([]);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [storeNumber, setStoreNumber] = useState("");
  const [code, setCode] = useState("");
  const [wantsInviteCode, setWantsInviteCode] = useState(false);

  // Rechargées au focus : la responsable peut confirmer l'adhésion pendant que
  // l'écran vit dans la pile (retour depuis Notifications, par exemple).
  // Adhésion et enseignes ensemble : l'écran ne s'affiche qu'une fois les deux
  // connues, sinon la saisie basculerait sous les doigts.
  useFocusEffect(
    useCallback(() => {
      let isCancelled = false;
      Promise.all([getMyStore(), listOrganizations()])
        .then(([store, orgs]) => {
          if (isCancelled) return;
          setMembership(store);
          setOrganizations(orgs);
          // Une seule enseigne : il n'y a rien à choisir, on la pré-sélectionne.
          setOrgSlug((current) => current ?? (orgs.length === 1 ? orgs[0].slug : null));
        })
        .catch((error: unknown) => {
          if (isCancelled) return;
          Alert.alert(
            "Magasin indisponible",
            error instanceof Error ? error.message : "Impossible de lire ton rattachement.",
          );
        })
        .finally(() => {
          if (!isCancelled) setIsLoading(false);
        });
      return () => {
        isCancelled = true;
      };
    }, []),
  );

  // Sans liste d'enseignes, il n'y a rien à proposer : le code d'invitation
  // redevient la seule saisie, sans bascule à afficher.
  const hasOrganizations = organizations.length > 0;
  const isNumberMode = hasOrganizations && !wantsInviteCode;
  const isCodeReady = code.trim().length === JOIN_CODE_LENGTH;
  const isNumberReady = orgSlug !== null && storeNumber.trim().length > 0;
  const canJoin = isNumberMode ? isNumberReady : isCodeReady;

  async function handleJoin() {
    if (isJoining || !canJoin) return;
    setIsJoining(true);
    try {
      const joined = isNumberMode
        ? await joinStoreByNumber(orgSlug ?? "", storeNumber)
        : await joinStore(code);
      setMembership(joined);
      setCode("");
      setStoreNumber("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Rattachement impossible",
        error instanceof Error ? error.message : "Magasin introuvable",
      );
    } finally {
      setIsJoining(false);
    }
  }

  // --- Horaires du magasin : « tu ouvres / tu fermes » sur l'accueil.
  // Les mentions O/F lues sur le planning priment sur cette déduction.
  const [storeOpen, setStoreOpen] = useState<string | null>(null);
  const [storeClose, setStoreClose] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("store_open_time, store_close_time")
      .eq("id", userId)
      .single<{ store_open_time: string | null; store_close_time: string | null }>()
      .then(({ data }) => {
        setStoreOpen(data?.store_open_time?.slice(0, 5) ?? null);
        setStoreClose(data?.store_close_time?.slice(0, 5) ?? null);
      });
  }, [userId]);

  /** Écriture optimiste : en cas d'échec on revient à l'affichage précédent. */
  async function saveStoreHours(open: string | null, close: string | null) {
    if (!userId) return;
    const previous = { open: storeOpen, close: storeClose };
    setStoreOpen(open);
    setStoreClose(close);
    const { error } = await supabase
      .from("profiles")
      .update({ store_open_time: open, store_close_time: close })
      .eq("id", userId);
    if (error) {
      setStoreOpen(previous.open);
      setStoreClose(previous.close);
      Alert.alert("Erreur", "Horaires du magasin non enregistrés : " + error.message);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <SubPageHeader title="Mon magasin" />

          {isLoading ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.textMuted} />
            </View>
          ) : membership === null ? (
            /* ÉTAT 1 — pas de magasin : enseigne + numéro, code en repli. */
            <SettingsCard
              title="Rejoindre mon magasin"
              subtitle="Ton magasin peut publier le planning directement dans Clork"
            >
              {isNumberMode ? (
                <>
                  <View style={styles.orgRow}>
                    {organizations.map((org) => {
                      const isSelected = org.slug === orgSlug;
                      return (
                        <Pressable
                          key={org.slug}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setOrgSlug(org.slug);
                          }}
                          style={({ pressed }) => [
                            styles.orgChip,
                            {
                              backgroundColor: isSelected ? colors.accent : colors.background,
                              borderColor: isSelected ? colors.accent : colors.border,
                              opacity: pressed ? pressOpacity.control : 1,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.orgChipLabel,
                              { color: isSelected ? colors.onAccent : colors.textSoft },
                            ]}
                          >
                            {org.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.codeRow}>
                    <TextInput
                      value={storeNumber}
                      onChangeText={setStoreNumber}
                      placeholder="1064"
                      placeholderTextColor={colors.textDisabled}
                      accessibilityLabel="Numéro de magasin"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="off"
                      maxLength={STORE_NUMBER_MAX_LENGTH}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleJoin()}
                      style={[
                        styles.numberInput,
                        { backgroundColor: colors.background, color: colors.text },
                      ]}
                    />
                    <Button
                      label="Rejoindre"
                      onPress={() => void handleJoin()}
                      disabled={!canJoin}
                      isLoading={isJoining}
                      style={styles.joinButton}
                    />
                  </View>
                  <Text style={[styles.hint, { color: colors.textDisabled }]}>
                    Le numéro de ton magasin, celui qui figure sur tes documents. Ta responsable
                    confirmera ensuite que tu fais partie de l'équipe.
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.codeRow}>
                    <TextInput
                      value={code}
                      onChangeText={(value) => setCode(value.toUpperCase())}
                      placeholder="CODE MAGASIN"
                      placeholderTextColor={colors.textDisabled}
                      accessibilityLabel="Code magasin"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      autoComplete="off"
                      maxLength={JOIN_CODE_LENGTH}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleJoin()}
                      style={[
                        styles.codeInput,
                        { backgroundColor: colors.background, color: colors.text },
                      ]}
                    />
                    <Button
                      label="Rejoindre"
                      onPress={() => void handleJoin()}
                      disabled={!canJoin}
                      isLoading={isJoining}
                      style={styles.joinButton}
                    />
                  </View>
                  <Text style={[styles.hint, { color: colors.textDisabled }]}>
                    Le code magasin ({JOIN_CODE_LENGTH} caractères) est donné par ta responsable.
                  </Text>
                </>
              )}

              {hasOrganizations ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setWantsInviteCode((current) => !current)}
                  style={({ pressed }) => [
                    styles.switchRow,
                    { opacity: pressed ? pressOpacity.control : 1 },
                  ]}
                >
                  <Text style={[styles.switchLabel, { color: colors.textMuted }]}>
                    {isNumberMode
                      ? "J'ai un code d'invitation"
                      : "Rejoindre avec le numéro de mon magasin"}
                  </Text>
                </Pressable>
              ) : null}
            </SettingsCard>
          ) : membership.status === "pending" ? (
            /* ÉTAT 2 — en attente de confirmation par la responsable. */
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: colors.shiftCp }]} />
                <Text style={[styles.statusLabel, { color: colors.shiftCp }]}>EN ATTENTE</Text>
              </View>
              <Text style={[styles.storeLabel, { color: colors.text }]}>{membership.label}</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                Ton responsable doit confirmer que tu fais partie de l'équipe. Tu recevras tes
                horaires dès que ce sera fait.
              </Text>
            </View>
          ) : (
            /* ÉTAT 3 — adhésion confirmée : ligne du planning + notification. */
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.statusLabel, { color: colors.success }]}>RATTACHÉE</Text>
              </View>
              <Text style={[styles.storeLabel, { color: colors.text }]}>{membership.label}</Text>
              <View style={[styles.nameBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.nameKicker, { color: colors.textMuted }]}>
                  Reconnue sur le planning
                </Text>
                <Text style={[styles.nameValue, { color: colors.text }]}>
                  {membership.employeeName ?? "Ligne non précisée"}
                </Text>
              </View>
              {/* Renvoi, pas de doublon : les interrupteurs (notification, envoi
                  par e-mail) vivent dans Notifications, cette ligne dit où. */}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/profile/notifications")}
                style={({ pressed }) => [
                  styles.linkRow,
                  { borderColor: colors.border, opacity: pressed ? pressOpacity.surface : 1 },
                ]}
              >
                <Text style={[styles.linkText, { color: colors.textSoft }]}>
                  Être prévenue à chaque publication, par notification ou par e-mail : réglage
                  « Planning de mon magasin »
                </Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textDisabled} />
              </Pressable>
            </View>
          )}

          <SettingsCard title="Horaires du magasin" subtitle="Pour savoir quand tu ouvres ou fermes">
            <View style={styles.pillsRow}>
              <TimeSettingPill
                label="Ouvre"
                value={storeOpen}
                placeholder="09:00"
                onChange={(time) => void saveStoreHours(time, storeClose)}
              />
              <TimeSettingPill
                label="Ferme"
                value={storeClose}
                placeholder="21:00"
                onChange={(time) => void saveStoreHours(storeOpen, time)}
              />
            </View>
            <Text style={[styles.hint, { color: colors.textDisabled }]}>
              Créneau qui commence à l'ouverture → tu ouvres ; qui finit à la fermeture → tu
              fermes. Les mentions O/F du planning priment.
            </Text>
          </SettingsCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: 12 },
  // Carte blanche v2 (bord 1px, r16, padding 18, gap 12).
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    gap: 12,
  },
  cardTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  // Saisie du code : champ espacé + bouton, sur une seule ligne.
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  codeInput: {
    flex: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 5,
    minHeight: 52,
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: 3,
  },
  joinButton: { paddingHorizontal: spacing.md },
  // Numéro de magasin : même gabarit que le code, sans l'espacement de lettres
  // (« 1064 » se lit d'un bloc, un code se déchiffre caractère par caractère).
  numberInput: {
    flex: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 5,
    minHeight: 52,
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  // Enseignes : chips qui passent à la ligne quand la liste s'allonge.
  orgRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  orgChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  orgChipLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  // Bascule discrète vers l'autre saisie : un lien texte, pas un bouton.
  switchRow: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  switchLabel: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
    textDecorationLine: "underline",
  },
  hint: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.medium,
    lineHeight: 16,
  },
  // Bandeau d'état de l'adhésion (dot + libellé court).
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
  },
  storeLabel: {
    fontSize: typeScale.heading,
    fontFamily: fonts.bold,
    letterSpacing: -0.4,
  },
  body: {
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 18,
  },
  // Nom de la ligne du planning : posé sur le neutre, comme les réglages.
  nameBox: {
    borderRadius: radius.input,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 2,
  },
  nameKicker: {
    fontSize: typeScale.tiny,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  nameValue: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  linkText: {
    flex: 1,
    fontSize: typeScale.caption,
    fontFamily: fonts.medium,
    lineHeight: 17,
  },
  // Rangée de 2 pilules réglage côte à côte (Ouvre / Ferme).
  pillsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
