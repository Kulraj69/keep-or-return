export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export const RETAKE_MESSAGES: Record<string, string> = {
  error_src_face_too_small:
    "Move closer so your face fills the guide, then retake your photo.",
  error_lighting_dark:
    "Find soft, even daylight. Your photo is too dark to analyze reliably.",
  error_no_face:
    "We couldn’t find a face. Look straight at the camera and try again.",
  error_src_face_out_of_bound:
    "Keep your whole face inside the frame, including your forehead and chin.",
  error_below_min_image_size:
    "Use a larger photo: the short side must be at least 480 pixels.",
};
export function youcamError(body: unknown): AppError {
  const text = JSON.stringify(body) ?? "";
  const code = Object.keys(RETAKE_MESSAGES).find((key) => text.includes(key));
  return new AppError(
    code
      ? RETAKE_MESSAGES[code]
      : "Skin analysis couldn’t finish. Check your photo and try again later.",
    code ? 422 : 502,
  );
}
