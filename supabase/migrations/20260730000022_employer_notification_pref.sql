-- Notification « mon employeur a publie mes horaires ».
--
-- Les autres rappels vivent dans le telephone (AsyncStorage) parce que c est
-- lui qui les declenche. Celui-ci part du SERVEUR au moment ou la responsable
-- publie : la preference doit donc etre lisible cote serveur, donc en base.
--
-- Par defaut a true : une employee qui recoit son planning de son employeur
-- veut evidemment le savoir. Elle peut couper depuis Notifications.

alter table public.profiles
  add column if not exists notify_employer_planning boolean not null default true;

comment on column public.profiles.notify_employer_planning is
  'Recevoir une notification quand le magasin publie un planning qui me concerne.';
