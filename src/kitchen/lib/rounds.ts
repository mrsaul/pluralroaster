// Production-round helpers. A round occurrence is one (round, production date) pair with
// its own order cutoff; the server computes occurrences (kitchen_round_occurrences).
import type { Lang } from "@/i18n";
import { PARIS_TZ } from "./format";
import type { RoundOccurrence } from "../types";

/** 0 = dimanche … 6 = samedi, matching Postgres EXTRACT(DOW). */
export const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today's date (YYYY-MM-DD) on the Paris calendar. */
export function parisDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS_TZ }).format(now);
}

const byDate = (a: RoundOccurrence, b: RoundOccurrence) =>
  a.productionDate < b.productionDate ? -1 : a.productionDate > b.productionDate ? 1 : 0;

/** Kitchen default: the earliest round whose production day is today or later. */
export function kitchenDefaultRound(occ: RoundOccurrence[], now: Date): RoundOccurrence | null {
  const today = parisDate(now);
  return occ.filter((o) => o.productionDate >= today).sort(byDate)[0] ?? null;
}

/**
 * Stores default: the latest round already decided (cutoff passed) that is still to be
 * produced; otherwise the earliest round still open.
 */
export function storesDefaultRound(occ: RoundOccurrence[], now: Date): RoundOccurrence | null {
  const today = parisDate(now);
  const decided = occ
    .filter((o) => new Date(o.cutoffAt) <= now && o.productionDate >= today)
    .sort(byDate);
  if (decided.length) return decided[decided.length - 1];
  return occ.filter((o) => new Date(o.cutoffAt) > now).sort(byDate)[0] ?? null;
}

export function isAfterCutoff(occ: RoundOccurrence, now: Date): boolean {
  return now >= new Date(occ.cutoffAt);
}

/** fr "Production du mardi 3 nov." / en "Production Tuesday 3 Nov". */
export function formatRoundLabel(occ: Pick<RoundOccurrence, "productionDate">, lang: Lang): string {
  const [y, m, d] = occ.productionDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return lang === "fr"
    ? `Production du ${WEEKDAYS_FR[dow]} ${d} ${MONTHS_FR[m - 1]}`
    : `Production ${WEEKDAYS_EN[dow]} ${d} ${MONTHS_EN[m - 1]}`;
}

/** fr "mardi 3 nov." / en "Tuesday 3 Nov" (no year). */
export function formatProductionDay(productionDate: string, lang: Lang): string {
  const [y, m, d] = productionDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return lang === "fr"
    ? `${WEEKDAYS_FR[dow]} ${d} ${MONTHS_FR[m - 1]}`
    : `${WEEKDAYS_EN[dow]} ${d} ${MONTHS_EN[m - 1]}`;
}
