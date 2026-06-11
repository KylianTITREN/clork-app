-- Clork — schéma initial.
-- Tables : profiles, scans, scan_rows, shifts, scan_shares + bucket storage "scans".
-- RLS activée partout : chacun ne voit que ses données ; un scan partagé est
-- lisible par ses invités (le claim complet arrive en phase 6 via RPC).
-- Ordre : helpers → toutes les tables → triggers → policies (certaines policies
-- référencent des tables créées plus loin, d'où la séparation).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- profiles — 1 ligne par utilisateur, créée automatiquement à l'inscription
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  -- Noms tels qu'ils peuvent apparaître sur le planning papier
  -- (ex: {"COPIN Typhanie", "Typhanie", "COPIN T."})
  employee_aliases text[] not null default '{}',
  employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- scans — une photo de planning envoyée et son extraction brute
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  photo_path text not null, -- chemin dans le bucket storage "scans"
  store_label text,
  week_start date,
  week_end date,
  status text not null default 'pending'
    check (status in ('pending', 'extracted', 'validated', 'failed')),
  photo_quality text
    check (photo_quality in ('good', 'degraded', 'unusable')),
  raw_extraction jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scans_uploader_idx on public.scans (uploader_id, week_start desc);

-- scan_rows — une ligne employé extraite d'un scan
create table public.scan_rows (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  employee_label text not null, -- nom tel que lu sur le planning
  row_index int not null,
  raw jsonb not null, -- l'EmployeeRow complet de l'extraction
  created_at timestamptz not null default now(),
  unique (scan_id, row_index)
);

create index scan_rows_scan_idx on public.scan_rows (scan_id);

-- shifts — les créneaux validés d'un utilisateur (la vérité de son calendrier)
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scan_row_id uuid references public.scan_rows (id) on delete set null,
  date date not null,
  start_at timestamptz,
  end_at timestamptz,
  type text not null default 'work'
    check (type in ('work', 'off', 'leave', 'rh', 'cp', 'meeting')),
  note text,
  source text not null default 'scan' check (source in ('scan', 'manual')),
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- un même utilisateur ne peut pas avoir deux créneaux identiques :
  -- le re-scan d'une semaine fait un upsert sur cette clé
  constraint shifts_start_required check (type not in ('work', 'meeting') or start_at is not null),
  unique nulls not distinct (user_id, date, start_at)
);

create index shifts_user_date_idx on public.shifts (user_id, date);

-- scan_shares — invitations « Sofia récupère son planning depuis mon scan »
create table public.scan_shares (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  invited_user_id uuid references public.profiles (id) on delete cascade,
  claimed_row_id uuid references public.scan_rows (id) on delete set null,
  created_at timestamptz not null default now()
);

create index scan_shares_scan_idx on public.scan_shares (scan_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger scans_updated_at
  before update on public.scans
  for each row execute function public.set_updated_at();

create trigger shifts_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.scans enable row level security;
alter table public.scan_rows enable row level security;
alter table public.shifts enable row level security;
alter table public.scan_shares enable row level security;

-- profiles
create policy "profiles: read own"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- scans
create policy "scans: uploader full access"
  on public.scans for all
  using (uploader_id = (select auth.uid()))
  with check (uploader_id = (select auth.uid()));

create policy "scans: invited users can read"
  on public.scans for select
  using (
    exists (
      select 1 from public.scan_shares s
      where s.scan_id = scans.id
        and s.invited_user_id = (select auth.uid())
    )
  );

-- scan_rows : visibles si le scan parent est visible
create policy "scan_rows: visible with parent scan"
  on public.scan_rows for select
  using (
    exists (
      select 1 from public.scans sc
      where sc.id = scan_rows.scan_id
        and (
          sc.uploader_id = (select auth.uid())
          or exists (
            select 1 from public.scan_shares s
            where s.scan_id = sc.id
              and s.invited_user_id = (select auth.uid())
          )
        )
    )
  );

create policy "scan_rows: uploader writes"
  on public.scan_rows for insert
  with check (
    exists (
      select 1 from public.scans sc
      where sc.id = scan_rows.scan_id
        and sc.uploader_id = (select auth.uid())
    )
  );

create policy "scan_rows: uploader deletes"
  on public.scan_rows for delete
  using (
    exists (
      select 1 from public.scans sc
      where sc.id = scan_rows.scan_id
        and sc.uploader_id = (select auth.uid())
    )
  );

-- shifts
create policy "shifts: owner full access"
  on public.shifts for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- scan_shares
create policy "scan_shares: scan uploader manages"
  on public.scan_shares for all
  using (
    exists (
      select 1 from public.scans sc
      where sc.id = scan_shares.scan_id
        and sc.uploader_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.scans sc
      where sc.id = scan_shares.scan_id
        and sc.uploader_id = (select auth.uid())
    )
  );

create policy "scan_shares: invited user reads own"
  on public.scan_shares for select
  using (invited_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage — bucket privé pour les photos de plannings
-- Chemin imposé : scans/{user_id}/{scan_id}.jpg
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('scans', 'scans', false)
on conflict (id) do nothing;

create policy "storage scans: owner uploads"
  on storage.objects for insert
  with check (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage scans: owner reads"
  on storage.objects for select
  using (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage scans: owner deletes"
  on storage.objects for delete
  using (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
