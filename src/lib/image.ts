export function resizeDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    Math.min(width, height) < 480
  )
    throw new Error(
      "Choose a larger photo. The short side needs at least 480 pixels.",
    );
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const resized = {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
  if (Math.min(resized.width, resized.height) < 480)
    throw new Error(
      "That photo is too narrow. Use a portrait or square photo with your full face in frame.",
    );
  return resized;
}
export async function preparePhoto(
  source: File | string,
): Promise<{ imageBase64: string; thumbnail: string }> {
  if (
    source instanceof File &&
    (!/^image\/(jpeg|png|webp)$/.test(source.type) ||
      source.size > 20 * 1024 * 1024)
  )
    throw new Error("Choose a JPEG, PNG, or WebP photo under 20 MB.");
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = resizeDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Photo resizing isn’t supported by this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.9);
    if (imageBase64.length > 3_900_000)
      throw new Error(
        "The resized photo is still too large. Try a simpler background.",
      );
    const thumbScale = 160 / Math.max(size.width, size.height);
    canvas.width = Math.round(size.width * thumbScale);
    canvas.height = Math.round(size.height * thumbScale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { imageBase64, thumbnail: canvas.toDataURL("image/jpeg", 0.65) };
  } finally {
    if (source instanceof File) URL.revokeObjectURL(url);
  }
}
