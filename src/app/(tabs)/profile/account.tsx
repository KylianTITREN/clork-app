// Compte v2 (maquette 4c) : carte « Image de profil » (collection d'avatars,
// Premium), Email, Mot de passe, accès VIP et zone danger. Les flux existants
// (changement d'e-mail, mot de passe, code VIP/promo, suppression du compte)
// sont conservés — seule leur mise en scène suit la maquette.

import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
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
import { AvatarFace } from "@/components/ui/AvatarFace";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { AVATAR_COLLECTION } from "@/constants/avatars";
import {
  fonts,
  letterSpacing,
  radius,
  spacing,
  typeScale,
  useThemeColors,
} from "@/constants/tokens";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  isPremiumPlan,
  setCachedPlan,
  showPremiumGate,
  usePlan,
  type Plan,
} from "@/lib/plan-service";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const MIN_PASSWORD_LENGTH = 8;
/** Avatar gratuit : l'initiale du prénom. */
const DEFAULT_AVATAR = "letter";
const AVATAR_SIZE = 52;

/** Force 0-3 — même barème que l'inscription (longueur, casses, chiffre/symbole). */
function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;
  return score;
}

const STRENGTH_LABELS = ["Trop court", "Fragile", "Correct", "Solide"] as const;

export default function AccountSettingsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const livePlan = usePlan();

  const userId = session?.user.id;
  const isGuest = session?.user.is_anonymous ?? false;
  const email = session?.user.email ?? "";

  // Plan : usePlan rafraîchit à chaque focus ; l'activation d'un code met à
  // jour l'état local tout de suite, sans attendre l'aller-retour suivant.
  const [plan, setPlan] = useState<Plan>(livePlan);
  useEffect(() => {
    setPlan(livePlan);
  }, [livePlan]);
  const isPremium = isPremiumPlan(plan);

  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string>(DEFAULT_AVATAR);
  // Choix visé tant qu'il n'est pas enregistré (bouton de validation).
  const [draftAvatar, setDraftAvatar] = useState<string>(DEFAULT_AVATAR);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  const isPasswordValid = newPassword.length >= MIN_PASSWORD_LENGTH;
  const canSubmitEmail = newEmail.trim().length > 0 && newEmail.trim() !== email;

  const strength = passwordStrength(newPassword);
  // Jauge : « Correct » = accent du thème, les états faibles gardent leur
  // couleur sémantique (rouge / orange), « Solide » = succès.
  const strengthColors = [colors.danger, colors.shiftCp, colors.accent, colors.success];

  // Profil : prénom (initiale de l'avatar par défaut) + avatar choisi.
  useEffect(() => {
    if (!userId) return;
    let isMounted = true;
    supabase
      .from("profiles")
      .select("display_name, avatar")
      .eq("id", userId)
      .single<{ display_name: string | null; avatar: string | null }>()
      .then(({ data }) => {
        if (!isMounted || !data) return;
        setDisplayName(data.display_name ?? "");
        setAvatar(data.avatar ?? DEFAULT_AVATAR);
        setDraftAvatar(data.avatar ?? DEFAULT_AVATAR);
      });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  /** Enregistre le choix affiché — le tap sur un avatar ne fait que le viser. */
  async function handleSaveAvatar() {
    if (!userId || draftAvatar === avatar) return;
    setIsSavingAvatar(true);
    const { error } = await supabase
      .from("profiles")
      .update({ avatar: draftAvatar })
      .eq("id", userId);
    setIsSavingAvatar(false);
    if (error) {
      Alert.alert(
        "Avatar non enregistré",
        "Ton avatar n'a pas pu être enregistré. Réessaie dans un instant.",
      );
      return;
    }
    setAvatar(draftAvatar);
  }

  async function handleRedeemCode() {
    if (!promoCode.trim()) return;
    setIsRedeeming(true);
    const { data, error } = await supabase.rpc("redeem_promo_code", { p_code: promoCode });
    setIsRedeeming(false);
    if (error) {
      Alert.alert("Code refusé", "Ce code est invalide ou a déjà été utilisé au maximum.");
    } else {
      setPromoCode("");
      const redeemed: Plan = data === "founder" ? "founder" : "premium";
      setPlan(redeemed);
      setCachedPlan(redeemed);
      Alert.alert(
        "Accès débloqué",
        redeemed === "founder"
          ? "Tu fais partie des VIP : scans illimités, à vie."
          : "Tu fais désormais partie des membres Premium : scans illimités.",
      );
    }
  }

  async function handleChangePassword() {
    if (!isPasswordValid) return;
    setIsChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsChangingPassword(false);
    if (error) {
      Alert.alert("Erreur", authErrorMessage(error));
    } else {
      setNewPassword("");
      Alert.alert("Mot de passe mis à jour");
    }
  }

  function handleChangeEmail() {
    if (!canSubmitEmail) return;
    const target = newEmail.trim();
    Alert.alert(
      "Changer d'email ?",
      `Ton email passera de ${email} à ${target}. Un email de confirmation peut t'être envoyé.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            setIsChangingEmail(true);
            const { error } = await supabase.auth.updateUser({ email: target });
            setIsChangingEmail(false);
            if (error) {
              Alert.alert("Erreur", authErrorMessage(error));
            } else {
              setNewEmail("");
              setIsEditingEmail(false);
              Alert.alert("Email mis à jour", "Pense à valider l'email de confirmation.");
            }
          },
        },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Supprimer ton compte ?",
      "Toutes tes données (plannings, scans, partages) seront définitivement effacées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Continuer",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Dernière confirmation",
              "Cette action est irréversible. Supprimer ton compte maintenant ?",
              [
                { text: "Annuler", style: "cancel" },
                {
                  text: "Supprimer définitivement",
                  style: "destructive",
                  onPress: async () => {
                    const { error } = await supabase.rpc("delete_account");
                    if (error) {
                      Alert.alert("Suppression impossible", authErrorMessage(error));
                    } else {
                      await supabase.auth.signOut();
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
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
          {/* Gabarit d'en-tête commun aux sous-pages (maquette : carré 42 r12). */}
          <SubPageHeader title="Compte" />

          {isGuest ? (
            // En invité, cet écran est la destination de la porte Premium
            // (« J'ai un code d'accès ») : il doit proposer la seule action
            // utile ici — créer le compte — au lieu d'un texte sans issue.
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Crée ton compte gratuit
              </Text>
              <Text style={[styles.cardBody, { color: colors.textSoft }]}>
                Email, mot de passe, code d'accès Premium : tout ça vit sur un compte. Toutes tes
                données actuelles sont conservées.
              </Text>
              <Button
                label="Créer mon compte gratuit"
                onPress={() => router.push("/upgrade" as Parameters<typeof router.push>[0])}
              />
            </View>
          ) : (
            <>
              {/* ---- Image de profil : collection d'avatars (Premium) ---- */}
              <View
                style={[
                  styles.card,
                  styles.avatarCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.cardHeadRow}>
                  <View style={styles.flex}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Image de profil</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                      {isPremium
                        ? "Choisis ton avatar."
                        : "Changer d'avatar est une fonction Premium."}
                    </Text>
                  </View>
                  {!isPremium ? (
                    <View style={[styles.premiumPill, { backgroundColor: colors.ink }]}>
                      <Text style={[styles.premiumPillLabel, { color: colors.onInk }]}>
                        Premium
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.avatarGrid}>
                  {[DEFAULT_AVATAR, ...AVATAR_COLLECTION].map((slug) => {
                    const isLetter = slug === DEFAULT_AVATAR;
                    const isSelected = slug === draftAvatar;
                    // Sans Premium, les animaux sont inertes : la porte passe
                    // par la rangée « Collection verrouillée » en bas de carte.
                    const isLocked = !isPremium && !isLetter;
                    return (
                      <Pressable
                        key={slug}
                        disabled={isLocked || isSelected}
                        onPress={() => setDraftAvatar(slug)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected, disabled: isLocked }}
                        accessibilityLabel={
                          isLetter ? "Avatar par défaut : ton initiale" : `Avatar ${slug}`
                        }
                        style={styles.avatarItem}
                      >
                        <View
                          style={[
                            styles.avatarRing,
                            { borderColor: isSelected ? colors.accent : "transparent" },
                          ]}
                        >
                          {/* Verrouillé : cercle neutre estompé (pas de grayscale en RN). */}
                          <View style={isLocked ? styles.avatarLocked : null}>
                            <AvatarFace
                              avatar={slug}
                              name={displayName || email}
                              size={AVATAR_SIZE}
                              background={
                                isLetter
                                  ? colors.accent
                                  : isLocked
                                    ? colors.surfaceMuted
                                    : colors.accentMuted
                              }
                              color={colors.onAccent}
                            />
                          </View>
                          {isLocked ? (
                            <View style={[styles.lockBadge, { backgroundColor: colors.ink }]}>
                              <Text style={styles.lockGlyph}>🔒</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text
                          style={[styles.avatarLabel, { color: colors.accent }]}
                          numberOfLines={1}
                        >
                          {isSelected ? (isLetter ? "Par défaut" : "Choisi") : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {!isPremium ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => showPremiumGate("La collection d'avatars")}
                    style={({ pressed }) => [
                      styles.lockedRow,
                      { backgroundColor: colors.background, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.lockedLabel, { color: colors.textMuted }]}>
                      Collection verrouillée
                    </Text>
                    <View style={[styles.lockedCta, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.lockedCtaLabel, { color: colors.onAccent }]}>
                        Passer Premium
                      </Text>
                    </View>
                  </Pressable>
                ) : draftAvatar !== avatar ? (
                  // Le choix ne s'applique qu'une fois validé (demande Kylian).
                  <Button
                    label="Enregistrer mon avatar"
                    onPress={handleSaveAvatar}
                    isLoading={isSavingAvatar}
                  />
                ) : null}
              </View>

              {/* ---- Email ---- */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>Email</Text>
                <View style={[styles.valueBox, { backgroundColor: colors.background }]}>
                  <Text style={[styles.valueText, { color: colors.text }]} numberOfLines={1}>
                    {email}
                  </Text>
                </View>
                {isEditingEmail ? (
                  <>
                    <TextField
                      label="Nouvel email"
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      placeholder="nouveau@exemple.fr"
                      value={newEmail}
                      onChangeText={setNewEmail}
                    />
                    <Button
                      label="Changer d'email"
                      onPress={handleChangeEmail}
                      disabled={!canSubmitEmail}
                      isLoading={isChangingEmail}
                    />
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setIsEditingEmail(true)}
                    hitSlop={8}
                  >
                    <Text style={[styles.cardLink, { color: colors.accent }]}>
                      Changer d'email ›
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* ---- Mot de passe ---- */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.cardTitle, { color: colors.text }]}>Mot de passe</Text>
                <TextInput
                  style={[
                    styles.valueBox,
                    styles.valueInput,
                    { backgroundColor: colors.background, color: colors.text },
                  ]}
                  placeholder="Nouveau mot de passe"
                  placeholderTextColor={colors.textDisabled}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                {/* Jauge 3 segments + libellé d'état (barème de l'inscription). */}
                <View style={styles.gaugeRow}>
                  {[0, 1, 2].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.gaugeSegment,
                        {
                          backgroundColor:
                            newPassword.length > 0 && index < strength
                              ? strengthColors[strength]
                              : colors.surfaceMuted,
                        },
                      ]}
                    />
                  ))}
                  <Text
                    style={[
                      styles.gaugeLabel,
                      {
                        color:
                          newPassword.length > 0 ? strengthColors[strength] : colors.textMuted,
                      },
                    ]}
                  >
                    {newPassword.length > 0 ? STRENGTH_LABELS[strength] : " "}
                  </Text>
                </View>
                {newPassword.length > 0 ? (
                  <Button
                    label="Mettre à jour le mot de passe"
                    onPress={handleChangePassword}
                    disabled={!isPasswordValid}
                    isLoading={isChangingPassword}
                  />
                ) : null}
              </View>

              {/* ---- Accès VIP / Premium ---- */}
              {isPremium ? (
                <View style={[styles.vipCard, { backgroundColor: colors.ink }]}>
                  <View style={[styles.vipDot, { backgroundColor: colors.accent }]} />
                  <View style={styles.flex}>
                    <Text style={[styles.vipTitle, { color: colors.onInk }]}>
                      {plan === "founder" ? "Accès VIP actif" : "Accès Premium actif"}
                    </Text>
                    <Text style={[styles.vipSubtitle, { color: colors.onInk }]}>
                      {plan === "founder"
                        ? "Scans illimités, à vie — merci."
                        : "Scans illimités."}
                    </Text>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>
                      J'ai un code d'accès
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                      Code VIP ou Premium reçu par l'équipe Clork.
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.valueBox,
                      styles.valueInput,
                      { backgroundColor: colors.background, color: colors.text },
                    ]}
                    placeholder="EX : CLORK-VIP"
                    placeholderTextColor={colors.textDisabled}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    value={promoCode}
                    onChangeText={setPromoCode}
                  />
                  {promoCode.trim() ? (
                    <Button
                      label="Activer mon accès"
                      onPress={handleRedeemCode}
                      isLoading={isRedeeming}
                    />
                  ) : null}
                </View>
              )}

              {/* ---- Zone danger ---- */}
              <View
                style={[
                  styles.card,
                  styles.dangerCard,
                  { backgroundColor: colors.surface, borderColor: colors.dangerBorder },
                ]}
              >
                <Text style={[styles.dangerTitle, { color: colors.danger }]}>Zone danger</Text>
                <Text style={[styles.dangerText, { color: colors.textMuted }]}>
                  Plannings, scans et partages seront effacés. Action irréversible.
                </Text>
                <Button
                  label="Supprimer mon compte"
                  variant="danger"
                  onPress={handleDeleteAccount}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: 10 },

  // Carte blanche r16 p18 — langage commun des sous-pages v2.
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  cardHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  cardBody: {
    fontSize: typeScale.caption,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  cardLink: {
    fontSize: typeScale.caption,
    fontFamily: fonts.semiBold,
  },
  valueBox: {
    borderRadius: radius.input,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  valueText: {
    fontSize: typeScale.body - 0.5,
    fontFamily: fonts.semiBold,
  },
  valueInput: {
    fontSize: typeScale.body - 0.5,
    fontFamily: fonts.medium,
    minHeight: 44,
  },

  // ---- Image de profil ----
  avatarCard: { gap: 14 },
  premiumPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  premiumPillLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
  },
  avatarItem: {
    // 4 colonnes de largeur ÉGALE, contenu centré (maquette : repeat(4,1fr)
    // + justify-items:center). Une largeur fixe désalignait les rangées dès
    // qu'une cellule portait un libellé.
    width: "25%",
    alignItems: "center",
    gap: 4,
  },
  avatarRing: {
    width: AVATAR_SIZE + 9,
    height: AVATAR_SIZE + 9,
    borderRadius: radius.pill,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLocked: { opacity: 0.4 },
  lockBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  lockGlyph: { fontSize: 10 },
  avatarLabel: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    // Hauteur réservée même sans libellé : les deux rangées restent alignées.
    height: 12,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  lockedLabel: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
  },
  lockedCta: {
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  lockedCtaLabel: {
    fontSize: 11.5,
    fontFamily: fonts.bold,
  },

  // ---- Mot de passe ----
  gaugeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  gaugeSegment: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
  },
  gaugeLabel: {
    fontSize: 11.5,
    fontFamily: fonts.semiBold,
    marginLeft: 6,
    minWidth: 62,
    textAlign: "right",
  },

  // ---- Accès VIP ----
  vipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    padding: 18,
  },
  vipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  vipTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  vipSubtitle: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    opacity: 0.6,
    marginTop: 2,
  },

  // ---- Zone danger ----
  dangerCard: { gap: 10 },
  dangerTitle: {
    fontSize: typeScale.body,
    fontFamily: fonts.bold,
  },
  dangerText: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    lineHeight: 17,
  },
});
