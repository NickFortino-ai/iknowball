-- Remove old non-prefixed NBA backdrop entries that are duplicates of nba-* versions.
-- These cause duplicate images in the profile backdrop picker.

-- First update any leagues/users still referencing the old filenames
UPDATE leagues SET backdrop_image = 'nba-american-airlines.webp' WHERE backdrop_image = 'american-airlines.webp';
UPDATE leagues SET backdrop_image = 'nba-big-shoes.webp' WHERE backdrop_image = 'big-shoes-to-fill.webp';
UPDATE leagues SET backdrop_image = 'nba-buzz-city.webp' WHERE backdrop_image = 'buzz-city.webp';
UPDATE leagues SET backdrop_image = 'nba-chase.webp' WHERE backdrop_image = 'chase.webp';
UPDATE leagues SET backdrop_image = 'nba-check.webp' WHERE backdrop_image = 'check.webp';
UPDATE leagues SET backdrop_image = 'nba-glow.webp' WHERE backdrop_image = 'glow-to-practice.webp';
UPDATE leagues SET backdrop_image = 'nba-moda.webp' WHERE backdrop_image = 'moda.webp';
UPDATE leagues SET backdrop_image = 'nba-mortgage.webp' WHERE backdrop_image = 'mortgage.webp';
UPDATE leagues SET backdrop_image = 'nba-msg.webp' WHERE backdrop_image = 'msg.webp';
UPDATE leagues SET backdrop_image = 'nba-oracle.webp' WHERE backdrop_image = 'oracle.webp';
UPDATE leagues SET backdrop_image = 'nba-play-bball.webp' WHERE backdrop_image = 'play-bball.webp';
UPDATE leagues SET backdrop_image = 'nba-rocket.webp' WHERE backdrop_image = 'rocket.webp';
UPDATE leagues SET backdrop_image = 'nba-the-court-is-yours.webp' WHERE backdrop_image = 'the-court-is-yours.webp';
UPDATE leagues SET backdrop_image = 'nba-the-garden.webp' WHERE backdrop_image = 'the-garden.webp';
UPDATE leagues SET backdrop_image = 'nba-united.webp' WHERE backdrop_image = 'united.webp';

UPDATE users SET backdrop_image = 'nba-american-airlines.webp' WHERE backdrop_image = 'american-airlines.webp';
UPDATE users SET backdrop_image = 'nba-big-shoes.webp' WHERE backdrop_image = 'big-shoes-to-fill.webp';
UPDATE users SET backdrop_image = 'nba-buzz-city.webp' WHERE backdrop_image = 'buzz-city.webp';
UPDATE users SET backdrop_image = 'nba-chase.webp' WHERE backdrop_image = 'chase.webp';
UPDATE users SET backdrop_image = 'nba-check.webp' WHERE backdrop_image = 'check.webp';
UPDATE users SET backdrop_image = 'nba-glow.webp' WHERE backdrop_image = 'glow-to-practice.webp';
UPDATE users SET backdrop_image = 'nba-moda.webp' WHERE backdrop_image = 'moda.webp';
UPDATE users SET backdrop_image = 'nba-mortgage.webp' WHERE backdrop_image = 'mortgage.webp';
UPDATE users SET backdrop_image = 'nba-msg.webp' WHERE backdrop_image = 'msg.webp';
UPDATE users SET backdrop_image = 'nba-oracle.webp' WHERE backdrop_image = 'oracle.webp';
UPDATE users SET backdrop_image = 'nba-play-bball.webp' WHERE backdrop_image = 'play-bball.webp';
UPDATE users SET backdrop_image = 'nba-rocket.webp' WHERE backdrop_image = 'rocket.webp';
UPDATE users SET backdrop_image = 'nba-the-court-is-yours.webp' WHERE backdrop_image = 'the-court-is-yours.webp';
UPDATE users SET backdrop_image = 'nba-the-garden.webp' WHERE backdrop_image = 'the-garden.webp';
UPDATE users SET backdrop_image = 'nba-united.webp' WHERE backdrop_image = 'united.webp';

-- Now delete the old entries
DELETE FROM league_backdrops WHERE filename IN (
  'american-airlines.webp',
  'big-shoes-to-fill.webp',
  'buzz-city.webp',
  'chase.webp',
  'check.webp',
  'glow-to-practice.webp',
  'moda.webp',
  'mortgage.webp',
  'msg.webp',
  'oracle.webp',
  'play-bball.webp',
  'rocket.webp',
  'the-court-is-yours.webp',
  'the-garden.webp',
  'united.webp'
);
