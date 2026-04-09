import type { ActionsBlockElement, KnownBlock } from "@slack/types";

export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toUTCString();
  } catch {
    return iso;
  }
}

export function bpRequestCard(params: {
  requestId: string;
  topic: string;
  trainerName: string;
  requestedDate: string;
  attendees: number;
  employeeName: string;
}): KnownBlock[] {
  const {
    requestId,
    topic,
    trainerName,
    requestedDate,
    attendees,
    employeeName,
  } = params;
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "New webinar request", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Topic*\n${topic}` },
        { type: "mrkdwn", text: `*Trainer*\n${trainerName}` },
        {
          type: "mrkdwn",
          text: `*Preferred time*\n${formatWhen(requestedDate)}`,
        },
        { type: "mrkdwn", text: `*Est. attendees*\n${attendees}` },
        { type: "mrkdwn", text: `*Requested by*\n${employeeName}` },
        { type: "mrkdwn", text: `*Request ID*\n\`${requestId}\`` },
      ],
    },
    {
      type: "actions",
      block_id: `bp_actions_${requestId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Confirm" },
          style: "primary",
          action_id: "bp_confirm",
          value: requestId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          action_id: "bp_reject",
          value: requestId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Suggest alternative" },
          action_id: "bp_suggest_alt",
          value: requestId,
        },
      ],
    },
  ];
}

/** Canonical Growth content checklist keys (order matters for UI). */
export const GROWTH_CHECKLIST_ITEM_KEYS = [
  "headshot",
  "bio",
  "deck",
  "promo_assets",
] as const;

export type GrowthChecklistItemKey = (typeof GROWTH_CHECKLIST_ITEM_KEYS)[number];

const CHECKLIST_ITEM_LABEL: Record<GrowthChecklistItemKey, string> = {
  headshot: "Headshot",
  bio: "Bio",
  deck: "Deck",
  promo_assets: "Promo assets",
};

export type GrowthChecklistItemState = {
  item: string;
  completed: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

/**
 * Interactive checklist for the Growth channel. `block_id` embeds `requestId`
 * so handlers can route actions.
 */
export function growthChecklistBlocks(params: {
  requestId: string;
  topic: string;
  trainerName: string;
  requestedDate: string;
  attendeesEst: number;
  items: GrowthChecklistItemState[];
}): KnownBlock[] {
  const {
    requestId,
    topic,
    trainerName,
    requestedDate,
    attendeesEst,
    items,
  } = params;

  const byItem = Object.fromEntries(
    items.map((r) => [r.item, r] as const)
  ) as Record<string, GrowthChecklistItemState | undefined>;

  let lastUpdatedBy: string | null = null;
  let lastUpdatedAtMs = 0;
  for (const r of items) {
    if (r.updatedBy && r.updatedAt) {
      const t = Date.parse(r.updatedAt);
      if (!Number.isNaN(t) && t >= lastUpdatedAtMs) {
        lastUpdatedAtMs = t;
        lastUpdatedBy = r.updatedBy;
      }
    }
  }

  const elements: ActionsBlockElement[] = [];

  for (const key of GROWTH_CHECKLIST_ITEM_KEYS) {
    const row = byItem[key];
    const done = !!row?.completed;
    elements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: `${done ? "✅" : "⬜"} ${CHECKLIST_ITEM_LABEL[key]}`,
      },
      action_id: `growth_toggle_checklist_${key}`,
      value: `${requestId}|${key}`,
    });
  }

  const allDone = GROWTH_CHECKLIST_ITEM_KEYS.every(
    (k) => byItem[k]?.completed
  );

  elements.push({
    type: "button",
    text: { type: "plain_text", text: "Mark complete" },
    ...(allDone ? { style: "primary" as const } : {}),
    action_id: "growth_mark_complete",
    value: requestId,
  });

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Webinar content checklist",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Topic*\n${topic}` },
        { type: "mrkdwn", text: `*Trainer*\n${trainerName}` },
        {
          type: "mrkdwn",
          text: `*Scheduled*\n${formatWhen(requestedDate)}`,
        },
        { type: "mrkdwn", text: `*Est. attendees*\n${attendeesEst}` },
        { type: "mrkdwn", text: `*Request ID*\n\`${requestId}\`` },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Toggle items as assets are ready. Anyone on the team can update this checklist.",
        },
      ],
    },
    {
      type: "actions",
      block_id: `growth_cl_${requestId}`,
      elements,
    },
  ];

  if (lastUpdatedBy) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Last updated by <@${lastUpdatedBy}>`,
        },
      ],
    });
  }

  return blocks;
}

export function growthChecklistCompletedBlocks(params: {
  topic: string;
  completedBySlackId: string;
}): KnownBlock[] {
  const { topic, completedBySlackId } = params;
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Content complete* — *${topic}*\nMarked complete by <@${completedBySlackId}>.`,
      },
    },
  ];
}

export function confirmedNotice(actorName: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Confirmed* by ${actorName}. Growth team has been notified.`,
      },
    },
  ];
}

export function rejectedNotice(reason: string, actorName: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `❌ *Rejected* by ${actorName}\n*Reason:* ${reason}`,
      },
    },
  ];
}

export function altSuggestedNotice(
  altDate: string,
  actorName: string
): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📅 *Alternative suggested* by ${actorName}\n*Proposed time:* ${formatWhen(altDate)}`,
      },
    },
  ];
}

export function employeeAltDecisionBlocks(requestId: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Please confirm or decline the proposed alternative date.",
      },
    },
    {
      type: "actions",
      block_id: `emp_alt_${requestId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Accept new date" },
          style: "primary",
          action_id: "employee_accept_alt",
          value: requestId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Decline" },
          action_id: "employee_decline_alt",
          value: requestId,
        },
      ],
    },
  ];
}
