-- Type « formation » + catégorie de créneau assignable (Matin/Jour/Soir).
alter table public.shifts drop constraint shifts_type_check;
alter table public.shifts add constraint shifts_type_check
  check (type in ('work', 'off', 'leave', 'rh', 'cp', 'meeting', 'training'));

alter table public.shifts
  add column period text
  check (period in ('morning', 'day', 'evening'));
