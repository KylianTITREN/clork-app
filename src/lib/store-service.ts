// Rattachement au magasin (Clork Pro) — trois portes d'entrée, de la meilleure
// à la moins bonne :
//   1. INVITATION PERSONNELLE : la responsable a inscrit le nom et l'adresse de
//      l'employée à son carnet d'équipe AVANT même qu'elle ait l'app. Au premier
//      lancement, `link_store_by_email()` retrouve cette ligne et crée l'adhésion
//      déjà CONFIRMÉE — la responsable l'a désignée, c'est cela la confirmation.
//   2. ENSEIGNE + NUMÉRO DE MAGASIN (« Nocibé » + « 1064 ») : adhésion « en
//      attente », la responsable confirme au dépôt suivant. Le numéro n'a pas
//      besoin d'être secret — rejoindre ne donne accès à rien avant confirmation.
//   3. CODE D'INVITATION à 6 caractères : même chemin, en repli.
// L'app ne voit jamais les secrets du magasin (lien de dépôt, code responsable) :
// les RPC ne renvoient que le libellé, le statut et le nom de la ligne.

import { supabase } from "@/lib/supabase";

export type StoreMembershipStatus = "pending" | "confirmed";

export type MyStore = {
  /** Libellé public du magasin, tel que saisi par la responsable. */
  label: string;
  status: StoreMembershipStatus;
  /** Nom de la ligne du planning sous lequel elle est reconnue (confirmée seulement). */
  employeeName: string | null;
};

/** Enseigne (Nocibé, Sephora…) : aucun secret, juste un nom de marque. */
export type StoreOrganization = {
  /** Identifiant stable envoyé aux RPC. */
  slug: string;
  /** Libellé affiché à l'employée. */
  name: string;
};

type JoinStoreResult = {
  success?: boolean;
  store_label?: string | null;
  status?: string | null;
  error?: string | null;
};

type MyStoreResult = {
  store_label?: string | null;
  status?: string | null;
  employee_name?: string | null;
};

/**
 * Un statut inattendu ne doit pas faire croire à une adhésion confirmée :
 * seul « confirmed » l'est, tout le reste retombe sur l'attente.
 */
function toStatus(value: string | null | undefined): StoreMembershipStatus {
  return value === "confirmed" ? "confirmed" : "pending";
}

/**
 * Les deux portes d'entrée « en attente » (code, enseigne + numéro) partagent
 * exactement le même retour côté serveur : une seule lecture ici.
 */
function toJoinedStore(result: JoinStoreResult | null): MyStore {
  if (!result?.success) {
    throw new Error(result?.error ?? "Code magasin invalide");
  }
  return {
    label: result.store_label?.trim() || "Mon magasin",
    status: toStatus(result.status),
    // Le nom de planning n'existe qu'après confirmation par la responsable.
    employeeName: null,
  };
}

/**
 * Demande à rejoindre un magasin avec le code d'équipe. L'adhésion naît « en
 * attente » : la responsable doit encore confirmer la ligne du planning.
 * Idempotente côté serveur — un code déjà saisi renvoie l'adhésion existante.
 */
export async function joinStore(code: string): Promise<MyStore> {
  const cleaned = code.trim().toUpperCase();
  if (!cleaned) throw new Error("Saisis le code donné par ta responsable.");

  const { data, error } = await supabase.rpc("join_store", { p_code: cleaned });
  if (error) throw new Error(error.message);

  return toJoinedStore((data ?? null) as JoinStoreResult | null);
}

/**
 * Rejoindre par l'enseigne et le VRAI numéro de magasin (« 1064 »), celui que
 * l'employée lit sur ses documents. Même niveau de preuve qu'un code d'équipe :
 * l'adhésion reste « en attente » jusqu'à la confirmation de la responsable.
 */
export async function joinStoreByNumber(orgSlug: string, storeNumber: string): Promise<MyStore> {
  const slug = orgSlug.trim();
  const number = storeNumber.trim();
  if (!slug) throw new Error("Choisis ton enseigne.");
  if (!number) throw new Error("Saisis le numéro de ton magasin.");

  const { data, error } = await supabase.rpc("join_store_by_number", {
    p_org_slug: slug,
    p_store_number: number,
  });
  if (error) throw new Error(error.message);

  return toJoinedStore((data ?? null) as JoinStoreResult | null);
}

/**
 * Enseignes proposées à la saisie manuelle. Aucun secret : la table ne porte que
 * des noms de marques. Ne lève jamais — sans liste, l'écran retombe sur le code
 * d'invitation plutôt que d'afficher une erreur pour un choix de confort.
 */
export async function listOrganizations(): Promise<StoreOrganization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("slug, name")
    .order("name");
  if (error) return [];
  return ((data ?? []) as StoreOrganization[]).filter((org) => Boolean(org.slug && org.name));
}

/** Adhésion vivante de l'utilisateur connecté, ou null s'il n'a pas de magasin. */
export async function getMyStore(): Promise<MyStore | null> {
  const { data, error } = await supabase.rpc("my_store");
  if (error) throw new Error(error.message);

  const result = (data ?? null) as MyStoreResult | null;
  if (!result?.store_label) return null;

  return {
    label: result.store_label,
    status: toStatus(result.status),
    employeeName: result.employee_name?.trim() || null,
  };
}

/** Comptes pour lesquels le rattachement automatique a déjà été tenté. */
const autoLinkAttempted = new Set<string>();

/**
 * Rattachement automatique par l'adresse du compte : si la responsable a inscrit
 * cette adresse à son carnet d'équipe, l'adhésion est créée CONFIRMÉE d'office.
 *
 * Silencieuse par construction. Ne pas figurer au carnet d'un magasin est le cas
 * de l'immense majorité des comptes — c'est la normale, pas une anomalie : rien
 * ne doit remonter à l'écran, ni erreur ni annonce. Elle ne s'exécute qu'une fois
 * par session et par compte, et ne réécrit rien si l'adhésion existe déjà.
 */
export async function autoLinkStoreOnce(userId: string): Promise<void> {
  if (autoLinkAttempted.has(userId)) return;
  // Marqué AVANT l'appel : un échec réseau ne doit pas relancer la tentative à
  // chaque rendu, et deux effets concurrents ne doivent pas la doubler.
  autoLinkAttempted.add(userId);
  try {
    // Déjà rattachée (par le carnet ou à la main) : rien à chercher, rien à
    // réécrire — le carnet ne déplace jamais quelqu'un d'un magasin à un autre.
    const existing = await getMyStore();
    if (existing) return;
    await supabase.rpc("link_store_by_email");
  } catch {
    // Silence volontaire : ce rattachement est un bonus, jamais un prérequis.
  }
}
