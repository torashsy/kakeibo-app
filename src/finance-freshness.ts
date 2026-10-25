/** Detect missing or stale server-side finance checks without implying that balances are current. */
export const FINANCE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function financeFreshness(checkedAt: unknown, now: number = Date.now()) {
  if (typeof checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(checkedAt)) return "never";
  const time = Date.parse(checkedAt);
  if (!Number.isFinite(time) || !Number.isFinite(now) || time > now + 5 * 60_000) return "invalid";
  return now - time > FINANCE_STALE_AFTER_MS ? "stale" : "recent";
}
