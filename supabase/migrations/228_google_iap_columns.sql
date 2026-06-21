-- Google Play Billing IAP — track the purchase token + product ID per user
-- so we can:
--   - de-duplicate verifications (server idempotency)
--   - look up the user when Real-Time Developer Notifications arrive
--     (RTDN payload includes the purchase token, not the user_id)
--   - re-query Play Developer API for current subscription state on demand

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_purchase_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_product_id TEXT;

-- Partial index — only non-null rows. Lookup pattern is
-- "given a token from RTDN, find the user". Bare token column lookups
-- are the only access path so a normal btree on the non-null subset is
-- the right shape.
CREATE INDEX IF NOT EXISTS idx_users_google_purchase_token
  ON users(google_purchase_token)
  WHERE google_purchase_token IS NOT NULL;
