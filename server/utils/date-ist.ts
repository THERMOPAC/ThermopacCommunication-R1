/**
 * IST (Asia/Kolkata, UTC+5:30) date utilities.
 *
 * The server process runs in UTC. All attendance dates are business dates in IST.
 * These helpers ensure every date derivation and duty-time construction uses IST
 * wall-clock semantics, preventing off-by-one-day errors around midnight.
 *
 * APP_TIMEZONE is the single authoritative timezone constant for this application.
 */

export const APP_TIMEZONE = 'Asia/Kolkata';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1_000; // 330 minutes in ms

/**
 * Returns the current date (or a given UTC Date) as a YYYY-MM-DD string in IST.
 *
 * Example: UTC 2026-04-28T18:35:00Z → IST 2026-04-29T00:05:00 → '2026-04-29'
 */
export function getISTDateString(date?: Date): string {
  const d = date ?? new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Returns yesterday's date as a YYYY-MM-DD string in IST.
 * "Yesterday" is relative to the current IST wall-clock time.
 */
export function getISTYesterdayString(): string {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  return getISTDateString(yesterday);
}

/**
 * Returns the day-of-week (0 = Sunday … 6 = Saturday) for an IST date string.
 *
 * Parses YYYY-MM-DD components as calendar date so no UTC-shift occurs.
 * Use this instead of `new Date(dateStr).getDay()` which on UTC servers returns
 * the UTC weekday (which can be one day behind the IST weekday near midnight).
 */
export function getISTDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Builds a UTC Date that represents a wall-clock time in IST for the given date.
 *
 * Example: buildISTDateTime('2026-04-28', '18:00')
 *   = IST 2026-04-28T18:00:00+05:30
 *   = UTC 2026-04-28T12:30:00Z
 *
 * Use this when constructing duty-start / duty-end DateTimes from dutyTimeIn /
 * dutyTimeOut strings, which are always expressed in IST wall-clock hours.
 */
export function buildISTDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00+05:30`);
}

/**
 * Returns milliseconds until the next IST midnight (00:00:00 IST).
 * Useful for logging; the cron scheduler does not need this.
 */
export function msUntilISTMidnight(): number {
  const nowUTC = Date.now();
  const nowIST = nowUTC + IST_OFFSET_MS;
  const istMidnightUTC =
    Math.floor(nowIST / (24 * 60 * 60 * 1_000)) * (24 * 60 * 60 * 1_000) +
    24 * 60 * 60 * 1_000 -
    IST_OFFSET_MS;
  return istMidnightUTC - nowUTC;
}
