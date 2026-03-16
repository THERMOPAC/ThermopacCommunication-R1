import { db } from './db';
import { payrollLocks, payrollLockExceptions, payrollPeriods } from '@shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export type LockModule = 'attendance' | 'leave' | 'salary' | 'payroll' | 'full';

interface LockCheckResult {
  isLocked: boolean;
  lockId?: number;
  lockType?: string;
  hasException?: boolean;
  exceptionId?: number;
  periodId?: number;
  message?: string;
}

export async function checkPayrollLock(
  module: LockModule,
  effectiveDate: string,
  userId?: number
): Promise<LockCheckResult> {
  const periods = await db
    .select()
    .from(payrollPeriods)
    .where(
      and(
        lte(payrollPeriods.startDate, effectiveDate),
        gte(payrollPeriods.endDate, effectiveDate)
      )
    );

  if (periods.length === 0) {
    return { isLocked: false, message: 'No payroll period covers this date' };
  }

  const period = periods[0];

  const locks = await db
    .select()
    .from(payrollLocks)
    .where(
      and(
        eq(payrollLocks.periodId, period.id),
        eq(payrollLocks.isLocked, true)
      )
    )
    .orderBy(desc(payrollLocks.lockedAt));

  const matchingLock = locks.find(
    (l) => l.lockType === 'full' || l.lockType === module
  );

  if (!matchingLock) {
    return { isLocked: false, periodId: period.id };
  }

  if (userId) {
    const exceptions = await db
      .select()
      .from(payrollLockExceptions)
      .where(
        and(
          eq(payrollLockExceptions.lockId, matchingLock.id),
          eq(payrollLockExceptions.userId, userId),
          eq(payrollLockExceptions.status, 'approved')
        )
      );

    const validException = exceptions.find((e) => {
      if (e.expiresAt && new Date(e.expiresAt) < new Date()) return false;
      if (e.closedAt) return false;
      return true;
    });

    if (validException) {
      return {
        isLocked: false,
        lockId: matchingLock.id,
        lockType: matchingLock.lockType,
        hasException: true,
        exceptionId: validException.id,
        periodId: period.id,
        message: 'Lock bypassed via approved exception',
      };
    }
  }

  return {
    isLocked: true,
    lockId: matchingLock.id,
    lockType: matchingLock.lockType,
    periodId: period.id,
    message: `Period is locked (${matchingLock.lockType} lock)`,
  };
}

export async function createPayrollLock(
  periodId: number,
  lockType: LockModule,
  lockedBy: number,
  lockReason?: string
): Promise<any> {
  const existing = await db
    .select()
    .from(payrollLocks)
    .where(
      and(
        eq(payrollLocks.periodId, periodId),
        eq(payrollLocks.lockType, lockType),
        eq(payrollLocks.isLocked, true)
      )
    );

  if (existing.length > 0) {
    return existing[0];
  }

  const [lock] = await db
    .insert(payrollLocks)
    .values({
      periodId,
      lockType,
      isLocked: true,
      lockedBy,
      lockReason: lockReason || `Auto-locked after payroll processing`,
      lockedAt: new Date(),
    })
    .returning();

  return lock;
}

export async function unlockPayrollLock(
  lockId: number,
  unlockedBy: number,
  unlockReason: string
): Promise<any> {
  const [updated] = await db
    .update(payrollLocks)
    .set({
      isLocked: false,
      unlockedAt: new Date(),
      unlockedBy,
      unlockReason,
    })
    .where(eq(payrollLocks.id, lockId))
    .returning();

  return updated;
}

export async function getLocksForPeriod(periodId: number): Promise<any[]> {
  return db
    .select()
    .from(payrollLocks)
    .where(eq(payrollLocks.periodId, periodId))
    .orderBy(desc(payrollLocks.lockedAt));
}

export async function createLockException(data: {
  lockId: number;
  userId: number;
  reason: string;
  requestedBy: number;
}): Promise<any> {
  const [exception] = await db
    .insert(payrollLockExceptions)
    .values({
      lockId: data.lockId,
      userId: data.userId,
      reason: data.reason,
      requestedBy: data.requestedBy,
      status: 'pending',
    })
    .returning();

  return exception;
}

export async function approveLockException(
  exceptionId: number,
  approvedBy: number,
  expiresAt?: Date
): Promise<any> {
  const [updated] = await db
    .update(payrollLockExceptions)
    .set({
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
      expiresAt: expiresAt || null,
    })
    .where(eq(payrollLockExceptions.id, exceptionId))
    .returning();

  return updated;
}

export async function rejectLockException(
  exceptionId: number,
  approvedBy: number
): Promise<any> {
  const [updated] = await db
    .update(payrollLockExceptions)
    .set({
      status: 'rejected',
      approvedBy,
      approvedAt: new Date(),
    })
    .where(eq(payrollLockExceptions.id, exceptionId))
    .returning();

  return updated;
}

export async function closeLockException(
  exceptionId: number,
  closedBy: number,
  changesDescription?: string
): Promise<any> {
  const [updated] = await db
    .update(payrollLockExceptions)
    .set({
      closedAt: new Date(),
      closedBy,
      changesDescription,
    })
    .where(eq(payrollLockExceptions.id, exceptionId))
    .returning();

  return updated;
}

export async function getLockExceptions(lockId: number): Promise<any[]> {
  return db
    .select()
    .from(payrollLockExceptions)
    .where(eq(payrollLockExceptions.lockId, lockId));
}
