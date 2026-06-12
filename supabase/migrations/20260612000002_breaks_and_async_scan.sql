-- 1. Pause non payée : écart entre l'amplitude (départ - arrivée) et la durée
--    payée imprimée sur le planning (ex: 10h-18h durée 7 → 60 min de pause).
alter table public.shifts
  add column break_minutes int not null default 0
  check (break_minutes >= 0 and break_minutes <= 480);

-- 2. Extraction asynchrone : la fonction edge écrit le résultat en tâche de
--    fond ; on garde la trace d'erreur pour l'afficher côté app.
alter table public.scans
  add column error_message text;
