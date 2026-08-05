-- Add NFL preseason as a distinct sport. The Odds API serves preseason
-- games under a separate sport key (americanfootball_nfl_preseason), so
-- we treat it as its own row in the `sports` table.
--
-- Isolation intent: fantasy, DFS, and regular NFL contests filter by
-- sport_id matching key='americanfootball_nfl'. Preseason games land
-- under a distinct sport_id and are invisible to those code paths.
--
-- We intentionally do NOT add 'americanfootball_nfl_preseason' to
-- leagues_sport_check or bracket_templates_sport_check — no league or
-- bracket should ever be created against preseason. Preseason surfaces
-- only on the picks board (and rolls up under the NFL leaderboard via a
-- server-side alias — see server/src/utils/nflFamily.js).

INSERT INTO sports (key, name, active) VALUES
  ('americanfootball_nfl_preseason', 'NFL Preseason', true)
ON CONFLICT (key) DO NOTHING;
