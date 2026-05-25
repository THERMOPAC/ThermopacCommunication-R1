import { createHmac, timingSafeEqual } from 'crypto';

export interface ApprovalTokenParams {
  artefact_type:      string;
  artefact_id:        number | string;
  baseline_revision:  string;
  baselined_by:       number | string;
  baselined_at_iso:   string;
  countersigned_by:   number | string;
  approval_discipline: string;
}

export function generateApprovalToken(params: ApprovalTokenParams): string {
  const key = process.env.SESSION_SECRET!;
  const msg = [
    params.artefact_type,
    String(params.artefact_id),
    params.baseline_revision,
    String(params.baselined_by),
    params.baselined_at_iso,
    String(params.countersigned_by),
    params.approval_discipline,
  ].join('|');
  return createHmac('sha256', key).update(msg).digest('hex');
}

export function verifyApprovalToken(params: ApprovalTokenParams, storedToken: string): boolean {
  const expected = generateApprovalToken(params);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(storedToken, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
