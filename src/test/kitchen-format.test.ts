import { describe, expect, it } from "vitest";
import { formatCountdown, formatMinutes, unitsToPieces } from "@/kitchen/lib/format";

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
