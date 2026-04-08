import { getPool } from "@/lib/db";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSlackWeb } from "@/lib/slackWeb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const opsChannel = process.env.OPS_CHANNEL_ID;
  if (!opsChannel) {
    return new Response("OPS_CHANNEL_ID missing", { status: 500 });
  }

  const pool = getPool();
  const slack = getSlackWeb();

  const bpBreaches = await pool.query<{
    id: string;
    topic: string;
    updated_at: Date;
  }>(
    `
    SELECT w.id, w.topic, w.updated_at
    FROM webinar_requests w
    WHERE w.state = 'PENDING_APPROVAL'
      AND w.updated_at < NOW() - INTERVAL '6 hours'
      AND NOT EXISTS (
        SELECT 1 FROM audit_log a
        WHERE a.request_id = w.id AND a.action = 'sla_bp_breach'
      )
    `
  );

  for (const row of bpBreaches.rows) {
    await slack.chat.postMessage({
      channel: opsChannel,
      text: `SLA: BP review pending >6h for *${row.topic}* (\`${row.id}\`).`,
    });
    await pool.query(
      `INSERT INTO audit_log (request_id, actor_id, actor_name, from_state, to_state, action, metadata)
       VALUES ($1, 'cron', 'Vercel Cron', 'PENDING_APPROVAL', 'PENDING_APPROVAL', 'sla_bp_breach', '{}'::jsonb)`,
      [row.id]
    );
  }

  const contentBreaches = await pool.query<{
    id: string;
    topic: string;
    growth_slack_id: string | null;
    requested_date: Date;
  }>(
    `
    SELECT w.id, w.topic, w.growth_slack_id, w.requested_date
    FROM webinar_requests w
    WHERE w.state = 'IN_PROGRESS'
      AND w.requested_date < NOW() + INTERVAL '48 hours'
      AND EXISTS (
        SELECT 1 FROM content_checklist c
        WHERE c.request_id = w.id AND c.completed = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM audit_log a
        WHERE a.request_id = w.id AND a.action = 'sla_content_breach'
      )
    `
  );

  for (const row of contentBreaches.rows) {
    await slack.chat.postMessage({
      channel: opsChannel,
      text: `SLA: Content incomplete for *${row.topic}* (\`${row.id}\`) — webinar in <48h.`,
    });
    if (row.growth_slack_id) {
      await slack.chat.postMessage({
        channel: row.growth_slack_id,
        text: `Heads up: *${row.topic}* is less than 48 hours away and the content checklist is incomplete.`,
      });
    }
    await pool.query(
      `INSERT INTO audit_log (request_id, actor_id, actor_name, from_state, to_state, action, metadata)
       VALUES ($1, 'cron', 'Vercel Cron', 'IN_PROGRESS', 'IN_PROGRESS', 'sla_content_breach', '{}'::jsonb)`,
      [row.id]
    );
  }

  return Response.json({
    ok: true,
    bpBreaches: bpBreaches.rows.length,
    contentBreaches: contentBreaches.rows.length,
  });
}
