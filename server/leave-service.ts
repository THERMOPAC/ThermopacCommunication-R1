/**
 * Leave Service — Central service layer for all leave operations.
 * ALL balance mutations must go through this file (no inline DB writes in routes).
 *
 * Baseline: docs/leave-management-correction-plan-baseline-v1.0.md
 */

import { db } from './db';
import {
  leaveRequests,
  leaveBalances,
  leaveTypes,
  leaveDeductions,
  leaveAccrualLog,
  lwpExemptionAuditLog,
  attendanceRecords,
  users,
  companyHolidays,
} from '@shared/schema';
import {
  eq,
  and,
  gte,
  lte,
  sql,
  inArray,
  desc,
  isNull,
  ne,
} from 'drizzle-orm';
import { computeSandwichLeave } from './sandwich-leave-utils';
import { createNotification } from './notification-routes';

// ─── Constants ─────────────────────────────────────────────────────────────
export const SANDWICH_EFFECTIVE_DATE = '2026-05-01';
const LWP_EXEMPT_ROLES = ['Superuser', 'General Manager', 'Senior Manager'];

// ─── Helper: get holiday set for a date range ──────────────────────────────
async function getHolidaySet(startDate: string, endDate: string): Promise<Set<string>> {
  const rows = await db
    .select({ date: companyHolidays.date })
    .from(companyHolidays)
    .where(and(gte(companyHolidays.date, startDate), lte(companyHolidays.date, endDate)));
  return new Set(rows.map((r: any) => {
    const d = typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0];
    return d.slice(0, 10);
  }));
}

// ─── Helper: upsert leave balance ──────────────────────────────────────────
async function upsertBalance(
  tx: typeof db,
  userId: number,
  leaveTypeId: number,
  year: number,
  delta: {
    pendingDays?: number;
    usedDays?: number;
    allocatedDays?: number;
  }
): Promise<void> {
  const [existing] = await tx
    .select({ id: leaveBalances.id })
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.userId, userId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year)
      )
    );

  if (!existing) {
    await tx.insert(leaveBalances).values({
      userId,
      leaveTypeId,
      year,
      allocatedDays: (delta.allocatedDays ?? 0).toFixed(2),
      usedDays: (delta.usedDays ?? 0).toFixed(2),
      pendingDays: (delta.pendingDays ?? 0).toFixed(2),
      carryoverDays: '0',
      lastUpdated: new Date(),
    });
  } else {
    const sets: Record<string, any> = { lastUpdated: new Date() };
    if (delta.pendingDays !== undefined) {
      const sign = delta.pendingDays >= 0 ? '+' : '';
      sets.pendingDays = sql`GREATEST(0, pending_days ${sql.raw(sign + delta.pendingDays)})`;
    }
    if (delta.usedDays !== undefined) {
      const sign = delta.usedDays >= 0 ? '+' : '';
      sets.usedDays = sql`GREATEST(0, used_days ${sql.raw(sign + delta.usedDays)})`;
    }
    if (delta.allocatedDays !== undefined) {
      const sign = delta.allocatedDays >= 0 ? '+' : '';
      sets.allocatedDays = sql`GREATEST(0, allocated_days ${sql.raw(sign + delta.allocatedDays)})`;
    }
    await tx
      .update(leaveBalances)
      .set(sets)
      .where(eq(leaveBalances.id, existing.id));
  }
}

// ─── Helper: create/update attendance records for a leave span ─────────────
async function writeAttendanceForLeave(
  tx: typeof db,
  employeeId: number,
  startDate: string,
  endDate: string,
  isHalfDay: boolean,
  requestId: number
): Promise<void> {
  const leaveStatus = isHalfDay ? 'half_day' : 'on_leave';
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const [existing] = await tx
      .select({ id: attendanceRecords.id, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, employeeId),
          eq(attendanceRecords.date, dateStr)
        )
      );
    if (existing) {
      if (existing.status !== leaveStatus) {
        await tx.update(attendanceRecords).set({
          status: leaveStatus,
          statusSource: 'leave',
          adminNotes: `Leave approved (request #${requestId})`,
          updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, existing.id));
      }
    } else {
      await tx.insert(attendanceRecords).values({
        userId: employeeId,
        date: dateStr,
        status: leaveStatus,
        statusSource: 'leave',
        source: 'system',
        adminNotes: `Leave approved (request #${requestId})`,
      });
    }
  }
}

