-- Banned words table for content filtering
CREATE TABLE banned_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mute flag on users
ALTER TABLE users ADD COLUMN is_muted BOOLEAN NOT NULL DEFAULT false;

-- Seed with common slurs/profanity
INSERT INTO banned_words (word) VALUES
  ('nigger'),
  ('nigga'),
  ('faggot'),
  ('retard'),
  ('retarded'),
  ('chink'),
  ('spic'),
  ('kike'),
  ('wetback'),
  ('tranny'),
  ('coon'),
  ('gook'),
  ('beaner'),
  ('dyke'),
  ('raghead'),
  ('towelhead')
ON CONFLICT (word) DO NOTHING;
