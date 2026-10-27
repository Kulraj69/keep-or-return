import { describe, expect, it } from "vitest";
import fixture from "./fixtures-real-shape.json";
import { parseScores } from "@/lib/youcam";

describe("real YouCam v2 response shape (captured 2026-10-27, URLs redacted)", () => {
  it("parses SD scores and ignores all/skin_age/resize_image entries", () => {
    const out = parseScores(fixture, ["acne", "redness", "pore", "texture"]);
    expect(out.scores.map((s) => [s.concern, s.ui_score])).toEqual([["acne", 99], ["redness", 97], ["pore", 80], ["texture", 75]]);
    expect(out.maskUrl).toMatch(/^https:\/\/example.com\//);
  });
});
