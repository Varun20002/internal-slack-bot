import type { App } from "@slack/bolt";
import { getBlockButtonValue } from "@/slack/actionValue";
import type { ActionsBlockElement, KnownBlock } from "@slack/types";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionState } from "@/lib/stateMachine";
import { formatWhen } from "@/slack/blockKit";

const CHECKLIST_ITEMS = ["headshot", "bio", "deck", "promo_assets"] as const;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

async function buildGrowthHomeBlocks(
  userId: string
): Promise<KnownBlock[]> {
  const supabase = getSupabaseAdmin();
  const { data: sessions } = await supabase
    .from("webinar_requests")
    .select(
      `
      id,
      topic,
      trainer_name,
      requested_date,
      content_checklist ( item, completed )
    `
    )
    .eq("growth_slack_id", userId)
    .eq("state", "IN_PROGRESS");

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Your webinar sessions", emoji: true },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Toggle checklist items when assets are ready, then mark the session complete.",
        },
      ],
    },
  ];

  if (!sessions?.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "_No sessions in progress assigned to you._",
      },
    });
    return blocks;
  }

  for (const s of sessions) {
    const cl = (s.content_checklist || []) as {
      item: string;
      completed: boolean;
    }[];
    const byItem = Object.fromEntries(cl.map((r) => [r.item, r.completed]));

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${s.topic}*\nTrainer: ${s.trainer_name}\nWhen: ${formatWhen(s.requested_date)}`,
      },
    });

    const elements: ActionsBlockElement[] = [];

    for (const item of CHECKLIST_ITEMS) {
      const done = !!byItem[item];
      elements.push({
        type: "button",
        text: {
          type: "plain_text",
          text: `${done ? "✅" : "⬜"} ${item}`,
        },
        action_id: "growth_toggle_checklist",
        value: `${s.id}|${item}`,
      });
    }

    const allDone = CHECKLIST_ITEMS.every((i) => byItem[i]);
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Mark session complete" },
      ...(allDone ? { style: "primary" as const } : {}),
      action_id: "growth_mark_complete",
      value: s.id,
    });

    blocks.push({
      type: "actions",
      block_id: `growth_home_${s.id}`,
      elements,
    });
  }

  return blocks;
}

export function registerGrowthActions(app: App): void {
  app.event("app_home_opened", async ({ event, client, logger }) => {
    if (event.tab !== "home") return;
    const userId = event.user;
    try {
      const blocks = await buildGrowthHomeBlocks(userId);
      await client.views.publish({
        user_id: userId,
        view: {
          type: "home",
          blocks,
        },
      });
    } catch (e) {
      logger.error("app_home_opened failed", e);
    }
  });

  app.action("growth_pickup", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    const userId = body.user.id;
    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "IN_PROGRESS",
        actorId: userId,
        actorName,
        action: "growth_pickup",
        columnUpdates: { growth_slack_id: userId },
      });

      const supabaseForChecklist = getSupabaseAdmin();
      await supabaseForChecklist.rpc("seed_checklist", {
        p_request_id: requestId,
        p_items: [...CHECKLIST_ITEMS],
      });
    } catch (e) {
      logger.error("growth_pickup failed", e);
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("webinar_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (row?.growth_channel_id && row.growth_message_ts) {
      await client.chat.update({
        channel: row.growth_channel_id,
        ts: row.growth_message_ts,
        text: `Picked up: ${row.topic}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📌 *Picked up* by <@${userId}>\n*${row.topic}* — checklist sent via DM / App Home.`,
            },
          },
        ],
      });
    }

    await client.chat.postMessage({
      channel: userId,
      text: `You picked up *${row?.topic}*. Open the app's *Home* tab to manage the content checklist.`,
    });

    try {
      const blocks = await buildGrowthHomeBlocks(userId);
      await client.views.publish({
        user_id: userId,
        view: { type: "home", blocks },
      });
    } catch (e) {
      logger.error("refresh home after pickup failed", e);
    }
  });

  app.action("growth_toggle_checklist", async ({ ack, body, client, logger }) => {
    await ack();
    const raw = getBlockButtonValue(body);
    if (!raw) return;
    const [requestId, item] = raw.split("|");
    if (!requestId || !item) return;
    const userId = body.user.id;

    const supabase = getSupabaseAdmin();
    const { data: req } = await supabase
      .from("webinar_requests")
      .select("growth_slack_id, state")
      .eq("id", requestId)
      .single();

    if (req?.growth_slack_id !== userId || req.state !== "IN_PROGRESS") {
      return;
    }

    const { data: row } = await supabase
      .from("content_checklist")
      .select("id, completed")
      .eq("request_id", requestId)
      .eq("item", item)
      .maybeSingle();

    if (!row?.id) return;

    await supabase
      .from("content_checklist")
      .update({
        completed: !row.completed,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    try {
      const blocks = await buildGrowthHomeBlocks(userId);
      await client.views.publish({
        user_id: userId,
        view: { type: "home", blocks },
      });
    } catch (e) {
      logger.error("refresh home after toggle failed", e);
    }
  });

  app.action("growth_mark_complete", async ({ ack, body, client, logger }) => {
    await ack();
    const requestId = getBlockButtonValue(body);
    if (!requestId) return;
    const userId = body.user.id;

    const supabase = getSupabaseAdmin();
    const { data: req } = await supabase
      .from("webinar_requests")
      .select("growth_slack_id, state, topic")
      .eq("id", requestId)
      .single();

    if (req?.growth_slack_id !== userId || req.state !== "IN_PROGRESS") {
      return;
    }

    const { data: items } = await supabase
      .from("content_checklist")
      .select("item, completed")
      .eq("request_id", requestId);

    const incomplete = (items || []).filter((i) => !i.completed);
    if (incomplete.length > 0) {
      await client.chat.postMessage({
        channel: userId,
        text: `Complete all checklist items first (${incomplete.map((i) => i.item).join(", ")} remaining).`,
      });
      return;
    }

    const userInfo = await client.users.info({ user: userId });
    const actorName =
      userInfo.user?.real_name || userInfo.user?.name || userId;

    try {
      await transitionState({
        requestId,
        toState: "COMPLETED",
        actorId: userId,
        actorName,
        action: "growth_mark_complete",
      });
    } catch (e) {
      logger.error("growth_mark_complete transition failed", e);
      return;
    }

    const ops = requireEnv("OPS_CHANNEL_ID");
    await client.chat.postMessage({
      channel: ops,
      text: `Webinar session completed: ${req.topic}`,
    });

    await client.chat.postMessage({
      channel: userId,
      text: `*${req.topic}* is marked *COMPLETED*. Thank you!`,
    });

    try {
      const blocks = await buildGrowthHomeBlocks(userId);
      await client.views.publish({
        user_id: userId,
        view: { type: "home", blocks },
      });
    } catch (e) {
      logger.error("refresh home after complete failed", e);
    }
  });
}
