-- Corriger AVANT le premier envoi : la correction rejoint le SOCLE.
--
-- Probleme resolu : au tout premier depot, la responsable decouvre dans
-- lapercu quune ligne du fichier est fausse. Elle doit pouvoir la corriger sur
-- place, sans rouvrir Excel. Mais ce geste-la nest PAS une rature : personne
-- na encore vu ce planning dans lapp. Une rature, au contraire, corrige un
-- planning que les equipes ont deja lu et qui est deja dans leur poche.
--
-- Deux gestes, deux consequences :
--   · AVANT la premiere publication de la semaine -> SOCLE. Les creneaux sont
--     ecrits avec is_store_edit = false : aucun badge modifie cote app, et
--     aucune notification disant que les horaires ont change. La premiere
--     publication envoie de toute facon le message darrivee du planning.
--   · APRES la premiere publication -> RATURE. Comportement inchange :
--     is_store_edit = true, badge modifie, notification ciblee detaillant les
--     jours qui bougent.
--
-- Le drapeau se fige AU MOMENT DE LENREGISTREMENT et nest jamais recalcule :
-- une correction pre-publication reste pre-publication meme une fois la
-- semaine publiee. Reenregistrer la meme correction plus tard est un NOUVEAU
-- geste de la responsable : la nouvelle ligne est alors reevaluee, et devient
-- une rature si la semaine est entre-temps partie chez les employees.
--
-- Defaut false : toute ligne deja presente en base a ete saisie sur une
-- semaine publiee, cetait la seule facon dediter avant cette migration.
--
-- Comptage : le site doit annoncer separement les ratures conservees et les
-- corrections du socle. Sans quoi lapercu dun premier depot afficherait
-- N modifications conservees pour des corrections que personne na jamais vues.
-- Le compte se fait cote fonction edge, aucun index supplementaire nest
-- necessaire : store_planning_edits_store_week_idx couvre deja la lecture par
-- magasin et par semaine.
--
-- Migration REJOUABLE : la colonne nest ajoutee que si elle manque.
--
-- Note de redaction : ce fichier evite volontairement les apostrophes, y
-- compris dans les commentaires, pour rester applicable via API management.

alter table public.store_planning_edits
  add column if not exists pre_publication boolean not null default false;

comment on column public.store_planning_edits.pre_publication is
  'Correction enregistree AVANT la premiere publication de la semaine : elle fait partie du socle et non des ratures (is_store_edit = false, aucun badge modifie, aucune notification de changement). Fige a lenregistrement, jamais recalcule ensuite.';

-- Le cache de schema PostgREST doit voir la nouvelle colonne immediatement.
notify pgrst, 'reload schema';
