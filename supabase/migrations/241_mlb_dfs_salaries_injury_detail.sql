-- mlb_dfs_salaries (migration 105) was created with injury_status only.
-- NBA and WNBA equivalents got injury_detail added (migrations 098 + 214)
-- but MLB was missed. mlbDfsService reads/writes injury_detail every sync
-- cycle, throwing 'column does not exist' on every hit — a top contributor
-- to the disk-IO budget alert.

ALTER TABLE mlb_dfs_salaries ADD COLUMN IF NOT EXISTS injury_detail TEXT;
