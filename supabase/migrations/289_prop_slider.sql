-- Custom prop lines ("slider props").
--
-- A prop card currently offers the book's line and nothing else, which is why
-- the board carries nine Joe Burrow pass-yard cards differing by a yard or
-- two. With a slider the player picks their own threshold on ONE card, and
-- 442 of 1,449 published football props collapse away.
--
-- The chosen line has to live on the PICK, not the prop: two users on the
-- same prop can now be betting different numbers, so the prop's own outcome
-- no longer decides either of them.
ALTER TABLE prop_picks ADD COLUMN IF NOT EXISTS chosen_line NUMERIC;

-- NULL means "standard pick, settled against the prop's own line" — every
-- existing row, and every pick on a market with no slider (anytime TD and
-- the other flat markets, whose line never moves off 0.5). Settlement
-- branches on this, so legacy picks keep their exact current behaviour.
COMMENT ON COLUMN prop_picks.chosen_line IS
  'User-selected threshold for slider props. NULL = settled against player_props.line.';
