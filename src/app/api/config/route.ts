import { runtimeConfig } from "@/lib/config";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  return json(runtimeConfig());
}
