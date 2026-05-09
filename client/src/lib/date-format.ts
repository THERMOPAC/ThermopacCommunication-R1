/**
 * Global date display standard: DD/MM/YYYY
 *
 * Rules:
 *  - Database storage stays yyyy-MM-dd (do NOT change)
 *  - NEVER use <input type="date"> directly in the UI — it renders in OS locale (wrong).
 *    Use <DateInput> from '@/components/ui/date-input' instead.
 *  - ALL display in UI, tables, reports, and exports uses fmtDate() or fmtDateTime()
 *
 * Usage:
 *   import { fmtDate, fmtDateTime } from '@/lib/date-format';
 *   fmtDate(offer.createdAt)       → "04/05/2026"
 *   fmtDateTime(record.uploadedAt) → "04/05/2026 14:30"
 *   fmtDate(null)                  → "—"
 *
 *   import { DateInput } from '@/components/ui/date-input';
 *   <DateInput value={isoDate} onChange={setIsoDate} />  → shows DD/MM/YYYY, stores YYYY-MM-DD
 */
export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function fmtDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  const hrs   = String(d.getHours()).padStart(2, '0');
  const mins  = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hrs}:${mins}`;
}
