// Week model. The server's kitchen_current_week() is the *ordering* week: the earliest
// Monday whose cutoff is still ahead. The *production* week is the one before it — the
// week whose cutoff passed most recently (from one cutoff until the next).
import { PARIS_TZ } from "./format";

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function productionWeekStart(currentWeekStart: string): string {
  return addDaysIso(currentWeekStart, -7);
}

/** Today's date (YYYY-MM-DD) on the Paris calendar. */
export function parisDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS_TZ }).format(now);
}

/**
 * The week the stores manager sees by default: the production week until it has started
 * (between the cutoff and Monday) or while it still has sent orders to review;
 * otherwise the ordering week.
 */
export function storesDefaultWeek(orderingWeekStart: string, now: Date, productionHasSent: boolean): string {
  const production = productionWeekStart(orderingWeekStart);
  return parisDate(now) < production || productionHasSent ? production : orderingWeekStart;
}

/** True once the week's cutoff has passed. Weeks before the ordering week are always past it. */
export function isAfterCutoff(
  weekStart: string,
  current: { weekStart: string; cutoffAt: string },
  now: Date,
): boolean {
  if (weekStart === current.weekStart) return now >= new Date(current.cutoffAt);
  return weekStart < current.weekStart;
}
