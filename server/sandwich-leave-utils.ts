/**
 * Sandwich Leave Utility — Definition A
 *
 * If sandwichApplicable = true for a leave type, any weekend or company
 * holiday that falls INSIDE the requested date range is counted as a
 * leave day (deducted from balance).
 *
 * Per-user weekly_off_days are respected.
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
