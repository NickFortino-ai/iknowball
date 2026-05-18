-- Rename the "Lost" tier to "Learning". Tier is stored as a string in
-- users.tier, so we have to update the function that produces it AND
-- migrate any existing rows that currently read 'Lost'.

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
        ELSE 'Learning'
      END,
      updated_at = now()
  WHERE id = user_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

UPDATE users SET tier = 'Learning' WHERE tier = 'Lost';
