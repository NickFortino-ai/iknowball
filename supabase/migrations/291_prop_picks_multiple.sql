-- Several bets on the same prop.
--
-- player_props gets a NEW row every time the book re-quotes a line, so for a
-- while a player had eight pickable cards in one game and users took three
-- or four of them. Collapsing the board to one card per player/market/game
-- fixed the mess but removed the thing people were doing on purpose: laddering
-- a few lines on the same player. With one card and UNIQUE(user_id, prop_id),
-- you got exactly one bet.
--
-- So the uniqueness moves from "one pick per prop" to "one pick per prop, per
-- side, per line". Taking over 195 and over 220 on the same prop is two bets;
-- taking over 195 twice is an edit of the first.
--
-- NULLS NOT DISTINCT matters. chosen_line is NULL on flat markets (anytime
-- TD), and Postgres treats NULLs as distinct by default — without this, those
-- props would become infinitely stackable on one side, which is just a
-- doubled stake rather than an opinion. Requires Postgres 15+.

ALTER TABLE prop_picks DROP CONSTRAINT IF EXISTS prop_picks_user_id_prop_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS prop_picks_user_prop_side_line_key
  ON prop_picks (user_id, prop_id, picked_side, chosen_line)
  NULLS NOT DISTINCT;

-- Reading "every bet this user holds on this prop" is now a list rather than
-- a single row, and the card does it per prop on every render.
CREATE INDEX IF NOT EXISTS idx_prop_picks_user_prop
  ON prop_picks (user_id, prop_id);
