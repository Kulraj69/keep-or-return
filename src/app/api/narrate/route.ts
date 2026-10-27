import { validateDiary } from "@/lib/diary";
import { AppError } from "@/lib/errors";
import { errorResponse, json, readJson } from "@/lib/http";
import { narrateVerdict } from "@/lib/llm";
import { clientIp, narrationLimiter, validPasscode } from "@/lib/rate-limit";
import { getVerdict } from "@/lib/verdict";
import { validDate } from "@/lib/dates";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await readJson(request, 500_000);
    if (!validPasscode(body.passcode))
      return json(
        {
          error: "Enter the access code to request narration.",
          passcodeRequired: true,
        },
        401,
      );
    const limit = narrationLimiter().take(clientIp(request));
    if (!limit.ok)
      return json({ error: limit.note, retryAfter: limit.retryAfter }, 429, {
        "Retry-After": String(limit.retryAfter),
      });
    let diary;
    try {
      diary = validateDiary(body.diary);
    } catch {
      throw new AppError("This diary could not be read.");
    }
    if (
      !validDate(body.today) ||
      Math.abs(Date.parse(body.today) - Date.now()) > 2 * 86_400_000
    )
      throw new AppError("Refresh your diary to use today’s date.");
    return json(
      await narrateVerdict(getVerdict(diary, body.today), {
        apiKey: process.env.NEBIUS_API_KEY,
        signal: request.signal,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
