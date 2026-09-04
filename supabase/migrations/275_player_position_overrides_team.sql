-- Optional team scope for position overrides.
--
-- The table is keyed on player_name alone, so an override applies to
-- EVERY player with that name. Five rostered NFL players currently share
-- a name with another rostered player, and four of the five pairs are
-- IDP -- exactly the group these overrides are used for:
--
--   Byron Young      LB LAR | DL PHI
--   Byron Murphy     DL SEA | CB MIN
--   Marcus Harris    DL KC  | DB TEN
--   Justin Jefferson LB CLE | WR MIN
--   Michael Carter   RB TEN | CB PHI
--
-- The Justin Jefferson pair is the dangerous one: overriding the Browns
-- linebacker would also rewrite the Vikings receiver's position, which
-- feeds DFS rosters, starters and prop cards.
--
-- NULL team keeps today's behaviour (applies to every player with that
-- name), so the 8 existing rows are unaffected and callers that don't
-- know a team still resolve. A non-null team narrows the override to one
-- player.
--
-- Deliberately not switching to a player id: loadNflPositionOverrides and
-- the three DFS services all match by name, and several of those sources
-- (DFS salary tables) carry no shared id with nfl_players.

ALTER TABLE player_position_overrides
  ADD COLUMN IF NOT EXISTS team TEXT;

-- One override per (name, sport, team). The partial index handles NULL
-- team, which a plain UNIQUE would treat as always-distinct and allow to
-- duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppo_name_sport_team
  ON player_position_overrides (lower(player_name), sport_key, team)
  WHERE team IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ppo_name_sport_noteam
  ON player_position_overrides (lower(player_name), sport_key)
  WHERE team IS NULL;
