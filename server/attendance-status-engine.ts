import { db } from './db';
import { leaveRequests, companyHolidays, attendanceSettings } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

/**
 * Threshold enforcement cutover date.
 * For attendance dates >= this value, per-user settings are MANDATORY —
 * there is no silent fallback to system defaults.
 */
export const THRESHOLD_ENFORCEMENT_DATE = '2026-05-01';

export interface StatusInput {
  userId: number;
  date: string;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  workingHoursOverride?: number | null;
  userConfig: {
    minimumDailyHours?: number | null;
    halfDayMinimumHours?: number | null;
    weeklyOffDays?: number[] | null;
    dutyTimeIn?: string | null;
    dutyTimeOut?: string | null;
    allowedLateMinutes?: number | null;
    earlyExitMinutes?: number | null;
    workTimePolicy?: string | null;
  };
  workLocationId?: number | null;
}

export interface StatusResult {
  status: string;
  workingHours: number;
  netWorkingHours: number;
  overtimeHours: number;
  statusSource: string;
  isLateArrival: boolean;
  isEarlyDeparture: boolean;
  leaveId?: number;
  // Audit — populated for dates >= THRESHOLD_ENFORCEMENT_DATE
  minimumDailyHoursUsed?: number;
  halfDayMinimumHoursUsed?: number;
  workTimePolicyUsed?: string;
}

const DEFAULTS = {
  FULL_DAY_MINIMUM_HOURS: 8,
  HALF_DAY_MINIMUM_HOURS: 4,
  WEEKLY_OFF_DAYS: [0, 6],
  STANDARD_WORKING_HOURS: 8,
  LUNCH_BREAK_MINUTES: 60,
  DUTY_TIME_IN: '09:00',
  DUTY_TIME_OUT: '18:00',
  ALLOWED_LATE_MINUTES: 15,
  EARLY_EXIT_MINUTES: 15,
} as const;

/**
 * Single source of truth for attendance status determination.
 *
 * Priority order:
 *   1. Holiday
 *   2. Weekly Off
 *   3. Approved Leave
 *   4. Hours-based (present / half_day / absent)
 *
 * For dates >= THRESHOLD_ENFORCEMENT_DATE (2026-05-01):
 *   - minimumDailyHours and halfDayMinimumHours MUST be set in userConfig.
 *   - Missing values throw a configuration error — no silent defaulting.
 *   - Audit fields (thresholds used) are always returned.
 *
 * For dates < THRESHOLD_ENFORCEMENT_DATE:
 *   - Legacy defaults (8h / 4h) are used if config is missing.
 */
