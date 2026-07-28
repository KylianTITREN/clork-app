-- La vue Équipe (raw_extraction du scan) est une fonction Premium. Côté
-- suiveur, ce n'est pas SON plan qui compte mais celui de la personne suivie
-- (on ne peut pas « débloquer » les données de quelqu'un d'autre) : les scans
-- validés ne sont servis aux suiveurs QUE si la personne suivie est premium.
-- Le suivi des shifts (fonction cœur, gratuite) n'est pas touché.

drop policy if exists "scans: followers can read validated" on public.scans;

create policy "scans: followers can read validated"
  on public.scans for select
  using (
    status = 'validated'
    and exists (
      select 1
      from public.follows f
      join public.profiles p on p.id = scans.uploader_id
      where f.follower_id = auth.uid()
        and f.followed_id = scans.uploader_id
        and p.plan in ('premium', 'founder')
    )
  );
