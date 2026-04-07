-- Adds sport points without incrementing total_picks / correct_picks / streak.
-- Used by league bonuses (league_win, survivor_win, etc.) so a league finish
-- contributes to the sport's point total without polluting the W/L pick count.
CREATE OR REPLACE FUNCTION add_sport_points_only(
  p_user_id UUID,
  p_sport_id UUID,
  p_points INTEGER
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_sport_stats (user_id, sport_id, total_picks, correct_picks, total_points)
  VALUES (p_user_id, p_sport_id, 0, 0, p_points)
  ON CONFLICT (user_id, sport_id) DO UPDATE SET
    total_points = user_sport_stats.total_points + p_points;
END;
$$ LANGUAGE plpgsql;
