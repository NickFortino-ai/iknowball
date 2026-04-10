-- Track whether a draft is live (online with timers) or offline (commissioner enters results)
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS draft_mode TEXT DEFAULT 'live';
