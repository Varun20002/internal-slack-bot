import { getSupabaseAdmin } from "@/lib/supabase";
import {
  GROWTH_CHECKLIST_ITEM_KEYS,
  growthChecklistBlocks,
  type GrowthChecklistItemState,
} from "@/slack/blockKit";

/**
 * Loads webinar + checklist rows and returns Block Kit payload for
 * `chat.postMessage` / `chat.update`.
 */
export async function buildChecklistMessage(
  requestId: string
): Promise<{ text: string; blocks: ReturnType<typeof growthChecklistBlocks> } | null> {
  const supabase = getSupabaseAdmin();
  const [reqResult, clResult] = await Promise.all([
    supabase
      .from("webinar_requests")
      .select("id, topic, trainer_name, requested_date, attendees_est")
      .eq("id", requestId)
      .maybeSingle(),
    supabase
      .from("content_checklist")
      .select("item, completed, updated_by, updated_at")
      .eq("request_id", requestId),
  ]);

  const { data: row, error: reqErr } = reqResult;
  const { data: checklistRows, error: clErr } = clResult;

  if (reqErr || !row) return null;
  if (clErr) return null;

  const byItem = Object.fromEntries(
    (checklistRows || []).map((r) => [r.item, r] as const)
  ) as Record<
    string,
    {
      item: string;
      completed: boolean;
      updated_by: string | null;
      updated_at: string | null;
    }
  >;

  const items: GrowthChecklistItemState[] = GROWTH_CHECKLIST_ITEM_KEYS.map(
    (key) => {
      const r = byItem[key];
      return {
        item: key,
        completed: !!r?.completed,
        updatedBy: r?.updated_by ?? null,
        updatedAt: r?.updated_at ?? null,
      };
    }
  );

  const blocks = growthChecklistBlocks({
    requestId: row.id as string,
    topic: row.topic as string,
    trainerName: row.trainer_name as string,
    requestedDate: row.requested_date as string,
    attendeesEst: row.attendees_est as number,
    items,
  });

  return {
    text: `Content checklist: ${row.topic as string}`,
    blocks,
  };
}
