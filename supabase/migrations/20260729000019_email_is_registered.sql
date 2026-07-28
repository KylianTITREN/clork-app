-- Connexion « e-mail d'abord » (maquette 4f) : un e-mail déjà inscrit mène à
-- l'écran mot de passe (« Content de te revoir »), un e-mail inconnu part
-- DIRECTEMENT en inscription (« Comment tu t'appelles ? »). Cette fonction ne
-- révèle qu'un booléen — choix produit assumé (l'UX de la maquette l'exige).

create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(trim(p_email))
      and u.deleted_at is null
  );
$$;

revoke all on function public.email_is_registered(text) from public;
grant execute on function public.email_is_registered(text) to anon, authenticated;
