-- LE CARNET D EQUIPE, et le modele de rattachement qui tient a l echelle.
--
-- Principe directeur : le code magasin n a PAS besoin d etre secret, puisque
-- rejoindre ne donne acces a rien tant que la responsable n a pas confirme. On
-- peut donc utiliser le VRAI code du magasin (1064 chez Nocibe), celui que
-- l employee connait deja et lit sur son badge, au lieu d un code aleatoire a
-- diffuser.
--
-- Trois portes d entree, de la meilleure a la moins bonne :
--   1. INVITATION PERSONNELLE issue du carnet. La responsable inscrit
--      COPIN Typhanie et son adresse e-mail AVANT meme que la personne ait
--      l app. Le jour ou cette adresse cree un compte Clork, l adhesion est
--      creee CONFIRMEE d office : le carnet est une liste de pre-autorisations,
--      la responsable a designe la personne, c est cela la confirmation.
--      -> link_store_by_email() cote app, store_roster_upsert() cote site.
--   2. QR ou code magasin : adhesion en attente, la responsable confirme.
--      -> join_store(join_code) inchangee, join_store_by_number(enseigne, numero).
--   3. Saisie manuelle enseigne + numero de magasin : meme chemin que 2.
--
-- HIERARCHIE ENSEIGNE / MAGASIN : indolore aujourd hui (un seul magasin),
-- douloureuse dans six mois (plusieurs enseignes, des numeros qui se repetent
-- d une enseigne a l autre). On la pose maintenant : organizations porte
-- l enseigne, stores.store_number son vrai numero, unique PAR enseigne.
--
-- CONFIDENTIALITE DU CARNET : store_roster contient des adresses personnelles
-- saisies par la responsable. RLS active SANS aucune policy, revoke sur anon et
-- authenticated : la table n est lisible que par le service_role, donc par la
-- seule fonction edge. Et ce qui en ressort ne contient JAMAIS l adresse du
-- COMPTE Clork d une employee : store_roster_status ne renvoie qu un booleen
-- on_clork a cote de l adresse que la responsable a elle-meme ecrite.
--
-- Migration REJOUABLE : chaque objet est cree de maniere idempotente.
--
-- Note de redaction : ce fichier evite volontairement les apostrophes et les
-- accents dans les commentaires, pour rester applicable via API management.

-- ---------------------------------------------------------------------------
-- 1. organizations — l enseigne
-- ---------------------------------------------------------------------------
-- slug : identifiant stable et tapable (nocibe), c est lui que l app envoie a
-- join_store_by_number. name : le libelle affiche (Nocibe).
--
-- Contrairement a stores, cette table ne porte AUCUN secret : ce sont des noms
-- de marques. Elle est donc lisible par les comptes connectes, sans quoi l app
-- ne pourrait pas proposer la liste des enseignes a la saisie manuelle.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (btrim(name) <> ''),
  constraint organizations_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$')
);

alter table public.organizations enable row level security;

drop policy if exists "organizations: read all" on public.organizations;
create policy "organizations: read all"
  on public.organizations for select
  using (true);

revoke all on table public.organizations from anon, authenticated;
grant select on table public.organizations to authenticated;

comment on table public.organizations is
  'Enseigne (Nocibe, Sephora...). Aucun secret : lisible par les comptes connectes pour la saisie manuelle enseigne + numero de magasin.';

-- ---------------------------------------------------------------------------
-- 2. stores.organization_id et stores.store_number
-- ---------------------------------------------------------------------------
-- organization_id reste NULLABLE : les magasins deja crees hors enseigne
-- continuent de fonctionner par join_code, rien ne doit casser.
-- store_number est leur VRAI code (1064), unique par enseigne et non
-- globalement : deux enseignes peuvent tres bien avoir chacune un magasin 1064.

alter table public.stores
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

alter table public.stores
  add column if not exists store_number text;

create index if not exists stores_organization_idx
  on public.stores (organization_id);

-- Normalisation dans l index ET dans la recherche : le numero est tape a la
-- main, avec ou sans espace, en minuscules si jamais il contient une lettre.
create unique index if not exists stores_org_number_key
  on public.stores (organization_id, upper(btrim(store_number)))
  where organization_id is not null and store_number is not null;

