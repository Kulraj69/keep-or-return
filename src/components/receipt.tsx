"use client";
import { LABELS } from "@/lib/concerns";
import { prettyDate } from "@/lib/dates";
import type { Diary, Verdict } from "@/lib/types";
import { fallbackNarration, signed } from "@/lib/verdict";
export function Receipt({
  diary,
  verdict,
  onReminder,
  narration,
  onNarrate,
  pending,
}: {
  diary: Diary;
  verdict: Verdict;
  onReminder: () => void;
  narration?: { text: string; source: string };
  onNarrate?: () => void;
  pending: boolean;
}) {
  return (
    <section className="receipt" aria-labelledby="verdict-title">
      <div className="receipt-top">
        <span>KEEP / RETURN</span>
        <span>DECISION RECEIPT</span>
      </div>
      {diary.synthetic && (
        <div className="receipt-demo">SYNTHETIC DIARY · DEMONSTRATION ONLY</div>
      )}
      <div className="receipt-decision">
        <div>
          <span className="section-index">THE SIGNAL SO FAR</span>
          <h3
            id="verdict-title"
            className={verdict.decision === "RETURN" ? "return-verdict" : ""}
          >
            {verdict.decision}
          </h3>
        </div>
        <span className="receipt-seal" aria-hidden="true">
          {verdict.decision === "KEEP"
            ? "✓"
            : verdict.decision === "RETURN"
              ? "↩"
              : "…"}
        </span>
      </div>
      <p className="receipt-reason">{verdict.reason}</p>
      <dl className="receipt-deltas">
        {verdict.deltas.map((delta) => (
          <div key={delta.concern}>
            <dt>
              {LABELS[delta.concern]}
              <small>
                {delta.baseline} → {delta.latest}
              </small>
            </dt>
            <dd>
              {signed(delta.change, 4)}
              <small>raw points</small>
            </dd>
          </div>
        ))}
        <div className="receipt-total">
          <dt>AVERAGE CHANGE</dt>
          <dd>{verdict.average === null ? "—" : signed(verdict.average)}</dd>
        </div>
      </dl>
      <p className="receipt-meta">
        {verdict.count} check-ins / {verdict.span} days observed
      </p>
      <p className="receipt-narration">
        {narration?.text ?? fallbackNarration(verdict)}
      </p>
      {onNarrate && (
        <button
          type="button"
          className="text-button"
          onClick={onNarrate}
          disabled={pending}
        >
          {pending ? "Writing summary…" : "Summarize with Nebius ↗"}
        </button>
      )}
      {narration && (
        <small className="narration-source">
          Summary:{" "}
          {narration.source === "nebius"
            ? "Nebius · numbers validated"
            : "built-in template"}
        </small>
      )}
      <div className="receipt-deadline">
        <span>
          {verdict.daysLeft < 0
            ? "WINDOW ENDED"
            : `${verdict.daysLeft} DAYS LEFT`}
        </span>
        <strong>Return by {prettyDate(diary.product.returnDeadline)}</strong>
        <button type="button" onClick={onReminder}>
          ↓ Save calendar reminder (.ics)
        </button>
      </div>
      <p className="receipt-fineprint">
        A personal tracking aid. Photo scores can vary with lighting and
        routine; they don’t establish that a product caused a change. Confirm
        the retailer’s return policy.
      </p>
      <span className="receipt-barcode" aria-hidden="true" />
      <p className="receipt-thanks">
        A LITTLE LESS GUESSWORK. KEEP THIS RECEIPT.
      </p>
    </section>
  );
}
