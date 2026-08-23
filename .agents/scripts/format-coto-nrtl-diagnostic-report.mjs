import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join('.agents', 'outputs', 'thermopac-nrtl-fit-to-coto-2022-xylene-lle');
const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8'));
const labels = ['Sat', 'Mono', 'Di', 'Poly', 'Solvent'];
const fmt = (values) => values.map((v) => v.toFixed(6)).join(', ');
const diff = (prediction, experiment) => prediction.map((v, i) => (v - experiment[i]).toFixed(6)).join(', ');

const lines = [
  '# Phase composition comparison',
  '',
  `Candidate: **${result.candidateId}**`,
  '',
  'Order in every vector: `Sat, Mono, Di, Poly, Solvent`.',
  '',
  '| Source row | Phase | Experimental | Predicted | Predicted − experimental |',
  '|---:|:---|:---|:---|:---|',
];
for (const row of result.reproduction.rows) {
  lines.push(`| ${row.sourceTableRow} | Raffinate | ${fmt(row.experimentalRaffinate)} | ${fmt(row.predictedRaffinate)} | ${diff(row.predictedRaffinate, row.experimentalRaffinate)} |`);
  lines.push(`| ${row.sourceTableRow} | Extract | ${fmt(row.experimentalExtract)} | ${fmt(row.predictedExtract)} | ${diff(row.predictedExtract, row.experimentalExtract)} |`);
}
lines.push('', `Component labels: ${labels.join(', ')}.`);
writeFileSync(join(out, 'composition-comparison.md'), lines.join('\n'));