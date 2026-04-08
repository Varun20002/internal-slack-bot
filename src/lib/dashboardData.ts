import { getSupabaseAdmin } from "@/lib/supabase";
import type { WebinarState } from "@/lib/types";

export type DashboardRequest = {
  id: string;
  topic: string;
  trainer_name: string;
  requested_date: string;
  attendees_est: number;
  state: WebinarState;
  employee_slack_id: string;
  employee_name: string;
  created_at: string;
  updated_at: string;
};

export type DashboardSlaRow = {
  id: string;
  request_id: string | null;
  action: string;
  created_at: string;
};

export type DashboardPayload = {
  requests: DashboardRequest[];
  slaRows: DashboardSlaRow[];
  error: string | null;
  /** Server snapshot time for time-window metrics (React purity) */
  asOf: string;
};

export async function loadDashboardPayload(): Promise<DashboardPayload> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      requests: [],
      slaRows: [],
      error: "Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load data.",
      asOf: new Date().toISOString(),
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: requests, error: e1 } = await supabase
      .from("webinar_requests")
      .select(
        "id, topic, trainer_name, requested_date, attendees_est, state, employee_slack_id, employee_name, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    const { data: slaRows, error: e2 } = await supabase
      .from("audit_log")
      .select("id, request_id, action, created_at")
      .in("action", ["sla_bp_breach", "sla_content_breach"])
      .order("created_at", { ascending: false })
      .limit(500);

    const err = e1?.message || e2?.message || null;
    return {
      requests: (requests || []) as DashboardRequest[],
      slaRows: (slaRows || []) as DashboardSlaRow[],
      error: err,
      asOf: new Date().toISOString(),
    };
  } catch (e) {
    return {
      requests: [],
      slaRows: [],
      error: e instanceof Error ? e.message : "Failed to load dashboard data",
      asOf: new Date().toISOString(),
    };
  }
}
