import { describe, expect, it } from "vitest";
import {
  formatRoundLabel,
  isAfterCutoff,
  kitchenDefaultRound,
  parisDate,
  storesDefaultRound,
  WEEKDAYS_EN,
  WEEKDAYS_FR,
} from "@/kitchen/lib/rounds";
import type { RoundOccurrence } from "@/kitchen/types";

const occ = (roundName: string, productionDate: string, cutoffAt: string): RoundOccurrence => ({
  roundId: roundName, roundName, productionDate, cutoffAt, capacityMinutes: 1200,
});
const TUE3 = occ("Mardi", "2026-11-03", "2026-11-02T19:00:00Z");
const FRI6 = occ("Vendredi", "2026-11-06", "2026-11-05T19:00:00Z");
const TUE10 = occ("Mardi", "2026-11-10", "2026-11-09T19:00:00Z");
const all = [TUE3, FRI6, TUE10];

describe("rounds helpers", () => {
  it("parisDate uses the Paris calendar day", () => {
    expect(parisDate(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
    expect(parisDate(new Date("2026-11-01T19:30:00Z"))).toBe("2026-11-01");
  });

  it("kitchenDefaultRound: earliest occurrence not yet past", () => {
    expect(kitchenDefaultRound(all, new Date("2026-11-04T09:00:00Z"))?.productionDate).toBe("2026-11-06");
    expect(kitchenDefaultRound(all, new Date("2026-11-03T06:00:00Z"))?.productionDate).toBe("2026-11-03");
  });

  it("storesDefaultRound: latest decided round still to produce, else next open", () => {
    expect(storesDefaultRound(all, new Date("2026-11-02T19:30:00Z"))?.productionDate).toBe("2026-11-03");
    expect(storesDefaultRound(all, new Date("2026-11-03T12:00:00Z"))?.productionDate).toBe("2026-11-03");
    expect(storesDefaultRound(all, new Date("2026-11-04T09:00:00Z"))?.productionDate).toBe("2026-11-06");
  });

  it("empty occurrences give null defaults", () => {
    const now = new Date("2026-11-04T09:00:00Z");
    expect(kitchenDefaultRound([], now)).toBeNull();
    expect(storesDefaultRound([], now)).toBeNull();
  });

  it("isAfterCutoff compares against the cutoff instant", () => {
    expect(isAfterCutoff(TUE3, new Date("2026-11-02T18:59:00Z"))).toBe(false);
    expect(isAfterCutoff(TUE3, new Date("2026-11-02T19:00:00Z"))).toBe(true);
  });

  it("formatRoundLabel", () => {
    expect(formatRoundLabel({ productionDate: "2026-11-03" }, "fr")).toBe("Production du mardi 3 nov.");
    expect(formatRoundLabel({ productionDate: "2026-11-03" }, "en")).toBe("Production Tuesday 3 Nov");
  });

  it("weekday names are indexed 0=Sunday", () => {
    expect(WEEKDAYS_FR[0]).toBe("dimanche");
    expect(WEEKDAYS_FR[6]).toBe("samedi");
    expect(WEEKDAYS_EN[2]).toBe("Tuesday");
  });
});
