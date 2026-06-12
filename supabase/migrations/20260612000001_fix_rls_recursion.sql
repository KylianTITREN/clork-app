-- Correctif : récursion infinie (42P17) entre les policies de scans et
-- scan_shares (scans → scan_shares → scans). On casse le cycle avec une
-- fonction SECURITY DEFINER qui lit scan_shares sans repasser par la RLS.

create or replace function public.is_scan_shared_with(p_scan_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scan_shares s
    where s.scan_id = p_scan_id
      and s.invited_user_id = p_user_id
  );
$$;

-- scans : la lecture par les invités passe par la fonction (plus de référence
-- directe à scan_shares dans la policy).
drop policy "scans: invited users can read" on public.scans;
create policy "scans: invited users can read"
  on public.scans for select
  using (public.is_scan_shared_with(id, (select auth.uid())));

-- scan_rows : visible si le scan parent est visible — la sous-requête sur
-- scans applique déjà la RLS de scans (uploader OU invité), inutile de
-- dupliquer la logique ici.
drop policy "scan_rows: visible with parent scan" on public.scan_rows;
create policy "scan_rows: visible with parent scan"
  on public.scan_rows for select
  using (
    exists (
      select 1 from public.scans sc
      where sc.id = scan_rows.scan_id
    )
  );
