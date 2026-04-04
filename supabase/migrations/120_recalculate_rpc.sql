-- RPC function to aggregate all user points in a single SQL query (no row limits)
CREATE OR REPLACE FUNCTION recalculate_user_totals()
RETURNS TABLE(user_id UUID, total NUMERIC) AS $$
  SELECT user_id, SUM(pts) as total FROM (
    SELECT user_id, points_earned as pts FROM picks WHERE status = 'settled' AND points_earned IS NOT NULL
    UNION ALL
    SELECT user_id, points_earned as pts FROM parlays WHERE status = 'settled' AND points_earned IS NOT NULL
    UNION ALL
    SELECT user_id, points_earned as pts FROM prop_picks WHERE status = 'settled' AND points_earned IS NOT NULL
    UNION ALL
    SELECT user_id, points_earned as pts FROM futures_picks WHERE status = 'settled' AND points_earned IS NOT NULL
    UNION ALL
    SELECT user_id, points as pts FROM bonus_points WHERE points IS NOT NULL
  ) all_points
  GROUP BY user_id;
$$ LANGUAGE sql STABLE;
