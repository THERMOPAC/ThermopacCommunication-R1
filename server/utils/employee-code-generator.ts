import { sql } from 'drizzle-orm';

export const EMPLOYEE_CODE_BANDS: Record<string, [number, number]> = {
  'Superuser':        [1,   99],
  'General Manager':  [100, 199],
  'Senior Manager':   [200, 299],
  'Manager':          [300, 399],
  'Senior Executive': [400, 499],
  'Employee':         [500, 999],
};

export function formatEmployeeCode(n: number): string {
  return `TPEL-${String(n).padStart(3, '0')}`;
}

export function parseEmployeeCodeNumber(code: string): number | null {
  const match = code.match(/^TPEL-(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Generate the next available employee code for a given role.
 * Must be called inside a DB transaction — the advisory lock is transaction-scoped.
 *
 * Reserved numbers come from two sources (approved governance):
 *   1. users.employee_code             — live codes (active + inactive employees)
 *   2. employee_code_audit_log.old_employee_code — retired codes (never reuse)
 *
 * new_employee_code is NOT reserved, so correction mistakes do not permanently
 * consume codes.
 */
export async function generateEmployeeCode(role: string, tx: any): Promise<string> {
  const band = EMPLOYEE_CODE_BANDS[role];
  if (!band) {
    throw new Error(`No employee code band defined for role: ${role}`);
  }
  const [min, max] = band;

  await tx.execute(sql`SELECT pg_advisory_xact_lock(${min})`);

  const result = await tx.execute(sql`
    SELECT CAST(SUBSTRING(employee_code FROM 6) AS INTEGER) AS n
    FROM users
    WHERE employee_code ~ '^TPEL-[0-9]+$'
      AND CAST(SUBSTRING(employee_code FROM 6) AS INTEGER) BETWEEN ${min} AND ${max}
    UNION
    SELECT CAST(SUBSTRING(old_employee_code FROM 6) AS INTEGER)
    FROM employee_code_audit_log
    WHERE old_employee_code ~ '^TPEL-[0-9]+$'
      AND CAST(SUBSTRING(old_employee_code FROM 6) AS INTEGER) BETWEEN ${min} AND ${max}
  `);

  const used = new Set<number>((result.rows as any[]).map((r: any) => Number(r.n)));

  for (let i = min; i <= max; i++) {
    if (!used.has(i)) {
      return formatEmployeeCode(i);
    }
  }

  throw new Error(
    `EMPLOYEE_CODE_BAND_EXHAUSTED: No available codes in band ${min}–${max} for role "${role}"`
  );
}
