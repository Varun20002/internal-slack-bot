# CoinDCX Webinar Ops System

Internal Slack app + dashboard for the webinar request lifecycle (Employee → BP → Growth), backed by Supabase Postgres with atomic state transitions.

## Stack

- **Next.js 16** (App Router) — UI + API routes
- **Slack Bolt** — command/action handlers via a custom noop receiver bridged to `/api/slack/events`
- **Supabase** — Postgres database; `@supabase/supabase-js` for all DB access; `transition_state` RPC for atomic state changes
- **Vercel** — serverless hosting + cron jobs
- **Recharts + Tailwind CSS** — analytics dashboard

## Quick Start

```bash
cp .env.example .env.local   # fill in all values
npm install
npm run dev
```

Expose your local server with [ngrok](https://ngrok.com) and set the Slack app's Request URL to `https://<ngrok-url>/api/slack/events`.

## Slack App Setup

1. Create a Slack app with **socket mode off**
2. Enable **Interactivity** — Request URL: `https://<domain>/api/slack/events`
3. Add slash command **`/webinar`** — same Request URL
4. Enable **Messages Tab** under App Home
5. Bot token scopes: `chat:write`, `commands`, `users:read`, `im:write`, `im:read`, `files:read`, `files:write`
6. Install the app and invite the bot to `BP_CHANNEL_ID`, `GROWTH_CHANNEL_ID`, and `OPS_CHANNEL_ID`

## Project Layout

```
src/app/api/slack/events/   Single Slack entrypoint (signature verify → Bolt dispatch)
src/app/api/cron/           Daily SLA checks + weekly summary (secured with CRON_SECRET)
src/slack/commands/         /webinar slash command + modal submission
src/slack/actions/          BP, Employee, and Growth action handlers
src/slack/blockKit.ts       All Block Kit card builders
src/lib/stateMachine.ts     Atomic state transitions via Supabase RPC
src/lib/supabase.ts         Supabase admin client singleton
src/components/             Dashboard React components + charts
docs/                       Database schema and developer guide
```

## Documentation

- **[Developer Guide](docs/developer-guide.md)** — architecture, flows, handlers, deployment, and troubleshooting
- **[Database Schema](docs/database-schema.md)** — full SQL, table reference, state machine diagram
- **[Admin Approval](docs/admin-approval.md)** — scope justifications and data handling for workspace admin review

## License

Private / internal use.
