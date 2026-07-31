-- Canal B2B : la responsable du magasin depose le fichier Excel officiel du
-- planning, une lecture deterministe (zero IA) le transforme en horaires et la
-- fonction edge publish-planning les ecrit pour les employees inscrites.
--
--   1. stores        : un magasin partenaire et ses deux secrets de depot.
--   2. store_imports : journal des publications (audit et rejeu).
--   3. shifts.source : nouvelle valeur import a cote de scan et manual.
--
-- Les deux nouvelles tables portent des donnees de tiers (noms et horaires de
-- toute une equipe) : RLS activee et AUCUNE policy, donc lisibles uniquement
-- par le role service_role, donc par la seule fonction edge. Les grants par
-- defaut de Supabase sur anon et authenticated sont revoques par prudence.
--
-- Migration REJOUABLE : chaque objet est cree de maniere idempotente.
--
-- Note de redaction : ce fichier evite volontairement les apostrophes, y
-- compris dans les commentaires, pour rester applicable via API management.

-- ---------------------------------------------------------------------------
-- Generateur de code de depot
-- ---------------------------------------------------------------------------
-- 6 caracteres MAJUSCULES, alphabet volontairement ampute des caracteres
-- ambigus (0 et O, 1 et I) : le code est dicte au telephone ou recopie a la
-- main par une responsable de magasin, pas copie-colle.
create or replace function public.generate_store_access_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

revoke all on function public.generate_store_access_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. stores
-- ---------------------------------------------------------------------------
-- access_token : identifie le magasin, vit dans le lien de depot (32 octets).
-- access_code  : second facteur court, tape par la responsable a chaque depot.
-- Les deux sont verifies ensemble par la fonction edge. Passer is_active a
-- false coupe le depot sans rien supprimer de la table.
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  name text not null default '',
  access_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  access_code text not null default public.generate_store_access_code(),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Le token est le seul critere de recherche a chaque depot.
create index if not exists stores_active_token_idx
  on public.stores (access_token)
  where is_active;

-- ---------------------------------------------------------------------------
-- 2. store_imports
-- ---------------------------------------------------------------------------
-- payload : le ParsedPlanning complet tel que lu du fichier Excel. Il sert
-- deux choses — auditer ce qui a ete publie (aucune IA dans la chaine, donc
-- une divergence vient forcement du fichier) et rejouer une semaine sans
-- redemander le fichier a la responsable.
-- matched : la liste des employees appariees a un compte Clork.
-- published_at reste null pour une tentative qui a tout echoue.
create table if not exists public.store_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  week_start date not null,
  source_file_name text,
  payload jsonb not null,
  matched jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists store_imports_store_week_idx
  on public.store_imports (store_id, week_start desc);

-- ---------------------------------------------------------------------------
-- RLS : service_role uniquement
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.store_imports enable row level security;

-- Aucune policy declaree : RLS active sans policy bloque tout le monde sauf
-- service_role, qui contourne RLS par construction. Les revoke ci-dessous
-- ferment aussi la porte cote privileges, pas seulement cote policies.
revoke all on table public.stores from anon, authenticated;
revoke all on table public.store_imports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. shifts.source accepte import
-- ---------------------------------------------------------------------------
-- Un creneau publie par le magasin doit rester distinguable de celui lu sur
-- une photo (scan) et surtout de celui saisi a la main (manual) : la
-- republication de la semaine efface import et scan, jamais manual.
alter table public.shifts drop constraint if exists shifts_source_check;
alter table public.shifts add constraint shifts_source_check
  check (source in ('scan', 'manual', 'import'));

-- ---------------------------------------------------------------------------
-- Magasin de test de la beta
-- ---------------------------------------------------------------------------
-- Le token et le code sont generes par les valeurs par defaut. Pour les
-- recuperer apres application de la migration (role service_role uniquement) :
--   select label, access_token, access_code from public.stores;
insert into public.stores (label, name)
values ('1064 - Wasquehal', 'Nocibé Wasquehal')
on conflict (label) do nothing;
