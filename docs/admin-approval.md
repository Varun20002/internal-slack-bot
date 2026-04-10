# Webinar Ops Bot — Workspace Admin Review

This document describes the Webinar Ops Bot, the permissions it requests, and how it handles data. It is intended for the Slack workspace administrator who needs to approve the app installation.

---

## What is this bot?

Webinar Ops Bot is an internal tool that manages the lifecycle of webinar requests at CoinDCX. It automates the handoff between three teams:

1. **Employees** submit webinar requests via the `/webinar` slash command.
2. **BP (Business Partners)** review requests in a dedicated BP channel and approve, reject, or suggest alternative dates.
3. **Growth team** manages a content checklist (headshot, bio, deck, promo assets) in a dedicated Growth channel.

The bot replaces manual coordination over email/chat with a structured, auditable workflow.

---

## Permissions Requested

The bot requests **7 OAuth scopes**. Each is listed below with its justification and what it allows/does not allow.

| Scope | Why it is needed | What it can do | What it CANNOT do |
|-------|-----------------|----------------|-------------------|
| `commands` | Register the `/webinar` slash command that employees use to submit requests | Respond to the `/webinar` command | Cannot register commands the admin has not approved |
| `chat:write` | Post and update messages in channels the bot is invited to, and send DMs | Post request cards, checklist cards, status updates, SLA alerts | Cannot post to channels the bot has not been invited to |
| `im:write` | Open direct message conversations with users | Send confirmation DMs to employees, reminders, and SLA notifications | Cannot read or search existing DM history |
| `im:read` | Read DM channel metadata (e.g. whether a DM channel is open) | Reliably verify DM delivery and ensure conversations are open before posting | Cannot read message content in DMs it did not send |
| `users:read` | Look up basic user profile information | Resolve Slack user IDs to display names for audit logs and message text | Cannot read email addresses, phone numbers, or modify profiles |
| `files:read` | Access metadata of files shared in channels the bot is in | Read file URLs when Growth team members share content assets (headshots, decks, etc.) | Cannot access files in channels the bot is not a member of |
| `files:write` | Upload files on behalf of the bot | Upload processed assets or receipts to the Growth channel (future feature) | Cannot delete or modify files uploaded by other users |

### Scopes the bot does NOT request

The bot intentionally avoids broad or sensitive scopes:

- No `channels:history` or `im:history` — cannot read message history
- No `channels:read` — cannot list or discover private channels
- No `users:read.email` — cannot access email addresses
- No `admin.*` — no workspace administration capabilities
- No `groups:*` — no access to private channels
- No `usergroups:*` — cannot manage user groups

---

## Channels Required

The bot must be **invited** to exactly 3 channels after installation:

| Channel purpose | Env variable | Who uses it |
|----------------|-------------|-------------|
| BP review channel | `BP_CHANNEL_ID` | BP team reviews and approves/rejects requests here |
| Growth team channel | `GROWTH_CHANNEL_ID` | Growth team manages content checklists here |
| Ops / alerts channel | `OPS_CHANNEL_ID` | SLA breach alerts and weekly summaries are posted here |

The bot **cannot** read or post to any channel it has not been invited to.

---

## Slash Command

| Command | Description |
|---------|-------------|
| `/webinar` | Opens a form for employees to submit a webinar request |

This is the only slash command the bot registers.

---

## How the bot interacts with users

| Interaction | Who | Where |
|-------------|-----|-------|
| Slash command `/webinar` | Any employee | Any channel or DM |
| Confirmation DM after submission | Requesting employee | Direct message |
| Request review card (Confirm / Reject / Suggest alt) | BP team members | BP channel |
| Rejection reason modal | BP member who clicked Reject | Modal popup |
| Alternative date modal | BP member who clicked Suggest alternative | Modal popup |
| Accept/Decline buttons for alt date | Requesting employee | Direct message |
| Interactive content checklist | Growth team members | Growth channel |
| SLA breach alerts | Automated (daily cron) | Ops channel |
| 24-hour webinar reminders | Automated (daily cron) | Direct message to employee |
| Weekly summary | Automated (weekly cron) | Ops channel |

---

## Data Handling

### What data is stored

The bot stores the following in a **Supabase Postgres database** (hosted on Supabase's infrastructure):

- **Webinar request details**: topic, trainer name, requested date, estimated attendees
- **Slack user IDs**: of the requesting employee, BP reviewer, and Growth team member (used to tag users in messages)
- **Display names**: of actors for audit trail readability
- **State transitions**: an append-only audit log recording every action (who did what, when)
- **Checklist status**: which content items are completed and by whom
- **Slack message references**: channel ID + message timestamp, used to update messages in-place

### What data is NOT stored

- No message content from channels or DMs
- No file contents (only URLs if Growth team links assets in the future)
- No email addresses, phone numbers, or sensitive profile data
- No authentication tokens or passwords
- No data from channels the bot is not invited to

### Data access

- The database is accessed via Supabase's service role key (server-side only, never exposed to browsers)
- The dashboard (web UI) shows request status and metrics — it reads from the same database
- No data is shared with third parties

---

## Technical Details

| Property | Value |
|----------|-------|
| **Hosting** | Vercel (serverless) |
| **Request URL** | `https://internal-slack-bot-pi.vercel.app/api/slack/events` |
| **Database** | Supabase Postgres |
| **Socket mode** | Disabled (HTTP-based) |
| **Event subscriptions** | None (no passive listening to channel messages) |
| **Cron jobs** | Daily at 04:00 UTC (SLA checks), Monday 09:00 UTC (weekly summary) |

### Request verification

Every incoming request from Slack is verified using HMAC-SHA256 signature verification with the app's signing secret. Requests with invalid signatures or timestamps older than 5 minutes are rejected.

---

## Bot identity

| Property | Value |
|----------|-------|
| **App name** | Webinar Ops Bot |
| **Bot display name** | Webinar Ops |
| **Always online** | Yes |
| **App Home** | Enabled (home tab + messages tab) |

---

## Summary for approval

- The bot automates webinar request coordination between Employees, BP, and Growth teams
- It requests 7 scopes, all with specific justifications — no broad or admin-level permissions
- It only operates in 3 designated channels + direct messages to involved employees
- It does not read message history, access private channels, or collect sensitive user data
- All data is stored in a secured Supabase database; no third-party data sharing
- The bot's server-side code runs on Vercel with request signature verification

---

## Contact

| Role | Name |
|------|------|
| Bot developer / owner | Varun R |
