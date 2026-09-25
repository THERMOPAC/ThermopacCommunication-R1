import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(readFileSync(new URL('./SHA256SUMS.json', import.meta.url), 'utf8'));
for (const [path, expected] of Object.entries(manifest)) {
  const actual = createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
  if (actual !== expected) throw new Error(`CHECKSUM_MISMATCH: ${path}`);
}
console.log(`Verified ${Object.keys(manifest).length} package file checksums.`);