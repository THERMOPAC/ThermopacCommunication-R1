import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
export const dir = 'deliverables/p1-full-30-200-rpm-sweep/';
export const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
export const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const save = (name: string, value: unknown) => writeFileSync(dir + name, JSON.stringify(value, null, 2));
export const rrbo = 'rrbo-continuous-nmp-dispersed';
export const orient = (r: any) => r.orientationComparison.find((o: any) => o.orientation === rrbo);
export const key = (t: any) => [t.diameterM, t.hcToColumn, t.rotorToColumn, t.freeArea, t.rpm].join('|');
export const files = [
  'server/ecr-pre-pilot/stage3-stage4-optimizer.ts',
  'server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts',
  'server/ecr-pre-pilot/kuhni-hydrodynamics.ts',
  ...['common.ts', 'extract.ts', 'run.ts', 'report.ts'].map(p => dir + p),
];
export const csv = (name: string, rows: any[]) => {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v: any) => '"' + (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replaceAll('"', '""') + '"';
  writeFileSync(dir + name, [keys.map(cell).join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n') + '\n');
};