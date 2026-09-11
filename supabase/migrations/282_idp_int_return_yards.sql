-- Interception return yards for individual defensive players.
--
-- Sleeper sends idp_int_ret_yd on both the stats and projections feeds --
-- 126 players carry a projected value in a typical week -- and we stored
-- neither, so a defender who took a pick 40 yards got credit for the
-- interception and nothing for the return.
--
-- Note this is the INDIVIDUAL field. Sleeper's int_ret_yd is the TEAM figure
-- (it appears on the 'SEA' / 'TEAM_SEA' rows), which belongs to team-defense
-- scoring rather than IDP and is deliberately not added here.

ALTER TABLE nfl_player_stats ADD COLUMN IF NOT EXISTS idp_int_ret_yd INTEGER DEFAULT 0;
ALTER TABLE nfl_player_projections ADD COLUMN IF NOT EXISTS idp_int_ret_yd NUMERIC DEFAULT 0;
