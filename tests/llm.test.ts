import { describe, expect, it, vi } from "vitest";
import {
  narrateVerdict,
  narrationFacts,
  narrationNumbersValid,
} from "@/lib/llm";
import { getVerdict } from "@/lib/verdict";
import { sampleDiary } from "@/lib/diary";
const verdict = getVerdict(sampleDiary("2026-10-27"), "2026-10-27");
const model = (text: string) =>
  vi.fn(async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify({ text }) } }],
    }),
  );
describe("grounded Nebius narration", () => {
  it("cannot bypass validation with leading decimals or alternate number notation", () => {
    expect(narrationNumbersValid(".5 points.", { change: 5 })).toBe(false);
    expect(narrationNumbersValid(".5 points.", { change: 0.5 })).toBe(true);
    for (const text of [
      "twenty points.",
      "minus 5 points.",
      "٥ points.",
      "½ point.",
      "5 percent.",
      "1/5 points.",
    ]) {
      expect(narrationNumbersValid(text, { change: 5, count: 1 })).toBe(false);
    }
  });
  it("accepts only input numbers, including signed decimals", () => {
    expect(
      narrationNumbersValid("Change +3.25 points, 8 days.", {
        change: 3.25,
        days: 8,
      }),
    ).toBe(true);
    expect(
      narrationNumbersValid("Change -3.25 points.", { change: 3.25 }),
    ).toBe(false);
  });
  it("rejects invented numbers, percent conversions, and number words", () => {
    expect(narrationNumbersValid("99 points.", { score: 3 })).toBe(false);
    expect(narrationNumbersValid("3% better.", { score: 3 })).toBe(false);
    expect(narrationNumbersValid("three points.", { score: 3 })).toBe(false);
    expect(narrationNumbersValid("1e3 points.", { score: 1, count: 3 })).toBe(
      false,
    );
  });
  it("ignores digits inside concern identifiers as input numbers", () => {
    expect(
      narrationNumbersValid("2 days.", { concern: "dark_circle_v2" }),
    ).toBe(false);
  });
  it("uses the template without a key and makes no request", async () => {
    const output = await narrateVerdict(verdict);
    expect(output.source).toBe("template");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts exactly two grounded sentences", async () => {
    const text = `KEEP: the observed average change is ${narrationFacts(verdict).averageChange} points. There are 8 days left.`;
    const output = await narrateVerdict(verdict, {
      apiKey: "test",
      fetch: model(text) as typeof fetch,
    });
    expect(output).toEqual({ text, source: "nebius" });
  });
  it("falls back if the narration invents a number", async () => {
    expect(
      (
        await narrateVerdict(verdict, {
          apiKey: "test",
          fetch: model(
            "KEEP: you improved by 99 points. There are 8 days left.",
          ) as typeof fetch,
        })
      ).source,
    ).toBe("template");
  });
  it("rejects a changed verdict, extra sentences, and markup", async () => {
    for (const text of [
      "RETURN: no improvement. There are 8 days left.",
      "KEEP is suggested. You improved. Keep watching.",
      "<b>KEEP</b> is suggested. There are 8 days left.",
    ])
      expect(
        (
          await narrateVerdict(verdict, {
            apiKey: "test",
            fetch: model(text) as typeof fetch,
          })
        ).source,
      ).toBe("template");
  });
  it("returns the template on failure and never exposes the key", async () => {
    const output = await narrateVerdict(verdict, {
      apiKey: "test-secret",
      fetch: (async () => {
        throw new Error("test-secret");
      }) as typeof fetch,
    });
    expect(output.source).toBe("template");
    expect(JSON.stringify(output)).not.toContain("test-secret");
  });
  it("passes only structured numerical facts to the model", async () => {
    const fetcher = model("KEEP is suggested. There are 8 days left.");
    await narrateVerdict(verdict, {
      apiKey: "test",
      fetch: fetcher as typeof fetch,
    });
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    const request = JSON.parse(calls[0][1].body as string);
    const input = JSON.parse(request.messages[1].content);
    expect(input).toEqual(narrationFacts(verdict));
    expect(input).not.toHaveProperty("imageBase64");
  });
});
