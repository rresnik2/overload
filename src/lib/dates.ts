// Local-date helpers. PURE (Intl only). FROZEN after Phase 0.
//
// Rule: `Workout.localDate` (the DEVICE's local date when the workout starts) is the ONLY field used
// to group by day or week. Weeks run Monday-Sunday (ISO 8601). A "local date" is the string "YYYY-MM-DD";
// Postgres `@db.Date` columns come back from Prisma as a Date at UTC midnight (use localDateToDate/dateToLocalDate).

export type LocalDate = string; // "YYYY-MM-DD"

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isValidLocalDate(value: string): value is LocalDate {
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function assertLocalDate(value: string): LocalDate {
  if (!isValidLocalDate(value)) throw new Error(`Invalid local date: ${value}`);
  return value;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The local calendar date of an instant in an IANA time zone. */
export function toLocalDate(instant: Date | string | number, timeZone: string): LocalDate {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid instant: ${String(instant)}`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
}

/** UTC-midnight Date for a local date (what Prisma returns/accepts for `@db.Date`). */
export function localDateToDate(localDate: LocalDate): Date {
  assertLocalDate(localDate);
  return new Date(`${localDate}T00:00:00.000Z`);
}

/** Inverse of localDateToDate for Prisma `@db.Date` values. */
export function dateToLocalDate(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(localDate: LocalDate, days: number): LocalDate {
  const d = localDateToDate(localDate);
  return dateToLocalDate(new Date(d.getTime() + days * MS_PER_DAY));
}

/** Whole days from a to b (b - a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((localDateToDate(b).getTime() - localDateToDate(a).getTime()) / MS_PER_DAY);
}

export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export function isoWeekday(localDate: LocalDate): number {
  const dow = localDateToDate(localDate).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

/** Monday of the ISO week containing `localDate`. */
export function isoWeekStart(localDate: LocalDate): LocalDate {
  return addDays(localDate, 1 - isoWeekday(localDate));
}

/** Sunday of the ISO week containing `localDate`. */
export function isoWeekEnd(localDate: LocalDate): LocalDate {
  return addDays(isoWeekStart(localDate), 6);
}

/** ISO week-year and week number, e.g. { year: 2026, week: 42 }. */
export function isoWeek(localDate: LocalDate): { year: number; week: number } {
  const thursday = addDays(isoWeekStart(localDate), 3);
  const year = Number(thursday.slice(0, 4));
  const jan1 = `${year}-01-01`;
  const week = Math.floor(diffDays(isoWeekStart(jan1), isoWeekStart(thursday)) / 7) + 1;
  return { year, week };
}

/** "2026-W42" */
export function isoWeekKey(localDate: LocalDate): string {
  const { year, week } = isoWeek(localDate);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Inclusive list of local dates from `from` to `to`. */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Mondays of every ISO week touching [from, to]. */
export function eachWeekStart(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = isoWeekStart(from); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (positive = ahead of UTC). */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** The UTC instant at which `localDate` HH:MM happens in `timeZone` (DST-safe; used by the weekly cron). */
export function zonedTimeToUtc(localDate: LocalDate, hour: number, minute: number, timeZone: string): Date {
  const [y, mo, d] = localDate.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, mo - 1, d, hour, minute, 0);
  // Two passes handle DST transitions.
  let guess = naive - tzOffsetMinutes(new Date(naive), timeZone) * 60_000;
  guess = naive - tzOffsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess);
}

/** Whole years between a birth date and a local date. */
export function ageInYears(birthDate: LocalDate, onDate: LocalDate): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = onDate.split("-").map(Number) as [number, number, number];
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}
