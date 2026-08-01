-- LES DEUX E-MAILS DU PLANNING, et jamais un de plus.
--
-- Dans le magasin pilote, 14 employees sur 15 ne possedent pas encore lapp.
-- Sans e-mail, le canal B2B ne servirait donc quune seule personne. Deux
-- messages au total, decides avec Kylian :
--   1. LE PLANNING, a la publication : SES horaires de la semaine, et
--      linvitation a installer lapp EN PIED de message.
--   2. LE CHANGEMENT, si ses horaires bougent apres publication : le detail
--      des jours modifies, puis la semaine complete a jour.
--
-- Aucun e-mail rejoignez Clork separe. Ce serait de la publicite, cela
-- finirait en indesirables, et cela abimerait la confiance que le-mail utile
-- vient tout juste de construire. Un message qui souvre sur installez Clork
-- est une pub quon referme ; un message qui souvre sur votre semaine du
-- 3 aout est lu, et linvitation en pied prend son sens.
--
-- QUI RECOIT QUOI :
--   · pas de compte Clork  -> le-mail.
--   · compte Clork         -> la notification push et PAS de-mail, sauf si
--     elle a coche aussi par e-mail (profiles.planning_by_email) ou si sa
--     notification echoue (jeton mort = app desinstallee).
--
-- LA DESINSCRIPTION SANS COMPTE : la destinataire na pas de session Clork, et
-- souvent pas de compte du tout. Le lien de desinscription ne peut donc pas
-- sappuyer sur auth.uid() : il porte un JETON propre a lentree de carnet, et
-- la RPC unsubscribe_by_token est ouverte a anon. Le jeton fait 48 caracteres
-- hexadecimaux, il nest pas devinable.
--
-- CE QUI NEST PAS FAIT ICI : store_roster reste invisible de anon et de
-- authenticated (RLS active, aucune policy). La RPC est SECURITY DEFINER et ne
-- renvoie que le libelle du magasin, jamais ladresse ni le nom.
--
-- Migration REJOUABLE : chaque objet est cree de maniere idempotente.
--
-- Note de redaction : ce fichier evite volontairement les apostrophes et les
-- accents dans les commentaires, pour rester applicable via API management.

-- ---------------------------------------------------------------------------
-- 1. store_roster.email_opt_out — le refus, respecte pour toujours
-- ---------------------------------------------------------------------------
-- Une seule case, cochee par la destinataire elle-meme depuis le lien du pied
-- de page. Elle ne concerne QUE les e-mails : une personne desinscrite qui
-- installe ensuite lapp recevra ses notifications push normalement, ce qui est
-- exactement ce quelle a demande.

alter table public.store_roster
  add column if not exists email_opt_out boolean not null default false;

comment on column public.store_roster.email_opt_out is
  'La personne a demande a ne plus recevoir les e-mails de planning. Ne concerne que le-mail : les notifications push de lapp restent gouvernees par ses propres preferences.';

-- ---------------------------------------------------------------------------
-- 2. store_roster.unsubscribe_token — le jeton du lien de desinscription
-- ---------------------------------------------------------------------------
-- Ajout en trois temps plutot quen une seule commande avec DEFAULT : ainsi le
-- remplissage des lignes existantes est EXPLICITE et donne bien une valeur
-- differente par ligne. Une colonne ajoutee avec un defaut evalue une seule
-- fois donnerait le meme jeton a tout le monde, et un seul clic desinscrirait
-- toute une equipe.
--
-- Volontairement distinct de invite_token : une invitation se transmet, une
-- desinscription non. Deux usages, deux secrets.

alter table public.store_roster
  add column if not exists unsubscribe_token text;

update public.store_roster
   set unsubscribe_token = encode(gen_random_bytes(24), 'hex')
 where unsubscribe_token is null;

alter table public.store_roster
  alter column unsubscribe_token set default encode(gen_random_bytes(24), 'hex');

alter table public.store_roster
  alter column unsubscribe_token set not null;

create unique index if not exists store_roster_unsubscribe_token_key
  on public.store_roster (unsubscribe_token);

comment on column public.store_roster.unsubscribe_token is
  'Jeton du lien de desinscription, porte par le pied de chaque e-mail. Permet de se desinscrire SANS compte et SANS session. Distinct de invite_token : une invitation se transmet, une desinscription non.';

-- ---------------------------------------------------------------------------
-- 3. profiles.planning_by_email — recevoir AUSSI ses horaires par e-mail
-- ---------------------------------------------------------------------------
-- Pour celles qui ont lapp. Defaut FALSE, contrairement a
-- notify_employer_planning : quand on a lapp, la notification suffit, et
-- doubler chaque publication dun e-mail serait du bruit. Cest un choix
-- explicite de lemployee, pas un reglage par defaut.

alter table public.profiles
  add column if not exists planning_by_email boolean not null default false;