// ─── Helper: void attendance records for a leave span ─────────────────────
async function voidAttendanceForLeave(
  tx: typeof db,
  employeeId: number,
  startDate: string,
  endDate: string,
  requestId: number
): Promise<void> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    await tx.update(attendanceRecords).set({
      status: 'absent',
      statusSource: 'admin',
      adminNotes: `Leave revoked (request #${requestId})`,
      updatedAt: new Date(),
    }).where(
      and(
        eq(attendanceRecords.userId, employeeId),
        eq(attendanceRecords.date, dateStr),
        eq(attendanceRecords.statusSource, 'leave')
      )
    );
  }
}

// ─── Helper: create sandwich deductions for an approved leave ──────────────
async function createSandwichDeductionsForLeave(
  tx: typeof db,
  leaveRequestId: number,
  employeeId: number,
  leaveTypeId: number,
  startDate: string,
  endDate: string,
  weeklyOffDays: number[],
  holidayDates: Set<string>
): Promise<void> {
  if (startDate < SANDWICH_EFFECTIVE_DATE) return;

  const sandwich = computeSandwichLeave(startDate, endDate, weeklyOffDays, holidayDates, true);
  if (sandwich.offDates.length === 0) return;

  // Delete any stale deductions for this request first (idempotent)
  await tx.delete(leaveDeductions).where(eq(leaveDeductions.leaveRequestId, leaveRequestId));

  for (const off of sandwich.offDates) {
    await tx.insert(leaveDeductions).values({
      leaveRequestId,
      employeeId,
      leaveTypeId,
      deductionDate: off.date,
      days: '1',
      deductionType: 'sandwich',
      reason: `Sandwiched ${off.reason}: ${off.date}`,
      status: 'approved',
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC SERVICE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

// ─── applyLeave ─────────────────────────────────────────────────────────────
export interface ApplyLeaveInput {
  userId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  isHalfDay: boolean;
  halfDayPeriod?: string | null;
  reason: string;
  emergencyContact?: string | null;
  workHandoverNotes?: string | null;
  managerId: number;
}

export async function applyLeave(input: ApplyLeaveInput): Promise<typeof leaveRequests.$inferSelect> {
  return await db.transaction(async (tx) => {
    const {
      userId,
      leaveTypeId,
      startDate,
      endDate,
      totalDays,
      isHalfDay,
      halfDayPeriod,
      reason,
      emergencyContact,
      workHandoverNotes,
      managerId,
    } = input;

    const [newRequest] = await tx
      .insert(leaveRequests)
      .values({
        employeeId: userId,
        leaveTypeId,
        startDate,
        endDate,
        totalDays: totalDays.toString(),
        isHalfDay: isHalfDay || false,
        halfDayPeriod: isHalfDay ? halfDayPeriod : null,
        reason,
        emergencyContact: emergencyContact || null,
        workHandoverNotes: workHandoverNotes || null,
        status: 'pending',
        managerId,
        managerApprovalStatus: 'pending',
      })
      .returning();

    const balanceYear = new Date(startDate).getFullYear();
    await upsertBalance(tx, userId, leaveTypeId, balanceYear, { pendingDays: totalDays });

    return newRequest;
  });
}

// ─── approveLeave ───────────────────────────────────────────────────────────
export async function approveLeave(
  requestId: number,
  managerId: number,
  comments?: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, requestId));

    if (!req) throw new Error('Leave request not found');
    if (req.managerApprovalStatus !== 'pending') {
      throw new Error('Request has already been processed');
    }

    await tx.update(leaveRequests).set({
      status: 'approved',
      managerApprovalStatus: 'approved',
      managerApprovalDate: new Date(),
      managerComments: comments || null,
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, requestId));

    const totalDays = parseFloat(req.totalDays);
    const balanceYear = new Date(req.startDate).getFullYear();

    await upsertBalance(tx, req.employeeId, req.leaveTypeId, balanceYear, {
      pendingDays: -totalDays,
      usedDays: totalDays,
    });

    // Write attendance records
    await writeAttendanceForLeave(tx, req.employeeId, req.startDate, req.endDate, req.isHalfDay || false, requestId);

    // Create sandwich deduction records if applicable
    const [leaveType] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, req.leaveTypeId));
    if (leaveType?.sandwichApplicable && !req.isHalfDay && req.startDate >= SANDWICH_EFFECTIVE_DATE) {
      const [userRow] = await tx.select({ weeklyOffDays: users.weeklyOffDays }).from(users).where(eq(users.id, req.employeeId));
      const weeklyOffDays: number[] = (userRow?.weeklyOffDays as number[] | null) ?? [0, 6];
      const startYear = new Date(req.startDate).getFullYear();
      const endYear = new Date(req.endDate).getFullYear();
      const holidayDates = await getHolidaySet(`${startYear}-01-01`, `${endYear}-12-31`);
      await createSandwichDeductionsForLeave(tx, requestId, req.employeeId, req.leaveTypeId, req.startDate, req.endDate, weeklyOffDays, holidayDates);
    }
  });
}

