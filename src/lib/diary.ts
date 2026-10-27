import { isConcern, validateConcerns } from "./concerns";
import { addDays, todayLocal, validDate } from "./dates";
import type { CheckIn, Diary, DiaryStore, Product } from "./types";
export const STORAGE_KEY = "keep-or-return.diaries.v1";
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function validateProduct(value: unknown): Product {
  const p = object(value);
  if (
    !text(p.name, 120) ||
    !text(p.retailer, 120) ||
    !text(p.claims, 2000) ||
    typeof p.price !== "number" ||
    !Number.isFinite(p.price) ||
    p.price < 0 ||
    p.price > 1_000_000 ||
    !validDate(p.purchaseDate) ||
    !validDate(p.returnDeadline) ||
    p.returnDeadline < p.purchaseDate
  )
    throw new Error(
      "Check the product details. The return deadline must be on or after the purchase date.",
    );
  return {
    name: (p.name as string).trim(),
    retailer: (p.retailer as string).trim(),
    claims: (p.claims as string).trim(),
    price: p.price,
    purchaseDate: p.purchaseDate,
    returnDeadline: p.returnDeadline,
  };
}
function safeMask(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value === "/demo-mask.svg") return value;
  if (typeof value === "string" && value.length <= 8192) {
    try {
      const u = new URL(value);
      if (u.protocol === "https:" && !u.username && !u.password) return u.href;
    } catch {}
  }
  throw new Error("The diary contains an invalid mask URL.");
}
export function validateDiary(value: unknown): Diary {
  const d = object(value),
    p = object(d.plan);
  if (
    !text(d.id, 100) ||
    !/^[\w-]+$/.test(d.id as string) ||
    typeof d.synthetic !== "boolean" ||
    !Array.isArray(d.checkIns) ||
    d.checkIns.length > 366
  )
    throw new Error("This diary format isn’t supported.");
  const product = validateProduct(d.product);
  const concerns = validateConcerns(p.concerns);
  const reasons = concerns.map((concern) => {
    const source = Array.isArray(p.reasons)
      ? object(p.reasons.find((r) => object(r).concern === concern))
      : {};
    return {
      concern,
      reason: text(source.reason, 300)
        ? (source.reason as string)
        : `Tracking YouCam ${concern}.`,
    };
  });
  const checkIns: CheckIn[] = d.checkIns.map((entry): CheckIn => {
    const e = object(entry);
    if (
      !text(e.id, 100) ||
      !validDate(e.date) ||
      e.date < product.purchaseDate ||
      (e.mode !== "mock" && e.mode !== "live") ||
      !Array.isArray(e.scores) ||
      e.scores.length !== concerns.length
    )
      throw new Error("The diary has an invalid check-in.");
    const scores = e.scores.map((score) => {
      const s = object(score);
      if (
        !isConcern(s.concern) ||
        !concerns.includes(s.concern) ||
        typeof s.raw_score !== "number" ||
        !Number.isFinite(s.raw_score) ||
        Math.abs(s.raw_score) > 1000 ||
        typeof s.ui_score !== "number" ||
        !Number.isFinite(s.ui_score) ||
        Math.abs(s.ui_score) > 1000
      )
        throw new Error("The diary has invalid skin scores.");
      return {
        concern: s.concern,
        raw_score: s.raw_score,
        ui_score: s.ui_score,
      };
    });
    if (new Set(scores.map((s) => s.concern)).size !== concerns.length)
      throw new Error("The diary contains duplicate concerns.");
    if (
      e.thumbnail !== null &&
      e.thumbnail !== undefined &&
      (typeof e.thumbnail !== "string" ||
        e.thumbnail.length > 70_000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(e.thumbnail))
    )
      throw new Error("Only small JPEG thumbnails can be imported.");
    const trace = Array.isArray(e.trace)
      ? e.trace.slice(0, 10).map((step) => {
          const t = object(step);
          return {
            step: text(t.step, 100) ? (t.step as string) : "Analysis",
            ms:
              typeof t.ms === "number" && Number.isFinite(t.ms) && t.ms >= 0
                ? t.ms
                : 0,
          };
        })
      : [];
    return {
      id: e.id as string,
      date: e.date,
      mode: e.mode,
      scores,
      maskUrl: safeMask(e.maskUrl),
      thumbnail: (e.thumbnail as string | null) ?? null,
      trace,
    };
  });
  if (
    new Set(checkIns.map((e) => e.date)).size !== checkIns.length ||
    new Set(checkIns.map((e) => e.id)).size !== checkIns.length
  )
    throw new Error("Only one check-in per day is supported.");
  if (
    new Set(checkIns.map((e) => e.mode)).size > 1 ||
    (d.synthetic && checkIns.some((e) => e.mode !== "mock"))
  )
    throw new Error(
      "Live and synthetic scores must be kept in separate diaries.",
    );
  return {
    id: d.id as string,
    product,
    plan: { concerns, reasons },
    checkIns: checkIns.sort((a, b) => a.date.localeCompare(b.date)),
    synthetic: d.synthetic || checkIns.some((e) => e.mode === "mock"),
  };
}
export function parseStore(input: string): DiaryStore {
  if (new TextEncoder().encode(input).length > MAX_IMPORT_BYTES)
    throw new Error("Keep the diary file under 4 MB.");
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error("Choose a valid diary JSON export.");
  }
  const data = object(value);
  if (
    data.version !== 1 ||
    !Array.isArray(data.diaries) ||
    data.diaries.length > 20
  )
    throw new Error(
      "Choose a Keep or Return diary export (version 1, up to 20 products).",
    );
  const diaries = data.diaries.map(validateDiary);
  if (new Set(diaries.map((d) => d.id)).size !== diaries.length)
    throw new Error("The file contains duplicate diaries.");
  return {
    version: 1,
    diaries,
    activeId: diaries.some((d) => d.id === data.activeId)
      ? (data.activeId as string)
      : (diaries[0]?.id ?? null),
  };
}
export function sampleDiary(today = todayLocal()): Diary {
  const start = addDays(today, -13);
  return {
    id: "sample-diary",
    synthetic: true,
    product: {
      name: "Cloud Calm Barrier Serum",
      price: 32,
      retailer: "The Sunday Shelf (sample)",
      purchaseDate: start,
      returnDeadline: addDays(start, 21),
      claims:
        "Reduces redness and visible pores. Hydrates dry skin in 14 days.",
    },
    plan: {
      concerns: ["redness", "pore", "moisture"],
      reasons: [
        { concern: "redness", reason: "“Redness” maps to YouCam redness." },
        { concern: "pore", reason: "“Pores” maps to YouCam pore." },
        { concern: "moisture", reason: "“Hydrates” maps to YouCam moisture." },
      ],
    },
    checkIns: Array.from({ length: 14 }, (_, day) => ({
      id: `sample-${day}`,
      date: addDays(start, day),
      mode: "mock",
      thumbnail: null,
      maskUrl: "/demo-mask.svg",
      scores: (["redness", "pore", "moisture"] as const).map((concern, i) => {
        const raw_score = Number(
          (
            [52, 61, 48][i] +
            day * [0.65, 0.3, 0.5][i] +
            (day === 0 ? 0 : [0.2, -0.5, 0.3, -0.1][day % 4])
          ).toFixed(2),
        );
        return { concern, raw_score, ui_score: Math.round(raw_score) };
      }),
      trace: [{ step: "Synthetic sample · no photo analyzed", ms: 0 }],
    })),
  };
}
