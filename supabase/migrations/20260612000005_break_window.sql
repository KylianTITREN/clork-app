-- Fenêtre de pause : pas seulement la durée mais QUAND (début ; fin = début + durée).
alter table public.shifts
  add column break_start time;

-- Heure de pause habituelle (profil), appliquée par défaut à l'import.
alter table public.profiles
  add column break_start_default time;
