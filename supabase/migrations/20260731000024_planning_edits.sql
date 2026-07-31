-- Le CALQUE : les ratures de la responsable, conservees a part du fichier.
--
-- Probleme resolu : la responsable imprime son Excel et le rature au stylo. Elle
-- deplace un horaire, elle ajoute une reunion dequipe le vendredi soir. La
-- verite du planning nest donc PAS le fichier depose, cest son exemplaire
-- annote. Lui demander de reouvrir Excel a chaque rature est irrealiste.
--
-- Modele retenu, en deux couches :
--   · le SOCLE : le dernier fichier depose pour la semaine (store_imports.payload).
--   · le CALQUE : les corrections saisies sur le site (cette table).
-- Une reimportation remplace le socle et ne touche JAMAIS le calque : lapercu
-- annonce simplement combien de corrections sont conservees. Ce sont les deux
-- couches ensemble qui produisent les creneaux ecrits dans shifts.
--
-- Deux formes de correction, et deux seulement :
--   · set_day    : remplace INTEGRALEMENT la journee dune personne. Une liste
--                  de creneaux vide vaut mise en repos, cest le cas le plus
--                  frequent (barrer une journee).
--   · add_shift  : ajoute un creneau sans toucher au reste de la journee. Cest
--                  la seule forme autorisee pour une correction dequipe
--                  (reunion, formation, inventaire) : remplacer la journee de
--                  toute une equipe naurait aucun sens defini.
--
-- Perimetre dune correction dequipe (team_scope) :
--   · all       : tous les membres confirmes du magasin.
--   · working   : seulement ceux qui travaillent ce jour-la une fois le socle
--                 applique (une reunion de fin de journee ne concerne pas
--                 quelquun en repos).
--   · selection : les noms de lignes explicitement listes dans team_names.
--
-- Migration REJOUABLE : chaque objet est cree de maniere idempotente.
--
-- Note de redaction : ce fichier evite volontairement les apostrophes, y
-- compris dans les commentaires, pour rester applicable via API management.

-- ---------------------------------------------------------------------------
-- 1. store_planning_edits
-- ---------------------------------------------------------------------------
-- employee_name porte le nom de LIGNE du fichier (le meme ancrage que
-- store_members.employee_name), jamais un identifiant de compte : la
-- responsable rature un nom sur une feuille, elle ne connait aucun user_id. Le
-- rapprochement nom -> compte reste le travail de la fonction edge, qui refuse
-- toujours dapparier ce qui est ambigu.
--
-- shifts : liste de { start: "HH:MM", end: "HH:MM", type: "work"|"meeting"|"training" }.
-- Les heures sont des heures de pendule francaise, converties en horodatage par
-- la fonction edge (elle seule connait le decalage de la date concernee).

create table if not exists public.store_planning_edits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  week_start date not null,
  date date not null,
  scope text not null check (scope in ('employee', 'team')),
  employee_name text,
  team_scope text check (team_scope in ('all', 'working', 'selection')),
  team_names text[],
  action text not null check (action in ('set_day', 'add_shift')),
  shifts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une correction nominative porte un nom et rien dautre ; une correction
  -- dequipe porte un perimetre et aucun nom. Melanger les deux produirait des
  -- lignes que le calque ne saurait pas appliquer.
  constraint store_planning_edits_scope_shape check (
    (
      scope = 'employee'
      and employee_name is not null
      and btrim(employee_name) <> ''
      and team_scope is null
      and team_names is null
    )
    or (
      scope = 'team'
      and employee_name is null
      and team_scope is not null
      and (
        (team_scope = 'selection' and team_names is not null and array_length(team_names, 1) >= 1)
        or (team_scope <> 'selection' and team_names is null)
      )
    )
  ),

  -- Remplacer la journee de toute une equipe na pas de semantique definie :
  -- une correction dequipe ne peut quajouter un creneau.
  constraint store_planning_edits_team_action check (
    scope = 'employee' or action = 'add_shift'
  ),

  -- set_day accepte une liste vide (journee mise en repos), add_shift non :
  -- un ajout sans creneau serait une ligne morte dans le calque.
  constraint store_planning_edits_shifts_shape check (
    jsonb_typeof(shifts) = 'array'
    and (action = 'set_day' or jsonb_array_length(shifts) >= 1)
  )
);

-- La fonction edge lit toujours le calque semaine par semaine.
create index if not exists store_planning_edits_store_week_idx
  on public.store_planning_edits (store_id, week_start);

-- Unicite logique : une seule correction par (perimetre, personne, jour, forme).
-- Enregistrer deux fois la meme rature doit REMPLACER, pas empiler. La cle
-- utilise lower(btrim(...)) comme filet de securite cote base ; la fonction
-- edge, elle, deduplique avec la meme normalisation de nom que lappariement
-- (accents retires, mots tries), donc plus finement.
create unique index if not exists store_planning_edits_logical_key
  on public.store_planning_edits (
    store_id,
    week_start,
    date,
    scope,
    action,
    (coalesce(lower(btrim(employee_name)), ''))
  );

comment on table public.store_planning_edits is
  'Calque des corrections de la responsable, conserve a part du fichier Excel. Une reimportation remplace le socle sans effacer ces lignes.';
comment on column public.store_planning_edits.employee_name is
  'Nom de LIGNE du fichier, meme ancrage que store_members.employee_name. Null pour une correction dequipe.';
comment on column public.store_planning_edits.team_scope is
  'Perimetre dune correction dequipe : all (tous les membres confirmes), working (ceux qui travaillent ce jour-la), selection (les noms listes dans team_names).';
comment on column public.store_planning_edits.shifts is
  'Liste de { start, end, type }. Vide et action=set_day : la journee passe en repos.';

-- ---------------------------------------------------------------------------
-- 2. RLS : service_role uniquement
-- ---------------------------------------------------------------------------
-- Cette table porte les horaires nominatifs de toute une equipe, exactement
-- comme store_imports. RLS active SANS aucune policy : personne ne la lit hors
-- du service_role, donc hors de la fonction edge. Les grants par defaut de
-- Supabase sur anon et authenticated sont revoques par prudence.

alter table public.store_planning_edits enable row level security;

revoke all on table public.store_planning_edits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. shifts.is_store_edit
-- ---------------------------------------------------------------------------
-- Trois drapeaux a ne pas confondre sur un creneau :
--   · source        : la provenance du creneau (scan, manual, import).
--   · is_edited     : lEMPLOYEE a corrige ce creneau dans lapp.
--   · is_store_edit : le creneau vient du CALQUE de la responsable et non du
--                     fichier. Cest lui qui declenche le badge modifie cote
--                     app : la journee ne correspond plus au planning affiche
--                     en reserve, et lemployee doit le savoir.
-- Un creneau du calque reste source=import : la republication dune semaine
-- continue de tout effacer (import et scan) avant de reecrire, et manual reste
-- intouchable.

alter table public.shifts
  add column if not exists is_store_edit boolean not null default false;

comment on column public.shifts.is_store_edit is
  'Creneau issu du calque de corrections de la responsable, et non du fichier depose. Declenche le badge modifie cote app.';

-- Le cache de schema PostgREST doit voir la nouvelle table et la nouvelle
-- colonne immediatement.
notify pgrst, 'reload schema';
