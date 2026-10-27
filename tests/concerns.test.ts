import { describe, expect, it } from "vitest";
import { planClaims, validateConcerns } from "@/lib/concerns";
describe("claim mapping", () => {
  it("maps the advertised redness and pore claim", () => {
    expect(
      planClaims("reduces redness and visible pores in 14 days").concerns,
    ).toEqual(["redness", "pore"]);
  });
  it.each([
    ["acne and breakouts", "acne"],
    ["rough texture", "texture"],
    ["dark spots and pigmentation", "age_spot"],
    ["fine lines", "wrinkle"],
    ["dry skin and hydration", "moisture"],
    ["oil and shine", "oiliness"],
    ["glow and dullness", "radiance"],
    ["dark circles", "dark_circle_v2"],
    ["eye bags and puffiness", "eye_bag"],
    ["firming and elasticity", "firmness"],
  ])("maps %s", (claim, concern) => {
    expect(planClaims(claim).concerns).toEqual([concern]);
  });
  it("caps the first matching claims at four without duplicates", () => {
    expect(
      planClaims("glow, redness, red, pores, hydration, acne").concerns,
    ).toEqual(["radiance", "redness", "pore", "moisture"]);
  });
  it("gives a reason grounded in the exact keyword", () => {
    expect(planClaims("Visible Pores").reasons[0].reason).toContain("Pores");
  });
  it("does not invent concerns for unsupported promises", () => {
    expect(planClaims("100% vegan with a pleasant scent").concerns).toEqual([]);
  });
  it.each([
    [],
    ["redness", "redness"],
    ["skin_age"],
    ["acne", "pore", "texture", "redness", "wrinkle"],
    "redness",
    ["__proto__"],
  ])("rejects invalid concern selection %j", (value) => {
    expect(() => validateConcerns(value)).toThrow();
  });
});
