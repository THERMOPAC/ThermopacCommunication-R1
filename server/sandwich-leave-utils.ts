/**
 * Sandwich Leave Utility — Definition A
 *
 * If sandwichApplicable = true for a leave type, any weekend or company
 * holiday that falls INSIDE the requested date range is counted as a
 * leave day (deducted from balance).
 *
 * Per-user weekly_off_days are respected.
 *
 * computeSandwichFromAttendance: attendance-calendar variant.
 * Used for non-system users whose absences are entered via the admin
 * attendance calendar (no leave request). An off-day is sandwiched when
 * BOTH its adjacent working days (within the same month) are absent.
 */

export interface SandwichBreakdown {
  baseDays: number;
  offDaysInside: number;
  totalDays: number;
  offDates: { date: string; reason: 'weekend' | 'holiday' }[];
}

/**
 * Compute sandwich-adjusted leave days.
 *
 * @param startDate   Leave start (inclusive)
 * @param endDate     Leave end (inclusive)
 * @param weeklyOffDays  Per-user weekly-off day numbers, e.g. [0,6] = Sun+Sat
 * @param holidayDates   Set of "YYYY-MM-DD" strings for company holidays
 * @param sandwichApplicable  If false, returns plain calendar days with no sandwich
 */
export function computeSandwichLeave(
  startDate: Date | string,
  endDate: Date | string,
  weeklyOffDays: number[],
  holidayDates: Set<string>,
  sandwichApplicable: boolean
): SandwichBreakdown {
  const start = typeof startDate === 'string' ? new Date(startDate) : new Date(startDate);
  const end   = typeof endDate   === 'string' ? new Date(endDate)   : new Date(endDate);

  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  let baseDays = 0;
  const offDates: { date: string; reason: 'weekend' | 'holiday' }[] = [];

  const cursor = new Date(start);
  while (cursor <= end) {
    const dayOfWeek = cursor.getUTCDay();
    const dateStr   = cursor.toISOString().split('T')[0];

    const isWeeklyOff = weeklyOffDays.includes(dayOfWeek);
    const isHoliday   = holidayDates.has(dateStr);

    if (sandwichApplicable && (isWeeklyOff || isHoliday)) {
      offDates.push({ date: dateStr, reason: isHoliday ? 'holiday' : 'weekend' });
    } else {
      baseDays++;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    baseDays,
    offDaysInside: offDates.length,
    totalDays: baseDays + offDates.length,
    offDates,
  };
}

/**
 * Compute sandwich days from attendance-calendar data (non-system users).
 *
 * An off-day (weekly off or company holiday) within the month is sandwiched
 * when ALL of the following are true:
 *   1. The closest previous working day within the month is absent.
 *   2. The closest next working day within the month is absent.
 *
 * Cross-month boundaries are intentionally excluded — only days within
 * [monthStart, monthEnd] are considered as adjacent working days.
 *
 * @param absentWorkingDates  Set of YYYY-MM-DD strings for absent working days
 * @param weeklyOffDays       Array of getDay() numbers that are weekly off (e.g. [0,6])
 * @param holidayDates        Set of YYYY-MM-DD strings for company holidays
 * @param monthStart          First day of month as YYYY-MM-DD
 * @param monthEnd            Last day of month as YYYY-MM-DD
 */
export function computeSandwichFromAttendance(
  absentWorkingDates: Set<string>,
  weeklyOffDays: number[],
  holidayDates: Set<string>,
  monthStart: string,
  monthEnd: string,
): { date: string; reason: 'weekend' | 'holiday' }[] {
  const result: { date: string; reason: 'weekend' | 'holiday' }[] = [];

  function isWorkingDay(ds: string, dow: number): boolean {
    return !weeklyOffDays.includes(dow) && !holidayDates.has(ds);
  }

  function prevWorkingDay(from: Date): string | null {
    const cur = new Date(from);
    for (let i = 0; i < 14; i++) {
      cur.setUTCDate(cur.getUTCDate() - 1);
      const ds = cur.toISOString().split('T')[0];
      if (ds < monthStart) return null;
      if (isWorkingDay(ds, cur.getUTCDay())) return ds;
    }
    return null;
  }

  function nextWorkingDay(from: Date): string | null {
    const cur = new Date(from);
    for (let i = 0; i < 14; i++) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      const ds = cur.toISOString().split('T')[0];
      if (ds > monthEnd) return null;
      if (isWorkingDay(ds, cur.getUTCDay())) return ds;
    }
    return null;
  }

  const cursor = new Date(monthStart + 'T00:00:00Z');
  const end = new Date(monthEnd + 'T00:00:00Z');

  while (cursor <= end) {
    const ds = cursor.toISOString().split('T')[0];
    const dow = cursor.getUTCDay();
    const isOff = weeklyOffDays.includes(dow) || holidayDates.has(ds);

    if (isOff) {
      const prev = prevWorkingDay(cursor);
      const next = nextWorkingDay(cursor);
      if (prev && next && absentWorkingDates.has(prev) && absentWorkingDates.has(next)) {
        result.push({ date: ds, reason: holidayDates.has(ds) ? 'holiday' : 'weekend' });
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}
