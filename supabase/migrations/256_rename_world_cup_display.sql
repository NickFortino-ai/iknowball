-- Rename the display name of soccer_world_cup to 'Int'l Soccer' for
-- Apple 5.2.1 compliance. Apple flagged the literal string 'World Cup'
-- on a Picks-page game card as FIFA-branded content requiring
-- authorization. The sport KEY stays 'soccer_world_cup' — that's an
-- internal identifier used by the games sync + scoring paths.
--
-- Only sports.name (the human-readable display column) changes.
UPDATE sports SET name = 'Int''l Soccer' WHERE key = 'soccer_world_cup';
