import { formatFrNumber } from "@/lib/orderUtils";

/**
 * A pricing tier: one rate for coffee by the kg, one for bags (150 g / 250 g),
 * and an optional volume step on the kg rate (kg-by-the-kg in the order >= thresholdKg).
 */
export type TierRules = {
  kg: number;
  bag: number;
  thresholdKg: number | null;
  kgAbove: number | null;
};

type NumLike = number | string | null | undefined;

export type TierRulesRow = {
  kg_discount_percent?: NumLike;
  bag_discount_percent?: NumLike;
  volume_threshold_kg?: NumLike;
  volume_kg_discount_percent?: NumLike;
  product_discount_percent?: NumLike;
};

function num(v: NumLike): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function flatRules(percent: number): TierRules {
  return { kg: percent, bag: percent, thresholdKg: null, kgAbove: null };
}

export function tierRulesFromRow(row: TierRulesRow | null): TierRules {
  if (!row) return flatRules(0);
  const flat = num(row.product_discount_percent) ?? 0;
  const kg = num(row.kg_discount_percent);
  const bag = num(row.bag_discount_percent);
  const threshold = num(row.volume_threshold_kg);
  const above = num(row.volume_kg_discount_percent);
  if (kg === null && bag === null && threshold === null && above === null) return flatRules(flat);
  const hasStep = threshold !== null && threshold > 0 && above !== null;
  return {
    kg: kg ?? flat,
    bag: bag ?? flat,
    thresholdKg: hasStep ? threshold : null,
    kgAbove: hasStep ? above : null,
  };
}

/** Parses orders.pricing_rules JSON; null when malformed. */
export function parseTierRules(raw: unknown): TierRules | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const kg = num(r.kg as NumLike);
  const bag = num(r.bag as NumLike);
  if (kg === null || bag === null) return null;
  const threshold = num(r.thresholdKg as NumLike);
  const above = num(r.kgAbove as NumLike);
  const hasStep = threshold !== null && threshold > 0 && above !== null;
  return { kg, bag, thresholdKg: hasStep ? threshold : null, kgAbove: hasStep ? above : null };
}

/** A bag is a size under 1 kg (150 g, 250 g). 1 kg, 3 kg packs and plain kg are "by the kg". */
export function isBagSize(sizeKg: number | null | undefined): boolean {
  return sizeKg != null && sizeKg > 0 && sizeKg < 1;
}

export function ratesFor(rules: TierRules, kgByTheKg: number): { kg: number; bag: number } {
  const stepped = rules.thresholdKg != null && rules.kgAbove != null && kgByTheKg >= rules.thresholdKg;
  return { kg: stepped ? (rules.kgAbove as number) : rules.kg, bag: rules.bag };
}

const pct = (n: number) => `−${formatFrNumber(n)} %`;

export function describeRules(rules: TierRules): string | null {
  const parts: string[] = [];
  if (rules.kg > 0) parts.push(`café au kg ${pct(rules.kg)}`);
  if (rules.thresholdKg != null && rules.kgAbove != null && rules.kgAbove > 0) {
    parts.push(`dès ${formatFrNumber(rules.thresholdKg)} kg ${pct(rules.kgAbove)}`);
  }
  if (rules.bag > 0) parts.push(`sachets ${pct(rules.bag)}`);
  return parts.length ? parts.join(" · ") : null;
}

export type VolumeNudge =
  | { kind: "remaining"; kg: number; percent: number }
  | { kind: "reached"; percent: number };

export function volumeNudge(rules: TierRules, kgByTheKg: number): VolumeNudge | null {
  if (rules.thresholdKg == null || rules.kgAbove == null || !(kgByTheKg > 0)) return null;
  if (kgByTheKg >= rules.thresholdKg) return { kind: "reached", percent: rules.kgAbove };
  const kg = Math.round((rules.thresholdKg - kgByTheKg) * 100) / 100;
  return { kind: "remaining", kg, percent: rules.kgAbove };
}

export function formatNudge(n: NonNullable<ReturnType<typeof volumeNudge>>): string {
  return n.kind === "reached"
    ? `Remise ${pct(n.percent)} atteinte`
    : `Plus que ${formatFrNumber(n.kg)} kg pour passer à ${pct(n.percent)}`;
}

/** The rule set an existing order is priced with: its frozen pricing_rules, else its flat discount (old orders). */
export function orderRulesFor(rawRules: unknown, discountPercent: number): TierRules {
  return parseTierRules(rawRules) ?? flatRules(discountPercent);
}
