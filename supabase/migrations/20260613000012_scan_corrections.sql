-- Journal des corrections manuelles faites à la VALIDATION d'un scan : quand
-- l'utilisatrice change le type/les horaires/l'inclusion d'un jour proposé par
-- l'IA, on enregistre (valeur IA → valeur retenue). C'est le signal « l'IA
-- s'est trompée » : exploitable pour mesurer la qualité d'extraction et
-- améliorer le prompt (rapprocher scan_id → photo + extraction + corrections).
create table public.scan_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scan_id uuid not null references public.scans (id) on delete cascade,
  scan_row_id uuid references public.scan_rows (id) on delete set null,
  date date,
  field text not null, -- 'type' | 'start' | 'end' | 'include' | 'break_minutes'
  ai_value text,       -- valeur produite par l'IA (null = absente)
  user_value text,     -- valeur retenue par l'utilisatrice
  created_at timestamptz not null default now()
);

create index scan_corrections_scan_idx on public.scan_corrections (scan_id);
create index scan_corrections_user_idx on public.scan_corrections (user_id, created_at desc);

alter table public.scan_corrections enable row level security;

-- Chacun écrit/relit ses propres corrections ; l'analyse globale se fait via la
-- service_role (dashboard Supabase / export), jamais exposée au client.
create policy "scan_corrections: owner inserts"
  on public.scan_corrections for insert
  with check (user_id = (select auth.uid()));

create policy "scan_corrections: owner reads"
  on public.scan_corrections for select
  using (user_id = (select auth.uid()));
