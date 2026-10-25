import { describe, expect, it } from "vitest";
import { financeFreshness } from "./finance-freshness";
describe("finance freshness", () => {
  const now = Date.parse("2026-10-25T23:00:00+09:00");
  it("flags missing checks", () => { expect(financeFreshness(undefined, now)).toBe("never"); expect(financeFreshness("", now)).toBe("never"); });
  it("detects stale and recent checks", () => {
    expect(financeFreshness("2026-10-25T10:00:00+09:00", now)).toBe("recent");
    expect(financeFreshness("2026-10-24T21:00:00+09:00", now)).toBe("stale");
  });
  it("does not trust malformed or future timestamps", () => {
    expect(financeFreshness("yesterday", now)).toBe("never");
    expect(financeFreshness("2026-10-26T09:00:00+09:00", now)).toBe("invalid");
  });
});