// ─── rejectLeave ────────────────────────────────────────────────────────────
export async function rejectLeave(
  requestId: number,
  managerId: number,
  comments: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, requestId));

    if (!req) throw new Error('Leave request not found');
    if (req.managerApprovalStatus !== 'pending') {
      throw new Error('Request has already been processed');
    }

    await tx.update(leaveRequests).set({
      status: 'rejected',
      managerApprovalStatus: 'rejected',
      managerApprovalDate: new Date(),
      managerComments: comments,
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, requestId));

    const totalDays = parseFloat(req.totalDays);
    const balanceYear = new Date(req.startDate).getFullYear();
    await upsertBalance(tx, req.employeeId, req.leaveTypeId, balanceYear, { pendingDays: -totalDays });
  });
}

// ─── cancelLeave ────────────────────────────────────────────────────────────
export async function cancelLeave(
  requestId: number,
  userId: number
): Promise<void> {
  await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.employeeId, userId)));

    if (!req) throw new Error('Request not found');
    if (req.status !== 'pending') throw new Error('Only pending requests can be cancelled');

    await tx.update(leaveRequests).set({
      status: 'canceled',
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, requestId));

    const totalDays = parseFloat(req.totalDays);
    const balanceYear = new Date(req.startDate).getFullYear();
    await upsertBalance(tx, req.employeeId, req.leaveTypeId, balanceYear, { pendingDays: -totalDays });
  });
}

// ─── revokeApprovedLeave ────────────────────────────────────────────────────
// Admin-only: revoke an approved leave (reverses balance, voids attendance, voids deductions)
export async function revokeApprovedLeave(
  requestId: number,
  revokedBy: number,
  reason: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));

    if (!req) throw new Error('Leave request not found');
    if (req.status !== 'approved') throw new Error('Only approved leaves can be revoked');

    await tx.update(leaveRequests).set({
      status: 'revoked' as any,
      managerComments: `REVOKED by admin (id:${revokedBy}): ${reason}`,
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, requestId));

    const totalDays = parseFloat(req.totalDays);
    const balanceYear = new Date(req.startDate).getFullYear();
    await upsertBalance(tx, req.employeeId, req.leaveTypeId, balanceYear, { usedDays: -totalDays });

    // Void attendance records set by this leave
    await voidAttendanceForLeave(tx, req.employeeId, req.startDate, req.endDate, requestId);

    // Void sandwich deduction records
    await tx.update(leaveDeductions).set({
      status: 'revoked',
      voidedBy: revokedBy,
      voidedAt: new Date(),
      voidReason: reason,
      updatedAt: new Date(),
    }).where(
      and(
        eq(leaveDeductions.leaveRequestId, requestId),
        eq(leaveDeductions.status, 'approved')
      )
    );
  });
}

