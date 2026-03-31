-- Fix NFL backdrop format keys to match the actual sport key
UPDATE league_backdrops
SET formats = array_replace(formats, 'football_nfl', 'americanfootball_nfl')
WHERE 'football_nfl' = ANY(formats);
