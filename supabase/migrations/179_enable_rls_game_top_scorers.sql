-- Supabase Security Advisor flagged game_top_scorers for missing RLS.
-- All current access is server-side via the service-role key (jobs and the
-- league results route), which bypasses RLS, so enabling it here doesn't
-- break any current code path. Read policy mirrors team_intel (075).

ALTER TABLE game_top_scorers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Top scorers are viewable by authenticated users"
  ON game_top_scorers FOR SELECT TO authenticated USING (true);
