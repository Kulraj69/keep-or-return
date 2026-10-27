import { daysBetween, todayLocal } from "./dates";
import type { Diary, Verdict } from "./types";
export const KEEP_THRESHOLD = 3;
export const RETURN_THRESHOLD = 1;
export function signed(value: number, precision = 2): string {
  return `${value >= 0 ? "+" : ""}${Number(value.toFixed(precision))}`;
}
export function fallbackNarration(verdict: Verdict): string {
  return `${verdict.decision === "TOO EARLY" ? "Keep watching your diary" : verdict.decision === "KEEP" ? "Your diary points toward keeping this product" : "Your diary points toward considering a return"}${verdict.average === null ? "; record a baseline to start" : `, with an average raw-score change of ${signed(verdict.average)} points`}. ${verdict.daysLeft < 0 ? "Your recorded return deadline has passed" : `You have ${verdict.daysLeft} days left in your recorded return window`}.`;
}
export function getVerdict(diary: Diary, today = todayLocal()): Verdict {
  const entries = [...diary.checkIns]
    .filter((entry) => entry.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = entries[0];
  const last = entries.at(-1);
  const deltas = diary.plan.concerns.flatMap((concern) => {
    const baseline = first?.scores.find(
      (s) => s.concern === concern,
    )?.raw_score;
    const latest = last?.scores.find((s) => s.concern === concern)?.raw_score;
    return baseline !== undefined && latest !== undefined
      ? [
          {
            concern,
            baseline,
            latest,
            change: Number((latest - baseline).toFixed(4)),
          },
        ]
      : [];
  });
  const average =
    deltas.length === diary.plan.concerns.length && deltas.length
      ? deltas.reduce((sum, d) => sum + d.change, 0) / deltas.length
      : null;
  const daysLeft = daysBetween(today, diary.product.returnDeadline);
  const count = new Set(entries.map((entry) => entry.date)).size;
  const span = first && last ? daysBetween(first.date, last.date) : 0;
  const base = { deltas, average, daysLeft, count, span, borderline: false };
  if (
    count < 3 ||
    span < 5 ||
    average === null ||
    new Set(entries.map((e) => e.mode)).size > 1
  )
    return {
      ...base,
      decision: "TOO EARLY",
      reason:
        "A verdict needs at least 3 daily check-ins spanning 5 days, with every tracked concern in the same analysis mode.",
    };
  if (average >= KEEP_THRESHOLD)
    return {
      ...base,
      decision: "KEEP",
      reason: "The average raw-score improvement meets the +3 point threshold.",
    };
  if (average <= RETURN_THRESHOLD)
    return {
      ...base,
      decision: "RETURN",
      reason:
        "The average raw-score change is +1 point or less: no clear improvement above our noise allowance.",
    };
  if (daysLeft <= 2)
    return {
      ...base,
      borderline: true,
      decision: "RETURN",
      reason:
        "The result is borderline and the return deadline is close. The improvement has not reached +3 points.",
    };
  return {
    ...base,
    borderline: true,
    decision: "TOO EARLY",
    reason:
      "Keep watching. The average improvement is between +1 and +3 points; check again before the final 2 days.",
  };
}
