-- Dedup table for App Store Server Notifications v2. Apple's docs say
-- they may retry on non-2xx, and we've seen duplicate notifications
-- fire even when we ACK 200 (rare, but happens during sandbox testing
-- in particular). Recording the notificationUUID gives us a hard guard
-- against double-processing — every webhook hit checks this table
-- before doing any state change.

CREATE TABLE IF NOT EXISTS apple_notifications (
  notification_uuid TEXT PRIMARY KEY,
  notification_type TEXT NOT NULL,
  subtype TEXT,
  original_transaction_id TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apple_notifications_tx
  ON apple_notifications(original_transaction_id);
