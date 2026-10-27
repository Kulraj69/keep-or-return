"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Camera as CameraIcon,
  Check,
  Download,
  FlaskConical,
  FolderOpen,
  LoaderCircle,
  Monitor,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { LABELS } from "@/lib/concerns";
import { addDays, daysBetween, prettyDate, todayLocal } from "@/lib/dates";
import {
  MAX_IMPORT_BYTES,
  parseStore,
  sampleDiary,
  STORAGE_KEY,
  validateProduct,
} from "@/lib/diary";
import { preparePhoto } from "@/lib/image";
import { makeReminder } from "@/lib/ics";
import type { Analysis, Diary, DiaryStore, Mode, Plan } from "@/lib/types";
import { getVerdict } from "@/lib/verdict";
import { Camera } from "./camera";
import { NightScene } from "./night-scene";
import { Receipt } from "./receipt";
import { Timeline } from "./timeline";

type Config = {
  mode: Mode;
  passcodeRequired: boolean;
  narrationAvailable: boolean;
};
const empty: DiaryStore = { version: 1, diaries: [], activeId: null };
function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className={`mode-badge ${mode}`}>
      <span />
      {mode === "mock"
        ? "Demo mode: synthetic scores"
        : "Live · YouCam Skin Analysis"}
    </span>
  );
}
function download(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KeepReturnApp({
  config,
  initialToday,
}: {
  config: Config;
  initialToday: string;
}) {
  const [store, setStore] = useState<DiaryStore>(empty);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(initialToday);
  const [creating, setCreating] = useState(true);
  const [busy, setBusy] = useState<
    "plan" | "photo" | "analyze" | "narrate" | "import" | null
  >(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passcode, setPasscode] = useState("");
  const [passcodeRequired, setPasscodeRequired] = useState(
    config.passcodeRequired,
  );
  const [photo, setPhoto] = useState<{
    imageBase64: string;
    thumbnail: string;
  } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [narration, setNarration] = useState<
    { text: string; source: string } | undefined
  >();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const active = store.diaries.find((d) => d.id === store.activeId);
  const diary = active ?? sampleDiary(today);
  const isPreview = !active;
  const verdict = getVerdict(diary, today);
  const selected =
    diary.checkIns.find((entry) => entry.date === selectedDate) ??
    diary.checkIns.at(-1);
  const hasToday = diary.checkIns.some((entry) => entry.date === today);
  const diaryMode =
    diary.checkIns[0]?.mode ?? (diary.synthetic ? "mock" : config.mode);
  const wrongMode = diaryMode !== config.mode;
  const canAnalyze = Boolean(
    active &&
    !hasToday &&
    !wrongMode &&
    active.id !== "sample-diary" &&
    active.product.purchaseDate <= today,
  );

  useEffect(() => {
    // Read after hydration; no automatic write can overwrite an unread diary.
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = parseStore(saved);
          setStore(parsed);
          setCreating(parsed.diaries.length === 0);
        }
      } catch {
        setError(
          "Your saved diary couldn’t be read. Nothing has been overwritten; import a valid JSON backup to recover it.",
        );
      }
      setReady(true);
      setToday(todayLocal());
    });
    let currentDate = todayLocal();
    const timer = setInterval(() => {
      const nextDate = todayLocal();
      if (nextDate !== currentDate) {
        currentDate = nextDate;
        setToday(nextDate);
        setNarration(undefined);
      }
    }, 60_000);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, []);

  function persist(next: DiaryStore) {
    setStore(next);
    try {
      const serialized = JSON.stringify(next);
      if (new TextEncoder().encode(serialized).length > MAX_IMPORT_BYTES)
        throw new Error();
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      setError(
        "This browser couldn’t save the diary, or local storage is full. Export a JSON backup now; your current session still has the data.",
      );
    }
  }
  function resetSelection() {
    setPhoto(null);
    setSelectedDate(null);
    setNarration(undefined);
    setDeleteConfirm(false);
    setError("");
    setNotice("");
    if (uploadRef.current) uploadRef.current.value = "";
  }
  function focusResults() {
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }
  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      if (store.diaries.length >= 20)
        throw new Error(
          "Your diary holds up to 20 products. Export and remove an older product first.",
        );
      const product = validateProduct({
        name: form.get("name"),
        price: Number(form.get("price")),
        retailer: form.get("retailer"),
        purchaseDate: form.get("purchaseDate"),
        returnDeadline: form.get("returnDeadline"),
        claims: form.get("claims"),
      });
      if (product.purchaseDate > today)
        throw new Error("Choose a purchase date of today or earlier.");
      setBusy("plan");
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claims: product.claims }),
        signal: AbortSignal.timeout(10_000),
      });
      const plan = (await response.json()) as Plan & { error?: string };
      if (!response.ok)
        throw new Error(
          plan.error ?? "We couldn’t map those claims. Try again.",
        );
      if (!plan.concerns.length)
        throw new Error(
          "No trackable skin claims found. Try the label’s wording, such as redness, pores, hydration, dark spots, or fine lines.",
        );
      const created: Diary = {
        id: crypto.randomUUID(),
        product,
        plan,
        checkIns: [],
        synthetic: config.mode === "mock",
      };
      resetSelection();
      persist({
        ...store,
        diaries: [...store.diaries, created],
        activeId: created.id,
      });
      setCreating(false);
      setNotice("Product saved. Take your day 0 baseline to begin.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t add that product. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }
  function loadSample() {
    if (
      store.diaries.length >= 20 &&
      !store.diaries.some((d) => d.id === "sample-diary")
    ) {
      setError("Export and remove a product to make room for the sample.");
      return;
    }
    resetSelection();
    const sample = sampleDiary(today);
    persist({
      ...store,
      diaries: [...store.diaries.filter((d) => d.id !== sample.id), sample],
      activeId: sample.id,
    });
    setCreating(false);
    setNotice("Loaded a synthetic 14-day diary. No selfie or API units used.");
    focusResults();
  }
  async function readPhoto(source?: File | string) {
    if (!source || busy) return;
    setBusy("photo");
    setError("");
    setNotice("");
    setCameraOpen(false);
    setPhoto(null);
    try {
      setPhoto(await preparePhoto(source));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t read this photo. Try another JPEG or PNG.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function analyze() {
    if (!photo || !canAnalyze || !active || busy) return;
    const captureDate = todayLocal();
    if (active.checkIns.some((c) => c.date === captureDate)) {
      setError("Today’s check-in is already saved.");
      return;
    }
    setError("");
    setNotice("");
    setBusy("analyze");
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 110_000);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: photo.imageBase64,
          concerns: active.plan.concerns,
          passcode,
        }),
        signal: controller.signal,
      });
      const body = (await response.json()) as Analysis & {
        error?: string;
        passcodeRequired?: boolean;
      };
      if (body.passcodeRequired) setPasscodeRequired(true);
      if (!response.ok)
        throw new Error(
          body.error ?? "Analysis couldn’t finish. Please try again.",
        );
      if (active.checkIns.length && body.mode !== active.checkIns[0].mode)
        throw new Error(
          "The server’s analysis mode changed. Start a separate diary to keep your scores comparable.",
        );
      const updated: Diary = {
        ...active,
        synthetic: body.mode === "mock",
        checkIns: [
          ...active.checkIns,
          {
            ...body,
            id: crypto.randomUUID(),
            date: captureDate,
            thumbnail: photo.thumbnail,
          },
        ],
      };
      persist({
        ...store,
        diaries: store.diaries.map((d) => (d.id === updated.id ? updated : d)),
      });
      setPhoto(null);
      setNarration(undefined);
      setSelectedDate(captureDate);
      setNotice(
        `${active.checkIns.length ? "Daily check-in" : "Day 0 baseline"} saved${body.mode === "mock" ? " with synthetic scores" : ""}.`,
      );
      focusResults();
      if (uploadRef.current) uploadRef.current.value = "";
    } catch (caught) {
      setError(
        controller.signal.aborted
          ? "Analysis stopped or timed out. Your previous diary is safe. A started request still counts toward today’s budget."
          : caught instanceof Error
            ? caught.message
            : "We couldn’t reach the server. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(null);
      abortRef.current = null;
    }
  }
  async function importDiaries(file?: File) {
    if (!file || busy) return;
    setBusy("import");
    setError("");
    setNotice("");
    try {
      if (file.size > MAX_IMPORT_BYTES)
        throw new Error("Choose a diary JSON file under 4 MB.");
      const imported = parseStore(await file.text());
      if (!imported.diaries.length)
        throw new Error("This export has no products to import.");
      if (store.diaries.length + imported.diaries.length > 20)
        throw new Error(
          "The combined diary would exceed 20 products. Export and remove older products first.",
        );
      const diaries = imported.diaries.map((d) => ({
        ...d,
        id: store.diaries.some((existing) => existing.id === d.id)
          ? crypto.randomUUID()
          : d.id,
      }));
      resetSelection();
      persist({
        ...store,
        diaries: [...store.diaries, ...diaries],
        activeId: diaries[0].id,
      });
      setCreating(false);
      setNotice(
        `Imported ${diaries.length} product diaries. Existing products were preserved.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That diary could not be imported.",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
      setBusy(null);
    }
  }
  async function narrate() {
    if (busy) return;
    setBusy("narrate");
    setError("");
    try {
      // Photos, mask URLs, and product details never go to the model.
      const summaryDiary = {
        ...diary,
        checkIns: diary.checkIns.map((entry) => ({
          ...entry,
          thumbnail: null,
          maskUrl: null,
          trace: [],
        })),
      };
      const response = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diary: summaryDiary, passcode, today }),
        signal: AbortSignal.timeout(12_000),
      });
      const body = await response.json();
      if (body.passcodeRequired) setPasscodeRequired(true);
      if (!response.ok)
        throw new Error(
          body.error ??
            "Narration unavailable. The built-in summary is still shown.",
        );
      setNarration(body);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Narration unavailable. Your verdict is unchanged.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <NightScene />
      <a className="skip-link" href="#product-form">
        Skip to your product
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Keep or Return home">
            <Monitor size={31} strokeWidth={1.5} />
            <span>
              keep or return<span className="brand-dot">✳</span>
            </span>
          </Link>
          <nav aria-label="Main navigation">
            <a href="#the-method">
              The method <ArrowUpRight size={13} />
            </a>
            <ModeBadge mode={config.mode} />
          </nav>
        </div>
      </header>
      <main className="page-shell">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span aria-hidden="true">✦</span> A little clarity for your
              skincare shelf
            </span>
            <h1>
              A new serum.
              <br />A <em>keeper?</em>
              <span className="terminal-cursor" aria-hidden="true">
                _
              </span>
            </h1>
            <p>
              Track your skin. Follow the evidence.
              <br />
              Make the call before the return window closes.
            </p>
          </div>
          <div className="hero-aside">
            <div className="weekend-stamp">
              <span>SKIN DIARY.EXE</span>
              <div>
                <span>DAY 0</span>
                <ArrowRight size={25} />
                <span>?</span>
              </div>
              <span>LESS GUESSWORK. MORE CLARITY.</span>
            </div>
            <p>
              Your skin, over time.
              <br />
              With a receipt for the decision.
            </p>
          </div>
        </section>
        <div className="computer-case">
          <div className="workspace-topline">
            <span className="hardware-nameplate">
              KEEP/RETURN <strong>5150</strong>
            </span>
            <span className="hardware-vents" aria-hidden="true" />
            <span className="power-label">
              <span className="live-dot" />
              {busy ? "PROCESSING" : "SYSTEM READY"}
            </span>
          </div>
          <div className="workspace">
            <aside className="input-column">
              {!!store.diaries.length && (
                <div className="diary-picker">
                  <label htmlFor="diary-picker">YOUR PRODUCT DIARIES</label>
                  <select
                    id="diary-picker"
                    disabled={!!busy}
                    value={store.activeId ?? ""}
                    onChange={(event) => {
                      resetSelection();
                      persist({ ...store, activeId: event.target.value });
                      setCreating(false);
                    }}
                  >
                    <option value="" disabled>
                      Select a diary
                    </option>
                    {store.diaries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.synthetic ? "[DEMO] " : ""}
                        {d.product.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {creating ? (
                <form
                  id="product-form"
                  ref={formRef}
                  className="product-form"
                  onSubmit={(e) => void createProduct(e)}
                >
                  <div className="form-heading">
                    <span className="section-index">01 / THE NEW ADDITION</span>
                    <FlaskConical size={18} />
                  </div>
                  <h2>
                    What’s on
                    <br />
                    your <em>shelf?</em>
                  </h2>
                  <p className="form-description">
                    Start with the promise on the label.
                    <br />
                    We’ll find the skin signals to follow.
                  </p>
                  <fieldset disabled={!!busy || !ready}>
                    <label htmlFor="product-name">Product name</label>
                    <input
                      id="product-name"
                      name="name"
                      placeholder="e.g. Calm Days Barrier Serum"
                      required
                      maxLength={120}
                    />
                    <div className="field-row">
                      <div>
                        <label htmlFor="price">Price (USD)</label>
                        <input
                          id="price"
                          name="price"
                          type="number"
                          placeholder="32.00"
                          min="0"
                          max="1000000"
                          step="0.01"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="retailer">Retailer</label>
                        <input
                          id="retailer"
                          name="retailer"
                          placeholder="Where you bought it"
                          required
                          maxLength={120}
                        />
                      </div>
                    </div>
                    <label htmlFor="purchase-date">Purchase date</label>
                    <input
                      id="purchase-date"
                      name="purchaseDate"
                      type="date"
                      defaultValue={today}
                      max={today}
                      required
                    />
                    <label htmlFor="return-deadline">Return deadline</label>
                    <input
                      id="return-deadline"
                      name="returnDeadline"
                      type="date"
                      defaultValue={addDays(today, 30)}
                      required
                    />
                    <label htmlFor="claims">What does it promise?</label>
                    <textarea
                      id="claims"
                      name="claims"
                      rows={3}
                      placeholder="Reduces redness and visible pores in 14 days…"
                      maxLength={2000}
                      required
                    />
                    <p className="field-hint">
                      We map the label to up to 4 skin concerns. Check the
                      actual return date with your retailer.
                    </p>
                    <button className="generate-button" type="submit">
                      {busy === "plan" ? (
                        <>
                          <LoaderCircle className="spin" size={17} /> Mapping
                          the claims…
                        </>
                      ) : (
                        <>
                          Start my skin diary <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </fieldset>
                  <p className="form-footnote">
                    <ShieldCheck size={12} /> Your diary stays in this browser.
                  </p>
                  {active && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => setCreating(false)}
                    >
                      Back to current product
                    </button>
                  )}
                </form>
              ) : (
                <section
                  id="product-form"
                  className="product-form product-summary"
                >
                  <span className="section-index">01 / ON YOUR SHELF</span>
                  <h2>{diary.product.name}</h2>
                  <p className="product-price">
                    ${diary.product.price.toFixed(2)}{" "}
                    <span>· {diary.product.retailer}</span>
                  </p>
                  <blockquote>“{diary.product.claims}”</blockquote>
                  <dl>
                    <div>
                      <dt>Purchased</dt>
                      <dd>{prettyDate(diary.product.purchaseDate)}</dd>
                    </div>
                    <div>
                      <dt>Return by</dt>
                      <dd>{prettyDate(diary.product.returnDeadline)}</dd>
                    </div>
                  </dl>
                  <div className="mapping">
                    <span className="section-index">CLAIMS → SKIN SIGNALS</span>
                    {diary.plan.reasons.map((r) => (
                      <div key={r.concern}>
                        <Check size={13} />
                        <p>
                          <strong>{LABELS[r.concern]}</strong>
                          <small>{r.reason}</small>
                        </p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="key-button full-width"
                    disabled={!!busy}
                    onClick={() => {
                      setCreating(true);
                      setDeleteConfirm(false);
                    }}
                  >
                    <Plus size={15} /> Add another product
                  </button>
                </section>
              )}

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              {notice && (
                <div className="form-notice" role="status">
                  {notice}
                </div>
              )}
              <section
                className="capture-panel"
                aria-labelledby="capture-heading"
              >
                <div className="form-heading">
                  <span className="section-index">
                    02 / A MOMENT FOR YOUR SKIN
                  </span>
                  <CameraIcon size={18} />
                </div>
                <h3 id="capture-heading">
                  {!active || !active.checkIns.length
                    ? "Your day 0 baseline."
                    : "A daily check-in."}
                </h3>
                <p>Same light. Same distance. Same you.</p>
                <details className="photo-tips">
                  <summary>
                    Set up a consistent photo <Plus size={12} />
                  </summary>
                  <ul>
                    <li>Use soft, even daylight in the same spot.</li>
                    <li>Clean, dry skin; no makeup or filters.</li>
                    <li>Face forward with a neutral expression.</li>
                    <li>
                      Keep your whole face in frame, at the same distance.
                    </li>
                    <li>
                      Check in at a similar time, before applying products.
                    </li>
                  </ul>
                </details>
                {passcodeRequired && (
                  <div className="access-field">
                    <label htmlFor="access-code">Access code</label>
                    <input
                      id="access-code"
                      type="password"
                      autoComplete="off"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      maxLength={200}
                      placeholder="Enter the demo access code"
                    />
                    <small>Required by this demo’s host. Not saved.</small>
                  </div>
                )}
                {canAnalyze ? (
                  <>
                    <div className="capture-buttons">
                      <button
                        type="button"
                        className="key-button"
                        disabled={!!busy}
                        onClick={() => setCameraOpen(true)}
                      >
                        <CameraIcon size={15} /> Use camera
                      </button>
                      <button
                        type="button"
                        className="key-button"
                        disabled={!!busy}
                        onClick={() => uploadRef.current?.click()}
                      >
                        <Upload size={15} /> Upload photo
                      </button>
                    </div>
                    <input
                      ref={uploadRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="visually-hidden"
                      tabIndex={-1}
                      aria-label="Choose a check-in photo"
                      onChange={(e) => void readPhoto(e.target.files?.[0])}
                    />
                    {photo && (
                      <div className="photo-preview">
                        <Image
                          unoptimized
                          src={photo.thumbnail}
                          alt="Your prepared check-in photo"
                          width={64}
                          height={80}
                        />
                        <div>
                          <strong>Ready for your check-in.</strong>
                          <small>Resized & converted to JPEG.</small>
                          <button
                            className="text-button"
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                              setPhoto(null);
                              if (uploadRef.current)
                                uploadRef.current.value = "";
                            }}
                          >
                            Remove photo
                          </button>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      className="generate-button"
                      disabled={!photo || !!busy}
                      onClick={() => void analyze()}
                    >
                      {busy === "analyze" || busy === "photo" ? (
                        <>
                          <LoaderCircle size={18} className="spin" />
                          {busy === "photo"
                            ? "Preparing photo…"
                            : "Analyzing your skin…"}
                        </>
                      ) : (
                        <>
                          Analyze & save check-in <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="capture-placeholder">
                    {isPreview
                      ? "Add your product to take a baseline photo."
                      : diary.id === "sample-diary"
                        ? "This sample already has 14 synthetic check-ins. Add your own product to begin."
                        : wrongMode
                          ? "This diary uses a different analysis mode. Add a new product diary to keep the scores comparable."
                          : hasToday
                            ? "✓ Today’s check-in is saved. Come back tomorrow in the same light."
                            : "Check-ins begin on your purchase date."}
                  </div>
                )}
                {busy === "analyze" && (
                  <div className="analysis-status" role="status">
                    <p>Analysis may take about a minute. Keep this tab open.</p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => abortRef.current?.abort()}
                    >
                      Cancel analysis
                    </button>
                  </div>
                )}
                <p className="field-hint">
                  {config.mode === "live"
                    ? "Analyze sends your resized photo to YouCam. Only a small thumbnail and scores are saved in this browser."
                    : "Demo analysis generates synthetic scores. Your photo isn’t sent to YouCam. Only a small thumbnail is saved here."}{" "}
                  Camera capture loads the YouCam Camera Kit.
                </p>
              </section>
              <div className="sample-block">
                <div className="examples-heading">
                  <h3>A little test drive?</h3>
                  <span>NO SELFIE NEEDED</span>
                </div>
                <button
                  type="button"
                  className="example-button"
                  disabled={!!busy || !ready}
                  onClick={loadSample}
                >
                  <span className="example-icon">
                    <Sparkles size={20} />
                  </span>
                  <span>
                    <strong>Load sample diary</strong>
                    <small>14 days · synthetic scores · zero API units</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="diary-tools">
                <button
                  type="button"
                  className="key-button"
                  disabled={!store.diaries.length || !!busy}
                  onClick={() =>
                    download(
                      JSON.stringify(store, null, 2),
                      "keep-or-return-diary.json",
                      "application/json",
                    )
                  }
                >
                  <Download size={14} /> Export JSON
                </button>
                <button
                  type="button"
                  className="key-button"
                  disabled={!!busy || !ready}
                  onClick={() => importRef.current?.click()}
                >
                  <FolderOpen size={14} /> Import JSON
                </button>
                <input
                  type="file"
                  ref={importRef}
                  className="visually-hidden"
                  tabIndex={-1}
                  accept=".json,application/json"
                  aria-label="Import diary JSON"
                  onChange={(e) => void importDiaries(e.target.files?.[0])}
                />
              </div>
              <p className="backup-note">
                Local to this browser. Export a backup before clearing browser
                data. Exports include your thumbnails.
              </p>
              {active && (
                <div className="delete-area">
                  {deleteConfirm ? (
                    <>
                      <p>
                        Remove this product and its check-ins from this browser?
                      </p>
                      <button
                        className="text-button"
                        disabled={!!busy}
                        type="button"
                        onClick={() => {
                          const diaries = store.diaries.filter(
                            (d) => d.id !== active.id,
                          );
                          resetSelection();
                          persist({
                            ...store,
                            diaries,
                            activeId: diaries[0]?.id ?? null,
                          });
                          setCreating(!diaries.length);
                        }}
                      >
                        Yes, remove diary
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => setDeleteConfirm(true)}
                    >
                      Remove this product diary
                    </button>
                  )}
                </div>
              )}
            </aside>
            <section
              className="output-column"
              ref={resultsRef}
              aria-labelledby="diary-title"
              aria-busy={busy === "analyze"}
            >
              <div className="results-column">
                <div className="screen-topline">
                  <span>KEEP/RETURN / SKIN OBSERVATORY</span>
                  <span>● {busy === "analyze" ? "ANALYZING" : "ONLINE"}</span>
                </div>
                <div className="results-heading">
                  <div>
                    <span className="section-index">
                      03 /{" "}
                      {isPreview ? "A LITTLE PREVIEW" : "YOUR SKIN, OVER TIME"}
                    </span>
                    <h2 id="diary-title">{diary.product.name}</h2>
                  </div>
                  <span className="checkin-count">
                    {diary.checkIns.length} CHECK-INS
                  </span>
                </div>
                <div className="result-context">
                  <p>
                    {isPreview
                      ? "An invented product. A synthetic diary. Take a look around."
                      : diary.synthetic
                        ? "Synthetic scores for demonstration. Not an assessment of your skin."
                        : "Your own baseline is the reference point."}
                  </p>
                  <ModeBadge mode={diaryMode} />
                </div>
                <div className="signal-strip">
                  <div>
                    <span>OBSERVATION</span>
                    <strong>
                      {verdict.span}
                      <small> days</small>
                    </strong>
                  </div>
                  <div>
                    <span>TRACKING</span>
                    <strong>
                      {diary.plan.concerns.length}
                      <small> signals</small>
                    </strong>
                  </div>
                  <div>
                    <span>RETURN WINDOW</span>
                    <strong>
                      {Math.max(0, verdict.daysLeft)}
                      <small> days left</small>
                    </strong>
                  </div>
                </div>
                <Timeline key={diary.id} diary={diary} />
                <div className="checkin-heading">
                  <h3>The daily record</h3>
                  <span>SELECT A CHECK-IN ↓</span>
                </div>
                <div className="checkin-strip" aria-label="Check-in history">
                  {diary.checkIns.length ? (
                    diary.checkIns.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        aria-pressed={entry.id === selected?.id}
                        onClick={() => setSelectedDate(entry.date)}
                        title={prettyDate(entry.date)}
                      >
                        <span>DAY</span>
                        <strong>
                          {daysBetween(diary.checkIns[0].date, entry.date)
                            .toString()
                            .padStart(2, "0")}
                        </strong>
                        <span className="checkin-indicator">✓</span>
                      </button>
                    ))
                  ) : (
                    <p className="empty-record">
                      Your first selfie becomes day 0. You’ll see each check-in
                      here.
                    </p>
                  )}
                </div>
                {selected && (
                  <div className="checkin-detail">
                    <div className="mask-monitor">
                      <div className="mask-image">
                        {selected.maskUrl ? (
                          <MaskImage
                            key={selected.maskUrl}
                            url={selected.maskUrl}
                            synthetic={selected.mode === "mock"}
                          />
                        ) : (
                          <p>No mask was returned for this check-in.</p>
                        )}
                      </div>
                      <span>
                        {selected.mode === "mock"
                          ? "SYNTHETIC MASK ILLUSTRATION"
                          : "YOUCAM MASK OVERLAY"}
                      </span>
                    </div>
                    <div className="score-readout">
                      <div className="score-date">
                        {selected.thumbnail && (
                          <Image
                            unoptimized
                            src={selected.thumbnail}
                            alt={`Check-in thumbnail from ${prettyDate(selected.date)}`}
                            width={30}
                            height={38}
                          />
                        )}
                        <div>
                          <span className="section-index">
                            CHECK-IN / DAY{" "}
                            {daysBetween(diary.checkIns[0].date, selected.date)}
                          </span>
                          <h4>{prettyDate(selected.date)}</h4>
                        </div>
                      </div>
                      <table>
                        <caption className="visually-hidden">
                          Selected check-in scores
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">CONCERN</th>
                            <th scope="col">UI</th>
                            <th scope="col">RAW</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.scores.map((s) => (
                            <tr key={s.concern}>
                              <th scope="row">{LABELS[s.concern]}</th>
                              <td>{s.ui_score}</td>
                              <td>{s.raw_score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="screen-note">
                        The verdict uses raw scores. UI scores are shown for
                        reference.
                      </p>
                    </div>
                  </div>
                )}
                {selected && (
                  <details className="trace-panel">
                    <summary>
                      Analysis trace{" "}
                      <span>
                        {selected.trace.reduce((sum, step) => sum + step.ms, 0)}{" "}
                        ms
                      </span>
                    </summary>
                    <ol>
                      {selected.trace.map((step, index) => (
                        <li key={index}>
                          <span>{step.step}</span>
                          <span>{step.ms} ms</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                <p className="screen-footer">
                  <ShieldCheck size={13} />{" "}
                  {diary.synthetic
                    ? "SYNTHETIC DATA · NO SKIN ASSESSMENT"
                    : "YOUCAM SKIN ANALYSIS · YOUR BASELINE, YOUR DIARY"}
                </p>
              </div>
              <div className="printer-slot" aria-hidden="true">
                <span />
                <ReceiptText size={15} />
                <span />
              </div>
              <Receipt
                diary={diary}
                verdict={verdict}
                onReminder={() =>
                  download(
                    makeReminder(diary),
                    "return-reminder.ics",
                    "text/calendar;charset=utf-8",
                  )
                }
                narration={narration}
                onNarrate={
                  config.narrationAvailable ? () => void narrate() : undefined
                }
                pending={!!busy}
              />
            </section>
          </div>
          <div className="hardware-bottom" aria-hidden="true">
            <span className="hardware-vents" />
            <span>PERSONAL SKINCARE COMPUTER</span>
            <span className="hardware-controls">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
        <section id="the-method" className="how-it-works">
          <span className="eyebrow">THERE’S A METHOD TO THE MAYBE.</span>
          <div className="how-grid">
            <div>
              <span>01</span>
              <h3>Read the promise.</h3>
              <p>
                The label’s claims map to up to four YouCam skin concerns. Fewer
                signals, more focused tracking.
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>Give it a little time.</h3>
              <p>
                A baseline, then daily photos. At least three check-ins spanning
                five days before a verdict.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>Keep the receipt.</h3>
              <p>
                Average raw-score change: +3 or more suggests KEEP; +1 or less
                suggests RETURN. Between them, keep watching until two days
                before the deadline.
              </p>
            </div>
          </div>
          <p className="method-note">
            These are transparent demo thresholds, not clinically validated
            measures. Follow product instructions; stop using a product if it
            irritates your skin.
          </p>
        </section>
        <section className="merchant-panel">
          <span className="merchant-icon" aria-hidden="true">
            ↳
          </span>
          <div>
            <span className="eyebrow">THE OTHER SIDE OF THE COUNTER</span>
            <h2>Returns avoided. Trust kept.</h2>
            <p>
              A retailer’s best outcome is a purchase someone feels good about
              keeping. A clear diary can help shoppers notice gradual changes,
              make informed decisions, and return products that aren’t a fit. A
              useful decision, either way.
            </p>
          </div>
          <span className="merchant-stamp">
            LESS DOUBT
            <br />
            MORE TRUST
          </span>
        </section>
      </main>
      <footer className="site-footer">
        <span>keep or return ✳</span>
        <p>Made for a more considered skincare shelf.</p>
        <a
          href="https://www.perfectcorp.com/business/products/ai-skin-diagnostic"
          target="_blank"
          rel="noreferrer"
        >
          Powered by YouCam <ArrowUpRight size={12} />
        </a>
      </footer>
      {cameraOpen && (
        <Camera
          onCapture={(image) => void readPhoto(image)}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

function MaskImage({ url, synthetic }: { url: string; synthetic: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <p>
      This mask link has expired or couldn’t load. Your saved scores are still
      available.
    </p>
  ) : (
    <Image
      unoptimized
      src={url}
      alt={
        synthetic
          ? "Illustrated synthetic skin concern mask, not a real analysis"
          : "YouCam skin concern mask from this check-in"
      }
      width={320}
      height={360}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
