-- Cloisonnement par magasin du canal B2B (Clork Pro).
--
-- Probleme resolu : jusque-la, publish-planning appariait les lignes du fichier
-- Excel par NOM sur TOUS les profils Clork. Une homonyme employee dans un autre
-- magasin pouvait donc recevoir le planning de Wasquehal. Un faux horaire est
-- pire quun horaire absent, une fuite dhoraires lest encore plus.
--
-- Modele retenu : poignee de main en deux temps.
--   1. La responsable diffuse un CODE MAGASIN (stores.join_code) a son equipe.
--      Lemployee le saisit une fois dans lapp via join_store() : adhesion
--      creee en statut pending. Elle ne choisit PAS son magasin librement, elle
--      prouve seulement quon lui a donne le code.
--   2. Au depot suivant, le site montre a la responsable les adhesions pending
--      et lui fait designer, pour chacune, la LIGNE de son fichier. La fonction
--      edge ecrit alors employee_name et passe ladhesion en confirmed.
--   Ensuite lappariement est direct : plus aucun rapprochement flou.
--
-- Trois secrets a ne pas confondre sur stores :
--   · access_token : identifie le magasin, vit dans le lien de depot.
--   · access_code  : second facteur du depot, secret de la RESPONSABLE.
--   · join_code    : code dequipe, distribue aux EMPLOYEES. Il ne donne aucun
--                    droit de depot, seulement le droit de demander a rejoindre.
--
-- Aucune des trois colonnes nest lisible par le role authenticated : la table
-- stores est revoquee et sans policy, et les RPC ci-dessous ne renvoient que
-- le libelle du magasin.
--
-- Migration REJOUABLE : chaque objet est cree de maniere idempotente.
--
-- Note de redaction : ce fichier evite volontairement les apostrophes, y
-- compris dans les commentaires, pour rester applicable via API management.

-- ---------------------------------------------------------------------------
-- 1. stores.join_code
-- ---------------------------------------------------------------------------
-- Meme alphabet non ambigu que access_code (ni 0/O ni 1/I) : ce code est dicte
-- de vive voix ou colle sur le tableau de la reserve, pas copie-colle.

alter table public.stores
  add column if not exists join_code text;

-- Index unique cree AVANT le remplissage : Postgres autorise plusieurs NULL
-- dans un index unique, et le generateur sen sert pour eviter les collisions.
create unique index if not exists stores_join_code_key
  on public.stores (join_code);

create or replace function public.generate_store_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_code text;
  v_tries int := 0;
begin
  loop
    v_code := public.generate_store_access_code();
    exit when not exists (select 1 from public.stores s where s.join_code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 50 then
      raise exception 'Impossible de generer un code magasin unique';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.generate_store_join_code() from public, anon, authenticated;
-- Le default de colonne sevalue avec les droits de la session qui insere : la
-- creation dun magasin passe par le service_role, qui doit donc pouvoir appeler
-- les deux generateurs (le second a ete revoque en 20260730000021).
grant execute on function public.generate_store_join_code() to service_role;
grant execute on function public.generate_store_access_code() to service_role;

-- Les magasins deja crees recoivent leur code (boucle : un default ne sappuie
-- pas retroactivement, et un update global partagerait la meme valeur).
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.stores where join_code is null loop
    update public.stores
       set join_code = public.generate_store_join_code()
     where id = v_id;
  end loop;
end;
$$;

alter table public.stores
  alter column join_code set default public.generate_store_join_code();
alter table public.stores
  alter column join_code set not null;

comment on column public.stores.join_code is
  'Code dequipe distribue aux employees pour demander a rejoindre le magasin. Distinct de access_code, qui reste le secret de depot de la responsable.';

-- ---------------------------------------------------------------------------
-- 2. store_members
-- ---------------------------------------------------------------------------
-- employee_name : le nom EXACT de la ligne du planning, tel que la responsable
-- la designe a la confirmation. Cest lui, et lui seul, qui sert dancre
-- dappariement ensuite. Il reste null tant que ladhesion est pending.
--
-- status :
--   pending   : lemployee a saisi le code, la responsable na pas encore
--               confirme quelle fait partie de son equipe.
--   confirmed : appariement etabli, les horaires peuvent partir.
--   rejected  : adhesion close (refusee, ou remplacee par un autre magasin).

create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  employee_name text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (store_id, user_id)
);

-- La fonction edge lit systematiquement (store_id, status).
create index if not exists store_members_store_status_idx
  on public.store_members (store_id, status);

-- my_store() et le changement de magasin lisent par employee.
create index if not exists store_members_user_idx
  on public.store_members (user_id);

-- ---------------------------------------------------------------------------
-- 3. store_notices
-- ---------------------------------------------------------------------------
-- Les infos de la semaine que la responsable joint au depot (livraison, reunion,
-- inventaire). date null = information valable toute la semaine.

create table if not exists public.store_notices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  week_start date not null,
  date date,
  title text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists store_notices_store_week_idx
  on public.store_notices (store_id, week_start);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- store_members : lecture de SES PROPRES adhesions, aucune ecriture cote
-- client. Une employee qui pourrait inserer sa ligne se rattacherait au magasin
-- de son choix sans code, et pire, pourrait se declarer confirmed : tout le
-- cloisonnement seffondrerait. Tout passe donc par les RPC ou la fonction edge.
alter table public.store_members enable row level security;

drop policy if exists "store_members: read own" on public.store_members;
create policy "store_members: read own"
  on public.store_members for select
  using (user_id = (select auth.uid()));

revoke all on table public.store_members from anon, authenticated;
grant select on table public.store_members to authenticated;

