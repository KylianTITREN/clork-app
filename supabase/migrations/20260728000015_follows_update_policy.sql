-- v2 : le toggle « Afficher ce planning par défaut » écrit follows.is_default_view,
-- mais la table n'avait que SELECT/DELETE — l'UPDATE était silencieusement filtré
-- par la RLS (0 ligne touchée). On autorise le suiveur à modifier SES lignes.

create policy "follows: follower updates own"
  on public.follows for update
  using (follower_id = auth.uid())
  with check (follower_id = auth.uid());
