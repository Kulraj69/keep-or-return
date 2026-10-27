import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as analyze } from "@/app/api/analyze/route";
import { POST as plan } from "@/app/api/plan/route";
import { GET as config } from "@/app/api/config/route";
import { POST as narrate } from "@/app/api/narrate/route";
import { sampleDiary, parseStore } from "@/lib/diary";
import { getVerdict } from "@/lib/verdict";
import { makeReminder } from "@/lib/ics";
import { todayLocal } from "@/lib/dates";
const imageBase64 = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0xff, 0xd9]).toString("base64")}`;
function req(body: unknown) {
  return new Request("https://example.test/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "test-ip",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  const state = globalThis as typeof globalThis & {
    keepReturnLimiter?: unknown;
    keepReturnNarratorLimiter?: unknown;
  };
  delete state.keepReturnLimiter;
  delete state.keepReturnNarratorLimiter;
});
describe("API routes and mock end-to-end", () => {
  it("runs claims → analysis → persisted diary → verdict → reminder without network", async () => {
    const planResponse = await plan(req({ claims: "Redness and pores" }));
    const mapping = await planResponse.json();
    expect(mapping.concerns).toEqual(["redness", "pore"]);
    const response = await analyze(
      req({ imageBase64, concerns: mapping.concerns }),
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.mode).toBe("mock");
    expect(result.scores).toHaveLength(2);
    const diary = sampleDiary(todayLocal());
    diary.plan = mapping;
    diary.checkIns = [
      { ...result, date: todayLocal(), id: "baseline", thumbnail: null },
    ];
    const store = parseStore(
      JSON.stringify({ version: 1, diaries: [diary], activeId: diary.id }),
    );
    expect(getVerdict(store.diaries[0]).decision).toBe("TOO EARLY");
    expect(makeReminder(diary)).toContain("BEGIN:VCALENDAR");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires a body passcode before charging the budget", async () => {
    vi.stubEnv("DEMO_PASSCODE", "testing-code");
    const response = await analyze(req({ imageBase64, concerns: ["redness"] }));
    expect(response.status).toBe(401);
    for (let i = 0; i < 3; i++)
      expect(
        (
          await analyze(
            req({
              imageBase64,
              concerns: ["redness"],
              passcode: "testing-code",
            }),
          )
        ).status,
      ).toBe(200);
  });
  it("returns a friendly 429 and Retry-After for the fourth request", async () => {
    for (let i = 0; i < 3; i++)
      await analyze(req({ imageBase64, concerns: ["redness"] }));
    const response = await analyze(req({ imageBase64, concerns: ["redness"] }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await response.json()).error).toContain("diary is safe");
  });
  it("rejects invalid concerns and photos without charging", async () => {
    expect(
      (await analyze(req({ imageBase64, concerns: ["unknown"] }))).status,
    ).toBe(400);
    expect(
      (await analyze(req({ imageBase64: "bad", concerns: ["redness"] })))
        .status,
    ).toBe(400);
    for (let i = 0; i < 3; i++)
      expect(
        (await analyze(req({ imageBase64, concerns: ["redness"] }))).status,
      ).toBe(200);
  });
  it("rejects oversized payloads and empty claims", async () => {
    expect(
      (
        await analyze(
          req({
            imageBase64: "a".repeat(4 * 1024 * 1024),
            concerns: ["redness"],
          }),
        )
      ).status,
    ).toBe(413);
    expect((await plan(req({ claims: " " }))).status).toBe(400);
  });
  it("only exposes public mode flags, never credentials", async () => {
    vi.stubEnv("YOUCAM_API_KEY", "unit-test-secret");
    vi.stubEnv("DEMO_PASSCODE", "private");
    const response = await config();
    expect(await response.json()).toEqual({
      mode: "live",
      passcodeRequired: true,
      narrationAvailable: false,
    });
  });
  it("returns built-in narration without a Nebius key", async () => {
    const response = await narrate(
      req({ diary: sampleDiary(todayLocal()), today: todayLocal() }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).source).toBe("template");
    expect(fetch).not.toHaveBeenCalled();
  });
});
