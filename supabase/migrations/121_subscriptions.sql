-- Subscription model: replace one-time is_paid with subscription tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT NULL;

-- Grandfather all existing paid users as lifetime
UPDATE users SET is_lifetime = true WHERE is_paid = true;

-- Promo code users are also lifetime
UPDATE users SET is_lifetime = true WHERE promo_code_used IS NOT NULL AND is_paid = true;
