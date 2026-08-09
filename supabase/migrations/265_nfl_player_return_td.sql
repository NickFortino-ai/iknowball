-- Player return TDs (kick/punt/INT/fumble returns).
--
-- Sleeper's per-player weekly stats include distinct keys for return
-- TDs — td_special (kick/punt returns), td_int (defensive INT return),
-- td_fum / td_fum_rec (defensive fumble return), plus a generic td_st.
-- We roll them into one aggregate column here because no product surface
-- needs the breakdown; we just need the total when settling
-- player_anytime_td.
--
-- Sportsbooks grade "anytime TD" as ANY touchdown a player scores —
-- including returns. Prior to this column the settlement job summed
-- only rush_td + rec_td, which under-graded any WR/RB/DEF player who
-- scored via a return only.
--
-- Default 0 keeps every existing row consistent; the Sleeper sync
-- fills the column going forward via defensive `|| 0` fallbacks so
-- unknown key names simply mean "no return TDs this week."

ALTER TABLE nfl_player_stats
  ADD COLUMN IF NOT EXISTS return_td INTEGER DEFAULT 0;
