import { db } from '../../db';
import { payrollPeriods } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export async function runPayrollPeriodAutoCreate(): Promise<number> {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;

  const existing = await db.select().from(payrollPeriods)
    .where(
      and(
        gte(payrollPeriods.startDate, `${nextYear}-01-01`),
        lte(payrollPeriods.startDate, `${nextYear}-12-31`)
      )
    );

  if (existing.length >= 12) {
    console.log(`[PayrollPeriodAutoCreate] ${new Date().toISOString()} — All 12 periods for ${nextYear} already exist. Skipping.`);
    return 0;
  }

  const existingMonths = new Set(existing.map(p => {
    const d = new Date(p.startDate);
    return d.getMonth() + 1;
  }));

  let created = 0;

  for (let month = 1; month <= 12; month++) {
    if (existingMonths.has(month)) continue;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    const lastDay = new Date(nextYear, month, 0).getDate();
    const startDate = `${nextYear}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${nextYear}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let payDate: string;
    if (month === 12) {
      payDate = `${nextYear + 1}-01-01`;
    } else {
      payDate = `${nextYear}-${String(month + 1).padStart(2, '0')}-01`;
    }

    const periodName = `${monthNames[month - 1]} ${nextYear}`;

    await db.insert(payrollPeriods).values({
      periodName,
      startDate,
      endDate,
      payDate,
      status: 'draft',
    });

    created++;
  }

  console.log(`[PayrollPeriodAutoCreate] ${new Date().toISOString()} — Created ${created} payroll periods for ${nextYear}.`);
  return created;
}

function cronToNextRunDelay(hour: number, minute: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

export function schedulePayrollPeriodAutoCreate() {
  const runDaily = () => {
    const now = new Date();
    if (now.getMonth() === 10 && now.getDate() === 1) {
      runPayrollPeriodAutoCreate().catch(err => {
        console.error('[PayrollPeriodAutoCreate] Error:', err.message);
      });
    }

    const nextDelay = cronToNextRunDelay(4, 0);
    const nextRunMinutes = Math.round(nextDelay / 60000);
    setTimeout(runDaily, nextDelay);
  };

  const initialDelay = cronToNextRunDelay(4, 0);
  const initialMinutes = Math.round(initialDelay / 60000);
  console.log(`[PayrollPeriodAutoCreate] Scheduled to check daily at 04:00 AM. Next year's periods auto-created on November 1st. First check in ${initialMinutes} minutes.`);
  setTimeout(runDaily, initialDelay);
}
