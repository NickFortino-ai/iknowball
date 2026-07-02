-- Mid-season "you've clinched a playoff spot" flag.
--
-- Set the moment a team mathematically guarantees a playoff berth,
-- even if they lose every remaining regular-season game. Persisted so
-- the clinch notification only fires once per team.
--
-- Populated by checkAndMarkClinch() after every regular-season week's
-- matchups settle. Client renders an asterisk next to clinched teams
-- on the standings tab.

ALTER TABLE league_members
  ADD COLUMN IF NOT EXISTS fantasy_clinched_at TIMESTAMPTZ;
