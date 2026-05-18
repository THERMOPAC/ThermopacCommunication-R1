/**
 * EPC Project Naming Governance v2
 * Canonical format: {project_code} — {customer_name} — {offer_subject}
 * Example: 2627-018 — Industria Petroquimica Apollo — Used Engine Oil Refinery
 *
 * Single source of truth for displaying project names across all modules.
 * All EPC modules MUST use getProjectDisplayName() — no ad-hoc name construction.
 * project_display_name is READ-ONLY outside Project Master.
 */

type ProjectLike = {
  projectDisplayName?: string | null;
  project_display_name?: string | null;
  code?: string | null;
  projectCode?: string | null;
  project_code?: string | null;
  customerName?: string | null;
  customer_name?: string | null;
  client_name?: string | null;
  clientName?: string | null;
  /** v2 canonical field — the offer subject that became the project */
  offerSubject?: string | null;
  offer_subject?: string | null;
  /** v1 legacy aliases — kept for backward compat with old API responses */
  shortDescription?: string | null;
  short_description?: string | null;
  name?: string | null;
  projectName?: string | null;
  project_name?: string | null;
};

const EM = ' \u2014 ';

/**
 * Returns the canonical project display name.
 * Prefers the stored projectDisplayName (SSOT) and falls back gracefully
 * for records not yet backfilled.
 */
export function getProjectDisplayName(p: ProjectLike | null | undefined): string {
  if (!p) return 'Unknown Project';

  const stored = p.projectDisplayName || p.project_display_name;
  if (stored && stored.trim()) return stored.trim();

  const code = (p.code || p.projectCode || p.project_code || '').trim();
  const cust = (p.customerName || p.customer_name || p.client_name || p.clientName || '').trim();
  // v2: prefer offerSubject/offer_subject; fall back to legacy shortDescription aliases
  const desc = (p.offerSubject || p.offer_subject || p.shortDescription || p.short_description || p.name || p.projectName || p.project_name || '').trim();

  const parts = [code, cust, desc].filter(Boolean);
  return parts.length ? parts.join(EM) : 'Unknown Project';
}

/**
 * Server-side helper (also exported so client can preview).
 * Validates and assembles the three mandatory segments.
 * Trims whitespace, prevents empty segments and duplicate separators.
 */
export function computeProjectDisplayName(
  projectCode: string,
  customerName: string,
  offerSubject: string,
): string {
  const c = projectCode.trim();
  const n = customerName.trim();
  const d = offerSubject.trim();

  if (!c) throw new Error('project_code is required for display name');
  if (!n) throw new Error('customer_name is required for display name');
  if (!d) throw new Error('offer_subject is required for display name');

  return `${c}${EM}${n}${EM}${d}`;
}
