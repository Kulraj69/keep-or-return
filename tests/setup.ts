import { beforeEach, afterEach, vi } from "vitest";
beforeEach(() => {
  // No test may accidentally reach YouCam, Nebius, or any other network service.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request in test");
    }),
  );
  vi.stubEnv("YOUCAM_API_KEY", "");
  vi.stubEnv("NEBIUS_API_KEY", "");
  vi.stubEnv("DEMO_PASSCODE", "");
  vi.stubEnv("ANALYZE_DAILY_CAP", "30");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
