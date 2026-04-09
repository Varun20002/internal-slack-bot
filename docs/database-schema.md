# Database Schema & Configuration — Webinar Ops System

Use this document to recreate the database on any PostgreSQL provider.

---

## Prerequisites

- PostgreSQL 14+ with `pgcrypto` extension
- A connection string in the format: `postgresql://user:password@host:port/dbname`

---

## 1. Full Migration SQL

Run this SQL to recreate the entire schema from scratch:

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- TABLE: webinar_requests
-- Core table tracking every webinar request through its lifecycle.
-- =====================================================================
CREATE TABLE IF NOT EXISTS webinar_requests (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  topic            TEXT         NOT NULL,
  trainer_name     TEXT         NOT NULL,
  requested_date   TIMESTAMPTZ  NOT NULL,
  attendees_est    INT          NOT NULL,
  state            TEXT         NOT NULL DEFAULT 'RAISED',
  employee_slack_id TEXT        NOT NULL,
  employee_name    TEXT         NOT NULL,
  bp_slack_id      TEXT,
  growth_slack_id  TEXT,
  rejection_reason TEXT,
  alt_date         TIMESTAMPTZ,
  bp_channel_id    TEXT,
  bp_message_ts    TEXT,
  growth_channel_id TEXT,
  growth_message_ts TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webinar_requests_state ON webinar_requests (state);
CREATE INDEX IF NOT EXISTS idx_webinar_requests_requested_date ON webinar_requests (requested_date);
CREATE INDEX IF NOT EXISTS idx_webinar_requests_created_at ON webinar_requests (created_at);

-- =====================================================================
-- TABLE: audit_log
-- Append-only log of every state transition and system event.
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID         REFERENCES webinar_requests (id) ON DELETE CASCADE,
  actor_id    TEXT         NOT NULL,
  actor_name  TEXT         NOT NULL,
  from_state  TEXT,
  to_state    TEXT         NOT NULL,
  action      TEXT         NOT NULL,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON audit_log (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

-- =====================================================================
-- TABLE: content_checklist
-- Per-request checklist items managed by the Growth team.
-- =====================================================================
CREATE TABLE IF NOT EXISTS content_checklist (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID         NOT NULL REFERENCES webinar_requests (id) ON DELETE CASCADE,
  item        TEXT         NOT NULL,
  completed   BOOLEAN      NOT NULL DEFAULT false,
  file_url    TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_checklist_request_id ON content_checklist (request_id);

-- =====================================================================
-- FUNCTION + TRIGGERS: auto-update updated_at on row changes
-- =====================================================================
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
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_content_checklist_updated ON content_checklist;
CREATE TRIGGER trg_content_checklist_updated
  BEFORE UPDATE ON content_checklist
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 2. Table Schemas (Quick Reference)

### webinar_requests

| Column             | Type        | Nullable | Default              | Description                                    |
|--------------------|-------------|----------|----------------------|------------------------------------------------|
| id                 | UUID        | NO       | gen_random_uuid()    | Primary key                                    |
| topic              | TEXT        | NO       |                      | Webinar title/topic                            |
| trainer_name       | TEXT        | NO       |                      | Name of the trainer                            |
| requested_date     | TIMESTAMPTZ | NO       |                      | Preferred date/time (UTC)                      |
| attendees_est      | INT         | NO       |                      | Estimated attendee count                       |
| state              | TEXT        | NO       | 'RAISED'             | Current state (see State Machine below)        |
| employee_slack_id  | TEXT        | NO       |                      | Slack user ID of the requester                 |
| employee_name      | TEXT        | NO       |                      | Display name of the requester                  |
| bp_slack_id        | TEXT        | YES      |                      | Slack user ID of BP reviewer                   |
| growth_slack_id    | TEXT        | YES      |                      | Slack user ID of Growth team assignee          |
| rejection_reason   | TEXT        | YES      |                      | Reason if rejected by BP                       |
| alt_date           | TIMESTAMPTZ | YES      |                      | Alternative date suggested by BP               |
| bp_channel_id      | TEXT        | YES      |                      | Slack channel ID where BP card was posted      |
| bp_message_ts      | TEXT        | YES      |                      | Slack message timestamp for BP card            |
| growth_channel_id  | TEXT        | YES      |                      | Slack channel ID where Growth card was posted  |
| growth_message_ts  | TEXT        | YES      |                      | Slack message timestamp for Growth card        |
| created_at         | TIMESTAMPTZ | NO       | now()                | Row creation time                              |
| updated_at         | TIMESTAMPTZ | NO       | now()                | Last update time (auto-set by trigger)         |

### audit_log

| Column      | Type        | Nullable | Default           | Description                               |
|-------------|-------------|----------|-------------------|-------------------------------------------|
| id          | UUID        | NO       | gen_random_uuid() | Primary key                               |
| request_id  | UUID        | YES      |                   | FK → webinar_requests.id (CASCADE DELETE) |
| actor_id    | TEXT        | NO       |                   | Slack user ID or 'cron'/'system'          |
| actor_name  | TEXT        | NO       |                   | Display name of actor                     |
| from_state  | TEXT        | YES      |                   | State before transition                   |
| to_state    | TEXT        | NO       |                   | State after transition                    |
| action      | TEXT        | NO       |                   | Action name (e.g. bp_confirm, cron_...)   |
| metadata    | JSONB       | NO       | '{}'              | Extra context (reason, dates, etc.)       |
| created_at  | TIMESTAMPTZ | NO       | now()             | When this event occurred                  |

### content_checklist

| Column     | Type        | Nullable | Default           | Description                               |
|------------|-------------|----------|-------------------|-------------------------------------------|
| id         | UUID        | NO       | gen_random_uuid() | Primary key                               |
| request_id | UUID        | NO       |                   | FK → webinar_requests.id (CASCADE DELETE) |
| item       | TEXT        | NO       |                   | Checklist item name                       |
| completed  | BOOLEAN     | NO       | false             | Whether item is done                      |
| file_url   | TEXT        | YES      |                   | Optional URL to uploaded asset            |
| updated_by | TEXT        | YES      |                   | Slack user ID of last updater             |
| updated_at | TIMESTAMPTZ | NO       | now()             | Last update time (auto-set by trigger)    |

---

## 3. Foreign Keys

| Constraint                        | Table              | Column     | References                |
|-----------------------------------|--------------------|------------|---------------------------|
| audit_log_request_id_fkey         | audit_log          | request_id | webinar_requests (id)     |
| content_checklist_request_id_fkey | content_checklist   | request_id | webinar_requests (id)     |

Both use `ON DELETE CASCADE`.

---

## 4. Indexes

| Index Name                            | Table              | Column(s)       |
|---------------------------------------|--------------------|-----------------|
| webinar_requests_pkey                 | webinar_requests   | id (UNIQUE)     |
| idx_webinar_requests_state            | webinar_requests   | state           |
| idx_webinar_requests_requested_date   | webinar_requests   | requested_date  |
| idx_webinar_requests_created_at       | webinar_requests   | created_at      |
| audit_log_pkey                        | audit_log          | id (UNIQUE)     |
| idx_audit_log_request_id              | audit_log          | request_id      |
| idx_audit_log_created_at              | audit_log          | created_at      |
| idx_audit_log_action                  | audit_log          | action          |
| content_checklist_pkey                | content_checklist   | id (UNIQUE)     |
| idx_content_checklist_request_id      | content_checklist   | request_id      |

---

## 5. Triggers

| Trigger Name                     | Table              | Event  | Action                        |
|----------------------------------|--------------------|--------|-------------------------------|
| trg_webinar_requests_updated     | webinar_requests   | UPDATE | EXECUTE FUNCTION set_updated_at() |
| trg_content_checklist_updated    | content_checklist   | UPDATE | EXECUTE FUNCTION set_updated_at() |

---

## 6. State Machine (Application-Level)

Valid states and transitions enforced in code (`src/lib/types.ts`):

```
RAISED           → PENDING_APPROVAL
PENDING_APPROVAL → CONFIRMED, REJECTED, ALT_SUGGESTED
ALT_SUGGESTED    → CONFIRMED, CANCELLED
CONFIRMED        → IN_PROGRESS, CANCELLED
IN_PROGRESS      → COMPLETED, CANCELLED
REJECTED         → (terminal)
COMPLETED        → (terminal)
CANCELLED        → (terminal)
```

Checklist items seeded when Growth picks up a session:
`headshot`, `bio`, `deck`, `promo_assets`

---

## 7. Environment Variables Required

| Variable                    | Used By           | Description                                      |
|-----------------------------|-------------------|--------------------------------------------------|
| NEXT_PUBLIC_SUPABASE_URL    | Supabase JS client | Supabase project API URL                        |
| SUPABASE_SERVICE_ROLE_KEY   | Supabase JS client | Service role key (bypasses RLS)                 |
| DATABASE_URL                | pg Pool            | Direct Postgres connection string for transactions |
| SLACK_BOT_TOKEN             | Slack Bolt SDK     | Bot user OAuth token (xoxb-...)                 |
| SLACK_SIGNING_SECRET        | Route handler      | Slack app signing secret                        |
| CRON_SECRET                 | Cron routes        | Shared secret to verify cron invocations        |
| BP_CHANNEL_ID               | App logic          | Slack channel for BP team reviews               |
| GROWTH_CHANNEL_ID           | App logic          | Slack channel for Growth team pickups           |
| OPS_CHANNEL_ID              | App logic          | Slack channel for SLA alerts & summaries        |

---

## 8. Existing Data (as of 2026-04-09)

### webinar_requests (3 rows)

| id | topic | state | employee_name |
|----|-------|-------|---------------|
| 9895ce58-bf41-4c78-bf10-6b95c188b9b9 | US perps | PENDING_APPROVAL | VARUN |
| 70ef3eb7-b866-47c4-abd2-8ad58be3b37b | comedy night | PENDING_APPROVAL | VARUN |
| 5de8b247-e632-4111-a9ba-e44cefc57951 | Crypto futures | PENDING_APPROVAL | VARUN |

### audit_log (3 rows)

All manual fixes from RAISED → PENDING_APPROVAL.

### content_checklist

Empty (no sessions have been picked up yet).

---

## 9. How to Migrate to a New Database

1. Create a new PostgreSQL database on your new provider
2. Run the full SQL from Section 1 above
3. Get the new connection string and update `DATABASE_URL` in `.env.local` and Vercel
4. If using Supabase JS client features (dashboard reads), also update `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
5. Optionally export/import existing data using `pg_dump` and `pg_restore`
