export const CONCERNS = [
  "acne",
  "redness",
  "pore",
  "texture",
  "age_spot",
  "wrinkle",
  "moisture",
  "oiliness",
  "radiance",
  "dark_circle_v2",
  "eye_bag",
  "firmness",
] as const;
export type Concern = (typeof CONCERNS)[number];
export type Mode = "live" | "mock";
export type Score = { concern: Concern; ui_score: number; raw_score: number };
export type TraceStep = { step: string; ms: number };
export type Analysis = {
  scores: Score[];
  maskUrl: string | null;
  mode: Mode;
  trace: TraceStep[];
};
export type Plan = {
  concerns: Concern[];
  reasons: { concern: Concern; reason: string }[];
};
export type Product = {
  name: string;
  price: number;
  retailer: string;
  purchaseDate: string;
  returnDeadline: string;
  claims: string;
};
export type CheckIn = Analysis & {
  id: string;
  date: string;
  thumbnail: string | null;
};
export type Diary = {
  id: string;
  product: Product;
  plan: Plan;
  checkIns: CheckIn[];
  synthetic: boolean;
};
export type DiaryStore = {
  version: 1;
  diaries: Diary[];
  activeId: string | null;
};
export type Delta = {
  concern: Concern;
  baseline: number;
  latest: number;
  change: number;
};
export type Verdict = {
  decision: "KEEP" | "RETURN" | "TOO EARLY";
  reason: string;
  deltas: Delta[];
  average: number | null;
  daysLeft: number;
  span: number;
  count: number;
  borderline: boolean;
};
