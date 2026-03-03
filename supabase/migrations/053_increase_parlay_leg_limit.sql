-- Remove max parlay leg limit (keep minimum of 2)
ALTER TABLE parlays DROP CONSTRAINT IF EXISTS parlays_leg_count_check;
ALTER TABLE parlays ADD CONSTRAINT parlays_leg_count_check CHECK (leg_count >= 2);
