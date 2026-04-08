/** Combine Slack datepicker + timepicker values as UTC wall-clock. */
export function combineDateTimeUtc(date: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}
