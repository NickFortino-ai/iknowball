-- Granular admin role. Existing admins (is_admin=true) default to NULL which
-- the app treats as 'full' — same access as before. Set to 'helper' for an
-- admin who should see everything EXCEPT the dashboard (which exposes
-- revenue, user growth, promo codes, etc).
--
-- To make someone a helper admin:
--   UPDATE users SET is_admin = true, admin_role = 'helper' WHERE username = '...';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role TEXT
  CHECK (admin_role IS NULL OR admin_role IN ('full', 'helper'));
