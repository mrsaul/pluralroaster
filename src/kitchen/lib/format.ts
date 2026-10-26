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
