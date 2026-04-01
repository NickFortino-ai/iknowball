-- DFS League Activity Reports
CREATE TABLE dfs_league_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  report_data JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(league_id)
);

CREATE INDEX idx_dfs_league_reports_league ON dfs_league_reports(league_id);

ALTER TABLE dfs_league_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view reports" ON dfs_league_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage reports" ON dfs_league_reports FOR ALL TO service_role USING (true);

-- Add league_report notification type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction','comment','streak_milestone','parlay_result',
    'futures_result','connection_request','headlines','squares_quarter_win',
    'record_broken','survivor_result','survivor_win','league_deleted','league_win',
    'hot_take_reminder','hot_take_ask','hot_take_callout','league_invitation',
    'league_report'));
