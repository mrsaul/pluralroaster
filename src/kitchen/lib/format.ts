import type { Lang } from "@/i18n";

export function unitsToPieces(units: number, piecesPerUnit: number): number {
  return units * piecesPerUnit;
}

/** "in 1 d 4 h" / "dans 1 j 4 h"; "< 1 h" under an hour; "" once passed. */
export function formatCountdown(cutoffAt: Date, now: Date, lang: Lang): string {
  const ms = cutoffAt.getTime() - now.getTime();
  if (ms <= 0) return "";
  const totalHours = Math.floor(ms / 3_600_000);
  if (totalHours < 1) return "< 1 h";
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const [prefix, dayUnit] = lang === "fr" ? ["dans", "j"] : ["in", "d"];
  return days > 0 ? `${prefix} ${days} ${dayUnit} ${hours} h` : `${prefix} ${hours} h`;
}

/** 2040 -> "34 h", 90 -> "1 h 30", 45 -> "45 min". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h} h`;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export const PARIS_TZ = "Europe/Paris";

function parisOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "2026-03-29T10:00" (a Paris wall-clock time from datetime-local) -> UTC ISO string. */
export function parisLocalToIso(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return "";
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = wall - parisOffsetMs(wall);
  utc = wall - parisOffsetMs(utc); // second pass settles around DST changes
  return new Date(utc).toISOString();
}

/** "tomorrow 10:00" in Paris, as a datetime-local value. */
export function defaultParisNeededBy(now: Date = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: PARIS_TZ }).format(now); // YYYY-MM-DD
  const [y, mo, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return `${next.toISOString().slice(0, 10)}T10:00`;
}
