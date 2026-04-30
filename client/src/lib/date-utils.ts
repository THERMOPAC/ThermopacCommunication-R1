export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return String(value);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return String(value);
  }
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return String(value);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return String(value);
  }
}

export function toIsoDate(ddmmyyyy: string): string {
  const p = ddmmyyyy.split('/');
  if (p.length === 3 && p[2].length === 4) {
    return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  return ddmmyyyy;
}

export function toDisplayDate(isoDate: string): string {
  if (!isoDate) return '';
  const p = isoDate.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return isoDate;
}

export function april1Display(): string {
  return `01/04/${new Date().getFullYear()}`;
}

export function april1Iso(): string {
  return `${new Date().getFullYear()}-04-01`;
}