// ─── adminApproveLeave ──────────────────────────────────────────────────────
// Admin version: works for any employee (no manager check)
export async function adminApproveLeave(
  requestId: number,
  adminId: number,
  comments?: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
    if (!req) throw new Error('Leave request not found');

    const wasApproved = req.status === 'approved';

    await tx.update(leaveRequests).set({
      status: 'approved',
      managerApprovalStatus: 'approved',
      managerApprovalDate: new Date(),
      managerComments: comments || null,
      managerId: req.managerId || adminId,
      approvedBy: adminId,
      approvedDate: new Date(),
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, requestId));

    const totalDays = parseFloat(req.totalDays);
    const balanceYear = new Date(req.startDate).getFullYear();

    if (!wasApproved) {
      // Reverse pending and add to used
      await upsertBalance(tx, req.employeeId, req.leaveTypeId, balanceYear, {
        pendingDays: -totalDays,
        usedDays: totalDays,
      });
      await writeAttendanceForLeave(tx, req.employeeId, req.startDate, req.endDate, req.isHalfDay || false, requestId);

      // Sandwich deductions
      const [leaveType] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, req.leaveTypeId));
      if (leaveType?.sandwichApplicable && !req.isHalfDay && req.startDate >= SANDWICH_EFFECTIVE_DATE) {
        const [userRow] = await tx.select({ weeklyOffDays: users.weeklyOffDays }).from(users).where(eq(users.id, req.employeeId));
        const weeklyOffDays: number[] = (userRow?.weeklyOffDays as number[] | null) ?? [0, 6];
        const startYear = new Date(req.startDate).getFullYear();
        const endYear = new Date(req.endDate).getFullYear();
        const holidayDates = await getHolidaySet(`${startYear}-01-01`, `${endYear}-12-31`);
        await createSandwichDeductionsForLeave(tx, requestId, req.employeeId, req.leaveTypeId, req.startDate, req.endDate, weeklyOffDays, holidayDates);
      }
    }
  });
}

// ─── adminRejectLeave ───────────────────────────────────────────────────────
export async function adminRejectLeave(
  requestId: number,
  adminId: number,
  comments: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
    if (!req) throw new Error('Leave request not found');

    const wasPending = req.status === 'pending';

    await tx.update(leaveRequests).set({
      status: 'rejected',
      managerApprovalStatus: 'rejected',
      managerApprovalDate: new Date(),
      managerComments: comments,
      rejectionReason: comments,
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, requestId));

    if (wasPending) {
      const totalDays = parseFloat(req.totalDays);
      const balanceYear = new Date(req.startDate).getFullYear();
      await upsertBalance(tx, req.employeeId, req.leaveTypeId, balanceYear, { pendingDays: -totalDays });
    }
  });
}

// ─── adminCreateLeave ───────────────────────────────────────────────────────
// Admin bypass-safe leave creation: always posts balance entry
export async function adminCreateLeave(input: {
  employeeId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  isHalfDay?: boolean;
  halfDayPeriod?: string | null;
  reason: string;
  status?: string;
  managerId?: number | null;
  adminId: number;
}): Promise<typeof leaveRequests.$inferSelect> {
  return await db.transaction(async (tx) => {
    const status = (input.status || 'pending') as string;
    const [newRequest] = await tx
      .insert(leaveRequests)
      .values({
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        totalDays: input.totalDays.toString(),
        isHalfDay: input.isHalfDay || false,
        halfDayPeriod: input.halfDayPeriod || null,
        reason: input.reason,
        status,
        managerId: input.managerId || null,
        managerApprovalStatus: status === 'approved' ? 'approved' : 'pending',
        approvedBy: status === 'approved' ? input.adminId : null,
        approvedDate: status === 'approved' ? new Date() : null,
      })
      .returning();

    const balanceYear = new Date(input.startDate).getFullYear();

    if (status === 'approved') {
      await upsertBalance(tx, input.employeeId, input.leaveTypeId, balanceYear, { usedDays: input.totalDays });
      await writeAttendanceForLeave(tx, input.employeeId, input.startDate, input.endDate, input.isHalfDay || false, newRequest.id);

      // Sandwich deductions
      const [leaveType] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, input.leaveTypeId));
      if (leaveType?.sandwichApplicable && !input.isHalfDay && input.startDate >= SANDWICH_EFFECTIVE_DATE) {
        const [userRow] = await tx.select({ weeklyOffDays: users.weeklyOffDays }).from(users).where(eq(users.id, input.employeeId));
        const weeklyOffDays: number[] = (userRow?.weeklyOffDays as number[] | null) ?? [0, 6];
        const startYear = new Date(input.startDate).getFullYear();
        const endYear = new Date(input.endDate).getFullYear();
        const holidayDates = await getHolidaySet(`${startYear}-01-01`, `${endYear}-12-31`);
        await createSandwichDeductionsForLeave(tx, newRequest.id, input.employeeId, input.leaveTypeId, input.startDate, input.endDate, weeklyOffDays, holidayDates);
      }
    } else {
      await upsertBalance(tx, input.employeeId, input.leaveTypeId, balanceYear, { pendingDays: input.totalDays });
    }

    return newRequest;
  });
}

