-- Partage : claim d'un code d'invitation (RPC security definer car l'invitée
-- ne peut pas lire scan_shares avant d'y être rattachée) + token push Expo.

alter table public.profiles
  add column expo_push_token text;

create or replace function public.claim_scan_share(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.scan_shares%rowtype;
  v_scan public.scans%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentification requise');
  end if;

  select * into v_share from public.scan_shares where invite_code = lower(trim(p_code));
  if not found then
    return jsonb_build_object('success', false, 'error', 'Code invalide');
  end if;
  if v_share.invited_user_id is not null and v_share.invited_user_id <> auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Ce code a déjà été utilisé par quelqu''un d''autre');
  end if;

  update public.scan_shares set invited_user_id = auth.uid() where id = v_share.id;

  select * into v_scan from public.scans where id = v_share.scan_id;
  return jsonb_build_object(
    'success', true,
    'scan_id', v_scan.id,
    'week_start', v_scan.week_start,
    'store_label', v_scan.store_label,
    'raw_extraction', v_scan.raw_extraction
  );
end;
$$;

revoke execute on function public.claim_scan_share(text) from public, anon;
grant execute on function public.claim_scan_share(text) to authenticated;

-- L'invitée peut enregistrer la ligne qu'elle a choisie sur le scan partagé.
create policy "scan_shares: invited user updates own claim"
  on public.scan_shares for update
  using (invited_user_id = (select auth.uid()))
  with check (invited_user_id = (select auth.uid()));
