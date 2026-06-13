-- Limites du plan gratuit, appliquées côté serveur (incontournables) :
-- 1) Suivre un seul planning en gratuit (illimité en premium/founder).
create or replace function public.follow_user(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_plan text;
  v_count int;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentification requise');
  end if;
  select * into v_target from public.profiles where follow_code = lower(trim(p_code));
  if not found then
    return jsonb_build_object('success', false, 'error', 'Code invalide');
  end if;
  if v_target.id = auth.uid() then
    return jsonb_build_object('success', false, 'error', 'C''est ton propre code 😄');
  end if;
  select plan into v_plan from public.profiles where id = auth.uid();
  if coalesce(v_plan, 'free') = 'free' then
    select count(*) into v_count from public.follows
      where follower_id = auth.uid() and followed_id <> v_target.id;
    if v_count >= 1 then
      return jsonb_build_object('success', false, 'error',
        'Le plan gratuit permet de suivre 1 planning. Passe en Premium pour en suivre plusieurs.');
    end if;
  end if;
  insert into public.follows (follower_id, followed_id)
  values (auth.uid(), v_target.id)
  on conflict do nothing;
  return jsonb_build_object('success', true, 'display_name', v_target.display_name);
end;
$$;

-- 2) Créer un code de partage = premium/founder uniquement
--    (le RECEVOIR reste gratuit et illimité : boucle virale préservée).
drop policy if exists "scan_shares: uploader can insert" on public.scan_shares;
create policy "scan_shares: premium uploader can insert" on public.scan_shares
  for insert with check (
    exists (
      select 1 from public.scans s
      where s.id = scan_id and s.uploader_id = auth.uid()
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.plan in ('premium', 'founder')
    )
  );

-- 3) L'ancienne policy ALL couvrait aussi INSERT : découpée en SELECT/DELETE.
drop policy if exists "scan_shares: scan uploader manages" on public.scan_shares;
create policy "scan_shares: uploader reads own shares" on public.scan_shares
  for select using (exists (select 1 from public.scans s where s.id = scan_id and s.uploader_id = auth.uid()));
create policy "scan_shares: uploader deletes own shares" on public.scan_shares
  for delete using (exists (select 1 from public.scans s where s.id = scan_id and s.uploader_id = auth.uid()));
