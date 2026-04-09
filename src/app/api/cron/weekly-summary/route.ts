import { getSupabaseAdmin } from "@/lib/supabase";
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

  const supabase = getSupabaseAdmin();
  const slack = getSlackWeb();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: requests } = await supabase
    .from("webinar_requests")
    .select("state")
    .gte("created_at", weekAgo);

  const all = requests ?? [];
  const s = {
    total: String(all.length),
    confirmed: String(all.filter((r) => r.state === "CONFIRMED").length),
    rejected: String(all.filter((r) => r.state === "REJECTED").length),
    completed: String(all.filter((r) => r.state === "COMPLETED").length),
  };

  const { count: slaCount } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .in("action", ["sla_bp_breach", "sla_content_breach"])
    .gte("created_at", weekAgo);

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
            text: `*SLA alerts fired*\n${slaCount ?? 0}`,
          },
        ],
      },
    ],
  });

  return Response.json({ ok: true });
}
