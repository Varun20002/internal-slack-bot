import { getPool } from "@/lib/db";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSlackWeb } from "@/lib/slackWeb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const pool = getPool();
  const slack = getSlackWeb();

  const { rows } = await pool.query<{
    id: string;
    topic: string;
    employee_slack_id: string;
  }>(
    `
    SELECT w.id, w.topic, w.employee_slack_id
    FROM webinar_requests w
    WHERE w.state = 'CONFIRMED'
      AND w.requested_date >= NOW() + INTERVAL '23 hours'
      AND w.requested_date <= NOW() + INTERVAL '25 hours'
      AND NOT EXISTS (
        SELECT 1 FROM audit_log a
        WHERE a.request_id = w.id AND a.action = 'cron_reminder_24h'
      )
    `
  );

  for (const row of rows) {
    try {
      await slack.chat.postMessage({
        channel: row.employee_slack_id,
        text: `Reminder: your confirmed webinar *${row.topic}* is scheduled in about 24 hours.`,
      });
      await pool.query(
        `INSERT INTO audit_log (request_id, actor_id, actor_name, from_state, to_state, action, metadata)
         VALUES ($1, 'cron', 'Vercel Cron', 'CONFIRMED', 'CONFIRMED', 'cron_reminder_24h', '{}'::jsonb)`,
        [row.id]
      );
    } catch (e) {
      console.error("reminder failed", row.id, e);
    }
  }

  return Response.json({ ok: true, reminded: rows.length });
}
