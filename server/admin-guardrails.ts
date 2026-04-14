import path from 'path';

// ─── Guard types ─────────────────────────────────────────────────────────────

export class AdminGcsPathViolation extends Error {
  constructor(gcsPath: string, reason: string) {
    super(`AdminGcsPathViolation: path "${gcsPath}" rejected — ${reason}`);
    this.name = 'AdminGcsPathViolation';
  }
}

// ─── Blocked legacy roots (all previously used by Administration modules) ────

const BLOCKED_PREFIXES: string[] = [
  'Business_Trips/',
  'Business_Visa/',
  'visa-documents/',
  'contracts/',
  'compliance/',
  'posh-cases/',
  'legal-notices/',
  'policy-templates/',
  'nda-agreements/',
  'exclusivity-agreements/',
];

// ─── Approved ADMIN path patterns (covers all 18 module paths in Rev 2) ──────

const ALLOWED_PATTERNS: RegExp[] = [
  /^ADMIN\/Travel\/Employees\/[\w-]+\/Trips\/[\w-]+\/Documents\/[\w.-]+$/,
  /^ADMIN\/Travel\/Employees\/[\w-]+\/Trips\/[\w-]+\/Expenses\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Visa\/Employees\/[\w-]+\/Records\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Legal\/Contracts\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Legal\/Compliance\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Legal\/Posh\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Legal\/Notices\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Legal\/PolicyTemplates\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Legal\/NDA\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Legal\/Exclusivity\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Leave\/Requests\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Payroll\/Payslips\/[\w-]+\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Payroll\/Loans\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Payroll\/Advances\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Payroll\/TaxProofs\/[\w-]+\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Statutory\/Challans\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Statutory\/AdvanceTax\/[\w-]+\/[\w.-]+$/,
  /^ADMIN\/Appraisals\/Cycles\/[\w-]+\/Records\/[\w-]+\/[\w.-]+$/,
];

export function assertAdminGcsPath(gcsPath: string): void {
  for (const blocked of BLOCKED_PREFIXES) {
    if (gcsPath.startsWith(blocked)) {
      throw new AdminGcsPathViolation(
        gcsPath,
        `legacy root "${blocked}" is blocked — all Administration files must use ADMIN/ root`
      );
    }
  }
  if (!gcsPath.startsWith('ADMIN/')) {
    throw new AdminGcsPathViolation(gcsPath, 'path must start with ADMIN/');
  }
  if (!ALLOWED_PATTERNS.some(pattern => pattern.test(gcsPath))) {
    throw new AdminGcsPathViolation(
      gcsPath,
      'path does not match any approved ADMIN/ module structure — check docs/admin-gcs-remediation-plan-v2.md'
    );
  }
}

// ─── Controlled vocabulary (Rev 2 §3) ────────────────────────────────────────

export const LEGAL_LABEL_VOCAB: Record<string, string[]> = {
  Contracts:       ['draft', 'executed', 'amendment', 'termination-notice', 'addendum'],
  Compliance:      ['evidence'],
  Posh:            ['complaint', 'acknowledgement', 'inquiry-order', 'witness-statement', 'inquiry-report', 'show-cause', 'closure-notice', 'appeal'],
  Notices:         ['notice', 'reply', 'counter-reply', 'settlement-agreement', 'court-filing'],
  PolicyTemplates: ['policy'],
  NDA:             ['draft', 'executed'],
  Exclusivity:     ['draft', 'executed'],
};

export const VISA_LABEL_VOCAB: string[] = ['visa-copy', 'renewal-copy', 'entry-permit', 'other'];

export const TRIP_LABEL_VOCAB: string[] = ['travel-booking', 'hotel-confirmation', 'visa-copy', 'itinerary', 'invitation-letter', 'other'];

// ─── Default labels per module ───────────────────────────────────────────────

const LEGAL_LABEL_DEFAULTS: Record<string, string> = {
  Contracts:       'draft',
  Compliance:      'evidence',
  Posh:            'complaint',
  Notices:         'notice',
  PolicyTemplates: 'policy',
  NDA:             'draft',
  Exclusivity:     'draft',
};

// ─── Seq rules per module (Rev 2 §2 control rules) ───────────────────────────
// 'fixed-001' — seq is always 001 (either permanent single-file semantics or TEMP-P2)
// 'label-derived' — seq derived from label: draft=001, executed=002
// Modules marked [TEMP-P2] need Phase 2 child tables for correct seq increment.

