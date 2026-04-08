/** Works for Block Kit interactive actions (buttons). */
export function getBlockButtonValue(body: unknown): string | undefined {
  const b = body as { actions?: unknown[] };
  const a = b.actions?.[0];
  if (a && typeof a === "object" && a !== null && "value" in a) {
    const v = (a as { value?: unknown }).value;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}
