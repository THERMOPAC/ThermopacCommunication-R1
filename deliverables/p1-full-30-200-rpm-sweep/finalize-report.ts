/** Report-only presentation pass. Does not import or rerun scientific code.
 * Preserves frozen runner/input/source and all underlying numerical evidence.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = 'deliverables/p1-full-30-200-rpm-sweep/';
const read = (name: string) => JSON.parse(readFileSync(dir + name, 'utf8'));
const hash = (name: string) => createHash('sha256').update(readFileSync(dir + name)).digest('hex');
const summary = read('summary.json');
if (summary.status !== 'COMPLETE' || summary.hypotheticalSelection.geometry !== null
  || summary.diameters.some((d: any) => d.adequateGeometryCount !== 0)) {
  throw Error('Unexpected selection evidence; refusing misleading report rendering');
}
const original = readFileSync(dir + 'report.md', 'utf8');
const paragraph = 'Hypothetical selection: **none** (geometry, RPM and operating window remain null). No fixed geometry meets the required 20-rpm useful span; consequently there is no second adequate diameter to select. The longest tested fixed-geometry feasible span is '
  + Math.max(...summary.diameters.map((d: any) => d.maxFixedGeometryWindowRpm))
  + ' rpm. Full unchanged ranking/frontier evidence remains in summary.json and hypothetical-selected-result.json.';
const md = original.split('\n').map(line => line.startsWith('Hypothetical selection:') ? paragraph : line).join('\n');
if (!md.includes(paragraph)) throw Error('Selection paragraph not found');
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
writeFileSync(dir + 'report.md', md);
writeFileSync(dir + 'report.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P1 full diagnostic sweep</title><style>body{font:15px/1.6 system-ui;margin:32px;color:#183044;background:#f5f8fa}main{max-width:1400px;margin:auto;background:white;padding:28px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style><main><pre>${escape(md)}</pre></main></html>`);
const manifest = read('manifest.json');
for (const name of ['report.md', 'report.html', 'finalize-report.ts']) manifest[name] = hash(name);
writeFileSync(dir + 'manifest.json', JSON.stringify(manifest, null, 2));
console.log('Report presentation shortened; report hashes updated; numerical evidence unchanged.');