const LEGAL_SEQ_RULE: Record<string, 'fixed-001' | 'label-derived'> = {
  Contracts:       'fixed-001',       // [TEMP-P2] append-only multi-file — seq increment needs child table
  Compliance:      'fixed-001',       // PERMANENT: overwrite-before-lock, seq always 001
  Posh:            'fixed-001',       // [TEMP-P2] append-only multi-file
  Notices:         'fixed-001',       // [TEMP-P2] append-only multi-file
  PolicyTemplates: 'fixed-001',       // [TEMP-P2] single-active-with-history
  NDA:             'label-derived',   // PERMANENT: draft=001, executed=002, two-file max
  Exclusivity:     'label-derived',   // PERMANENT: same as NDA
};

// ─── Label + seq resolution ──────────────────────────────────────────────────

/**
 * Validates the supplied label against the module's vocabulary, applies the
 * module default if label is absent, and derives the correct seq number.
 *
 * Throws HTTP-400-suitable Error if label is present but invalid.
 */
export function resolveLegalLabelAndSeq(
  module: string,
  rawLabel: string | undefined
): { label: string; seq: number } {
  const vocab = LEGAL_LABEL_VOCAB[module];
  if (!vocab) throw new Error(`Unknown Legal GCS module: "${module}"`);

  const label = rawLabel || LEGAL_LABEL_DEFAULTS[module];
  if (!vocab.includes(label)) {
    throw new Error(
      `Invalid document label "${label}" for ADMIN/Legal/${module}/. ` +
      `Allowed values: ${vocab.join(', ')}`
    );
  }

  const rule = LEGAL_SEQ_RULE[module];
  const seq = rule === 'label-derived'
    ? (label === 'executed' ? 2 : 1)
    : 1;

  return { label, seq };
}

export function resolveVisaLabel(rawLabel: string | undefined): string {
  const label = rawLabel || 'visa-copy';
  if (!VISA_LABEL_VOCAB.includes(label)) {
    throw new Error(
      `Invalid visa document label "${label}". Allowed: ${VISA_LABEL_VOCAB.join(', ')}`
    );
  }
  return label;
}

export function resolveTripLabel(rawDocumentType: string | undefined): string {
  const label = rawDocumentType || 'other';
  return TRIP_LABEL_VOCAB.includes(label) ? label : 'other';
}

// ─── Path builders (centralized — no path construction outside this file) ────

/**
 * Build an approved Legal GCS path.
 * Format: ADMIN/Legal/{module}/{entityId}/{seq:03d}-{label}.{ext}
 */
export function buildLegalGcsPath(
  module: string,
  entityId: number,
  seq: number,
  label: string,
  originalName: string
): string {
  const ext = path.extname(originalName);
  const seqStr = String(seq).padStart(3, '0');
  return `ADMIN/Legal/${module}/${entityId}/${seqStr}-${label}${ext}`;
}

/**
 * Build an approved Visa GCS path.
 * Format: ADMIN/Visa/Employees/{employeeId}/Records/{visaRecordId}/{seq:03d}-{label}.{ext}
 * [TEMP-P2]: seq is always 001 until Phase 2 child tables enable concurrency-safe increment.
 */
export function buildVisaDocumentGcsPath(
  employeeId: number,
  visaRecordId: number,
  seq: number,
  label: string,
  originalName: string
): string {
  const ext = path.extname(originalName);
  const seqStr = String(seq).padStart(3, '0');
  return `ADMIN/Visa/Employees/${employeeId}/Records/${visaRecordId}/${seqStr}-${label}${ext}`;
}

/**
 * Build an approved Travel Trip document GCS path.
 * Format: ADMIN/Travel/Employees/{employeeId}/Trips/{tripId}/Documents/{seq:03d}-{label}.{ext}
 * [TEMP-P2]: seq is always 001 until Phase 2 child tables enable concurrency-safe increment.
 */
export function buildTripDocumentGcsPath(
  employeeId: number,
  tripId: string | number,
  seq: number,
  label: string,
  originalName: string
): string {
  const ext = path.extname(originalName);
  const seqStr = String(seq).padStart(3, '0');
  return `ADMIN/Travel/Employees/${employeeId}/Trips/${tripId}/Documents/${seqStr}-${label}${ext}`;
}
