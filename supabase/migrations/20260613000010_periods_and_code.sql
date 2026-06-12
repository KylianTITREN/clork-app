-- Ouverture/Fermeture deviennent des CATÉGORIES de créneau (pas des types).
alter table public.shifts drop constraint shifts_period_check;
alter table public.shifts add constraint shifts_period_check
  check (period in ('morning', 'day', 'evening', 'afternoon', 'opening', 'closing'));

-- Rotation du code d'accès fondateur (l'ancien apparaissait dans l'UI).
delete from public.promo_codes where code = 'WASQUEHAL';
insert into public.promo_codes (code, plan, max_uses) values ('CLORK-VIP-1064', 'founder', 50)
  on conflict (code) do nothing;
