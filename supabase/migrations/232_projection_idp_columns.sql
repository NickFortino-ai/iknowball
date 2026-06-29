-- IDP raw stat projections so defenders get non-zero Proj numbers in
-- IDP-enabled leagues. Sleeper's pre-baked pts_ppr / pts_half_ppr /
-- pts_std totals use an offense-only formula that scores defenders as
-- ~0, which is correct for team-DEF leagues but useless for IDP. The
-- raw fields below let the server compute IDP projections via
-- applyScoringRules using the league's actual IDP scoring values.
-- NUMERIC because projections are decimals (e.g. 4.7 sacks/season).

ALTER TABLE nfl_player_projections
  ADD COLUMN IF NOT EXISTS idp_sack NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_int NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_tkl_solo NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_tkl_ast NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_tkl_loss NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_pass_def NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_qb_hit NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_ff NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_fum_rec NUMERIC DEFAULT 0;