export async function determineAttendanceStatus(input: StatusInput): Promise<StatusResult> {
  const {
    userId,
    date,
    checkInTime,
    checkOutTime,
    workingHoursOverride,
    userConfig,
    workLocationId,
  } = input;

  const isEnforced = date >= THRESHOLD_ENFORCEMENT_DATE;

  // Resolve per-user thresholds — strict for enforced dates
  let fullDayMin: number;
  let halfDayMin: number;

  if (isEnforced) {
    if (userConfig.minimumDailyHours == null) {
      throw new Error(
        `[ThresholdEnforcement] userId=${userId} date=${date}: ` +
        `minimumDailyHours not configured. Attendance status cannot be determined. ` +
        `Update employee settings before processing.`
      );
    }
    if (userConfig.halfDayMinimumHours == null) {
      throw new Error(
        `[ThresholdEnforcement] userId=${userId} date=${date}: ` +
        `halfDayMinimumHours not configured. Attendance status cannot be determined. ` +
        `Update employee settings before processing.`
      );
    }
    fullDayMin = Number(userConfig.minimumDailyHours);
    halfDayMin = Number(userConfig.halfDayMinimumHours);
  } else {
    fullDayMin = userConfig.minimumDailyHours != null
      ? Number(userConfig.minimumDailyHours)
      : DEFAULTS.FULL_DAY_MINIMUM_HOURS;
    halfDayMin = userConfig.halfDayMinimumHours != null
      ? Number(userConfig.halfDayMinimumHours)
      : DEFAULTS.HALF_DAY_MINIMUM_HOURS;
  }

  const policy = userConfig.workTimePolicy || 'Fixed';

  let grossHours = 0;
  if (workingHoursOverride != null) {
    grossHours = workingHoursOverride;
  } else if (checkInTime && checkOutTime) {
    const inMs = new Date(checkInTime).getTime();
    const outMs = new Date(checkOutTime).getTime();
    grossHours = Math.max(0, (outMs - inMs) / (1000 * 60 * 60));
  }

  let breakHours = 0;
  let standardHours = DEFAULTS.STANDARD_WORKING_HOURS;

  if (workLocationId) {
    const [settings] = await db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.workLocationId, workLocationId));

    if (settings) {
      standardHours = parseFloat(settings.standardWorkingHours?.toString() || '8');
      if (settings.automaticBreakDeduction) {
        breakHours = (settings.lunchBreakDuration || DEFAULTS.LUNCH_BREAK_MINUTES) / 60;
      }
    }
  }

  const netHours = Math.max(0, grossHours - breakHours);
  const overtimeHours = Math.max(0, netHours - standardHours);

  let isLateArrival = false;
  let isEarlyDeparture = false;

  if (policy === 'Fixed' && checkInTime && checkOutTime) {
    const dutyIn = userConfig.dutyTimeIn || DEFAULTS.DUTY_TIME_IN;
    const dutyOut = userConfig.dutyTimeOut || DEFAULTS.DUTY_TIME_OUT;
    const allowedLate = userConfig.allowedLateMinutes ?? DEFAULTS.ALLOWED_LATE_MINUTES;
    const earlyExit = userConfig.earlyExitMinutes ?? DEFAULTS.EARLY_EXIT_MINUTES;

    const [inH, inM] = dutyIn.split(':').map(Number);
    const [outH, outM] = dutyOut.split(':').map(Number);

    const checkIn = new Date(checkInTime);
    const checkOut = new Date(checkOutTime);

    const lateThreshold = new Date(date + 'T00:00:00');
    lateThreshold.setHours(inH, inM + allowedLate, 0, 0);

    const earlyThreshold = new Date(date + 'T00:00:00');
    earlyThreshold.setHours(outH, outM - earlyExit, 0, 0);

    if (checkIn.getTime() > lateThreshold.getTime()) isLateArrival = true;
    if (checkOut.getTime() < earlyThreshold.getTime()) isEarlyDeparture = true;
  }

  const audit = isEnforced
    ? { minimumDailyHoursUsed: fullDayMin, halfDayMinimumHoursUsed: halfDayMin, workTimePolicyUsed: policy }
    : {};

  // — Priority 1: Holiday —
  const [holiday] = await db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(eq(companyHolidays.date, date))
    .limit(1);

  if (holiday) {
    return buildResult('holiday', grossHours, netHours, overtimeHours, 'holiday', isLateArrival, isEarlyDeparture, audit);
  }

  // — Priority 2: Weekly Off —
  const weeklyOffDays = userConfig.weeklyOffDays ?? DEFAULTS.WEEKLY_OFF_DAYS;
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  if (weeklyOffDays.includes(dayOfWeek)) {
    return buildResult('weekly_off', grossHours, netHours, overtimeHours, 'weekly_off', isLateArrival, isEarlyDeparture, audit);
  }

  // — Priority 3: Approved Leave —
  const [approvedLeave] = await db
    .select({ id: leaveRequests.id, isHalfDay: leaveRequests.isHalfDay })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.employeeId, userId),
      eq(leaveRequests.status, 'approved'),
      lte(leaveRequests.startDate, date),
      gte(leaveRequests.endDate, date)
    ))
    .limit(1);

  if (approvedLeave) {
    const leaveStatus = approvedLeave.isHalfDay ? 'half_day' : 'on_leave';
    const result = buildResult(leaveStatus, grossHours, netHours, overtimeHours, 'leave', isLateArrival, isEarlyDeparture, audit);
    result.leaveId = approvedLeave.id;
    return result;
  }

  // — Priority 4: Hours-based —
  if (!checkInTime && workingHoursOverride == null) {
    return buildResult('absent', 0, 0, 0, 'no_data', false, false, audit);
  }

  if (!checkInTime) {
    console.error(
      `[AttendanceStatusEngine] RULE VIOLATION: userId=${userId} date=${date} ` +
      `reached hours-based calculation without a check-in time. Forcing absent.`
    );
    return buildResult('absent', 0, 0, 0, 'no_data', false, false, audit);
  }

  let status: string;
  if (netHours >= fullDayMin) {
    status = 'present';
  } else if (netHours >= halfDayMin) {
    status = 'half_day';
  } else {
    status = 'absent';
  }

  return buildResult(status, grossHours, netHours, overtimeHours, 'hours', isLateArrival, isEarlyDeparture, audit);
}

function buildResult(
  status: string,
  grossHours: number,
  netHours: number,
  overtimeHours: number,
  source: string,
  isLateArrival: boolean,
  isEarlyDeparture: boolean,
  audit: { minimumDailyHoursUsed?: number; halfDayMinimumHoursUsed?: number; workTimePolicyUsed?: string } = {},
): StatusResult {
  return {
    status,
    workingHours: Number(grossHours.toFixed(2)),
    netWorkingHours: Number(netHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    statusSource: source,
    isLateArrival,
    isEarlyDeparture,
    ...audit,
  };
}