comment on column public.stores.store_number is
  'Vrai numero du magasin chez son enseigne (1064). Unique par enseigne, pas globalement. Il n a pas besoin d etre secret : rejoindre ne donne acces a rien avant confirmation.';

-- Rattachement du magasin de la beta a son enseigne. Idempotent : la ligne
-- n est touchee que si elle n a pas encore d enseigne.
insert into public.organizations (name, slug)
values ('Nocibé', 'nocibe')
on conflict (slug) do nothing;

update public.stores s
   set organization_id = o.id,
       store_number = coalesce(nullif(btrim(s.store_number), ''), '1064')
  from public.organizations o
 where o.slug = 'nocibe'
   and s.label = '1064 - Wasquehal'
   and s.organization_id is null;

-- Rappel de fermeture : stores porte desormais deux colonnes de plus, et
-- toujours trois secrets qui ne doivent jamais fuiter cote client.
revoke all on table public.stores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. store_roster — le carnet d equipe
-- ---------------------------------------------------------------------------
-- employee_name : le nom EXACT tel qu il apparait sur la LIGNE du planning.
--   C est le meme ancrage que store_members.employee_name et que
--   store_planning_edits.employee_name : la responsable travaille toujours avec
--   les noms de son fichier, jamais avec des identifiants de compte.
-- email : l adresse que la responsable connait de cette personne. Facultative
--   (une equipe se remplit d abord au nom, les adresses viennent apres).
-- invite_token : reserve au futur lien personnel (clork.app/i/<token>). Genere
--   des la creation pour n avoir jamais a le retro-remplir.
-- linked_user_id : le compte Clork identifie pour cette entree. Sert au site a
--   afficher deja sur Clork, et a retrouver la personne meme si elle change de
--   nom d affichage.

create table if not exists public.store_roster (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  employee_name text not null,
  email text,
  invite_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  linked_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint store_roster_name_shape check (
    btrim(employee_name) <> '' and length(employee_name) <= 120
  ),
  constraint store_roster_email_shape check (
    email is null or (btrim(email) <> '' and length(email) <= 200)
  )
);

-- La fonction edge lit toujours le carnet magasin par magasin.
create index if not exists store_roster_store_idx
  on public.store_roster (store_id);

-- Une seule entree par personne et par magasin. Le nom est la cle du carnet :
-- deux lignes COPIN Typhanie rendraient tout appariement ambigu.
create unique index if not exists store_roster_name_key
  on public.store_roster (store_id, lower(btrim(employee_name)));

-- Une adresse ne peut designer qu une personne du carnet : sans cela, un compte
-- cree avec cette adresse ne saurait pas quelle ligne de planning lui revient.
create unique index if not exists store_roster_email_key
  on public.store_roster (store_id, lower(btrim(email)))
  where email is not null;

-- RLS active SANS policy : le carnet porte des adresses personnelles, il n est
-- lisible et modifiable que par le service_role, donc par la fonction edge.
alter table public.store_roster enable row level security;

revoke all on table public.store_roster from anon, authenticated;

comment on table public.store_roster is
  'Carnet d equipe : liste de PRE-AUTORISATIONS saisies par la responsable. Une entree avec adresse e-mail vaut confirmation anticipee, le compte cree avec cette adresse est rattache et confirme d office.';
comment on column public.store_roster.employee_name is
  'Nom EXACT de la ligne du planning, meme ancrage que store_members.employee_name.';
comment on column public.store_roster.email is
  'Adresse saisie par la responsable. Jamais confondue avec l adresse du compte Clork de la personne, qui ne sort jamais de la base.';
comment on column public.store_roster.linked_user_id is
  'Compte Clork identifie pour cette entree. Permet au site d afficher deja sur Clork.';

