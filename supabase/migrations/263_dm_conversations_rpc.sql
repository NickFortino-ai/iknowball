-- Partner-first aggregation for the messages sidebar.
--
-- Prior JS-side implementation fetched up to 500 direct_messages ordered
-- by created_at DESC, then grouped by partner. With two chatty pairs
-- that swap >250 messages each, older conversation partners silently
-- fell off the sidebar. Bumping the limit is a band-aid; the correct
-- fix is to aggregate in the DB and return exactly one row per partner.
--
-- The DISTINCT ON pattern lets Postgres pick the latest message per
-- partner in one pass. Unread count is a separate CTE joined back on.
-- Parameter is prefixed p_ to avoid any accidental column-name shadow
-- with the RETURNS TABLE output columns.

CREATE OR REPLACE FUNCTION get_conversations_for_user(p_user_id UUID)
RETURNS TABLE (
  partner_id UUID,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT
) AS $$
  WITH partners AS (
    SELECT
      CASE WHEN sender_id = p_user_id THEN receiver_id ELSE sender_id END AS partner_id,
      content,
      created_at,
      receiver_id,
      read_at
    FROM direct_messages
    WHERE sender_id = p_user_id OR receiver_id = p_user_id
  ),
  latest AS (
    SELECT DISTINCT ON (partner_id)
      partner_id,
      content AS last_message,
      created_at AS last_message_at
    FROM partners
    ORDER BY partner_id, created_at DESC
  ),
  unread AS (
    SELECT partner_id, COUNT(*)::BIGINT AS unread_count
    FROM partners
    WHERE receiver_id = p_user_id AND read_at IS NULL
    GROUP BY partner_id
  )
  SELECT
    l.partner_id,
    l.last_message,
    l.last_message_at,
    COALESCE(u.unread_count, 0)::BIGINT AS unread_count
  FROM latest l
  LEFT JOIN unread u USING (partner_id)
  ORDER BY l.last_message_at DESC;
$$ LANGUAGE sql STABLE;
