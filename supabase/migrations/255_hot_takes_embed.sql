-- YouTube + X (Twitter) embed support for hot takes. Users paste a URL
-- or the full embed snippet; the server parses it into a structured
-- {provider, ref_id, url} shape so rendering can never trust user HTML.
--
-- provider: which platform (whitelisted)
-- ref_id:   the extracted video/status ID
-- url:      the canonical URL, kept for provenance / deep-linking
ALTER TABLE hot_takes
  ADD COLUMN IF NOT EXISTS embed_provider TEXT
    CHECK (embed_provider IS NULL OR embed_provider IN ('youtube', 'x')),
  ADD COLUMN IF NOT EXISTS embed_ref_id TEXT,
  ADD COLUMN IF NOT EXISTS embed_url TEXT;