// ─── voidSandwichDeduction ─────────────────────────────────────────────────
// Admin: void a specific sandwich deduction row (e.g., employee applied separate leave for that day)
export async function voidSandwichDeduction(
  deductionId: number,
  adminId: number,
  reason: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [ded] = await tx.select().from(leaveDeductions).where(eq(leaveDeductions.id, deductionId));
    if (!ded) throw new Error('Deduction not found');
    if (ded.status !== 'approved') throw new Error('Only approved deductions can be voided');

    await tx.update(leaveDeductions).set({
      status: 'voided',
      voidedBy: adminId,
      voidedAt: new Date(),
      voidReason: reason,
      updatedAt: new Date(),
    }).where(eq(leaveDeductions.id, deductionId));

    // Reverse the balance (the sandwich day is no longer deducted)
    const days = parseFloat(ded.days);
    const balanceYear = new Date(ded.deductionDate).getFullYear();
    await upsertBalance(tx, ded.employeeId, ded.leaveTypeId, balanceYear, { usedDays: -days });
  });
}

// ─── runMonthlyClAccrual ────────────────────────────────────────────────────
// Runs on the 1st of each month (called by midnight cron or manual trigger)
// Adds monthly_accrual_rate days to allocated_days for all accrual-type leave types
export async function runMonthlyClAccrual(accrualMonth: string, runBy?: number): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
}> {
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Find all leave types with accrual_type = 'monthly'
  const accrualLeaveTypes = await db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.accrualType, 'monthly'), eq(leaveTypes.isActive, true)));

  if (accrualLeaveTypes.length === 0) return { processed, skipped, errors };

  // Get all active users
  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isActive, true));

  const year = parseInt(accrualMonth.split('-')[0]);

  for (const lt of accrualLeaveTypes) {
    const rate = parseFloat(lt.monthlyAccrualRate || '0');
    if (rate <= 0) {
      skipped++;
      continue;
    }

    for (const user of activeUsers) {
      try {
        // Check if accrual already ran this month for this user+type
        const [existing] = await db
          .select({ id: leaveAccrualLog.id })
          .from(leaveAccrualLog)
          .where(
            and(
              eq(leaveAccrualLog.userId, user.id),
              eq(leaveAccrualLog.leaveTypeId, lt.id),
              eq(leaveAccrualLog.accrualMonth, accrualMonth)
            )
          );

        if (existing) {
          skipped++;
          continue;
        }

        // Add to balance
        await upsertBalance(db, user.id, lt.id, year, { allocatedDays: rate });

        // Fetch new balance for log
        const [bal] = await db
          .select({ allocatedDays: leaveBalances.allocatedDays, usedDays: leaveBalances.usedDays, carryoverDays: leaveBalances.carryoverDays })
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.userId, user.id),
              eq(leaveBalances.leaveTypeId, lt.id),
              eq(leaveBalances.year, year)
            )
          );

        const balanceAfter = bal
          ? parseFloat(bal.allocatedDays) + parseFloat(bal.carryoverDays || '0') - parseFloat(bal.usedDays || '0')
          : rate;

        await db.insert(leaveAccrualLog).values({
          userId: user.id,
          leaveTypeId: lt.id,
          accrualMonth,
          daysAccrued: rate.toString(),
          balanceAfter: balanceAfter.toFixed(2),
          runBy: runBy ?? null,
          notes: `Auto monthly accrual: ${rate} days for ${lt.name}`,
        });

        processed++;
      } catch (err: any) {
        errors.push(`User ${user.id}: ${err.message}`);
      }
    }
  }

  console.log(`[LeaveAccrual] ${accrualMonth}: processed=${processed}, skipped=${skipped}, errors=${errors.length}`);
  return { processed, skipped, errors };
}

