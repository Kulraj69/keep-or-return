import { CONCERNS, type Concern, type Plan } from "./types";

export const LABELS: Record<Concern, string> = {
  acne: "Acne",
  redness: "Redness",
  pore: "Pores",
  texture: "Texture",
  age_spot: "Dark spots",
  wrinkle: "Fine lines",
  moisture: "Hydration",
  oiliness: "Oiliness",
  radiance: "Radiance",
  dark_circle_v2: "Dark circles",
  eye_bag: "Eye bags",
  firmness: "Firmness",
};
const keywords: Record<Concern, RegExp> = {
  acne: /\b(acne|pimples?|blemishes|blemish|breakouts?)\b/i,
  redness: /\b(redness|red|rosacea)\b/i,
  pore: /\b(pores?)\b/i,
  texture: /\b(texture|smooth\w*|rough\w*)\b/i,
  age_spot:
    /\b((?:dark|age|sun)[ -]?spots?|spots?|pigmentation|hyperpigmentation|uneven[ -]tone)\b/i,
  wrinkle: /\b(wrinkles?|fine[ -]lines?)\b/i,
  moisture: /\b(hydrat\w*|moistur\w*|dry\w*|dehydrat\w*)\b/i,
  oiliness: /\b(oil\w*|shine|shiny|sebum)\b/i,
  radiance: /\b(radian\w*|glow\w*|dull\w*|brighten\w*)\b/i,
  dark_circle_v2: /\b(dark[ -]circles?|under[ -]?eye[ -]dark\w*)\b/i,
  eye_bag: /\b(eye[ -]?bags?|puffy[ -]eyes?|puffiness)\b/i,
  firmness: /\b(firm\w*|elastic\w*|sagging|tighten\w*)\b/i,
};

export function isConcern(value: unknown): value is Concern {
  return typeof value === "string" && CONCERNS.includes(value as Concern);
}
export function validateConcerns(value: unknown): Concern[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 4 ||
    !value.every(isConcern) ||
    new Set(value).size !== value.length
  )
    throw new Error("Choose 1–4 different skin concerns.");
  return value;
}

export function planClaims(claims: string): Plan {
  // Claim order is the priority, with the whitelist order breaking ties.
  const matches = CONCERNS.flatMap((concern) => {
    const match = keywords[concern].exec(claims);
    return match ? [{ concern, index: match.index, word: match[0] }] : [];
  })
    .sort((a, b) => a.index - b.index)
    .slice(0, 4);
  return {
    concerns: matches.map(({ concern }) => concern),
    reasons: matches.map(({ concern, word }) => ({
      concern,
      reason: `“${word}” maps to YouCam ${concern}.`,
    })),
  };
}