comment on column public.profiles.planning_by_email is
  'Recevoir AUSSI ses horaires par e-mail quand le magasin publie, en plus de la notification push. Defaut false : avec lapp, la notification suffit.';

-- ---------------------------------------------------------------------------
-- 4. email_deliveries — le journal qui repond a est-ce quelle a recu ?
-- ---------------------------------------------------------------------------
-- Sans ce journal, la seule facon de repondre a la responsable serait de
-- fouiller les logs du fournisseur. On y ecrit UNE ligne par destinataire
-- envisagee, y compris celles quon na pas servies, avec la raison :
--   · no_email       : aucune adresse au carnet
--   · opted_out      : elle sest desinscrite
--   · has_app        : elle a lapp, elle a recu la notification
--   · push_disabled  : elle a lapp et a coupe la notification employeur
--   · not_in_planning: elle est au carnet mais absente de cette semaine
--   · no_change      : rien de neuf a lui annoncer
--   · email_disabled : aucune cle denvoi configuree sur ce projet
--   · le code derreur du fournisseur en cas dechec
--
-- roster_id est nullable et pointe avec on delete set null : retirer une
-- personne du carnet ne doit pas effacer la preuve de ce qui lui a ete envoye.
-- email est nullable : une ligne no_email na precisement pas dadresse.
--
-- RLS active SANS aucune policy : ce journal contient des adresses
-- personnelles, seul le service_role (donc la fonction edge) y accede.

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  week_start date not null,
  roster_id uuid references public.store_roster (id) on delete set null,
  email text,
  kind text not null,
  status text not null,
  reason text,
  sent_at timestamptz not null default now(),

  constraint email_deliveries_kind_check check (kind in ('planning', 'change')),
  constraint email_deliveries_status_check check (status in ('sent', 'skipped', 'failed')),
  constraint email_deliveries_email_shape check (
    email is null or (btrim(email) <> '' and length(email) <= 200)
  ),
  constraint email_deliveries_reason_shape check (reason is null or length(reason) <= 200)
);

-- La question posee est toujours celle dune semaine precise dun magasin.
create index if not exists email_deliveries_store_week_idx
  on public.email_deliveries (store_id, week_start, sent_at desc);

-- Et parfois celle dune personne : a-t-elle recu quelque chose, un jour ?
create index if not exists email_deliveries_roster_idx
  on public.email_deliveries (roster_id, sent_at desc);

alter table public.email_deliveries enable row level security;

revoke all on table public.email_deliveries from anon, authenticated;

comment on table public.email_deliveries is
  'Journal des e-mails de planning : une ligne par destinataire envisagee, envoyee ou non, avec la raison. Repond a la question est-ce quelle a recu ?';
comment on column public.email_deliveries.kind is
  'planning = ses horaires de la semaine. change = ses horaires ont bouge apres publication.';
comment on column public.email_deliveries.status is
  'sent = remis au fournisseur. skipped = volontairement pas envoye (voir reason). failed = tentative en echec.';
comment on column public.email_deliveries.reason is
  'Motif du skip ou de lechec, en code court et sans donnee personnelle.';

-- ---------------------------------------------------------------------------
-- 5. unsubscribe_by_token(token) — le lien du pied de page
-- ---------------------------------------------------------------------------
-- Ouverte a anon : le lien est clique depuis une boite mail, sans session, et
-- souvent par quelquun qui na aucun compte Clork. Cest tout linteret du
-- jeton.
--
-- Idempotente : cliquer deux fois renvoie le meme succes. Un jeton inconnu
-- renvoie success = false SANS autre detail, et un jeton connu ne revele que
-- le libelle du magasin — de quoi ecrire vous ne recevrez plus les e-mails de
-- 1064 - Wasquehal, rien de plus. Ni le nom, ni ladresse de la personne ne
-- sortent dici.
--
-- Aucune limitation de debit : le jeton fait 48 caracteres hexadecimaux, soit
-- 192 bits. Le deviner nest pas une menace realiste.

create or replace function public.unsubscribe_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_store_id uuid;
  v_label text;
begin
  -- Garde-fou de forme avant de toucher la table : le jeton fait 48 caracteres.
  if length(v_token) = 0 or length(v_token) > 128 then
    return jsonb_build_object('success', false);
  end if;

  update public.store_roster r
     set email_opt_out = true,
         updated_at = now()
   where r.unsubscribe_token = v_token
  returning r.store_id into v_store_id;

  if v_store_id is null then
    return jsonb_build_object('success', false);
  end if;

  select s.label into v_label
    from public.stores s
   where s.id = v_store_id;

  return jsonb_build_object('success', true, 'store_label', v_label);
end;
$$;

revoke all on function public.unsubscribe_by_token(text) from public;
grant execute on function public.unsubscribe_by_token(text) to anon, authenticated, service_role;

-- Le cache de schema PostgREST doit voir les nouvelles colonnes, la table et la
-- RPC immediatement.
notify pgrst, 'reload schema';
