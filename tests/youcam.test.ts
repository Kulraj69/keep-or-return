import { describe, expect, it, vi } from "vitest";
import {
  analyzeYoucam,
  buildFileRequest,
  buildTaskRequest,
  mockAnalysis,
  parseScores,
  YOUCAM_HOST,
} from "@/lib/youcam";
import { RETAKE_MESSAGES } from "@/lib/errors";
const output = {
  data: {
    task_status: "success",
    results: {
      output: [
        {
          type: "redness",
          ui_score: 67,
          raw_score: 66.25,
          mask_urls: ["https://images.example/mask.jpg"],
        },
        { type: "skin_age", ui_score: 25, raw_score: 25 },
        { type: "all" },
      ],
    },
  },
};
const reserve = {
  data: {
    files: [
      {
        file_id: "file-1",
        requests: [
          {
            method: "PUT",
            url: "https://uploads.example/photo",
            headers: {
              "Content-Type": "image/jpeg",
              "x-upload-token": "signed-header",
            },
          },
        ],
      },
    ],
  },
};
function fetchQueue(bodies: unknown[]) {
  return vi.fn(async () => {
    if (!bodies.length) throw new Error("No more mock responses");
    return Response.json(bodies.shift());
  });
}
describe("YouCam v2 integration", () => {
  it("builds the upload metadata", () => {
    expect(buildFileRequest("photo.jpg", 1024)).toEqual({
      files: [
        { content_type: "image/jpeg", file_name: "photo.jpg", file_size: 1024 },
      ],
    });
  });
  it("builds the SD concern task with mask overlays", () => {
    expect(buildTaskRequest("file-1", ["pore", "redness"])).toEqual({
      src_file_id: "file-1",
      dst_actions: ["pore", "redness"],
      miniserver_args: { enable_mask_overlay: true },
      format: "json",
    });
  });
  it("parses the output array and skips aggregate fields", () => {
    expect(parseScores(output, ["redness"])).toEqual({
      scores: [{ concern: "redness", ui_score: 67, raw_score: 66.25 }],
      maskUrl: "https://images.example/mask.jpg",
    });
  });
  it("parses concern keyed score_info", () => {
    expect(
      parseScores(
        {
          data: {
            results: {
              output: {
                score_info: { pore: { ui_score: 80, raw_score: 79.7 } },
              },
            },
          },
        },
        ["pore"],
      ).scores[0].raw_score,
    ).toBe(79.7);
  });
  it("parses direct score_info and per-item score_info including zero scores", () => {
    expect(
      parseScores({ score_info: { pore: { ui_score: 0, raw_score: 0 } } }, [
        "pore",
      ]).scores[0].raw_score,
    ).toBe(0);
    expect(
      parseScores(
        {
          output: [
            { type: "pore", score_info: { ui_score: 20, raw_score: 20.1 } },
          ],
        },
        ["pore"],
      ).scores[0].raw_score,
    ).toBe(20.1);
  });
  it("rejects incomplete, nonfinite, and string scores", () => {
    expect(() => parseScores(output, ["pore"])).toThrow("incomplete");
    expect(() =>
      parseScores({ pore: { ui_score: 2, raw_score: NaN } }, ["pore"]),
    ).toThrow();
    expect(() =>
      parseScores({ pore: { ui_score: "2", raw_score: 2 } }, ["pore"]),
    ).toThrow();
  });
  it("rejects unsafe mask URLs", () => {
    expect(
      parseScores(
        {
          pore: {
            ui_score: 2,
            raw_score: 2,
            mask_urls: ["javascript:alert(1)"],
          },
        },
        ["pore"],
      ).maskUrl,
    ).toBeNull();
  });
  it("uploads only to the signed URL, polls every two seconds, and returns no credential", async () => {
    const fetcher = fetchQueue([
      reserve,
      {},
      { data: { task_id: "task/1" } },
      { data: { task_status: "running" } },
      output,
    ]);
    const sleep = vi.fn(async () => {});
    const result = await analyzeYoucam(new Uint8Array([1, 2, 3]), ["redness"], {
      apiKey: "unit-test-secret",
      fetch: fetcher as typeof fetch,
      sleep,
    });
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe(`${YOUCAM_HOST}/s2s/v2.0/file/skin-analysis`);
    expect(calls[0][1].headers).toMatchObject({
      Authorization: "Bearer unit-test-secret",
    });
    expect(calls[1][1]).toMatchObject({
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        "x-upload-token": "signed-header",
      },
    });
    expect(calls[1][1].headers).not.toHaveProperty("Authorization");
    expect(calls[3][0]).toContain("task%2F1");
    expect(sleep.mock.calls).toEqual([[2000], [2000]]);
    expect(result.trace).toHaveLength(4);
    expect(result.mode).toBe("live");
    expect(JSON.stringify(result)).not.toContain("unit-test-secret");
  });
  it.each(Object.entries(RETAKE_MESSAGES))(
    "maps %s to a friendly retake message",
    async (code, message) => {
      const fetcher = fetchQueue([
        reserve,
        {},
        { data: { task_id: "t" } },
        { data: { task_status: "error", error: { code } } },
      ]);
      await expect(
        analyzeYoucam(new Uint8Array([1]), ["redness"], {
          apiKey: "test",
          fetch: fetcher as typeof fetch,
          sleep: async () => {},
        }),
      ).rejects.toThrow(message);
    },
  );
  it("stops polling at sixty seconds", async () => {
    let clock = 0;
    const first = [reserve, {}, { data: { task_id: "t" } }];
    const fetcher = vi.fn(async () =>
      Response.json(
        first.length ? first.shift() : { data: { task_status: "running" } },
      ),
    );
    await expect(
      analyzeYoucam(new Uint8Array([1]), ["redness"], {
        apiKey: "test",
        fetch: fetcher as typeof fetch,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      }),
    ).rejects.toMatchObject({ status: 504 });
    expect(clock).toBe(60000);
    expect(fetcher.mock.calls.length).toBe(32);
  });
  it("sanitizes unexpected errors instead of returning provider details", async () => {
    await expect(
      analyzeYoucam(new Uint8Array([1]), ["redness"], {
        apiKey: "test-secret",
        fetch: (async () => {
          throw new Error("test-secret");
        }) as typeof fetch,
      }),
    ).rejects.toThrow("unavailable");
  });
  it("does not fall back to synthetic results on live failure", async () => {
    await expect(
      analyzeYoucam(new Uint8Array([1]), ["redness"], {
        apiKey: "test",
        fetch: (async () =>
          Response.json({ error: "bad key" }, { status: 401 })) as typeof fetch,
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("produces deterministic mock scores without a request", () => {
    const bytes = new Uint8Array([42, 17]);
    expect(mockAnalysis(bytes, ["redness"])).toEqual(
      mockAnalysis(bytes, ["redness"]),
    );
    expect(mockAnalysis(bytes, ["redness"]).mode).toBe("mock");
    expect(fetch).not.toHaveBeenCalled();
  });
});
