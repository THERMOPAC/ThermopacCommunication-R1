export class AdminGcsPathViolation extends Error {
  constructor(path: string, reason: string) {
    super(`AdminGcsPathViolation: path "${path}" rejected — ${reason}`);
    this.name = 'AdminGcsPathViolation';
  }
}

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
