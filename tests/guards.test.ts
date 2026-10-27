import { describe, expect, it, vi } from "vitest";
import {
  AnalyzeLimiter,
  clientIp,
  dailyCap,
  validPasscode,
} from "@/lib/rate-limit";
import { decodePhoto, readJson } from "@/lib/http";
import { resizeDimensions } from "@/lib/image";
const day = Date.parse("2026-10-27T12:00:00Z");
describe("budget, access, and input guards", () => {
  it("allows three requests per IP per UTC day", () => {
    const l = new AnalyzeLimiter();
    for (let i = 0; i < 3; i++) expect(l.take("a", day).ok).toBe(true);
    expect(l.take("a", day)).toMatchObject({ ok: false, retryAfter: 43200 });
    expect(l.take("b", day).ok).toBe(true);
  });
  it("enforces the shared budget across IPs", () => {
    const l = new AnalyzeLimiter(2);
    expect(l.take("a", day).ok).toBe(true);
    expect(l.take("b", day).ok).toBe(true);
    expect(l.take("c", day).ok).toBe(false);
  });
  it("resets both limits at UTC midnight", () => {
    const l = new AnalyzeLimiter(1);
    l.take("a", day);
    expect(l.take("a", day + 12 * 3600000).ok).toBe(true);
  });
  it("supports a zero budget and safe invalid config defaults", () => {
    expect(new AnalyzeLimiter(0).take("a", day).ok).toBe(false);
    expect(dailyCap("0")).toBe(0);
    expect(dailyCap("oops")).toBe(30);
    expect(dailyCap("-1")).toBe(30);
  });
  it("does not charge another IP for a refused request", () => {
    const l = new AnalyzeLimiter(4);
    for (let i = 0; i < 5; i++) l.take("a", day);
    expect(l.take("b", day).ok).toBe(true);
  });
  it("requires exactly the configured passcode", () => {
    expect(validPasscode(undefined, "")).toBe(true);
    expect(validPasscode("code", "code")).toBe(true);
    expect(validPasscode("nope", "code")).toBe(false);
    expect(validPasscode(undefined, "code")).toBe(false);
  });
  it("trusts the Vercel overwritten header in deployment", () => {
    vi.stubEnv("VERCEL", "1");
    expect(
      clientIp(
        new Request("https://example.test", {
          headers: {
            "x-vercel-forwarded-for": "1.2.3.4",
            "x-forwarded-for": "spoof",
          },
        }),
      ),
    ).toBe("1.2.3.4");
    expect(
      clientIp(
        new Request("https://example.test", {
          headers: { "x-forwarded-for": "spoof" },
        }),
      ),
    ).toBe("unknown");
  });
  it("caps streamed bodies even without content-length", async () => {
    await expect(
      readJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claims: "a".repeat(100) }),
        }),
        20,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects non-JSON and malformed JSON", async () => {
    await expect(
      readJson(
        new Request("https://example.test", { method: "POST", body: "hi" }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects disguised and malformed photos", () => {
    expect(() => decodePhoto("data:image/jpeg;base64,YWJjZA==")).toThrow(
      "JPEG",
    );
    expect(() => decodePhoto("bogus!!")).toThrow("valid JPEG");
  });
  it("resizes portrait and landscape to 1600 without upscaling", () => {
    expect(resizeDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(resizeDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(resizeDimensions(600, 800)).toEqual({ width: 600, height: 800 });
  });
  it("rejects tiny and too narrow photos", () => {
    expect(() => resizeDimensions(400, 800)).toThrow("480");
    expect(() => resizeDimensions(600, 5000)).toThrow("too narrow");
  });
});
