-- Nouveaux types de créneau (ouverture/fermeture, RTT, maladie, absence,
-- congé sans solde, heures supp). 'rh' et 'leave' restent acceptés : les
-- extractions de plannings papier continuent d'en produire (legacy).
alter table public.shifts drop constraint shifts_type_check;
alter table public.shifts add constraint shifts_type_check
  check (type in (
    'work', 'off', 'leave', 'rh', 'cp', 'meeting', 'training',
    'opening', 'closing', 'rtt', 'sick', 'absent', 'unpaid', 'overtime'
  ));

-- Demi-journée d'absence : period gagne 'afternoon' (Matin/Jour/Soir/Après-midi).
alter table public.shifts drop constraint if exists shifts_period_check;
alter table public.shifts add constraint shifts_period_check
  check (period in ('morning', 'day', 'evening', 'afternoon'));
