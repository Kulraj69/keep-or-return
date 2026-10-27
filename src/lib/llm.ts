import "server-only";
import { record } from "./youcam";
import { fallbackNarration } from "./verdict";
import type { Verdict } from "./types";
export const NEBIUS_URL =
  "https://api.tokenfactory.nebius.com/v1/chat/completions";
export const NEBIUS_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
export function narrationFacts(verdict: Verdict) {
  return {
    decision: verdict.decision,
    averageChange:
      verdict.average === null ? null : Number(verdict.average.toFixed(2)),
    daysLeft: verdict.daysLeft,
    checkIns: verdict.count,
    spanDays: verdict.span,
    deltas: verdict.deltas.map((d) => ({
      concern: d.concern,
      change: Number(d.change.toFixed(2)),
    })),
  };
}
function numbers(value: string): number[] {
  return (value.match(/[-+−]?(?:\d+(?:\.\d+)?|\.\d+)/g) ?? []).map((n) =>
    Number(n.replace("−", "-")),
  );
}
export function narrationNumbersValid(output: string, input: unknown): boolean {
  const allowed = new Set<number>();
  function visit(value: unknown): void {
    if (typeof value === "number" && Number.isFinite(value)) allowed.add(value);
    else if (value && typeof value === "object")
      Object.values(value).forEach(visit);
  }
  visit(input);
  // Number words and scientific notation are not allowed: they could bypass the digit check.
  if (
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|quarter|dozen|double|triple|twice|minus|negative|percent|percentage|\d+(?:\.\d+)?e[-+]?\d+)\b/i.test(
      output,
    ) ||
    /\d[,%/]\d|\d,\d{3}|\d\s*%/.test(output) ||
    [...output].some((char) => /\p{N}/u.test(char) && !/[0-9]/.test(char))
  )
    return false;
  return numbers(output).every((number) => allowed.has(number));
}
export async function narrateVerdict(
  verdict: Verdict,
  options: { apiKey?: string; fetch?: typeof fetch; signal?: AbortSignal } = {},
) {
  const fallback = {
    text: fallbackNarration(verdict),
    source: "template" as const,
  };
  if (!options.apiKey?.trim()) return fallback;
  const facts = narrationFacts(verdict);
  try {
    const timeout = AbortSignal.timeout(8_000);
    const response = await (options.fetch ?? fetch)(NEBIUS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: options.signal
        ? AbortSignal.any([timeout, options.signal])
        : timeout,
      cache: "no-store",
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        max_tokens: 220,
        temperature: 0.2,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          {
            role: "system",
            content:
              '/no_think\nWrite exactly two short plain sentences summarizing a skin diary. Return only JSON {"text":"..."}. The deterministic decision is final; never change it. Quote only numbers in the supplied facts, using digits and their original units (points, days, check-ins). No percentages, number words, medical advice, causal claims, guarantees, markdown, product names or invented facts. Include the exact decision label. Explain only the observed average score change and recorded time left.',
          },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const body = record(await response.json());
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const content = record(record(choices[0]).message).content;
    if (typeof content !== "string" || /<\/?think>/i.test(content))
      return fallback;
    const output = record(JSON.parse(content)).text;
    if (
      typeof output !== "string" ||
      output.length > 450 ||
      /[\n\r<>*#]/.test(output) ||
      !output.includes(verdict.decision) ||
      (output.match(/\b(?:KEEP|RETURN|TOO EARLY)\b/g) ?? []).some(
        (label) => label !== verdict.decision,
      ) ||
      output.trim().split(/(?<=[.!?])\s+/).length !== 2 ||
      !/[.!?]$/.test(output.trim()) ||
      !narrationNumbersValid(output, facts)
    )
      return fallback;
    return { text: output.trim(), source: "nebius" as const };
  } catch {
    return fallback;
  }
}
