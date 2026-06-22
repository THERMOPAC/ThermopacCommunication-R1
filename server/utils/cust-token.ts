/**
 * buildCustToken — canonical {Cust} token for GCS / mirror paths.
 *
 * Format : {bp_code}-{FIRST_WORD}
 * Rules  : bp_code preserved in full.
 *           First word = first whitespace-delimited token of bp_name after
 *           uppercasing and stripping all non-alphanumeric characters.
 *           Maximum 12 characters for the first-word segment.
 *
 * Examples:
 *   C10147, "AFRO INTERNATIONAL OIL IND. LLC"  → "C10147-AFRO"
 *   C10295, "YANBU UNITED COMPANY FOR TRADING"  → "C10295-YANBU"
 *   C10357, "INDUSTRIA PETROQUIMICA APOLLO"     → "C10357-INDUSTRIA"
 *   C00027, "BIOFACTOR SA"                      → "C00027-BIOFACTOR"
 */
export function buildCustToken(bp_code: string, bp_name: string): string {
  const firstWord = (bp_name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')[0]
    .slice(0, 12);
  return `${bp_code}-${firstWord || 'UNKNOWN'}`;
}
