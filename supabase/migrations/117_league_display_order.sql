-- Per-user league display order for drag-to-reorder
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS display_order INTEGER;
