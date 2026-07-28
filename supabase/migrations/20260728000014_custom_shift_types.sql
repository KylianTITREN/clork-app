-- Types de créneau personnalisés : l'utilisateur crée ses propres libellés
-- (ex. « Inventaire », « Formation sécu ») avec un caractère payé/non payé.
-- Un shift peut pointer vers un type personnalisé via custom_type_id.

create table public.custom_shift_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_paid boolean not null default true,
  created_at timestamptz default now()
);

-- Unicité insensible à la casse par utilisateur (« Inventaire » = « inventaire »).
create unique index custom_shift_types_user_name
  on public.custom_shift_types (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.custom_shift_types enable row level security;

create policy "custom_shift_types: read own"
  on public.custom_shift_types for select
  using (user_id = (select auth.uid()));

create policy "custom_shift_types: insert own"
  on public.custom_shift_types for insert
  with check (user_id = (select auth.uid()));

create policy "custom_shift_types: update own"
  on public.custom_shift_types for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "custom_shift_types: delete own"
  on public.custom_shift_types for delete
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Lien depuis les shifts : la suppression d'un type personnalisé détache les
-- shifts concernés (custom_type_id repasse à null) sans les supprimer.
-- ---------------------------------------------------------------------------

alter table public.shifts
  add column custom_type_id uuid
    references public.custom_shift_types (id) on delete set null;
