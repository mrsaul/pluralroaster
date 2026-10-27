import { describe, expect, it } from "vitest";
import { isAfterCutoff, parisDate, productionWeekStart, storesDefaultWeek } from "@/kitchen/lib/weeks";

// Default settings: cutoff Sunday 20:00 Paris. The server's "current week" is always the
// ordering week (earliest Monday whose cutoff is still in the future).
describe("weeks", () => {
  it("production week is the ordering week minus 7 days", () => {
    expect(productionWeekStart("2026-11-02")).toBe("2026-10-26");
    expect(productionWeekStart("2026-03-30")).toBe("2026-03-23"); // across the DST change
    expect(productionWeekStart("2027-01-04")).toBe("2026-12-28"); // across the year end
  });

  it("parisDate uses the Paris calendar day", () => {
    expect(parisDate(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02"); // 00:30 Monday in Paris
    expect(parisDate(new Date("2026-11-01T19:30:00Z"))).toBe("2026-11-01");
  });

  describe("stores default week", () => {
    it("mid-week (Tue): ordering week, unless the production week still has sent orders", () => {
      const now = new Date("2026-10-27T09:00:00Z"); // Tue 10:00 Paris; ordering week 2026-11-02
      expect(storesDefaultWeek("2026-11-02", now, false)).toBe("2026-11-02");
      expect(storesDefaultWeek("2026-11-02", now, true)).toBe("2026-10-26");
    });
    it("Sunday 20:30 (just after cutoff): the week that starts tomorrow", () => {
      const now = new Date("2026-11-01T19:30:00Z"); // Sun 20:30 Paris; ordering week now 2026-11-09
      expect(storesDefaultWeek("2026-11-09", now, false)).toBe("2026-11-02");
      expect(storesDefaultWeek("2026-11-09", now, true)).toBe("2026-11-02");
    });
    it("Monday 00:30: the started week while it has sent orders, else the ordering week", () => {
      const now = new Date("2026-11-01T23:30:00Z"); // Mon 00:30 Paris
      expect(storesDefaultWeek("2026-11-09", now, true)).toBe("2026-11-02");
      expect(storesDefaultWeek("2026-11-09", now, false)).toBe("2026-11-09");
    });
  });

  it("after cutoff: production and past weeks yes, ordering week by its cutoff, future weeks no", () => {
    const current = { weekStart: "2026-11-09", cutoffAt: "2026-11-08T19:00:00Z" };
    const now = new Date("2026-11-03T10:00:00Z");
    expect(isAfterCutoff("2026-11-02", current, now)).toBe(true);
    expect(isAfterCutoff("2026-10-26", current, now)).toBe(true);
    expect(isAfterCutoff("2026-11-09", current, now)).toBe(false);
    expect(isAfterCutoff("2026-11-09", current, new Date("2026-11-08T19:00:00Z"))).toBe(true);
    expect(isAfterCutoff("2026-11-16", current, now)).toBe(false);
  });
});
