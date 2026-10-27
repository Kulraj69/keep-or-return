import { addDays } from "./dates";
import type { Diary } from "./types";
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function fold(line: string): string {
  let result = "",
    bytes = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (bytes + length > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += char;
    bytes += length;
  }
  return result;
}
export function makeReminder(diary: Diary, now = new Date()): string {
  const deadline = diary.product.returnDeadline;
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Keep or Return//Skin Diary//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeText(diary.id)}@keep-or-return.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${deadline.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${addDays(deadline, 1).replaceAll("-", "")}`,
    `SUMMARY:${escapeText(`Return by ${deadline}: ${diary.product.name}`)}`,
    `DESCRIPTION:${escapeText(`Review your skin diary and ${diary.product.retailer}'s return policy. This is your recorded deadline; confirm eligibility with the retailer.`)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-P2D",
    "DESCRIPTION:Review your product before the return window closes.",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
