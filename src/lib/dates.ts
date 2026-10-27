export const DAY_MS = 86_400_000;
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS);
}
export function addDays(date: string, amount: number): string {
  return new Date(Date.parse(date) + amount * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
export function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
