import { validateConcerns } from "@/lib/concerns";
import { AppError } from "@/lib/errors";
import { decodePhoto, errorResponse, json, readJson } from "@/lib/http";
import { clientIp, limiter, validPasscode } from "@/lib/rate-limit";
import { analyzeYoucam, mockAnalysis } from "@/lib/youcam";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!validPasscode(body.passcode))
      return json(
        {
          error: "Enter the access code to run an analysis.",
          passcodeRequired: true,
        },
        401,
      );
    let concerns;
    try {
      concerns = validateConcerns(body.concerns);
    } catch {
      throw new AppError("Choose 1–4 different supported skin concerns.");
    }
    const bytes = decodePhoto(body.imageBase64);
    const limit = limiter().take(clientIp(request));
    if (!limit.ok)
      return json({ error: limit.note, retryAfter: limit.retryAfter }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    const key = process.env.YOUCAM_API_KEY?.trim();
    const result = key
      ? await analyzeYoucam(bytes, concerns, {
          apiKey: key,
          signal: request.signal,
        })
      : mockAnalysis(bytes, concerns);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
