import "server-only";
import { AppError, youcamError } from "./errors";
import { isConcern } from "./concerns";
import type { Analysis, Concern, Score, TraceStep } from "./types";

export const YOUCAM_HOST = "https://yce-api-01.makeupar.com";
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function buildFileRequest(fileName: string, fileSize: number) {
  return {
    files: [
      { content_type: "image/jpeg", file_name: fileName, file_size: fileSize },
    ],
  };
}
export function buildTaskRequest(fileId: string, concerns: Concern[]) {
  return {
    src_file_id: fileId,
    dst_actions: concerns,
    miniserver_args: { enable_mask_overlay: true },
    format: "json",
  };
}
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseScores(
  body: unknown,
  concerns: Concern[],
): Pick<Analysis, "scores" | "maskUrl"> {
  const root = record(body);
  const data = record(root.data ?? root);
  const results = record(data.results ?? data);
  const output =
    results.output ?? results.score_info ?? data.score_info ?? results;
  const found = new Map<Concern, Score>();
  let maskUrl: string | null = null;
  const visit = (value: unknown, hint?: string, depth = 0): void => {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, hint, depth + 1));
      return;
    }
    const item = record(value);
    const type = item.type ?? hint;
    const score = record(item.score_info ?? item);
    if (isConcern(type) && concerns.includes(type)) {
      const ui = score.ui_score,
        raw = score.raw_score;
      if (
        typeof ui === "number" &&
        Number.isFinite(ui) &&
        typeof raw === "number" &&
        Number.isFinite(raw)
      )
        found.set(type, { concern: type, ui_score: ui, raw_score: raw });
      const masks = item.mask_urls ?? score.mask_urls;
      if (!maskUrl && Array.isArray(masks))
        maskUrl = masks.map(httpsUrl).find(Boolean) ?? null;
    }
    for (const [key, nested] of Object.entries(item))
      if (nested && typeof nested === "object") visit(nested, key, depth + 1);
  };
  visit(output);
  if (concerns.some((concern) => !found.has(concern)))
    throw new AppError(
      "The analysis returned incomplete scores. Please retake your photo in even light.",
      502,
    );
  return { scores: concerns.map((concern) => found.get(concern)!), maskUrl };
}

type Options = {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
};
export async function analyzeYoucam(
  bytes: Uint8Array,
  concerns: Concern[],
  options: Options,
): Promise<Analysis> {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const trace: TraceStep[] = [];
  const overall = AbortSignal.timeout(100_000);
  const signal = options.signal
    ? AbortSignal.any([overall, options.signal])
    : overall;
  async function api(path: string, init?: RequestInit) {
    const response = await request(`${YOUCAM_HOST}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw youcamError(body);
    return record(body);
  }
  async function step<T>(name: string, fn: () => Promise<T>) {
    const start = now();
    const result = await fn();
    trace.push({ step: name, ms: Math.max(0, now() - start) });
    return result;
  }
  try {
    const upload = await step("Reserve upload", () =>
      api("/s2s/v2.0/file/skin-analysis", {
        method: "POST",
        body: JSON.stringify(
          buildFileRequest("check-in.jpg", bytes.byteLength),
        ),
      }),
    );
    const data = record(upload.data);
    const file = record(Array.isArray(data.files) ? data.files[0] : null);
    const requests = file.requests ?? data.requests;
    const signed = record(Array.isArray(requests) ? requests[0] : null);
    const url = httpsUrl(signed.url);
    if (
      typeof file.file_id !== "string" ||
      !url ||
      String(signed.method).toUpperCase() !== "PUT"
    )
      throw new AppError(
        "The photo upload could not be prepared. Please try again later.",
        502,
      );
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(record(signed.headers)))
      if (typeof value === "string") headers[key] = value;
    await step("Upload photo", async () => {
      const response = await request(url, {
        method: "PUT",
        headers,
        body: new Uint8Array(bytes),
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok)
        throw new AppError(
          "Your photo could not be uploaded. Please try again later.",
          502,
        );
    });
    const task = await step("Start skin analysis", () =>
      api("/s2s/v2.0/task/skin-analysis", {
        method: "POST",
        body: JSON.stringify(
          buildTaskRequest(file.file_id as string, concerns),
        ),
      }),
    );
    const taskId = record(task.data).task_id;
    if (typeof taskId !== "string" || !taskId) throw youcamError(task);
    const scores = await step("Wait for skin scores", async () => {
      const deadline = now() + 60_000;
      // A count bound also protects tests/injected clocks and stalled clocks.
      for (let attempt = 0; attempt < 30 && now() < deadline; attempt++) {
        await sleep(Math.min(2_000, deadline - now()));
        if (signal.aborted)
          throw new AppError(
            "Analysis timed out. Please try again later.",
            504,
          );
        const remaining = deadline - now();
        if (remaining <= 0) break;
        const response = await request(
          `${YOUCAM_HOST}/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${options.apiKey}` },
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(Math.max(1, Math.min(15_000, remaining))),
            ]),
          },
        );
        const result: unknown = await response.json();
        const resultData = record(record(result).data);
        if (!response.ok || resultData.task_status === "error")
          throw youcamError(result);
        if (resultData.task_status === "success")
          return parseScores(result, concerns);
      }
      throw new AppError(
        "Analysis is taking longer than a minute. Please try again later.",
        504,
      );
    });
    return { ...scores, mode: "live", trace };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Never expose provider responses, signed URLs, headers, or exception messages.
    throw new AppError(
      "Skin analysis is unavailable right now. Please try again later.",
      502,
    );
  }
}

export function mockAnalysis(bytes: Uint8Array, concerns: Concern[]): Analysis {
  let seed = 2166136261;
  for (const byte of bytes) seed = Math.imul(seed ^ byte, 16777619) >>> 0;
  return {
    scores: concerns.map((concern, index) => {
      const raw_score = Number(
        (55 + ((seed + index * 997) % 1800) / 100).toFixed(2),
      );
      return { concern, raw_score, ui_score: Math.round(raw_score) };
    }),
    maskUrl: "/demo-mask.svg",
    mode: "mock",
    trace: [{ step: "Synthetic analysis · no API units used", ms: 0 }],
  };
}
