-- « Équipe vivante » : la vue Équipe superpose aux lignes du scan les
-- créneaux ACTUELS des comptes reliés — l'uploader + chaque invitée ayant
-- réclamé sa ligne via le code équipe — avec prénom + avatar à jour.
--
-- Accès (mêmes règles que l'UI, appliquées ICI côté serveur) :
--   · uploader et invitée : leur PROPRE ligne toujours ; celles des autres
--     seulement si l'appelant est premium (sinon l'app montre des silhouettes,
--     et la base ne doit pas en dire plus que l'écran) ;
--   · suiveur : tout, si l'uploader est premium (même règle que la policy
--     « scans: followers can read validated »).

create or replace function public.get_team_links(p_scan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scan public.scans%rowtype;
  v_caller uuid := auth.uid();
  v_is_uploader boolean;
  v_is_invited boolean;
  v_is_follower boolean;
  v_caller_premium boolean;
  v_uploader_premium boolean;
  v_full_access boolean;
  v_result jsonb;
begin
  if v_caller is null then
    return jsonb_build_object('success', false, 'error', 'Non authentifié');
  end if;

  select * into v_scan from public.scans where id = p_scan_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Scan introuvable');
  end if;

  v_is_uploader := v_scan.uploader_id = v_caller;
  v_is_invited := exists (
    select 1 from public.scan_shares s
    where s.scan_id = v_scan.id and s.invited_user_id = v_caller
  );
  v_is_follower := exists (
    select 1 from public.follows f
    where f.follower_id = v_caller and f.followed_id = v_scan.uploader_id
  );
  v_caller_premium := exists (
    select 1 from public.profiles p
    where p.id = v_caller and p.plan in ('premium', 'founder')
  );
  v_uploader_premium := exists (
    select 1 from public.profiles p
    where p.id = v_scan.uploader_id and p.plan in ('premium', 'founder')
  );

  if not (v_is_uploader or v_is_invited or (v_is_follower and v_uploader_premium)) then
    return jsonb_build_object('success', false, 'error', 'Accès refusé');
  end if;

  -- Toutes les lignes, ou seulement la sienne (uploader/invitée non premium).
  v_full_access := (v_is_follower and v_uploader_premium)
    or ((v_is_uploader or v_is_invited) and v_caller_premium);

  -- Un lien par compte relié. row_index null = l'uploader (sa ligne est
  -- résolue côté app par alias, comme partout) ; les invitées portent le
  -- row_index de la ligne qu'elles ont réclamée.
  with links as (
    select v_scan.uploader_id as user_id, null::int as row_index
    union
    select s.invited_user_id, r.row_index
    from public.scan_shares s
    join public.scan_rows r on r.id = s.claimed_row_id
    where s.scan_id = v_scan.id
      and s.invited_user_id is not null
  )
  select jsonb_agg(
    jsonb_build_object(
      'user_id', l.user_id,
      'row_index', l.row_index,
      'display_name', p.display_name,
      'employee_aliases', to_jsonb(coalesce(p.employee_aliases, '{}')),
      'avatar', p.avatar,
      'shifts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'date', sh.date,
          'start_at', sh.start_at,
          'end_at', sh.end_at,
          'type', sh.type,
          'break_minutes', sh.break_minutes
        ) order by sh.date, sh.start_at)
        from public.shifts sh
        where sh.user_id = l.user_id
          and sh.date between v_scan.week_start and v_scan.week_start + 6
      ), '[]'::jsonb)
    )
  )
  into v_result
  from links l
  join public.profiles p on p.id = l.user_id
  where v_full_access or l.user_id = v_caller;

  return jsonb_build_object('success', true, 'links', coalesce(v_result, '[]'::jsonb));
end;
$$;

revoke all on function public.get_team_links(uuid) from public;
grant execute on function public.get_team_links(uuid) to authenticated;
