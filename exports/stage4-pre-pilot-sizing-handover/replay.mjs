import { readFileSync } from 'node:fs';
import { replayStage4 } from './index.mjs';
const input = JSON.parse(readFileSync(process.argv[2] ?? new URL('./input.json', import.meta.url), 'utf8'));
console.log(JSON.stringify(replayStage4(input), null, 2));