-- store_notices : lecture reservee aux membres CONFIRMES du magasin. La
-- sous-requete traverse elle-meme la RLS de store_members (policy read own),
-- donc elle ne peut porter que sur ladhesion de lappelante.
alter table public.store_notices enable row level security;

drop policy if exists "store_notices: confirmed members read" on public.store_notices;
create policy "store_notices: confirmed members read"
  on public.store_notices for select
  using (
    exists (
      select 1 from public.store_members m
      where m.store_id = store_notices.store_id
        and m.user_id = (select auth.uid())
        and m.status = 'confirmed'
    )
  );

revoke all on table public.store_notices from anon, authenticated;
grant select on table public.store_notices to authenticated;

-- Rappel de fermeture (deja pose par 20260730000021, reaffirme ici parce que
-- stores porte desormais une colonne de plus a ne jamais laisser fuiter).
revoke all on table public.stores from anon, authenticated;
revoke all on table public.store_imports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC join_store(p_code)
-- ---------------------------------------------------------------------------
-- Idempotente : rappelee avec le meme code, elle renvoie ladhesion existante
-- sans rien changer. Une adhesion rejected est rouverte en pending (une
-- employee qui revient dans son ancien magasin doit pouvoir le refaire).
--
-- Un compte na quune adhesion vivante a la fois : saisir le code dun autre
-- magasin ferme la precedente (statut rejected). Sans cette regle, une personne
-- passee chez le concurrent continuerait de recevoir les plannings de son
-- ancienne equipe.

create or replace function public.join_store(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_store public.stores%rowtype;
  v_member public.store_members%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentification requise');
  end if;
  if length(v_code) = 0 then
    return jsonb_build_object('success', false, 'error', 'Code magasin manquant');
  end if;
  -- Garde-fou de forme avant de toucher la table : le code fait 6 caracteres.
  if length(v_code) > 12 then
    return jsonb_build_object('success', false, 'error', 'Code magasin invalide');
  end if;

  select * into v_store
    from public.stores s
   where upper(s.join_code) = v_code;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Code magasin invalide');
  end if;
  if not v_store.is_active then
    return jsonb_build_object('success', false, 'error', 'Ce magasin ne publie plus de planning');
  end if;

  -- Invariant applique AVANT toute autre branche : au plus une adhesion vivante
  -- par compte. Il vaut aussi bien pour une premiere adhesion que pour le retour
  -- dans un ancien magasin, sinon une employee revenue chez son premier
  -- employeur resterait aussi rattachee au second.
  update public.store_members
     set status = 'rejected',
         confirmed_at = null
   where user_id = v_uid
     and store_id <> v_store.id
     and status in ('pending', 'confirmed');

  select * into v_member
    from public.store_members m
   where m.store_id = v_store.id and m.user_id = v_uid;

  if found then
    if v_member.status = 'rejected' then
      update public.store_members
         set status = 'pending',
             employee_name = null,
             confirmed_at = null,
             created_at = now()
       where id = v_member.id
      returning * into v_member;
    end if;
    return jsonb_build_object(
      'success', true,
      'store_label', v_store.label,
      'status', v_member.status
    );
  end if;

  insert into public.store_members (store_id, user_id, status)
  values (v_store.id, v_uid, 'pending')
  on conflict (store_id, user_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'store_label', v_store.label,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.join_store(text) from public, anon;
grant execute on function public.join_store(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC my_store()
-- ---------------------------------------------------------------------------
-- Ne renvoie QUE le libelle, le statut et le nom de planning confirme. Ni
-- access_token, ni access_code, ni join_code : lapp na aucun besoin de les
-- connaitre, et une employee ne doit pas pouvoir redistribuer le code dequipe
-- de son magasin.

create or replace function public.my_store()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
  v_status text;
  v_name text;
begin
  if v_uid is null then
    return null;
  end if;

  select s.label, m.status, m.employee_name
    into v_label, v_status, v_name
    from public.store_members m
    join public.stores s on s.id = m.store_id
   where m.user_id = v_uid
     and m.status in ('pending', 'confirmed')
   order by case m.status when 'confirmed' then 0 else 1 end, m.created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'store_label', v_label,
    'status', v_status,
    'employee_name', v_name
  );
end;
$$;

revoke all on function public.my_store() from public, anon;
grant execute on function public.my_store() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. replace_store_notices — remplacement atomique
-- ---------------------------------------------------------------------------
-- Le delete + insert doit etre indivisible : sans cela, un insert en echec
-- apres un delete reussi laisserait la semaine sans aucune info alors que la
-- responsable croit les avoir republiees. Une seule fonction = une seule
-- transaction. Le contenu est deja valide par la fonction edge (titre non vide,
-- longueurs, date dans la semaine) ; on refiltre les titres vides par prudence.
-- Reservee au service_role : jamais appelable depuis lapp.

create or replace function public.replace_store_notices(
  p_store_id uuid,
  p_week_start date,
  p_notices jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.store_notices
   where store_id = p_store_id
     and week_start = p_week_start;

  insert into public.store_notices (store_id, week_start, date, title, detail)
  select
    p_store_id,
    p_week_start,
    nullif(btrim(coalesce(n->>'date', '')), '')::date,
    btrim(n->>'title'),
    nullif(btrim(coalesce(n->>'detail', '')), '')
  from jsonb_array_elements(coalesce(p_notices, '[]'::jsonb)) as t(n)
  where coalesce(btrim(n->>'title'), '') <> '';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_store_notices(uuid, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_store_notices(uuid, date, jsonb) to service_role;

-- Le cache de schema PostgREST doit voir les nouvelles RPC immediatement.
notify pgrst, 'reload schema';
