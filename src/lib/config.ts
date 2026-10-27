import "server-only";
import type { Mode } from "./types";
export function runtimeConfig(): {
  mode: Mode;
  passcodeRequired: boolean;
  narrationAvailable: boolean;
} {
  return {
    mode: process.env.YOUCAM_API_KEY?.trim() ? "live" : "mock",
    passcodeRequired: Boolean(process.env.DEMO_PASSCODE),
    narrationAvailable: Boolean(process.env.NEBIUS_API_KEY?.trim()),
  };
}
