import type { KnownBlock } from "@slack/types";

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

export function growthPickupCard(params: {
  requestId: string;
  topic: string;
  trainerName: string;
  requestedDate: string;
}): KnownBlock[] {
  const { requestId, topic, trainerName, requestedDate } = params;
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Confirmed webinar — pick up", emoji: true },
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
        { type: "mrkdwn", text: `*ID*\n\`${requestId}\`` },
      ],
    },
    {
      type: "actions",
      block_id: `growth_pick_${requestId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Pick up this session" },
          style: "primary",
          action_id: "growth_pickup",
          value: requestId,
        },
      ],
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