// ─── runYearEndClCarryover ──────────────────────────────────────────────────
// Runs on Dec 31 (or Jan 1) — carries over eligible unused balance to next year
export async function runYearEndClCarryover(fromYear: number, runBy?: number): Promise<{
  processed: number;
  errors: string[];
}> {
  let processed = 0;
  const errors: string[] = [];
  const toYear = fromYear + 1;

  const carryoverTypes = await db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.carryoverAllowed, true), eq(leaveTypes.isActive, true)));

  const activeUsers = await db.select({ id: users.id }).from(users).where(eq(users.isActive, true));

  for (const lt of carryoverTypes) {
    const maxCarryover = parseFloat(lt.maxCarryoverDays || '0');

    for (const user of activeUsers) {
      try {
        const [fromBal] = await db
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.userId, user.id),
              eq(leaveBalances.leaveTypeId, lt.id),
              eq(leaveBalances.year, fromYear)
            )
          );

        if (!fromBal) continue;

        const allocated = parseFloat(fromBal.allocatedDays);
        const carryover = parseFloat(fromBal.carryoverDays || '0');
        const used = parseFloat(fromBal.usedDays || '0');
        const unused = Math.max(0, allocated + carryover - used);
        const toCarry = Math.min(unused, maxCarryover);

        if (toCarry <= 0) continue;

        await upsertBalance(db, user.id, lt.id, toYear, { allocatedDays: toCarry });

        await db
          .update(leaveBalances)
          .set({ carryoverDays: toCarry.toFixed(2), lastUpdated: new Date() })
          .where(
            and(
              eq(leaveBalances.userId, user.id),
              eq(leaveBalances.leaveTypeId, lt.id),
              eq(leaveBalances.year, toYear)
            )
          );

        processed++;
      } catch (err: any) {
        errors.push(`User ${user.id} / Type ${lt.id}: ${err.message}`);
      }
    }
  }

  console.log(`[LeaveCarryover] ${fromYear}→${toYear}: processed=${processed}, errors=${errors.length}`);
  return { processed, errors };
}

// ─── isLwpExempt ────────────────────────────────────────────────────────────
// Returns true if the user is exempt from LWP/LOP deduction
export async function isLwpExempt(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ role: users.role, lwpExempt: users.lwpExempt })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return false;
  if (LWP_EXEMPT_ROLES.includes(user.role)) return true;
  return user.lwpExempt === true;
}

// ─── grantLwpExemption ──────────────────────────────────────────────────────
export async function grantLwpExemption(
  targetUserId: number,
  grantedBy: number,
  reason: string,
  nextReview?: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({
      lwpExempt: true,
      lwpExemptReason: reason,
      lwpExemptGrantedBy: grantedBy,
      lwpExemptGrantedAt: new Date(),
      lwpExemptNextReview: nextReview || null,
    }).where(eq(users.id, targetUserId));

    await tx.insert(lwpExemptionAuditLog).values({
      userId: targetUserId,
      action: 'granted',
      grantedBy,
      reason,
      effectiveFrom: new Date().toISOString().split('T')[0],
      nextReview: nextReview || null,
    });
  });
}

// ─── revokeLwpExemption ─────────────────────────────────────────────────────
export async function revokeLwpExemption(
  targetUserId: number,
  revokedBy: number,
  reason: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({
      lwpExempt: false,
      lwpExemptReason: null,
      lwpExemptGrantedBy: null,
      lwpExemptGrantedAt: null,
      lwpExemptNextReview: null,
    }).where(eq(users.id, targetUserId));

    await tx.insert(lwpExemptionAuditLog).values({
      userId: targetUserId,
      action: 'revoked',
      grantedBy: revokedBy,
      reason,
      effectiveFrom: new Date().toISOString().split('T')[0],
    });
  });
}
