-- Fix NBA backdrop labels for consistency and set sort_order to match desired display order
-- Arenas first (with proper Center/Arena/Forum suffixes), non-arenas after

-- Update all NBA backdrop entries with consistent labels and sort_order
UPDATE league_backdrops SET label = 'Crypto.com Arena', sort_order = 1 WHERE filename = 'nba-cryptocom.webp';
UPDATE league_backdrops SET label = 'Kaseya Center', sort_order = 2 WHERE filename = 'nba-kaseya-center.webp';
UPDATE league_backdrops SET label = 'Smoothie King Center', sort_order = 3 WHERE filename = 'nba-smoothie-king.webp';
UPDATE league_backdrops SET label = 'Chase Center', sort_order = 4 WHERE filename = 'nba-chase.webp';
UPDATE league_backdrops SET label = 'Oracle Arena', sort_order = 5 WHERE filename = 'nba-oracle.webp';
UPDATE league_backdrops SET label = 'United Center', sort_order = 6 WHERE filename = 'nba-united.webp';
UPDATE league_backdrops SET label = 'Madison Square Garden', sort_order = 7 WHERE filename = 'nba-msg.webp';
UPDATE league_backdrops SET label = 'Buzz City', sort_order = 8 WHERE filename = 'nba-buzz-city.webp';
UPDATE league_backdrops SET label = 'TD Garden', sort_order = 9 WHERE filename = 'nba-the-garden.webp';
UPDATE league_backdrops SET label = 'Little Caesars Arena', sort_order = 10 WHERE filename = 'nba-little-caesars.webp';
UPDATE league_backdrops SET label = 'Paycom Center', sort_order = 11 WHERE filename = 'nba-paycom-center.webp';
UPDATE league_backdrops SET label = 'Rocket Mortgage FieldHouse', sort_order = 12 WHERE filename = 'nba-mortgage.webp';
UPDATE league_backdrops SET label = 'Moda Center', sort_order = 13 WHERE filename = 'nba-moda.webp';
UPDATE league_backdrops SET label = 'Rockets Arena', sort_order = 14 WHERE filename = 'nba-rocket.webp';
UPDATE league_backdrops SET label = 'State Farm Arena', sort_order = 15 WHERE filename = 'nba-state-farm.webp';
UPDATE league_backdrops SET label = 'American Airlines Center', sort_order = 16 WHERE filename = 'nba-american-airlines.webp';
UPDATE league_backdrops SET label = 'FedExForum', sort_order = 17 WHERE filename = 'nba-fedex.webp';
UPDATE league_backdrops SET label = 'Frost Bank Center', sort_order = 18 WHERE filename = 'nba-frost-bank.webp';
UPDATE league_backdrops SET label = 'Golden 1 Center', sort_order = 19 WHERE filename = 'nba-golden-1.webp';
UPDATE league_backdrops SET label = 'Target Center', sort_order = 20 WHERE filename = 'nba-target-center.webp';
UPDATE league_backdrops SET label = 'Fiserv Forum', sort_order = 21 WHERE filename = 'nba-fiserv.webp';
UPDATE league_backdrops SET label = 'Barclays Center', sort_order = 22 WHERE filename = 'nba-barclays.webp';
UPDATE league_backdrops SET label = 'Ball Arena', sort_order = 23 WHERE filename = 'nba-ball.webp';
UPDATE league_backdrops SET label = 'Toyota Center', sort_order = 24 WHERE filename = 'nba-toyota.webp';
UPDATE league_backdrops SET label = 'Scotiabank Arena', sort_order = 25 WHERE filename = 'nba-scotiabank.webp';
UPDATE league_backdrops SET label = 'Gainbridge Fieldhouse', sort_order = 26 WHERE filename = 'nba-gainbridge-fieldhouse.webp';
UPDATE league_backdrops SET label = 'Intuit Dome', sort_order = 27 WHERE filename = 'nba-intuit-dome.webp';
UPDATE league_backdrops SET label = 'Kia Center', sort_order = 28 WHERE filename = 'nba-kia-center.webp';
UPDATE league_backdrops SET label = 'Xfinity Mobile Center', sort_order = 29 WHERE filename = 'nba-xfinity-mobile-center.webp';
UPDATE league_backdrops SET label = 'Delta Center', sort_order = 30 WHERE filename = 'nba-delta-center.webp';
UPDATE league_backdrops SET label = 'Capital One Arena', sort_order = 31 WHERE filename = 'nba-capital-one.webp';
