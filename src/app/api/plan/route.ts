import { planClaims } from "@/lib/concerns";
import { AppError } from "@/lib/errors";
import { errorResponse, json, readJson } from "@/lib/http";
export async function POST(request: Request) {
  try {
    const { claims } = await readJson(request, 16_384);
    if (typeof claims !== "string" || !claims.trim() || claims.length > 2000)
      throw new AppError("Add the product’s claims, up to 2,000 characters.");
    return json(planClaims(claims));
  } catch (error) {
    return errorResponse(error);
  }
}
