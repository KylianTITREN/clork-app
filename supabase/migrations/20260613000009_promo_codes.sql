-- Codes d'accès (VIP/fondateur) : en attendant le paiement, un code saisi
-- dans Profil → Compte passe le plan du profil (founder/premium).
create table public.promo_codes (
  code text primary key,
  plan text not null check (plan in ('founder', 'premium')),
  max_uses int not null default 50,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;
-- Aucune policy : table illisible côté client, seul le RPC y accède.

create or replace function public.redeem_promo_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
begin
  update promo_codes
    set uses = uses + 1
    where code = upper(trim(p_code)) and uses < max_uses
    returning plan into v_plan;
  if v_plan is null then
    raise exception 'Code invalide ou épuisé';
  end if;
  update profiles set plan = v_plan, updated_at = now() where id = auth.uid();
  return v_plan;
end;
$$;

grant execute on function public.redeem_promo_code(text) to authenticated;

-- Premier code : l'équipe du magasin de Typhanie (fondatrices à vie).
insert into public.promo_codes (code, plan, max_uses) values ('WASQUEHAL', 'founder', 50);
