-- Bracket tiebreaker: predict championship total score
ALTER TABLE bracket_entries ADD COLUMN tiebreaker_score INTEGER DEFAULT NULL;
ALTER TABLE bracket_tournaments ADD COLUMN championship_total_score INTEGER DEFAULT NULL;
