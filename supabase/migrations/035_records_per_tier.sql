-- Add fewest picks to each tier (not just GOAT)
INSERT INTO records (record_key, display_name, description, category) VALUES
  ('fewest_picks_to_baller', 'Fewest Picks to Baller', 'Reached Baller tier with the fewest total picks', 'efficiency'),
  ('fewest_picks_to_elite', 'Fewest Picks to Elite', 'Reached Elite tier with the fewest total picks', 'efficiency'),
  ('fewest_picks_to_hof', 'Fewest Picks to Hall of Famer', 'Reached Hall of Famer tier with the fewest total picks', 'efficiency')
ON CONFLICT (record_key) DO NOTHING;
