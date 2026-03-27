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
  };
  workLocationId?: number | null;
}

export interface StatusResult {
  status: string;
  workingHours: number;
  netWorkingHours: number;
  overtimeHours: number;
  statusSource: string;
  leaveId?: number;
}

const DEFAULTS = {
  FULL_DAY_MINIMUM_HOURS: 8,
  HALF_DAY_MINIMUM_HOURS: 4,
  WEEKLY_OFF_DAYS: [0, 6],
  STANDARD_WORKING_HOURS: 8,
  LUNCH_BREAK_MINUTES: 60,
} as const;

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

  const [holiday] = await db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(eq(companyHolidays.date, date))
    .limit(1);

  if (holiday) {
    return buildResult('holiday', grossHours, netHours, overtimeHours, 'holiday');
  }

  const weeklyOffDays = userConfig.weeklyOffDays ?? DEFAULTS.WEEKLY_OFF_DAYS;
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  if (weeklyOffDays.includes(dayOfWeek)) {
    return buildResult('weekly off', grossHours, netHours, overtimeHours, 'weekly_off');
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
    const result = buildResult(leaveStatus, grossHours, netHours, overtimeHours, 'leave');
    result.leaveId = approvedLeave.id;
    return result;
  }

  if (!checkInTime && workingHoursOverride == null) {
    return buildResult('absent', 0, 0, 0, 'no_data');
  }

  const fullDayMin = userConfig.minimumDailyHours ?? DEFAULTS.FULL_DAY_MINIMUM_HOURS;
  const halfDayMin = userConfig.halfDayMinimumHours ?? DEFAULTS.HALF_DAY_MINIMUM_HOURS;

  let status: string;
  if (grossHours >= fullDayMin) {
    status = 'present';
  } else if (grossHours >= halfDayMin) {
    status = 'half_day';
  } else {
    status = 'absent';
  }

  return buildResult(status, grossHours, netHours, overtimeHours, 'hours');
}

function buildResult(
  status: string,
  grossHours: number,
  netHours: number,
  overtimeHours: number,
  source: string,
): StatusResult {
  return {
    status,
    workingHours: Number(grossHours.toFixed(2)),
    netWorkingHours: Number(netHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    statusSource: source,
  };
}
