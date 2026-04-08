-- CoinDCX Webinar Ops — initial schema
-- Run in Supabase SQL editor or via supabase db push

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- webinar_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webinar_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  trainer_name TEXT NOT NULL,
  requested_date TIMESTAMPTZ NOT NULL,
  attendees_est INT NOT NULL,
  state TEXT NOT NULL DEFAULT 'RAISED',
  employee_slack_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  bp_slack_id TEXT,
  growth_slack_id TEXT,
  rejection_reason TEXT,
  alt_date TIMESTAMPTZ,
  bp_channel_id TEXT,
  bp_message_ts TEXT,
  growth_channel_id TEXT,
  growth_message_ts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webinar_requests_state ON webinar_requests (state);
CREATE INDEX IF NOT EXISTS idx_webinar_requests_requested_date ON webinar_requests (requested_date);
CREATE INDEX IF NOT EXISTS idx_webinar_requests_created_at ON webinar_requests (created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_webinar_requests_updated ON webinar_requests;
CREATE TRIGGER trg_webinar_requests_updated
  BEFORE UPDATE ON webinar_requests
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log (append-only; revoke UPDATE/DELETE for API roles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES webinar_requests (id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON audit_log (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

REVOKE UPDATE, DELETE ON audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON audit_log FROM anon;

-- ---------------------------------------------------------------------------
-- content_checklist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES webinar_requests (id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  file_url TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_checklist_request_id ON content_checklist (request_id);

DROP TRIGGER IF EXISTS trg_content_checklist_updated ON content_checklist;
CREATE TRIGGER trg_content_checklist_updated
  BEFORE UPDATE ON content_checklist
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
