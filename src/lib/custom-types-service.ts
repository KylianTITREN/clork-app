// Types de créneau personnalisés (table custom_shift_types, RLS par user_id).
// L'utilisateur crée ses propres libellés (ex. « Inventaire ») avec un
// caractère payé/non payé ; un shift les référence via custom_type_id.

import { supabase } from "@/lib/supabase";

export type CustomShiftType = {
  id: string;
  name: string;
  isPaid: boolean;
};

type CustomShiftTypeRow = {
  id: string;
  name: string;
  is_paid: boolean;
};

/** Code Postgres d'une violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = "23505";

function toCustomShiftType(row: CustomShiftTypeRow): CustomShiftType {
  return { id: row.id, name: row.name, isPaid: row.is_paid };
}

/** Types personnalisés de l'utilisateur courant, triés par nom. */
export async function listCustomTypes(): Promise<CustomShiftType[]> {
  const { data, error } = await supabase
    .from("custom_shift_types")
    .select("id, name, is_paid")
    .order("name", { ascending: true });
  if (error) {
    throw new Error("Chargement des types personnalisés impossible : " + error.message);
  }
  return (data ?? []).map(toCustomShiftType);
}

/**
 * Crée un type personnalisé. L'unicité (insensible à la casse) est garantie
 * côté base : un doublon renvoie un message clair au lieu d'une erreur brute.
 */
export async function createCustomType(
  name: string,
  isPaid: boolean,
): Promise<CustomShiftType> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Le nom du type ne peut pas être vide.");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Connecte-toi pour créer un type personnalisé.");
  }
  const { data, error } = await supabase
    .from("custom_shift_types")
    .insert({ user_id: auth.user.id, name: trimmed, is_paid: isPaid })
    .select("id, name, is_paid")
    .single<CustomShiftTypeRow>();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(`Un type nommé « ${trimmed} » existe déjà.`);
    }
    throw new Error("Création du type impossible : " + error.message);
  }
  if (!data) {
    throw new Error("Création du type impossible : réponse vide.");
  }
  return toCustomShiftType(data);
}

/**
 * Supprime un type personnalisé. Les shifts qui l'utilisaient sont détachés
 * (custom_type_id remis à null côté base), pas supprimés.
 */
export async function deleteCustomType(id: string): Promise<void> {
  const { error } = await supabase.from("custom_shift_types").delete().eq("id", id);
  if (error) {
    throw new Error("Suppression du type impossible : " + error.message);
  }
}
