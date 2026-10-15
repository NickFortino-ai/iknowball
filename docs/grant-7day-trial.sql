-- Grant a 7-day trial to everyone who signed up and never got in.
--
-- WHO: 86 accounts that have never paid in any form — is_paid false,
-- is_lifetime false, no subscription_status, no subscription_expires_at, no
-- stripe_customer_id. Every one of them is COMPLETELY empty: zero picks,
-- zero prop picks, zero league memberships. Not a single one did anything
-- after signing up, which is the paywall working as a wall. They signed up
-- across Jun(6) Jul(13) Aug(35) Sep(26) Oct(6).
--
-- DELIBERATELY EXCLUDED: the 5 accounts with subscription_status='expired'.
-- They DID pay once and lapsed, so they are a win-back audience with a
-- different message, not people who never got through the door.
--
-- HOW IT WORKS — no new column and no gate change. ProtectedRoute already
-- grants access on:
--
--     subscription_expires_at && new Date(subscription_expires_at) > now
--
-- so a future timestamp IS the trial, and it lapses on its own. No cron, no
-- expiry job, nothing to remember to turn off.
--
-- is_paid STAYS FALSE. This is the important part: the same gate short-
-- circuits to true on is_paid, so setting it would grant access that never
-- expires. False is what makes this a trial rather than a gift.
--
-- subscription_status = 'trialing' is already a value the Stripe webhook
-- understands (webhooks.js treats active|trialing as paid), so nothing
-- downstream is surprised by it.

-- 1. LOOK FIRST — expect 86.
SELECT COUNT(*) AS will_be_granted
FROM users
WHERE is_paid = false
  AND is_lifetime = false
  AND subscription_status IS NULL
  AND subscription_expires_at IS NULL
  AND stripe_customer_id IS NULL;

-- 2. THE GRANT.
UPDATE users
SET subscription_status  = 'trialing',
    subscription_plan    = 'trial_7day',
    subscription_expires_at = NOW() + INTERVAL '7 days',
    updated_at = NOW()
WHERE is_paid = false
  AND is_lifetime = false
  AND subscription_status IS NULL
  AND subscription_expires_at IS NULL
  AND stripe_customer_id IS NULL;

-- 3. CONFIRM — 86 trialing, all expiring in 7 days, all still is_paid=false.
SELECT subscription_status,
       subscription_plan,
       COUNT(*) AS accounts,
       MIN(subscription_expires_at) AS earliest_expiry,
       MAX(subscription_expires_at) AS latest_expiry,
       BOOL_OR(is_paid) AS any_marked_paid   -- must be false
FROM users
WHERE subscription_plan = 'trial_7day'
GROUP BY subscription_status, subscription_plan;

-- ---------------------------------------------------------------------
-- THE EMAIL LIST. Addresses live in auth.users, not public.users — there
-- is no users.email column, which is what made sendAdminEmail silently
-- reach nobody for months. All 86 have a confirmed address and none have
-- email_unsubscribed set.
-- ---------------------------------------------------------------------
-- SELECT u.username, a.email, u.subscription_expires_at
-- FROM users u
-- JOIN auth.users a ON a.id = u.id
-- WHERE u.subscription_plan = 'trial_7day'
--   AND u.email_unsubscribed IS NOT TRUE
-- ORDER BY u.created_at;

-- ---------------------------------------------------------------------
-- TO UNDO, before anyone has used it:
-- ---------------------------------------------------------------------
-- UPDATE users
-- SET subscription_status = NULL, subscription_plan = NULL,
--     subscription_expires_at = NULL, updated_at = NOW()
-- WHERE subscription_plan = 'trial_7day';
