# CoinDCX Webinar Ops System

Internal Slack app + dashboard for webinar request lifecycle (Employee → BP → Growth), backed by Supabase Postgres with atomic state transitions.

## Stack

- **Next.js** (App Router) — UI + API routes
- **Slack Bolt** — `AwsLambdaReceiver` bridged to `/api/slack/events`
- **Supabase** — Postgres; `@supabase/supabase-js` for reads/dashboard; `pg` + transactions for the state machine
- **Vercel** — hosting + Cron

## Setup

1. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

2. Create a Slack app (socket mode off). Enable **Interactivity**, **Slash Commands** (`/webinar`), **Event Subscriptions** (`app_home_opened`), **App Home** tab.

   - Request URL / Interactivity: `https://<your-deployment>/api/slack/events`
   - Bot token scopes (minimum): `app_mentions:read`, `channels:history`, `chat:write`, `commands`, `users:read`, `users:read.email` (optional), `im:write`, `im:history` (optional)
   - Event subscription: subscribe to `app_home_opened`
   - Install the app to your workspace and invite the bot to `BP_CHANNEL_ID`, `GROWTH_CHANNEL_ID`, and `OPS_CHANNEL_ID`

3. Run SQL in Supabase SQL editor from [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).

4. Set `DATABASE_URL` to the Postgres connection string (pooler or direct) Supabase provides — same DB the service role uses.

5. Install and run locally:

   ```bash
   npm install
   npm run dev
   ```

6. Deploy to Vercel. Add all env vars. Set **Cron** secret: generate a random `CRON_SECRET` and add the same value in Vercel project env (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`).

## Project layout

- `src/app/api/slack/events` — Slack entrypoint
- `src/app/api/cron/*` — scheduled jobs (secured with `CRON_SECRET`)
- `src/lib/stateMachine.ts` — atomic state + audit log (via `pg`)
- `src/slack/*` — commands, Block Kit actions, App Home

## License

Private / internal use.
