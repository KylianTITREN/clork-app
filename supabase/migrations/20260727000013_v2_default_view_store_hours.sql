-- v2 : mode conjoint (planning affiché par défaut) + horaires du magasin
-- (déduction « tu ouvres / tu fermes ») + avatar prédéfini (collection Premium).

-- Un planning suivi peut être choisi comme vue PAR DÉFAUT : l'accueil et les
-- widgets s'ouvrent dessus. Un seul par utilisateur (contrainte partielle).
alter table public.follows
  add column if not exists is_default_view boolean not null default false;

create unique index if not exists follows_one_default_view
  on public.follows (follower_id)
  where is_default_view;

-- Horaires du magasin : si mon créneau commence à l'ouverture → « tu ouvres »,
-- s'il finit à la fermeture → « tu fermes ». Les mentions O/F scannées priment.
alter table public.profiles
  add column if not exists store_open_time time,
  add column if not exists store_close_time time;

-- Avatar prédéfini ('letter' = défaut lettre sur fond primaire ; sinon l'id
-- d'un animal de la collection Premium : fox, panda…).
alter table public.profiles
  add column if not exists avatar text not null default 'letter';