-- ---------------------------------------------------------------------------
-- 4. store_join_request — le geste commun aux deux portes d entree
-- ---------------------------------------------------------------------------
-- Extrait tel quel du corps de join_store (migration 20260730000023) pour que
-- join_store et join_store_by_number partagent EXACTEMENT la meme semantique :
-- meme invariant, memes statuts, memes retours. Deux copies auraient derive.
--
-- Invariant applique AVANT toute autre branche : au plus une adhesion vivante
-- par compte. Il vaut aussi bien pour une premiere adhesion que pour le retour
-- dans un ancien magasin, sinon une employee revenue chez son premier employeur
-- resterait aussi rattachee au second.
--
-- Interne : revoquee pour tout le monde. Les deux RPC publiques sont
-- SECURITY DEFINER, elles s executent donc avec les droits du proprietaire et
-- peuvent l appeler ; un client, lui, ne peut pas la joindre directement et ne
-- peut donc pas se rattacher a un magasin sans preuve.

create or replace function public.store_join_request(p_user_id uuid, p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_member public.store_members%rowtype;
begin
  select * into v_store from public.stores s where s.id = p_store_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Code magasin invalide');
  end if;

  update public.store_members
     set status = 'rejected',
         confirmed_at = null
   where user_id = p_user_id
     and store_id <> v_store.id
     and status in ('pending', 'confirmed');

  select * into v_member
    from public.store_members m
   where m.store_id = v_store.id and m.user_id = p_user_id;

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
  values (v_store.id, p_user_id, 'pending')
  on conflict (store_id, user_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'store_label', v_store.label,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.store_join_request(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. join_store(p_code) — inchangee vue du dehors
-- ---------------------------------------------------------------------------
-- Meme signature, memes messages, memes retours qu en 20260730000023 : l app
-- deployee continue de l appeler sans rien savoir de ce qui suit. Seul le corps
-- delegue desormais le geste commun a store_join_request.

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

  return public.store_join_request(v_uid, v_store.id);
end;
$$;

revoke all on function public.join_store(text) from public, anon;
grant execute on function public.join_store(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. join_store_by_number(enseigne, numero) — la porte d entree qui passe a l echelle
-- ---------------------------------------------------------------------------
-- Le QR colle en reserve et la saisie manuelle aboutissent tous les deux ici.
-- L employee ne choisit PAS son magasin librement : elle prouve seulement
-- qu elle sait ou elle travaille, et l adhesion reste en attente jusqu a ce que
-- la responsable la confirme. C est exactement le niveau de preuve d un code
-- d equipe, sans le code a diffuser.

create or replace function public.join_store_by_number(p_org_slug text, p_store_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(btrim(coalesce(p_org_slug, '')));
  v_number text := upper(regexp_replace(coalesce(p_store_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_store public.stores%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'Authentification requise');
  end if;
  if length(v_slug) = 0 or length(v_slug) > 60 then
    return jsonb_build_object('success', false, 'error', 'Enseigne inconnue');
  end if;
  if length(v_number) = 0 or length(v_number) > 20 then
    return jsonb_build_object('success', false, 'error', 'Code magasin invalide');
  end if;

  select s.* into v_store
    from public.stores s
    join public.organizations o on o.id = s.organization_id
   where o.slug = v_slug
     and upper(regexp_replace(coalesce(s.store_number, ''), '[^A-Za-z0-9]', '', 'g')) = v_number;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Magasin introuvable pour cette enseigne');
  end if;
  if not v_store.is_active then
    return jsonb_build_object('success', false, 'error', 'Ce magasin ne publie plus de planning');
  end if;

  return public.store_join_request(v_uid, v_store.id);
end;
$$;

revoke all on function public.join_store_by_number(text, text) from public, anon;
grant execute on function public.join_store_by_number(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. roster_link_account — le rattachement, en un seul endroit
-- ---------------------------------------------------------------------------
-- Coeur du carnet : une entree de carnet + un compte Clork = une adhesion
-- CONFIRMEE. Pas en attente : la responsable a elle-meme ecrit ce nom et cette
-- adresse, c est cela la confirmation.
--
-- Trois refus, tous du meme genre — mieux vaut ne rien rattacher que rattacher
-- de travers, un faux horaire etant pire qu un horaire absent :
--   · le compte a deja une adhesion vivante dans un AUTRE magasin. On ne la
--     deplace pas : ce n est pas la personne qui a agi, c est une responsable
--     qui a saisi une adresse. La personne garde la main — si elle a change de
--     magasin, elle scanne le nouveau code (join_store ferme alors l ancienne
--     adhesion) et le rattachement se fait au passage suivant.
--   · la ligne du planning est deja tenue par un AUTRE compte confirme du meme
--     magasin : deux comptes recevraient les memes horaires, et une employee
--     n en recevrait aucun.
--   · le profil n existe pas encore (compte a peine cree) : la cle etrangere
--     echouerait, on renvoie simplement linked = false.
--
-- Idempotente : rappelee, elle reecrit les memes valeurs et renvoie le meme
-- etat. Elle conserve confirmed_at de la premiere confirmation.
--
-- Interne : appelee par link_store_by_email (cote app) et store_roster_upsert
-- (cote site), jamais directement par un client.

create or replace function public.roster_link_account(p_roster_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roster public.store_roster%rowtype;
  v_store public.stores%rowtype;
  v_key text;
  v_name text;
begin
  if p_user_id is null then
    return jsonb_build_object('linked', false);
  end if;

  select * into v_roster from public.store_roster r where r.id = p_roster_id;
  if not found then
    return jsonb_build_object('linked', false);
  end if;

  select * into v_store from public.stores s where s.id = v_roster.store_id;
  if not found or not v_store.is_active then
    return jsonb_build_object('linked', false);
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return jsonb_build_object('linked', false);
  end if;

  -- Le carnet memorise le compte des qu on sait l identifier, meme si
  -- l adhesion ne peut pas etre creee : le site doit pouvoir afficher
  -- deja sur Clork sans avoir a redemander l adresse.
  update public.store_roster
     set linked_user_id = p_user_id,
         updated_at = now()
   where id = v_roster.id
     and linked_user_id is distinct from p_user_id;

  if exists (
    select 1 from public.store_members m
     where m.user_id = p_user_id
       and m.store_id <> v_roster.store_id
       and m.status in ('pending', 'confirmed')
  ) then
    return jsonb_build_object('linked', false);
  end if;

  v_key := lower(btrim(v_roster.employee_name));
  if exists (
    select 1 from public.store_members m
     where m.store_id = v_roster.store_id
       and m.user_id <> p_user_id
       and m.status = 'confirmed'
       and lower(btrim(coalesce(m.employee_name, ''))) = v_key
  ) then
    return jsonb_build_object('linked', false);
  end if;

  -- Une attribution DEJA confirmee ne se laisse pas reecrire par le carnet : la
  -- responsable qui a designe cette ligne avait son fichier sous les yeux, le
  -- carnet n est qu une liste de noms tapes de memoire. Dans tous les autres cas
  -- (adhesion en attente, adhesion close, premiere adhesion), le carnet fait foi.
  insert into public.store_members (store_id, user_id, employee_name, status, confirmed_at)
  values (v_roster.store_id, p_user_id, v_roster.employee_name, 'confirmed', now())
  on conflict (store_id, user_id) do update
     set employee_name = case
           when store_members.status = 'confirmed'
            and coalesce(btrim(store_members.employee_name), '') <> ''
             then store_members.employee_name
           else excluded.employee_name
         end,
         status = 'confirmed',
         confirmed_at = coalesce(store_members.confirmed_at, excluded.confirmed_at)
  returning employee_name into v_name;

  return jsonb_build_object(
    'linked', true,
    'store_label', v_store.label,
    'employee_name', v_name,
    'status', 'confirmed'
  );
end;
$$;

revoke all on function public.roster_link_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.roster_link_account(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. link_store_by_email() — ce que l app appelle
-- ---------------------------------------------------------------------------
-- Prend l adresse du COMPTE APPELANT (jamais une adresse fournie par le
-- client : sinon n importe qui se rattacherait au magasin de n importe qui en
-- devinant une adresse), cherche l entree de carnet correspondante, et rattache.
--
-- Comparaison insensible a la casse et aux espaces des deux cotes.
--
-- Idempotente : rappelee a chaque ouverture de l app, elle ne duplique rien et
-- renvoie l etat courant. Renvoie { linked: false } quand il n y a rien a faire,
-- ce qui est le cas de l immense majorite des comptes.

create or replace function public.link_store_by_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_roster_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('linked', false);
  end if;

  select lower(btrim(u.email)) into v_email
    from auth.users u
   where u.id = v_uid
     and u.deleted_at is null;
  if v_email is null or length(v_email) = 0 then
    return jsonb_build_object('linked', false);
  end if;

  -- Une meme adresse peut figurer aux carnets de deux magasins (une personne a
  -- deux employeurs, ou un ancien carnet jamais nettoye). On privilegie le
  -- magasin ou le compte a deja une adhesion vivante, puis l entree la plus
  -- recemment touchee : la plus proche de l intention actuelle.
  select r.id into v_roster_id
    from public.store_roster r
    join public.stores s on s.id = r.store_id
   where r.email is not null
     and lower(btrim(r.email)) = v_email
     and s.is_active
   order by
     case when exists (
       select 1 from public.store_members m
        where m.user_id = v_uid
          and m.store_id = r.store_id
          and m.status in ('pending', 'confirmed')
     ) then 0 else 1 end,
     r.updated_at desc
   limit 1;

  if v_roster_id is null then
    return jsonb_build_object('linked', false);
  end if;

  return public.roster_link_account(v_roster_id, v_uid);
end;
$$;

revoke all on function public.link_store_by_email() from public, anon;
grant execute on function public.link_store_by_email() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. store_roster_status(store) — le carnet enrichi, pour le site
-- ---------------------------------------------------------------------------
-- CONFIDENTIALITE, la regle qui commande cette fonction : la seule adresse
-- renvoyee est celle que la RESPONSABLE a saisie (store_roster.email). La
-- presence d un compte Clork est reduite a un booleen. L adresse du compte
-- d une employee ne quitte jamais la base — elle appartient a l employee, pas
-- a son magasin. Une personne presente sur Clork mais sans adresse au carnet se
-- lit donc email = null, on_clork = true.
--
-- membership_status : l adhesion vivante correspondante, retrouvee d abord par
-- le compte rattache, sinon par le nom de ligne. null = personne du carnet qui
-- n a pas encore d adhesion a ce magasin.
--
-- Une seule ligne par entree de carnet, garantie par les LATERAL ... limit 1 :
-- deux membres homonymes ne doivent pas dedoubler une ligne du carnet.

create or replace function public.store_roster_status(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'employee_name', r.employee_name,
        'email', r.email,
        'on_clork', (a.id is not null or r.linked_user_id is not null or m.user_id is not null),
        'membership_status', m.status
      )
      order by lower(btrim(r.employee_name))
    ),
    '[]'::jsonb
  )
  from public.store_roster r
  left join lateral (
    select u.id
      from auth.users u
     where r.email is not null
       and lower(btrim(u.email)) = lower(btrim(r.email))
       and u.deleted_at is null
     limit 1
  ) a on true
  left join lateral (
    select m.user_id, m.status
      from public.store_members m
     where m.store_id = r.store_id
       and m.status in ('pending', 'confirmed')
       and (
         (r.linked_user_id is not null and m.user_id = r.linked_user_id)
         or lower(btrim(coalesce(m.employee_name, ''))) = lower(btrim(r.employee_name))
       )
     order by
       case when m.user_id = r.linked_user_id then 0 else 1 end,
       case when m.status = 'confirmed' then 0 else 1 end
     limit 1
  ) m on true
  where r.store_id = p_store_id;
$$;

revoke all on function public.store_roster_status(uuid) from public, anon, authenticated;
grant execute on function public.store_roster_status(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 10. store_roster_upsert(...) — ecrire au carnet, et rattacher dans la foulee
-- ---------------------------------------------------------------------------
-- Le cas qui justifie cette fonction plutot qu un simple insert : une entree
-- creee APRES que la personne a deja un compte Clork avec cette adresse. Sans
-- rattachement immediat, elle attendrait une hypothetique prochaine ouverture
-- de l app pour etre confirmee, alors que la responsable vient tout juste de la
-- designer. Ecriture et rattachement partagent donc la meme transaction.
--
-- Les refus remontent un CODE et non une phrase : le texte affiche a la
-- responsable est ecrit cote fonction edge, avec ses accents et ses
-- apostrophes. Une erreur ne leve jamais d exception ici, sans quoi l ecriture
-- deja faite serait annulee sans explication.

create or replace function public.store_roster_upsert(
  p_store_id uuid,
  p_employee_name text,
  p_email text,
  p_max_entries int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_employee_name, ''), '\s+', ' ', 'g'));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_key text;
  v_existing_id uuid;
  v_entry public.store_roster%rowtype;
  v_count int;
  v_user_id uuid;
  v_link jsonb := jsonb_build_object('linked', false);
  v_status text;
begin
  if v_name = '' or length(v_name) > 120 then
    return jsonb_build_object('success', false, 'error_code', 'name_invalid');
  end if;
  if v_email is not null and length(v_email) > 200 then
    return jsonb_build_object('success', false, 'error_code', 'email_invalid');
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id) then
    return jsonb_build_object('success', false, 'error_code', 'store_unknown');
  end if;

  v_key := lower(v_name);

  select r.id into v_existing_id
    from public.store_roster r
   where r.store_id = p_store_id
     and lower(btrim(r.employee_name)) = v_key;

  -- Plafond verifie seulement a la CREATION : corriger une entree existante ne
  -- doit jamais etre bloque, meme sur un carnet plein.
  if v_existing_id is null then
    select count(*) into v_count
      from public.store_roster r
     where r.store_id = p_store_id;
    if v_count >= p_max_entries then
      return jsonb_build_object('success', false, 'error_code', 'roster_full');
    end if;
  end if;

  -- Dit proprement avant que l index unique partiel ne le refuse brutalement.
  if v_email is not null and exists (
    select 1 from public.store_roster r
     where r.store_id = p_store_id
       and r.email is not null
       and lower(btrim(r.email)) = v_email
       and (v_existing_id is null or r.id <> v_existing_id)
  ) then
    return jsonb_build_object('success', false, 'error_code', 'email_taken');
  end if;

  if v_existing_id is null then
    insert into public.store_roster (store_id, employee_name, email)
    values (p_store_id, v_name, v_email)
    returning * into v_entry;
  else
    update public.store_roster
       set employee_name = v_name,
           email = v_email,
           updated_at = now()
     where id = v_existing_id
    returning * into v_entry;
  end if;

  if v_entry.email is not null then
    select u.id into v_user_id
      from auth.users u
     where lower(btrim(u.email)) = v_entry.email
       and u.deleted_at is null
     order by u.created_at asc
     limit 1;
    if v_user_id is not null then
      v_link := public.roster_link_account(v_entry.id, v_user_id);
      -- roster_link_account a pu renseigner linked_user_id : on relit l entree
      -- pour que la reponse decrive la base et non l etat d avant.
      select * into v_entry from public.store_roster r where r.id = v_entry.id;
    end if;
  end if;

  select m.status into v_status
    from public.store_members m
   where m.store_id = v_entry.store_id
     and m.status in ('pending', 'confirmed')
     and (
       (v_entry.linked_user_id is not null and m.user_id = v_entry.linked_user_id)
       or lower(btrim(coalesce(m.employee_name, ''))) = lower(btrim(v_entry.employee_name))
     )
   order by
     case when m.user_id = v_entry.linked_user_id then 0 else 1 end,
     case when m.status = 'confirmed' then 0 else 1 end
   limit 1;

  return jsonb_build_object(
    'success', true,
    'linked', coalesce((v_link->>'linked')::boolean, false),
    'entry', jsonb_build_object(
      'id', v_entry.id,
      'employee_name', v_entry.employee_name,
      'email', v_entry.email,
      'on_clork', (v_user_id is not null or v_entry.linked_user_id is not null or v_status is not null),
      'membership_status', v_status
    )
  );
end;
$$;

revoke all on function public.store_roster_upsert(uuid, text, text, int)
  from public, anon, authenticated;
grant execute on function public.store_roster_upsert(uuid, text, text, int) to service_role;

-- Le cache de schema PostgREST doit voir les nouvelles tables, colonnes et RPC
-- immediatement.
notify pgrst, 'reload schema';
