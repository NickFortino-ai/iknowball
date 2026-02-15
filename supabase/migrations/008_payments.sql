-- Add payment columns to users
ALTER TABLE users ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN promo_code_used TEXT;

-- Create promo_codes table
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  max_uses INT DEFAULT 1,
  current_uses INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on promo_codes (no user policies — server uses service role key)
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Backfill: grandfather existing users
UPDATE users SET is_paid = true;
