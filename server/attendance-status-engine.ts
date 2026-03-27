import { db } from './db';
import { leaveRequests, companyHolidays, attendanceSettings } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

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
 * Status is determined using NET hours (gross minus break deduction).
 * If no break deduction is configured, net hours = gross hours.
 *
 * Late arrival / early departure flags are set when workTimePolicy = 'Fixed'.
 * When workTimePolicy = 'Flexible', flags are not set.
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

  const policy = userConfig.workTimePolicy || 'Fixed';
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

    if (checkIn.getTime() > lateThreshold.getTime()) {
      isLateArrival = true;
    }
    if (checkOut.getTime() < earlyThreshold.getTime()) {
      isEarlyDeparture = true;
    }
  }

  const [holiday] = await db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(eq(companyHolidays.date, date))
    .limit(1);

  if (holiday) {
    return buildResult('holiday', grossHours, netHours, overtimeHours, 'holiday', isLateArrival, isEarlyDeparture);
  }

  const weeklyOffDays = userConfig.weeklyOffDays ?? DEFAULTS.WEEKLY_OFF_DAYS;
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  if (weeklyOffDays.includes(dayOfWeek)) {
    return buildResult('weekly off', grossHours, netHours, overtimeHours, 'weekly_off', isLateArrival, isEarlyDeparture);
  }

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
    const leaveStatus = approvedLeave.isHalfDay ? 'half_day' : 'present';
    const result = buildResult(leaveStatus, grossHours, netHours, overtimeHours, 'leave', isLateArrival, isEarlyDeparture);
    result.leaveId = approvedLeave.id;
    return result;
  }

  if (!checkInTime && workingHoursOverride == null) {
    return buildResult('absent', 0, 0, 0, 'no_data', false, false);
  }

  const fullDayMin = userConfig.minimumDailyHours ?? DEFAULTS.FULL_DAY_MINIMUM_HOURS;
  const halfDayMin = userConfig.halfDayMinimumHours ?? DEFAULTS.HALF_DAY_MINIMUM_HOURS;

  let status: string;
  if (netHours >= fullDayMin) {
    status = 'present';
  } else if (netHours >= halfDayMin) {
    status = 'half_day';
  } else {
    status = 'absent';
  }

  return buildResult(status, grossHours, netHours, overtimeHours, 'hours', isLateArrival, isEarlyDeparture);
}

function buildResult(
  status: string,
  grossHours: number,
  netHours: number,
  overtimeHours: number,
  source: string,
  isLateArrival: boolean,
  isEarlyDeparture: boolean,
): StatusResult {
  return {
    status,
    workingHours: Number(grossHours.toFixed(2)),
    netWorkingHours: Number(netHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    statusSource: source,
    isLateArrival,
    isEarlyDeparture,
  };
}
