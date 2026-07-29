-- Durcissement sécurité (audit v2). Migration REJOUABLE, sans rupture des
-- lectures existantes côté app.
--
--   1. scan_shares : l'UPDATE client devient une RPC verrouillée — l'invité
--      pouvait réécrire scan_id et s'attribuer le scan d'un tiers.
--   2. get_team_links : la ligne réclamée doit appartenir au scan consulté.
--   3. claim_scan_share : on ne réclame pas son propre code.
--   4. redeem_promo_code : réservé aux comptes connectés, usage décompté
--      seulement en cas de succès.
--   5. follow_code : sorti de public.profiles — un suiveur lisait toutes les
--      colonnes du profil suivi, dont ce code d'accès.

-- ---------------------------------------------------------------------------
-- 1. scan_shares — plus d'écriture directe depuis le client
-- ---------------------------------------------------------------------------
-- L'ancienne policy autorisait l'invité à modifier N'IMPORTE quelle colonne de
-- SA ligne, scan_id compris. En le pointant sur le scan d'un tiers il obtenait
-- raw_extraction (policy « scans: invited users can read »), les scan_rows, et
-- passait pour « invitée » dans get_team_links. La ligne n'est plus modifiable
-- qu'à travers record_claimed_row, qui n'écrit que claimed_row_id.
drop policy if exists "scan_shares: invited user updates own claim" on public.scan_shares;

