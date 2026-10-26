import { describe, expect, it } from "vitest";
import { defaultParisNeededBy, formatCountdown, formatMinutes, parisLocalToIso, unitsToPieces } from "@/kitchen/lib/format";

describe("format", () => {
  const now = new Date("2026-10-31T15:00:00Z");
  it("countdown", () => {
    expect(formatCountdown(new Date("2026-11-01T19:00:00Z"), now, "en")).toBe("in 1 d 4 h");
    expect(formatCountdown(new Date("2026-11-01T19:00:00Z"), now, "fr")).toBe("dans 1 j 4 h");
    expect(formatCountdown(new Date("2026-10-31T19:00:00Z"), now, "fr")).toBe("dans 4 h");
    expect(formatCountdown(new Date("2026-10-31T15:30:00Z"), now, "en")).toBe("< 1 h");
    expect(formatCountdown(new Date("2026-10-31T14:00:00Z"), now, "en")).toBe("");
    expect(formatCountdown(now, now, "en")).toBe("");
  });
  it("minutes", () => {
    expect(formatMinutes(2040)).toBe("34 h");
    expect(formatMinutes(90)).toBe("1 h 30");
    expect(formatMinutes(65)).toBe("1 h 05");
    expect(formatMinutes(45)).toBe("45 min");
  });
  it("pieces", () => expect(unitsToPieces(2, 50)).toBe(100));
});

describe("Paris time", () => {
  it("converts winter, summer and DST-change days", () => {
    expect(parisLocalToIso("2026-01-15T10:00")).toBe("2026-01-15T09:00:00.000Z");
    expect(parisLocalToIso("2026-07-01T10:00")).toBe("2026-07-01T08:00:00.000Z");
    expect(parisLocalToIso("2026-03-28T10:00")).toBe("2026-03-28T09:00:00.000Z");
    expect(parisLocalToIso("2026-03-29T10:00")).toBe("2026-03-29T08:00:00.000Z");
    expect(parisLocalToIso("2026-03-29T01:30")).toBe("2026-03-29T00:30:00.000Z");
    expect(parisLocalToIso("2026-10-25T10:00")).toBe("2026-10-25T09:00:00.000Z");
    expect(parisLocalToIso("2026-10-24T10:00")).toBe("2026-10-24T08:00:00.000Z");
    expect(parisLocalToIso("garbage")).toBe("");
  });
  it("defaults to tomorrow 10:00 Paris", () => {
    // 22:30Z is 23:30 on the 26th in Paris -> tomorrow is the 27th
    expect(defaultParisNeededBy(new Date("2026-10-26T22:30:00Z"))).toBe("2026-10-27T10:00");
    // 23:30Z is already 00:30 on the 27th in Paris -> tomorrow is the 28th
    expect(defaultParisNeededBy(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-28T10:00");
  });
});
