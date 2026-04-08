export const WEBINAR_STATES = [
  "RAISED",
  "PENDING_APPROVAL",
  "CONFIRMED",
  "REJECTED",
  "ALT_SUGGESTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type WebinarState = (typeof WEBINAR_STATES)[number];

export type WebinarRequestRow = {
  id: string;
  topic: string;
  trainer_name: string;
  requested_date: string;
  attendees_est: number;
  state: WebinarState;
  employee_slack_id: string;
  employee_name: string;
  bp_slack_id: string | null;
  growth_slack_id: string | null;
  rejection_reason: string | null;
  alt_date: string | null;
  bp_channel_id: string | null;
  bp_message_ts: string | null;
  growth_channel_id: string | null;
  growth_message_ts: string | null;
  created_at: string;
  updated_at: string;
};

export const VALID_TRANSITIONS: Record<WebinarState, WebinarState[]> = {
  RAISED: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["CONFIRMED", "REJECTED", "ALT_SUGGESTED"],
  ALT_SUGGESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};
