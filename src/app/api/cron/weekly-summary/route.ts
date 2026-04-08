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

  const { rows: summary } = await pool.query<{
    total: string;
    confirmed: string;
    rejected: string;
    completed: string;
  }>(
    `
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE state = 'CONFIRMED')::text AS confirmed,
      COUNT(*) FILTER (WHERE state = 'REJECTED')::text AS rejected,
      COUNT(*) FILTER (WHERE state = 'COMPLETED')::text AS completed
    FROM webinar_requests
    WHERE created_at >= NOW() - INTERVAL '7 days'
    `
  );

  const { rows: sla } = await pool.query<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n FROM audit_log
    WHERE action IN ('sla_bp_breach', 'sla_content_breach')
      AND created_at >= NOW() - INTERVAL '7 days'
    `
  );

  const s = summary[0] || {
    total: "0",
    confirmed: "0",
    rejected: "0",
    completed: "0",
  };

  await slack.chat.postMessage({
    channel: opsChannel,
    text: "Weekly webinar ops summary (last 7 days)",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Webinar ops — weekly summary", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*New requests*\n${s.total}` },
          { type: "mrkdwn", text: `*Confirmed*\n${s.confirmed}` },
          { type: "mrkdwn", text: `*Rejected*\n${s.rejected}` },
          { type: "mrkdwn", text: `*Completed*\n${s.completed}` },
          {
            type: "mrkdwn",
            text: `*SLA alerts fired*\n${sla[0]?.n ?? "0"}`,
          },
        ],
      },
    ],
  });

  return Response.json({ ok: true });
}
