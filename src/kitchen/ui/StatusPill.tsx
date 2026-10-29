/* eslint-disable react-refresh/only-export-components -- constants are part of the agreed module interface */
import type { ReactNode } from "react";
import type { KitchenOrder } from "@/kitchen/types";
import { BRAND_HEX } from "./BrandShape";

export type PillTone = "grey" | "sand" | "blue" | "green" | "coral" | "orange";

const INK = "#1C1A17";
const PAPER = "#FBF8F1";

export const PILL_COLORS: Record<PillTone, { bg: string; fg: string }> = {
  grey: { bg: "#E7E1D5", fg: INK },
  sand: { bg: BRAND_HEX.sand, fg: INK },
  blue: { bg: BRAND_HEX.blue, fg: INK },
  green: { bg: BRAND_HEX.green600, fg: PAPER },
  coral: { bg: BRAND_HEX.coral, fg: INK },
  orange: { bg: BRAND_HEX.orange, fg: INK },
};

const STATUS_TONES: Record<KitchenOrder["status"], PillTone> = {
  draft: "grey",
  sent: "sand",
  approved: "blue",
  ready: "green",
  received: "grey",
  declined: "coral",
};

export function toneForStatus(status: KitchenOrder["status"]): PillTone {
  return STATUS_TONES[status];
}

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const { bg, fg } = PILL_COLORS[tone];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold leading-tight whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}
    >
      {children}
    </span>
  );
}
