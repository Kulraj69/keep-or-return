import "server-only";
import { timingSafeEqual } from "node:crypto";
export type LimitResult =
  | { ok: true; remaining: number }
  | { ok: false; note: string; retryAfter: number };
// A shared store is needed for a deployment-wide hard cap.
export class AnalyzeLimiter {
  private day = "";
  private count = 0;
  private hits = new Map<string, number>();
  constructor(
    private daily = 30,
    private perIp = 3,
  ) {}
  take(ip: string, now = Date.now()): LimitResult {
    const today = new Date(now).toISOString().slice(0, 10);
    if (this.day !== today) {
      this.day = today;
      this.count = 0;
      this.hits.clear();
    }
    const retryAfter = Math.max(
      1,
      Math.ceil((Date.parse(today) + 86_400_000 - now) / 1000),
    );
    if (this.count >= this.daily)
      return {
        ok: false,
        note: "Today’s analysis budget is used up. Try the sample diary, or come back after midnight UTC.",
        retryAfter,
      };
    const count = this.hits.get(ip) ?? 0;
    if (count >= this.perIp)
      return {
        ok: false,
        note: `You’ve used today’s ${this.perIp} requests. Your diary is safe; try again after midnight UTC.`,
        retryAfter,
      };
    this.count++;
    this.hits.set(ip, count + 1);
    return {
      ok: true,
      remaining: Math.min(this.perIp - count - 1, this.daily - this.count),
    };
  }
}
export function dailyCap(value = process.env.ANALYZE_DAILY_CAP): number {
  return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : 30;
}
const state = globalThis as typeof globalThis & {
  keepReturnLimiter?: AnalyzeLimiter;
  keepReturnNarratorLimiter?: AnalyzeLimiter;
};
export function limiter() {
  return (state.keepReturnLimiter ??= new AnalyzeLimiter(dailyCap()));
}
export function narrationLimiter() {
  return (state.keepReturnNarratorLimiter ??= new AnalyzeLimiter(300, 30));
}
export function validPasscode(
  input: unknown,
  expected = process.env.DEMO_PASSCODE,
): boolean {
  if (!expected) return true;
  if (typeof input !== "string") return false;
  const a = Buffer.from(input),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function clientIp(request: Request): string {
  if (process.env.VERCEL)
    return (
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
      "unknown"
    );
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
