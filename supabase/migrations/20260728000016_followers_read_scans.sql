-- Mode conjoint : en consultant le planning d'une personne suivie, on peut
-- aussi voir SON équipe de la semaine (feuille Équipe). Les suiveurs peuvent
-- donc lire les scans VALIDÉS de la personne suivie (raw_extraction inclus) —
-- même modèle que la policy « shifts: followers can read ».

create policy "scans: followers can read validated"
  on public.scans for select
  using (
    status = 'validated'
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.followed_id = scans.uploader_id
    )
  );
