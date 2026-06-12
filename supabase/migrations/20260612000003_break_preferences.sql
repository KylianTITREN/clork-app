-- Préférences de pause : utilisées quand le planning n'imprime pas de colonne
-- durée (sinon la pause est déduite de durée vs amplitude).
alter table public.profiles
  add column break_default_minutes int not null default 0
    check (break_default_minutes >= 0 and break_default_minutes <= 240),
  add column break_threshold_hours numeric not null default 6
    check (break_threshold_hours >= 0 and break_threshold_hours <= 13);
