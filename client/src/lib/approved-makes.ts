const STORAGE_PREFIX = "thermopac_makes_";

function loadCustomMakes(key: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch { return []; }
}

function saveCustomMakes(key: string, makes: string[]): void {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(makes)); } catch {}
}

export function getMakesList(key: string, baseMakes: string[]): string[] {
  const custom = loadCustomMakes(key);
  const seen = new Map<string, string>();
  for (const m of [...baseMakes, ...custom]) {
    if (!seen.has(m.toLowerCase())) seen.set(m.toLowerCase(), m);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function addMakeToList(make: string, key: string, baseMakes: string[]): boolean {
  const trimmed = make.trim();
  if (!trimmed) return false;
  const all = [...baseMakes, ...loadCustomMakes(key)];
  if (all.some(m => m.toLowerCase() === trimmed.toLowerCase())) return false;
  const custom = loadCustomMakes(key);
  custom.push(trimmed);
  saveCustomMakes(key, custom);
  return true;
}
