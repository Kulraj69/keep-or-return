import "server-only";
import { AppError } from "./errors";
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export async function readJson(
  request: Request,
  max = MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AppError("Send this request as JSON.", 415);
  if (Number(request.headers.get("content-length")) > max)
    throw new AppError(
      "That upload is too large. Use a photo under 4 MB after resizing.",
      413,
    );
  if (!request.body) throw new AppError("The request was empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new AppError(
          "That upload is too large. Use a photo under 4 MB after resizing.",
          413,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("We couldn’t read this request. Please try again.");
  } finally {
    reader.releaseLock();
  }
}
export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export function errorResponse(error: unknown) {
  return json(
    {
      error:
        error instanceof AppError
          ? error.message
          : "Something went wrong. Please try again.",
      trace: [],
    },
    error instanceof AppError ? error.status : 500,
  );
}
export function decodePhoto(value: unknown): Uint8Array {
  if (typeof value !== "string")
    throw new AppError("Choose a JPEG photo first.");
  const encoded = value.replace(/^data:image\/jpeg;base64,/, "");
  if (
    !encoded.length ||
    encoded.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new AppError("The photo isn’t a valid JPEG. Please choose it again.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > MAX_BODY_BYTES)
    throw new AppError("The photo must be under 4 MB.", 413);
  if (
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    throw new AppError(
      "Use a JPEG photo. The upload tool can convert PNG and WebP photos for you.",
    );
  return bytes;
}