create or replace function public.record_claimed_row(p_scan_id uuid, p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  -- Sans effet (volontairement silencieux) si aucun partage ne correspond :
  -- l'uploader valide son propre scan par le même chemin et n'a évidemment pas
  -- de ligne scan_shares à son nom. La condition sur scan_rows garantit que la
  -- ligne réclamée appartient bien au scan visé.
  update public.scan_shares s
     set claimed_row_id = p_row_id
   where s.scan_id = p_scan_id
     and s.invited_user_id = auth.uid()
     and exists (
       select 1 from public.scan_rows r
       where r.id = p_row_id and r.scan_id = p_scan_id
     );
end;
$$;

revoke all on function public.record_claimed_row(uuid, uuid) from public, anon;
grant execute on function public.record_claimed_row(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_team_links — la ligne réclamée doit venir du scan consulté
-- ---------------------------------------------------------------------------
-- Le join ne filtrait que par s.scan_id : une ligne réclamée sur un AUTRE scan
-- injectait son row_index dans la vue Équipe (identités décalées). Le reste de
-- la fonction est inchangé (cf. 20260729000018_team_live_links.sql).
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
  -- row_index de la ligne qu'elles ont réclamée SUR CE SCAN.
  with links as (
    select v_scan.uploader_id as user_id, null::int as row_index
    union
    select s.invited_user_id, r.row_index
    from public.scan_shares s
    join public.scan_rows r on r.id = s.claimed_row_id and r.scan_id = v_scan.id
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

revoke all on function public.get_team_links(uuid) from public, anon;
grant execute on function public.get_team_links(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. claim_scan_share — pas de réclamation de son propre code
-- ---------------------------------------------------------------------------
-- L'uploader qui saisissait son propre code d'équipe devenait « invité » de son
-- scan : il apparaissait deux fois dans get_team_links et pouvait s'y attribuer
-- un row_index. Le scan est donc lu AVANT l'update, pour connaître l'uploader.
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

  select * into v_scan from public.scans where id = v_share.scan_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Scan introuvable');
  end if;
  if v_scan.uploader_id = auth.uid() then
    return jsonb_build_object('success', false, 'error', 'C''est ton propre code 😄');
  end if;

  update public.scan_shares set invited_user_id = auth.uid() where id = v_share.id;

  return jsonb_build_object(
    'success', true,
    'scan_id', v_scan.id,
    'week_start', v_scan.week_start,
    'store_label', v_scan.store_label,
    'raw_extraction', v_scan.raw_extraction
  );
end;
$$;

revoke all on function public.claim_scan_share(text) from public, anon;
grant execute on function public.claim_scan_share(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. redeem_promo_code — comptes connectés uniquement, usage décompté au succès
-- ---------------------------------------------------------------------------
-- La fonction restait exécutable par PUBLIC (donc anon) : sans auth.uid(), la
-- mise à jour du profil ne touchait aucune ligne mais l'usage était consommé —
-- de quoi épuiser un code founder depuis l'extérieur. La ligne est maintenant
-- verrouillée puis décomptée seulement une fois le plan effectivement appliqué.
create or replace function public.redeem_promo_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_code));
  v_plan text;
  v_applied int;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select plan into v_plan
    from promo_codes
   where code = v_code and uses < max_uses
   for update;
  if v_plan is null then
    raise exception 'Code invalide ou épuisé';
  end if;

  update profiles set plan = v_plan, updated_at = now() where id = auth.uid();
  get diagnostics v_applied = row_count;
  if v_applied = 0 then
    raise exception 'Profil introuvable';
  end if;

  update promo_codes set uses = uses + 1 where code = v_code;
  return v_plan;
end;
$$;

revoke all on function public.redeem_promo_code(text) from public, anon;
grant execute on function public.redeem_promo_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. follow_code — hors de public.profiles
-- ---------------------------------------------------------------------------
-- « profiles: followed visible to followers » donne au suiveur TOUTES les
-- colonnes du profil suivi, dont follow_code : il pouvait redistribuer le code
-- d'accès de la personne suivie. La RLS ne filtre que des lignes, jamais des
-- colonnes, et l'app lit profiles avec select("*") (assistant de scan) : un
-- REVOKE au niveau colonne casserait cette lecture. Le code est donc déplacé
-- dans une table à part, lisible du seul propriétaire, et réexposé sous le même
-- nom via une colonne calculée — l'app continue de lire profiles.follow_code.

create table if not exists public.follow_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique default encode(gen_random_bytes(4), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.follow_codes enable row level security;

drop policy if exists "follow_codes: read own" on public.follow_codes;
create policy "follow_codes: read own"
  on public.follow_codes for select
  using (user_id = (select auth.uid()));

grant select on public.follow_codes to authenticated;

-- Reprise des codes existants : les personnes déjà suivies gardent le leur.
-- Dynamique car la colonne source disparaît juste après (rejeu de la migration).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'follow_code'
  ) then
    execute 'insert into public.follow_codes (user_id, code)
             select id, follow_code from public.profiles
             on conflict (user_id) do nothing';
  end if;
end;
$$;

-- Filet : tout profil sans code en reçoit un (rejeu partiel, profils orphelins).
insert into public.follow_codes (user_id)
select p.id from public.profiles p
where not exists (select 1 from public.follow_codes c where c.user_id = p.id);

alter table public.profiles drop column if exists follow_code;

-- handle_new_user n'insère que id + display_name : le code est posé ici.
create or replace function public.issue_follow_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.follow_codes (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_follow_code on public.profiles;
create trigger profiles_follow_code
  after insert on public.profiles
  for each row execute function public.issue_follow_code();

-- Colonne calculée : PostgREST expose toujours profiles.follow_code, mais la
-- valeur traverse la RLS de follow_codes (security invoker) → null pour un
-- suiveur, son code pour le propriétaire.
create or replace function public.follow_code(public.profiles)
returns text
language sql
stable
set search_path = public
as $$
  select c.code from public.follow_codes c where c.user_id = $1.id;
$$;

revoke all on function public.follow_code(public.profiles) from public, anon;
grant execute on function public.follow_code(public.profiles) to authenticated;

-- follow_user résout le code dans la nouvelle table (reste inchangé sinon,
-- cf. 20260613000011_free_plan_limits.sql : quota de suivi du plan gratuit).
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
  select p.* into v_target
    from public.follow_codes c
    join public.profiles p on p.id = c.user_id
   where c.code = lower(trim(p_code));
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

revoke all on function public.follow_user(text) from public, anon;
grant execute on function public.follow_user(text) to authenticated;

-- Le cache de schéma PostgREST doit voir la colonne calculée immédiatement.
notify pgrst, 'reload schema';
