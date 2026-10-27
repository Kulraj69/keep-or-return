import { describe, expect, it } from "vitest";
import {
  parseStore,
  sampleDiary,
  validateDiary,
  validateProduct,
} from "@/lib/diary";
import { makeReminder } from "@/lib/ics";
import { validDate } from "@/lib/dates";
describe("diary portability", () => {
  it("round-trips the synthetic fourteen-day sample", () => {
    const diary = sampleDiary("2026-10-27");
    const serialized = JSON.stringify({
      version: 1,
      diaries: [diary],
      activeId: diary.id,
    });
    expect(parseStore(serialized).diaries[0]).toEqual(diary);
    expect(diary.checkIns).toHaveLength(14);
    expect(diary.synthetic).toBe(true);
    expect(
      diary.checkIns.every((c) => c.thumbnail === null && c.mode === "mock"),
    ).toBe(true);
  });
  it("rejects invalid dates and backwards return windows", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(() =>
      validateProduct({
        ...sampleDiary().product,
        returnDeadline: "2000-01-01",
      }),
    ).toThrow();
  });
  it("rejects a malformed or unknown JSON export", () => {
    expect(() => parseStore("hello")).toThrow();
    expect(() => parseStore('{"version":2,"diaries":[]}')).toThrow();
  });
  it("rejects duplicate days and nonfinite scores", () => {
    const d = sampleDiary("2026-10-27");
    d.checkIns[1].date = d.checkIns[0].date;
    expect(() => validateDiary(d)).toThrow("one check-in");
    d.checkIns.pop();
    d.checkIns[0].scores[0].raw_score = Infinity;
    expect(() => validateDiary(d)).toThrow("scores");
  });
  it("rejects mixed modes and unsafe thumbnails or mask URLs", () => {
    const d = sampleDiary("2026-10-27");
    d.checkIns[0].mode = "live";
    expect(() => validateDiary(d)).toThrow("separate");
    d.checkIns[0].mode = "mock";
    d.checkIns[0].thumbnail = "data:image/svg+xml,<svg/>";
    expect(() => validateDiary(d)).toThrow("thumbnails");
    d.checkIns[0].thumbnail = null;
    d.checkIns[0].maskUrl = "javascript:alert(1)";
    expect(() => validateDiary(d)).toThrow("mask URL");
  });
  it("drops unknown fields such as accidentally exported secrets", () => {
    const d = sampleDiary("2026-10-27");
    expect(
      validateDiary({ ...d, passcode: "do-not-retain" }),
    ).not.toHaveProperty("passcode");
  });
});
describe("calendar reminder", () => {
  it("creates a date-only event on the deadline and an alarm two days earlier", () => {
    const d = sampleDiary("2026-10-27");
    const ics = makeReminder(d, new Date("2026-10-27T00:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261104\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261105");
    expect(ics).toContain("TRIGGER:-P2D");
    expect(ics).toContain("SUMMARY:Return by 2026-11-04");
    expect(ics).toContain("DTSTAMP:20261027T000000Z");
  });
  it("escapes calendar text and prevents newline injection", () => {
    const d = sampleDiary();
    d.product.name = "Serum, calm; skin\nBEGIN:VEVENT";
    const ics = makeReminder(d);
    expect(ics).toContain("Serum\\, calm\\; skin\\nBEGIN:VEVENT");
    expect(ics.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
  });
  it("folds long UTF-8 lines to at most seventy-five bytes", () => {
    const d = sampleDiary();
    d.product.name = "日".repeat(110);
    const ics = makeReminder(d);
    expect(
      ics
        .split("\r\n")
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
  });
});
