# Developer Guide — Webinar Ops Slack Bot

Internal Slack app + analytics dashboard for the CoinDCX webinar request lifecycle (Employee → BP → Growth), backed by Supabase Postgres with atomic state transitions and deployed on Vercel.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Environment Variables](#4-environment-variables)
5. [Local Development Setup](#5-local-development-setup)
6. [Request Lifecycle & State Machine](#6-request-lifecycle--state-machine)
7. [Slack App Wiring](#7-slack-app-wiring)
8. [Slash Commands](#8-slash-commands)
9. [Action Handlers](#9-action-handlers)
10. [Growth Checklist Flow](#10-growth-checklist-flow)
11. [Block Kit Components](#11-block-kit-components)
12. [Database Layer](#12-database-layer)
13. [Cron Jobs](#13-cron-jobs)
14. [Dashboard (Web UI)](#14-dashboard-web-ui)
15. [Deployment (Vercel)](#15-deployment-vercel)
16. [Slack App Configuration](#16-slack-app-configuration)
17. [Troubleshooting](#17-troubleshooting)
18. [Key Design Decisions](#18-key-design-decisions)

---

## 1. Architecture Overview

```
┌────────────┐   /webinar, buttons, modals   ┌──────────────────────┐
│   Slack    │ ─────────────────────────────▶ │  Vercel (Next.js)    │
│ Workspace  │ ◀───────────────────────────── │  /api/slack/events   │
└────────────┘   chat.postMessage, update     │                      │
                                              │  /api/cron/daily     │
┌────────────┐   Supabase JS (service role)   │  /api/cron/weekly    │
│  Supabase  │ ◀─────────────────────────────▶│                      │
│  Postgres  │   RPCs, REST queries           │  / (Dashboard)       │
└────────────┘                                └──────────────────────┘
```

**Data flow:** Every Slack interaction (slash command, button click, modal submission) hits the single `/api/slack/events` Next.js route handler, which delegates to Slack Bolt's `processEvent`. Bolt dispatches to the matching command/action/view handler. Handlers read and write Supabase, then reply via Slack's Web API.

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.x |
| Slack SDK | @slack/bolt | ^4.7.0 |
| Database | Supabase (Postgres 14+) | @supabase/supabase-js ^2.102.x |
| Hosting | Vercel (serverless) | — |
| Charts | Recharts | ^3.8.x |
| Styling | Tailwind CSS | ^4 |
| Language | TypeScript | ^5 |

---

## 3. Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   ├── daily/route.ts          # SLA checks, reminders
│   │   │   └── weekly-summary/route.ts # Weekly ops summary
│   │   └── slack/
│   │       └── events/route.ts         # ALL Slack traffic (single entrypoint)
│   ├── globals.css
│   ├── layout.tsx                      # Root layout (Geist fonts, metadata)
│   └── page.tsx                        # Dashboard server component
│
├── components/
│   ├── charts/
│   │   ├── SlaLineChart.tsx
│   │   ├── StatePieChart.tsx
│   │   └── VolumeBarChart.tsx
│   ├── DashboardShell.tsx              # Client component — tabs, metrics, table
│   ├── MetricCard.tsx
│   ├── RequestsTable.tsx
│   ├── StatusBadge.tsx
│   └── TrainersChart.tsx
│
├── lib/
│   ├── cronAuth.ts                     # Bearer token check for cron routes
│   ├── dashboardData.ts               # Supabase queries for dashboard payload
│   ├── datetime.ts                     # combineDateTimeUtc helper
│   ├── db.ts                           # pg Pool (legacy, unused at runtime)
│   ├── slack.ts                        # Bolt App singleton + handler registration
│   ├── slackWeb.ts                     # Standalone WebClient for cron jobs
│   ├── stateMachine.ts                 # transitionState via Supabase RPC
│   ├── supabase.ts                     # getSupabaseAdmin singleton
│   └── types.ts                        # WebinarState, VALID_TRANSITIONS map
│
└── slack/
    ├── actions/
    │   ├── bpActions.ts                # bp_confirm, bp_reject, bp_suggest_alt
    │   ├── employeeActions.ts          # employee_accept_alt, employee_decline_alt
    │   └── growthActions.ts            # growth_toggle_checklist_*, growth_mark_complete
    ├── actionValue.ts                  # getBlockButtonValue helper
    ├── blockKit.ts                     # All Block Kit card builders
    ├── commands/
    │   └── webinar.ts                  # /webinar slash command + modal submission
    ├── growthChecklistFlow.ts          # Seed checklist → IN_PROGRESS → post to Growth
    └── growthChecklistMessage.ts       # Build checklist Block Kit payload from DB

docs/
├── database-schema.md                  # Full SQL, table reference, state diagram
└── developer-guide.md                  # This file

supabase/
└── migrations/
    └── 001_init.sql                    # DDL for tables, indexes, triggers

slack-manifest.yml                      # Slack app manifest
vercel.json                             # Cron schedules
```

---

## 4. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Yes | Slack app signing secret for request verification |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS) |
| `CRON_SECRET` | Yes | Bearer token protecting cron endpoints |
| `BP_CHANNEL_ID` | Yes | Slack channel ID for BP team reviews |
| `GROWTH_CHANNEL_ID` | Yes | Slack channel ID for Growth team checklists |
| `OPS_CHANNEL_ID` | Yes | Slack channel ID for SLA alerts & summaries |
| `DATABASE_URL` | No | Direct Postgres URL (legacy, not used at runtime) |

The bot must be **invited** to all three channels (`BP_CHANNEL_ID`, `GROWTH_CHANNEL_ID`, `OPS_CHANNEL_ID`).

---

## 5. Local Development Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd internal-slack-bot
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all required values

# 3. Run the database migration
# In Supabase SQL Editor, run: supabase/migrations/001_init.sql
# Also ensure the transition_state RPC function exists (see Section 12)

# 4. Start the dev server
npm run dev

# 5. Expose local server for Slack (e.g. ngrok)
ngrok http 3000
# Update Slack app's Request URL to: https://<ngrok-url>/api/slack/events
```

**Scripts:**

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 6. Request Lifecycle & State Machine

### States

| State | Description | Terminal? |
|-------|-------------|-----------|
| `RAISED` | Employee submitted via `/webinar` | No |
| `PENDING_APPROVAL` | BP team notified, awaiting review | No |
| `CONFIRMED` | BP approved, triggers Growth checklist | No |
| `REJECTED` | BP rejected with reason | Yes |
| `ALT_SUGGESTED` | BP proposed alternative date | No |
| `IN_PROGRESS` | Growth checklist seeded, team working on content | No |
| `COMPLETED` | All checklist items done, marked complete | Yes |
| `CANCELLED` | Employee declined alt or manual cancel | Yes |

### Transition Diagram

```
RAISED ──────────────────▶ PENDING_APPROVAL
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
               CONFIRMED    REJECTED   ALT_SUGGESTED
                    │       (terminal)      │
                    │                  ┌────┴────┐
                    ▼                  ▼         ▼
              IN_PROGRESS         CONFIRMED  CANCELLED
                    │                         (terminal)
               ┌────┴────┐
               ▼         ▼
          COMPLETED   CANCELLED
          (terminal)  (terminal)
```

### Who triggers each transition

| Transition | Triggered by | Handler |
|-----------|-------------|---------|
| RAISED → PENDING_APPROVAL | Employee submits `/webinar` modal | `webinar.ts` |
| PENDING_APPROVAL → CONFIRMED | BP clicks "Confirm" | `bpActions.ts` |
| PENDING_APPROVAL → REJECTED | BP submits reject modal | `bpActions.ts` |
| PENDING_APPROVAL → ALT_SUGGESTED | BP submits alt-date modal | `bpActions.ts` |
| ALT_SUGGESTED → CONFIRMED | Employee clicks "Accept new date" | `employeeActions.ts` |
| ALT_SUGGESTED → CANCELLED | Employee clicks "Decline" | `employeeActions.ts` |
| CONFIRMED → IN_PROGRESS | Automatic after checklist seeding | `growthChecklistFlow.ts` |
| IN_PROGRESS → COMPLETED | Growth clicks "Mark complete" | `growthActions.ts` |
| IN_PROGRESS → CANCELLED | (Manual/future) | — |

---

## 7. Slack App Wiring

### Initialization (`src/lib/slack.ts`)

The Bolt `App` is created with a **noop custom receiver** (no HTTP server) since Next.js handles HTTP. Key settings:

- `processBeforeResponse: false` — Bolt calls the `ack()` callback immediately, allowing the route handler to return the HTTP response before the handler finishes.
- Handlers are registered in order: `registerWebinarCommand`, `registerBpActions`, `registerEmployeeActions`, `registerGrowthActions`.
- The app instance is cached as a **singleton** via `getSlackApp()`.

### Route Handler (`src/app/api/slack/events/route.ts`)

All Slack traffic flows through this single `POST` handler:

1. **Signature verification** — HMAC-SHA256 using `SLACK_SIGNING_SECRET` with 5-minute timestamp window
2. **Body parsing** — JSON or `x-www-form-urlencoded` (interactive payloads have `payload` field)
3. **Early exits** — `ssl_check` → 200, `url_verification` → challenge, **retries skipped** (`x-slack-retry-num` → 200)
4. **Bolt dispatch** — `app.processEvent()` with a custom `ack` callback that captures the response
5. **Fast response** — `Promise.race` between `ack` resolving and an 8-second timeout
6. **Deferred processing** — `after()` from `next/server` keeps the serverless function alive to complete remaining work (DB writes, Slack API calls) after the HTTP response is sent

```
Slack POST ──▶ verify sig ──▶ parse body ──▶ processEvent
                                                  │
                                            ack() fires
                                                  │
                                         ◀── HTTP 200 returned
                                                  │
                                        after() continues processing
                                        (DB writes, chat.postMessage)
```

---

## 8. Slash Commands

### `/webinar` (`src/slack/commands/webinar.ts`)

1. Opens a **modal** with inputs: Topic, Trainer name, Date, Time (UTC), Estimated attendees
2. On submission (`webinar_submit` view callback):
   - Inserts row into `webinar_requests` with state `RAISED`
   - Transitions to `PENDING_APPROVAL`
   - Posts a `bpRequestCard` (with Confirm/Reject/Suggest alt buttons) to `BP_CHANNEL_ID`
   - Stores `bp_channel_id` and `bp_message_ts` on the request row
   - DMs the requesting employee a confirmation

---

## 9. Action Handlers

### BP Actions (`src/slack/actions/bpActions.ts`)

| Action | Trigger | Effect |
|--------|---------|--------|
| `bp_confirm` | "Confirm" button | → CONFIRMED; updates BP card to confirmed notice; DMs employee; seeds Growth checklist |
| `bp_reject` | "Reject" button | Opens rejection reason modal |
| `bp_reject_modal` | Modal submit | → REJECTED; updates BP card; DMs employee with reason |
| `bp_suggest_alt` | "Suggest alternative" button | Opens date/time picker modal |
| `bp_alt_modal` | Modal submit | → ALT_SUGGESTED; updates BP card; DMs employee with accept/decline buttons |

### Employee Actions (`src/slack/actions/employeeActions.ts`)

| Action | Trigger | Effect |
|--------|---------|--------|
| `employee_accept_alt` | "Accept new date" button | → CONFIRMED (with `requested_date` updated); updates BP card; seeds Growth checklist |
| `employee_decline_alt` | "Decline" button | → CANCELLED; updates BP card |

### Growth Actions (`src/slack/actions/growthActions.ts`)

| Action | Trigger | Effect |
|--------|---------|--------|
| `/^growth_toggle_checklist_/` (regex) | Checklist toggle button | Flips `completed` on `content_checklist` row; updates message in-place |
| `growth_mark_complete` | "Mark complete" button | Validates all items done; → COMPLETED; posts to OPS channel; replaces checklist with summary |

---

## 10. Growth Checklist Flow

When a request reaches `CONFIRMED` (via BP confirm or employee accepting alt date), `seedChecklistAndPostToGrowthChannel()` in `growthChecklistFlow.ts` runs:

```
CONFIRMED
    │
    ├─ 1. Check if checklist rows exist for this request
    │     └─ If not, insert 4 rows: headshot, bio, deck, promo_assets
    │
    ├─ 2. transitionState → IN_PROGRESS
    │
    ├─ 3. buildChecklistMessage (queries DB for request + checklist items)
    │     └─ Returns { text, blocks } for growthChecklistBlocks
    │
    └─ 4. client.chat.postMessage to GROWTH_CHANNEL_ID
          └─ Stores growth_channel_id + growth_message_ts on the request
```

The checklist card in the Growth channel is **interactive** — any team member can toggle items. Each toggle calls `chat.update` to refresh the message in-place with updated checkboxes and a "Last updated by @user" footer.

### Checklist Items

| Key | Label |
|-----|-------|
| `headshot` | Headshot |
| `bio` | Bio |
| `deck` | Deck |
| `promo_assets` | Promo assets |

---

## 11. Block Kit Components

All Block Kit builders live in `src/slack/blockKit.ts`:

| Function | Used By | Description |
|----------|---------|-------------|
| `bpRequestCard()` | `/webinar` submit | Card with request details + Confirm/Reject/Alt buttons |
| `growthChecklistBlocks()` | Growth channel post & update | Interactive checklist with toggle buttons per item |
| `growthChecklistCompletedBlocks()` | `growth_mark_complete` | Summary card replacing checklist after completion |
| `confirmedNotice()` | `bp_confirm` | Replaces BP card after confirmation |
| `rejectedNotice()` | `bp_reject_modal` | Replaces BP card after rejection |
| `altSuggestedNotice()` | `bp_alt_modal` | Replaces BP card after alt suggestion |
| `employeeAltDecisionBlocks()` | `bp_alt_modal` | Accept/Decline buttons sent in employee DM |
| `formatWhen()` | Several | Formats ISO date with `toUTCString()` for consistency |

**Important:** Each button in an `actions` block must have a **unique `action_id`**. The checklist toggle buttons use `growth_toggle_checklist_{item_key}` (e.g. `growth_toggle_checklist_headshot`), matched by a regex handler.

---

## 12. Database Layer

### Supabase Client (`src/lib/supabase.ts`)

`getSupabaseAdmin()` returns a singleton Supabase client using the **service role key** (bypasses RLS). Used for all DB operations.

### State Machine (`src/lib/stateMachine.ts`)

`transitionState()` calls the Supabase RPC function `transition_state` which atomically:
1. Validates the current state allows the requested transition
2. Updates the `state` column (and any `columnUpdates`)
3. Inserts an `audit_log` entry
4. Returns the new state or raises an error

Parameters:
```typescript
transitionState({
  requestId: string,
  toState: WebinarState,
  actorId: string,
  actorName: string,
  action: string,
  metadata?: Record<string, unknown>,
  columnUpdates?: Record<string, unknown>,
})
```

Throws `InvalidTransitionError` if the transition is not allowed by `VALID_TRANSITIONS` (defined in `src/lib/types.ts`).

### Tables

See `docs/database-schema.md` for full DDL, column reference, and indexes. Summary:

- **`webinar_requests`** — Core table; one row per request with state, Slack message refs, and actor IDs
- **`audit_log`** — Append-only log of every state transition and system event; used for SLA tracking
- **`content_checklist`** — Four rows per request (seeded on CONFIRMED); tracks Growth team progress

### Required RPC Functions (not in migration file)

These must exist in the database for the app to function:

| Function | Called By | Purpose |
|----------|-----------|---------|
| `transition_state` | `stateMachine.ts` | Atomic state transition + audit log insert |
| `get_pending_reminders` | Daily cron | Returns requests needing 24h reminder DMs |
| `get_bp_sla_breaches` | Daily cron | Returns requests breaching BP review SLA |
| `get_content_sla_breaches` | Daily cron | Returns requests breaching Growth content SLA |

---

## 13. Cron Jobs

Cron routes are protected by `CRON_SECRET` (Bearer token auth via `src/lib/cronAuth.ts`). Schedules are defined in `vercel.json`.

### Daily (`GET /api/cron/daily`) — runs at 04:00 UTC

1. **Pending reminders** — DMs employees whose requests have been in `PENDING_APPROVAL` for 24h+
2. **BP SLA breaches** — Posts to OPS channel about requests exceeding BP review SLA
3. **Content SLA breaches** — Posts to OPS channel + DMs Growth assignee about content delays

Each action is deduplicated via `audit_log` entries (`cron_reminder_24h`, `sla_bp_breach`, `sla_content_breach`).

### Weekly Summary (`GET /api/cron/weekly-summary`) — runs Monday 09:00 UTC

Posts a summary to OPS channel with last 7 days stats: requests created, completed, rejected, open, and SLA alert count.

### Cron Slack Client

Cron jobs use `getSlackWeb()` from `src/lib/slackWeb.ts` — a standalone `WebClient` instance (not the Bolt app), since crons don't handle interactive events.

---

## 14. Dashboard (Web UI)

### Server Component (`src/app/page.tsx`)

Calls `loadDashboardPayload()` which queries:
- All `webinar_requests` (id, topic, trainer, date, attendees, state, employee info, timestamps)
- SLA-related `audit_log` entries

Renders `<DashboardShell>` as a client component with the data payload.

### Dashboard Tabs

| Tab | Components | Content |
|-----|-----------|---------|
| **Overview** | `MetricCard`, `StatePieChart`, `VolumeBarChart` | KPIs (total, active, completed, rejected), state distribution pie, monthly volume |
| **All Requests** | `RequestsTable`, `StatusBadge` | Filterable table by state and trainer |
| **Trainers** | `TrainersChart` | Request count by trainer |
| **SLA & Alerts** | `SlaLineChart` | SLA breach timeline |

### Styling

Tailwind CSS 4 with Geist Sans / Geist Mono fonts. Dark zinc background, card-based layout.

### Dates

All dates use `toUTCString()` (not `toLocaleString()`) to avoid hydration mismatches between server and client renders.

---

## 15. Deployment (Vercel)

### Steps

1. Connect the GitHub repo to a Vercel project
2. Set all environment variables from Section 4
3. Vercel auto-deploys on push to `main`

### `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/daily",          "schedule": "0 4 * * *"   },
    { "path": "/api/cron/weekly-summary",  "schedule": "0 9 * * 1"  }
  ]
}
```

### Serverless Considerations

- **Function timeout:** Hobby plan has a 10-second limit. The `after()` mechanism extends function lifetime past the HTTP response to handle slow Slack API calls.
- **Cold starts:** First request after idle may be slow. The Bolt app is cached as a singleton to mitigate.
- **Retry handling:** The route handler returns 200 immediately for any request with `x-slack-retry-num` header to prevent duplicate processing.

---

## 16. Slack App Configuration

### Required Bot Token Scopes

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post and update messages in channels and DMs |
| `commands` | Register slash commands |
| `users:read` | Look up user display names |
| `im:write` | Open DM conversations with users |
| `im:read` | Read DM channel metadata for reliable delivery |
| `files:read` | Access file metadata when users share assets |
| `files:write` | Upload files (future: Growth team asset management) |

### Manifest (`slack-manifest.yml`)

- **Slash command:** `/webinar` pointing to `https://internal-slack-bot-pi.vercel.app/api/slack/events`
- **Interactivity:** Enabled, same request URL
- **App Home:** Home tab enabled, messages tab enabled
- **Bot events:** None (no passive event subscriptions needed)

See `docs/admin-approval.md` for a full breakdown of each scope with justification, intended for workspace admin review.

### Channel Setup

1. Create three Slack channels for BP, Growth, and Ops
2. Invite the bot to all three
3. Copy each channel ID into the environment variables

---

## 17. Troubleshooting

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Slack says "dispatch_failed" | Signing secret mismatch or function timeout | Verify `SLACK_SIGNING_SECRET`; check Vercel function logs |
| Buttons don't work | Interactivity request URL misconfigured | Must point to `/api/slack/events` |
| Growth checklist not appearing | `invalid_blocks` — duplicate `action_id` in blocks | Each button in an `actions` block needs a unique `action_id` |
| Duplicate messages | Slack retrying due to slow response | Retry skip is in place; check for multiple button clicks |
| DM not delivered | Missing `conversations.open` before `postMessage`, or `messages_tab_disabled` | All DMs must use `conversations.open` first; enable "Messages Tab" in Slack app settings |
| Hydration mismatch | Locale-dependent date formatting | Use `toUTCString()` instead of `toLocaleString()` |
| State transition fails | Request not in expected state | Check `audit_log` for current state; may have been processed already |
| Cron not running | Missing `CRON_SECRET` or wrong Vercel config | Verify env var matches and `vercel.json` cron paths are correct |

### Debugging with audit_log

The `audit_log` table records every state transition and can hold diagnostic entries. To trace a request:

```sql
SELECT action, from_state, to_state, actor_name, metadata, created_at
FROM audit_log
WHERE request_id = '<uuid>'
ORDER BY created_at;
```

---

## 18. Key Design Decisions

### Single Route Handler

All Slack traffic (commands, actions, modals, events) goes through one endpoint. This simplifies Slack app configuration and Vercel routing.

### Noop Bolt Receiver

Bolt normally binds to a port. Since Next.js handles HTTP, a custom noop receiver is used and `processEvent` is called directly.

### Deferred Processing with `after()`

Slack requires a response within ~3 seconds. Heavy work (DB writes, Slack API calls) is deferred using Next.js `after()` which extends the serverless function lifetime via Vercel's `waitUntil`.

### Supabase RPC for State Transitions

State changes go through a database-side `transition_state` function for atomicity — the state check, update, and audit log insert happen in a single transaction.

### Team-Scoped Checklist (No Ownership)

The Growth checklist in the channel is collaborative — any team member can toggle items or mark completion. There's no single "owner" per request.

### In-Place Message Updates

Instead of posting new messages for each change, the Growth checklist card is updated in-place via `chat.update`, keeping the channel clean.

### DM Pattern: Always `conversations.open` First

Every DM in the codebase follows the same pattern:

```typescript
const dm = await client.conversations.open({ users: targetUserId });
if (dm.channel?.id) {
  await client.chat.postMessage({ channel: dm.channel.id, text: "..." });
}
```

Posting directly to a user ID (`channel: userId`) fails silently if the bot has never DMed that user before. `conversations.open` creates the DM channel first, ensuring reliable delivery. This applies to all 8 DM paths: employee confirmations, BP notifications, cron reminders, and SLA alerts.
