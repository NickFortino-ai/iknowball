-- Add Apple IAP columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_source TEXT;

-- Unique index to prevent double-processing Apple transactions
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_transaction_id
  ON users (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

-- Backfill payment_source for existing paid users (does NOT touch is_paid)
UPDATE users SET payment_source = 'promo'
  WHERE is_paid = true AND promo_code_used IS NOT NULL AND payment_source IS NULL;

UPDATE users SET payment_source = 'grandfathered'
  WHERE is_paid = true AND promo_code_used IS NULL AND payment_source IS NULL;
