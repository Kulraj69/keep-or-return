import { describe, expect, it } from "vitest";
import { getVerdict } from "@/lib/verdict";
import { sampleDiary } from "@/lib/diary";
import { addDays, daysBetween } from "@/lib/dates";
function fixture(change: number, daysLeft = 8) {
  const diary = sampleDiary("2026-10-27");
  diary.checkIns = [diary.checkIns[0], diary.checkIns[5], diary.checkIns[13]];
  diary.checkIns[2].scores = diary.checkIns[0].scores.map((s) => ({
    ...s,
    raw_score: s.raw_score + change,
  }));
  diary.product.returnDeadline = addDays("2026-10-27", daysLeft);
  return diary;
}
describe("deterministic verdict", () => {
  it("needs at least three check-ins", () => {
    const d = fixture(10);
    d.checkIns = [d.checkIns[0], d.checkIns[2]];
    expect(getVerdict(d, "2026-10-27").decision).toBe("TOO EARLY");
  });
  it("needs five days even with three check-ins", () => {
    const d = fixture(10);
    d.checkIns[2].date = addDays(d.checkIns[0].date, 2);
    d.checkIns[1].date = addDays(d.checkIns[0].date, 1);
    expect(getVerdict(d, "2026-10-27").decision).toBe("TOO EARLY");
  });
  it("accepts exactly five days", () => {
    const d = fixture(3);
    d.checkIns[1].date = addDays(d.checkIns[0].date, 2);
    d.checkIns[2].date = addDays(d.checkIns[0].date, 5);
    expect(getVerdict(d, "2026-10-27").decision).toBe("KEEP");
  });
  it.each([
    [3, "KEEP"],
    [6, "KEEP"],
    [1, "RETURN"],
    [0, "RETURN"],
    [-4, "RETURN"],
    [2, "TOO EARLY"],
  ])("handles average %s as %s", (delta, decision) => {
    expect(getVerdict(fixture(Number(delta)), "2026-10-27").decision).toBe(
      decision,
    );
  });
  it("returns borderline results at deadline minus two", () => {
    const v = getVerdict(fixture(2, 2), "2026-10-27");
    expect(v.decision).toBe("RETURN");
    expect(v.borderline).toBe(true);
  });
  it("keeps watching borderline results with three days left", () => {
    expect(getVerdict(fixture(2, 3), "2026-10-27").decision).toBe("TOO EARLY");
  });
  it("calculates exact raw deltas rather than UI deltas", () => {
    const d = fixture(3.25);
    d.checkIns[2].scores.forEach((s) => {
      s.ui_score = 1;
    });
    const v = getVerdict(d, "2026-10-27");
    expect(v.deltas.map((x) => x.change)).toEqual([3.25, 3.25, 3.25]);
    expect(v.average).toBe(3.25);
  });
  it("averages across all tracked concerns", () => {
    const d = fixture(4);
    d.checkIns[2].scores[0].raw_score = d.checkIns[0].scores[0].raw_score - 2;
    expect(getVerdict(d, "2026-10-27").average).toBe(2);
  });
  it("does not silently omit a missing concern", () => {
    const d = fixture(4);
    d.checkIns[2].scores.pop();
    expect(getVerdict(d, "2026-10-27").decision).toBe("TOO EARLY");
  });
  it("does not count duplicate dates or mixed analysis modes", () => {
    const d = fixture(4);
    d.checkIns[1].date = d.checkIns[0].date;
    expect(getVerdict(d, "2026-10-27").count).toBe(2);
    d.checkIns[1].mode = "live";
    expect(getVerdict(d, "2026-10-27").decision).toBe("TOO EARLY");
  });
  it("ignores future data and sorts imported check-ins", () => {
    const d = fixture(4);
    d.checkIns.reverse();
    expect(getVerdict(d, "2026-10-27").average).toBe(4);
    expect(getVerdict(d, "2026-10-14").count).toBe(1);
  });
  it("handles an empty diary and expired deadline", () => {
    const d = fixture(4, -1);
    d.checkIns = [];
    const v = getVerdict(d, "2026-10-27");
    expect(v.average).toBeNull();
    expect(v.daysLeft).toBe(-1);
    expect(v.decision).toBe("TOO EARLY");
  });
  it("calculates calendar days without daylight-saving errors", () => {
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });
});
