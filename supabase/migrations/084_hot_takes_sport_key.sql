ALTER TABLE hot_takes ADD COLUMN sport_key TEXT;
CREATE INDEX idx_hot_takes_sport_key ON hot_takes(sport_key);
