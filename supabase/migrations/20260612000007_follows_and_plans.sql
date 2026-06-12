-- 1) Plans (free/premium/founder) — base des quotas serveur et de la V1 payante.
alter table public.profiles
  add column plan text not null default 'free'
  check (plan in ('free', 'premium', 'founder'));

-- Les comptes existants (Kylian, Typhanie & testeurs) = fondateurs à vie.
update public.profiles set plan = 'founder';

-- 2) Suivi de planning en lecture (ex: Kylian suit Typhanie).
alter table public.profiles
  add column follow_code text not null unique default encode(gen_random_bytes(4), 'hex');

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

alter table public.follows enable row level security;

create policy "follows: follower reads own"
  on public.follows for select
  using (follower_id = (select auth.uid()));

create policy "follows: follower removes own"
  on public.follows for delete
  using (follower_id = (select auth.uid()));

-- Le suiveur peut lire les créneaux et le nom de la personne suivie.
create policy "shifts: followers can read"
  on public.shifts for select
  using (
    exists (
      select 1 from public.follows f
      where f.followed_id = shifts.user_id
        and f.follower_id = (select auth.uid())
    )
  );

create policy "profiles: followed visible to followers"
  on public.profiles for select
  using (
    exists (
      select 1 from public.follows f
      where f.followed_id = profiles.id
        and f.follower_id = (select auth.uid())
    )
  );

-- Suivre via code (la cible n'est pas lisible avant l'insertion → definer).
create or replace function public.follow_user(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentification requise');
  end if;
  select * into v_target from public.profiles where follow_code = lower(trim(p_code));
  if not found then
    return jsonb_build_object('success', false, 'error', 'Code invalide');
  end if;
  if v_target.id = auth.uid() then
    return jsonb_build_object('success', false, 'error', 'C''est ton propre code 😄');
  end if;
  insert into public.follows (follower_id, followed_id)
  values (auth.uid(), v_target.id)
  on conflict do nothing;
  return jsonb_build_object('success', true, 'display_name', v_target.display_name);
end;
$$;
revoke execute on function public.follow_user(text) from public, anon;
grant execute on function public.follow_user(text) to authenticated;

-- 3) Suppression de compte (cascade sur toutes les données via FK).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
