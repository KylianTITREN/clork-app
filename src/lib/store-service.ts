// Rattachement au magasin (Clork Pro) — poignée de main en deux temps :
//   1. la responsable diffuse le CODE MAGASIN à son équipe ; l'employée le
//      saisit une fois ici → adhésion « en attente » ;
//   2. au dépôt suivant, la responsable désigne la ligne du planning qui lui
//      correspond → adhésion « confirmée », avec le nom exact du planning.
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
 * Demande à rejoindre un magasin avec le code d'équipe. L'adhésion naît « en
 * attente » : la responsable doit encore confirmer la ligne du planning.
 * Idempotente côté serveur — un code déjà saisi renvoie l'adhésion existante.
 */
export async function joinStore(code: string): Promise<MyStore> {
  const cleaned = code.trim().toUpperCase();
  if (!cleaned) throw new Error("Saisis le code donné par ta responsable.");

  const { data, error } = await supabase.rpc("join_store", { p_code: cleaned });
  if (error) throw new Error(error.message);

  const result = (data ?? null) as JoinStoreResult | null;
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
