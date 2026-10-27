# Keep or Return

A personal skincare product diary for the YouCam API Skin AI & eCommerce hackathon. Turn a label’s claims into skin concerns, take a baseline and daily selfies, and compare the resulting scores before the return window closes. The interface is a dreamcore IBM-style computer with an SVG timeline and a thermal decision receipt.

Built with Next.js 16.4.3, React 19.3, TypeScript, and Tailwind CSS v4. Target: Vercel. No accounts or database are required.

## Run locally

Use Node.js 20.9+ (Node.js 22 recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Empty credentials give a fully working synthetic mode. **Load sample diary** opens an invented product with 14 synthetic daily check-ins, a timeline, mask illustration, verdict, and reminder. This uses no API units and needs no selfie.

| Environment variable | Purpose                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YOUCAM_API_KEY`     | Server-only YouCam Bearer token. Empty means mock analysis; populated means live analysis.                                                                       |
| `NEBIUS_API_KEY`     | Optional two-sentence narration using Nemotron on Nebius. Empty or unsuccessful responses use a template.                                                        |
| `DEMO_PASSCODE`      | Optional access code required by the analysis and narration routes. Submitted in the JSON body. The UI shows the field only when the server says it is required. |
| `ANALYZE_DAILY_CAP`  | Analysis-request cap per UTC day, default `30`. Set `0` to disable analysis. Also limited to `3` requests per IP per UTC day.                                    |

Never use a `NEXT_PUBLIC_` variable for a credential. The application does not log provider response bodies, credentials, signed upload URLs, or uploaded photos. `.env*` files are ignored except for the empty `.env.example`.

## YouCam Skin Analysis v2

The server integration is `src/lib/youcam.ts`. API host: `https://yce-api-01.makeupar.com`. Authenticated API calls use `Authorization: Bearer <YOUCAM_API_KEY>`.

1. `POST /s2s/v2.0/file/skin-analysis` registers JPEG content type, filename, and byte size.
2. Upload JPEG bytes to the returned signed URL using its `PUT` method and headers. The YouCam API credential is not forwarded to the upload host.
3. `POST /s2s/v2.0/task/skin-analysis` supplies `src_file_id`, up to four SD `dst_actions`, `miniserver_args: { enable_mask_overlay: true }`, and `format: "json"`.
4. `GET /s2s/v2.0/task/skin-analysis/{task_id}` polls every two seconds for up to sixty seconds. Scores are parsed from the output array or concern-keyed `score_info` objects. Aggregate `all` and `skin_age` results are ignored. Incomplete concern results are rejected.

Supported concerns: `acne`, `redness`, `pore`, `texture`, `age_spot`, `wrinkle`, `moisture`, `oiliness`, `radiance`, `dark_circle_v2`, `eye_bag`, and `firmness`. Deterministic keywords select the first four distinct matches in claim order; unsupported claims ask the shopper to provide more specific label wording.

Face-too-small, dark-lighting, no-face, out-of-bounds, and below-minimum-size errors produce friendly retake instructions. Live failures never silently become synthetic results. Successful responses include score pairs, a mask URL when available, mode, and a timing trace.

Camera capture loads `https://plugins-media.makeupar.com/v2.2-camera-kit/sdk.js` only when requested. It initializes `YMK` with `faceDetectionMode: 'skincare'` and `imageFormat: 'base64'`, listens for `faceDetectionCaptured`, and mounts in `#YMK-module`. A plain file upload remains available if the SDK, permissions, or domain configuration are unavailable. Camera access requires localhost or HTTPS; configure any required YouCam allowed origins for your deployment.

The browser resizes photos to at most 1600 pixels on the long side, rejects short sides below 480 pixels, and converts to JPEG at quality 0.9. Very narrow images are rejected rather than enlarged. A 160-pixel JPEG thumbnail is the only selfie retained in the diary. The API caps the entire JSON request at 4 MiB, including base64 overhead, and validates the concern whitelist and JPEG payload before reserving budget.

## Routes and storage

| Route               | Request / response                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/config`   | Public mode, access-code-required, and narration-available flags only.                                                                                               |
| `POST /api/plan`    | `{ claims }` → `{ concerns, reasons }`; no model or API units used.                                                                                                  |
| `POST /api/analyze` | `{ imageBase64, concerns, passcode? }` → `{ scores, maskUrl, mode, trace }`. Friendly 400/401/413/422/429/502/504 responses.                                         |
| `POST /api/narrate` | `{ diary, today, passcode? }` → `{ text, source }`. Recomputes the deterministic verdict and sends only numerical verdict facts to Nebius. Separate narration quota. |

Diaries are stored in `localStorage` under `keep-or-return.diaries.v1`. Up to 20 products and 366 daily entries per product are supported. Each entry records the local calendar date, raw/UI scores, mode, timing trace, thumbnail, and optional remote mask URL. Mask URLs may expire; scores remain available. Live and synthetic entries cannot be combined. The analysis route does not persist original photos. Your photos are processed by YouCam in live mode; the Camera Kit is a separately loaded YouCam service.

JSON export/import preserves the versioned diary, validates its schema, rejects unsafe image URLs, and keeps existing products when importing. Exports contain thumbnails: keep them private. Browser data removal deletes local diaries; export a backup first. Storage quota failures show a notice so you can export the in-memory diary.

## Verdict and reminder

Higher raw scores are treated as better skin-condition scores. Each concern’s exact change is the latest raw score minus its day-0 baseline; the verdict uses their arithmetic mean. UI scores do not drive the verdict.

- Fewer than three distinct daily check-ins, fewer than five elapsed days, missing tracked scores, or mixed modes: **TOO EARLY**.
- Average change **≥ +3**: **KEEP**.
- Average change **≤ +1**, including deterioration: **RETURN**.
- Between +1 and +3: **TOO EARLY / keep watching** until two days before the deadline, then **RETURN** because evidence remains borderline.

The receipt shows per-concern raw deltas to four decimal places, the average rounded to two decimal places, and days left. Threshold comparisons use the unrounded average. The `.ics` download creates an all-day “Return by” event on the recorded deadline, with an alarm two days earlier. Confirm the deadline and eligibility with the retailer. Dates use calendar-day arithmetic to avoid daylight-saving offsets. An expired window is labeled explicitly; insufficient observations never become a confident verdict just because time ran out.

The thresholds are transparent demo heuristics, not clinically validated noise thresholds or proof of product efficacy. Lighting, routine, and other factors can change scores. This is a personal tracking aid, not a diagnosis. Consistent photo tips are shown before capture.

Optional narration uses Nebius Token Factory: `https://api.tokenfactory.nebius.com/v1/chat/completions`, model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, eight-second timeout, strict two-sentence output, no photos or product names sent to the model. Output numbers must be present in the supplied numerical facts; unsupported numbers, number words, percentage conversions, markup, or changed verdict labels trigger the built-in template. The model never calculates or changes the verdict.

## Budget and deployment

The in-memory limiter is shared through `globalThis` within a running process. Authenticated, valid analysis attempts consume budget, including provider failures or cancelled requests, because they may already have consumed vendor units. Mock analysis also exercises the guard. A request may track up to four concerns; the request cap is not a claim about YouCam’s billing units. Loading the sample does not call the analysis route.

**The cap is per server instance.** Serverless scale-out and cold starts can create or reset counters. For a hard deployment-wide cap, replace the in-memory limiter with an atomic shared store and configure provider-side limits. On Vercel only the overwritten `x-vercel-forwarded-for` header is trusted; other hosts must overwrite forwarded IP headers at their reverse proxy.

`vercel.json` uses `npm install --include=dev`. The analysis route uses the Node runtime with a 120-second maximum duration to allow upload, task creation, and polling. Set the environment variables in the deployment environment and configure the provider origin requirements. This repository does not automatically deploy or push.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run lint
```

Vitest covers claim mapping, both response formats, request payloads, mocked polling and failures, verdict boundaries, deltas, calendar reminders, input/budget/access guards, narration validation, import/export, and mock end-to-end routes. Tests replace global fetch with a throwing stub and inject mocked responses: no test makes a real YouCam or Nebius call.

The reference’s Vitest 3.2.7 version is retained. Its development-only dependency tree currently has npm audit advisories in Vitest, mocker, and tinypool; upgrading the test runner requires moving beyond the requested reference version. `npm audit --omit=dev` reports no production dependency vulnerabilities.

MIT License — Kulraj Singh, 2026.
