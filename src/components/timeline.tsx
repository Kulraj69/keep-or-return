"use client";
import { useId, useState } from "react";
import { LABELS } from "@/lib/concerns";
import { daysBetween } from "@/lib/dates";
import type { Concern, Diary } from "@/lib/types";
import { signed } from "@/lib/verdict";
export const SERIES_COLORS = ["#c8e7b2", "#e6b59e", "#aec8f0", "#dfb7e8"];
export function Timeline({ diary }: { diary: Diary }) {
  const id = useId();
  const [focus, setFocus] = useState<Concern | null>(null);
  const entries = [...diary.checkIns].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const baseline = entries[0];
  const series = diary.plan.concerns.map((concern, index) => ({
    concern,
    color: SERIES_COLORS[index],
    points: entries.flatMap((entry) => {
      const base = baseline?.scores.find(
        (s) => s.concern === concern,
      )?.raw_score;
      const raw = entry.scores.find((s) => s.concern === concern)?.raw_score;
      return base !== undefined && raw !== undefined
        ? [{ day: daysBetween(baseline.date, entry.date), delta: raw - base }]
        : [];
    }),
  }));
  const extent = Math.max(
    5,
    Math.ceil(
      Math.max(
        ...series.flatMap((s) => s.points.map((p) => Math.abs(p.delta))),
        0,
      ) / 5,
    ) * 5,
  );
  const span = Math.max(
    1,
    baseline ? daysBetween(baseline.date, entries.at(-1)!.date) : 14,
  );
  const x = (day: number) => 48 + (day / span) * 552;
  const y = (delta: number) => 116 - (delta / extent) * 80;
  return (
    <div className="timeline">
      <div className="chart-heading">
        <h3>Small changes. A clearer picture.</h3>
        <span>RAW SCORE Δ / DAY 0</span>
      </div>
      <svg
        viewBox="0 0 630 240"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>
          Raw-score change from your first check-in
        </title>
        <desc id={`${id}-desc`}>
          {baseline
            ? `${entries.length} check-ins across ${span} days. Higher scores indicate improvement. Exact scores are listed below.`
            : "Record a baseline photo to start your chart."}
        </desc>
        {[-extent, -extent / 2, 0, extent / 2, extent].map((tick) => (
          <g key={tick}>
            <line
              x1="48"
              x2="600"
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? "#a9c5b8" : "#779b8b"}
              strokeOpacity={tick === 0 ? 0.55 : 0.18}
              strokeDasharray={tick === 0 ? "4 4" : undefined}
            />
            <text
              x="36"
              y={y(tick) + 4}
              textAnchor="end"
              fill="#b9cfc6"
              fontSize="10"
            >
              {signed(tick)}
            </text>
          </g>
        ))}
        {[0, Math.round(span / 2), span]
          .filter((d, i, arr) => arr.indexOf(d) === i)
          .map((day) => (
            <text
              key={day}
              x={x(day)}
              y="223"
              textAnchor="middle"
              fill="#b9cfc6"
              fontSize="10"
            >
              DAY {day}
            </text>
          ))}
        {series
          .filter((s) => !focus || s.concern === focus)
          .map((s) => (
            <g key={s.concern}>
              <polyline
                points={s.points
                  .map((p) => `${x(p.day)},${y(p.delta)}`)
                  .join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {s.points.map((p) => (
                <circle
                  key={p.day}
                  cx={x(p.day)}
                  cy={y(p.delta)}
                  r="3.5"
                  fill="#163633"
                  stroke={s.color}
                  strokeWidth="1.5"
                >
                  <title>{`${LABELS[s.concern]} · day ${p.day}: ${signed(p.delta)} points`}</title>
                </circle>
              ))}
            </g>
          ))}
        {!baseline && (
          <text x="320" y="95" textAnchor="middle" fill="#c0ecdb" fontSize="13">
            YOUR BASELINE STARTS HERE
          </text>
        )}
      </svg>
      <div className="chart-legend" aria-label="Filter chart concerns">
        {series.map((s) => (
          <button
            key={s.concern}
            type="button"
            aria-pressed={!focus || focus === s.concern}
            onClick={() => setFocus(focus === s.concern ? null : s.concern)}
          >
            <span style={{ background: s.color }} />
            {LABELS[s.concern]}
          </button>
        ))}
      </div>
      <p className="screen-note">
        Higher is better. Each line starts at zero; this is a comparison with
        your own baseline.
      </p>
    </div>
  );
}
