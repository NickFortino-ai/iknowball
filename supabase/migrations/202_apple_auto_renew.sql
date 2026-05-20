-- Track whether the user has auto-renew toggled on for their Apple
-- subscription. Updated by the App Store Server Notifications v2
-- webhook when Apple posts DID_CHANGE_RENEWAL_STATUS. Lets us surface
-- "cancels on <expires_at>" copy on the settings page without having
-- to round-trip to Apple's API on every render.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auto_renew_enabled BOOLEAN DEFAULT TRUE;
