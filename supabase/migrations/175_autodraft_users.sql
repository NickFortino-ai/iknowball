-- Commissioner-controlled autodraft: track which users are autodrafting
ALTER TABLE fantasy_settings
ADD COLUMN auto_drafting_users UUID[] NOT NULL DEFAULT '{}';
