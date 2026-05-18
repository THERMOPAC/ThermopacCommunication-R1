/**
 * EPC Project Naming Governance v1
 * Canonical format: {project_code} — {customer_name} — {short_description}
 * Example: 2627-018 — Industria Petroquimica Apollo — Used Engine Oil Refinery
 *
 * Single source of truth for displaying project names across all modules.
 * All EPC modules MUST use getProjectDisplayName() — no ad-hoc name construction.
 */

type ProjectLike = {
  projectDisplayName?: string | null;
  project_display_name?: string | null;
  code?: string | null;
  projectCode?: string | null;
  customerName?: string | null;
  client_name?: string | null;
  clientName?: string | null;
  shortDescription?: string | null;
  short_description?: string | null;
  name?: string | null;
  projectName?: string | null;
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

  const code = (p.code || p.projectCode || '').trim();
  const cust = (p.customerName || p.client_name || p.clientName || '').trim();
  const desc = (p.shortDescription || p.short_description || p.name || p.projectName || '').trim();

  const parts = [code, cust, desc].filter(Boolean);
  return parts.length ? parts.join(EM) : 'Unknown Project';
}

/**
 * Server-side helper (also exported so client can preview).
 * Validates and assembles the three mandatory segments.
 * Trims whitespace, prevents empty segments.
 */
export function computeProjectDisplayName(
  projectCode: string,
  customerName: string,
  shortDescription: string,
): string {
  const c = projectCode.trim();
  const n = customerName.trim();
  const d = shortDescription.trim();

  if (!c) throw new Error('project_code is required for display name');
  if (!n) throw new Error('customer_name is required for display name');
  if (!d) throw new Error('short_description is required for display name');

  return `${c}${EM}${n}${EM}${d}`;
}
