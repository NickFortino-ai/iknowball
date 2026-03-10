-- Add 'voided' to player_props status check
ALTER TABLE player_props DROP CONSTRAINT IF EXISTS player_props_status_check;
ALTER TABLE player_props ADD CONSTRAINT player_props_status_check
  CHECK (status IN ('synced', 'published', 'locked', 'settled', 'voided'));

-- Add 'voided' to prop_picks status check
ALTER TABLE prop_picks DROP CONSTRAINT IF EXISTS prop_picks_status_check;
ALTER TABLE prop_picks ADD CONSTRAINT prop_picks_status_check
  CHECK (status IN ('pending', 'locked', 'settled', 'voided'));

-- Allow users to see voided props (so joined prop picks show prop details)
DROP POLICY IF EXISTS "Published+ props viewable by authenticated users" ON player_props;
CREATE POLICY "Published+ props viewable by authenticated users"
  ON player_props FOR SELECT
  TO authenticated
  USING (status IN ('published', 'locked', 'settled', 'voided'));
