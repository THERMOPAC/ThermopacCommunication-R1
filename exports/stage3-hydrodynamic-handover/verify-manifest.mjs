import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest=JSON.parse(readFileSync('SHA256SUMS.json','utf8'));
for(const [file,expected] of Object.entries(manifest)){
  const actual=createHash('sha256').update(readFileSync(file)).digest('hex');
  if(actual!==expected) throw Error(`SHA256_MISMATCH: ${file}`);
}
console.log(`Verified ${Object.keys(manifest).length} package files.`);