-- Update tier calculation function with new tier system
-- Tiers: Lost (<0), Rookie (0-99), Baller (100-499), Elite (500-999), Hall of Famer (1000-2999), GOAT (3000+)
CREATE OR REPLACE FUNCTION increment_user_points(user_row_id UUID, points_delta INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET total_points = total_points + points_delta,
      tier = CASE
        WHEN total_points + points_delta >= 3000 THEN 'GOAT'
        WHEN total_points + points_delta >= 1000 THEN 'Hall of Famer'
        WHEN total_points + points_delta >= 500 THEN 'Elite'
        WHEN total_points + points_delta >= 100 THEN 'Baller'
        WHEN total_points + points_delta >= 0 THEN 'Rookie'
        ELSE 'Lost'
      END,
      updated_at = now()
  WHERE id = user_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate tiers for all existing users
UPDATE users SET tier = CASE
  WHEN total_points >= 3000 THEN 'GOAT'
  WHEN total_points >= 1000 THEN 'Hall of Famer'
  WHEN total_points >= 500 THEN 'Elite'
  WHEN total_points >= 100 THEN 'Baller'
  WHEN total_points >= 0 THEN 'Rookie'
  ELSE 'Lost'
END;
