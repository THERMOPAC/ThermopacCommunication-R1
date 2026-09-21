import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PDFParse } from 'pdf-parse';
import { generatePredictiveNtReport } from '../../server/ecr-pre-pilot/predictive-nt-report';
import { reportTrials } from '../../server/ecr-pre-pilot/predictive-nt-report-evidence';

const directory = 'deliverables/stage2-report-corrected/';
const job = JSON.parse(readFileSync(directory + 'frozen-job.json', 'utf8'));
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const before = { input: hash(job.input_snapshot), result: hash(job.result_snapshot) };
const snapshot = { id: job.id, projectNumber: 236, modelHash: job.model_hash,
  engineHash: job.engine_hash, completedAt: job.completed_at,
  input: job.input_snapshot, result: job.result_snapshot };
const pdf = await generatePredictiveNtReport(snapshot);
writeFileSync(directory + 'Project-236-Stage2-corrected.pdf', pdf);
assert.equal(hash(snapshot.input), before.input);
assert.equal(hash(snapshot.result), before.result);
const trials = reportTrials(snapshot.result);
assert.equal(trials.length, 10);
assert.equal(snapshot.result.predictiveNt, 4);
assert.equal(trials[8].accepted, false);
assert.equal(trials[8].stages[7].accepted, false);
assert(trials[8].reportingDisposition.includes('ROUTINE_REFINEMENT_AMBIGUOUS'));
assert(trials.every(t => t.multistartEvidence.bothStartsClosed));
assert(trials.every(t => typeof t.productMetrics.componentExtractionPct.MONO === 'number'));
assert.equal(trials[3].targetCompliance.minimumNmpFreeRecoveryPct.target, 80);
const parser = new PDFParse({ data: pdf });
const extracted = await parser.getText();
await parser.destroy();
assert(!/\bNaN\b|undefined|�|†|õ/.test(extracted.text));
assert(extracted.text.includes('NIST COSMO-SAC-2010'));
assert(extracted.text.includes('1237.55'));
assert(extracted.text.includes('64.641'));
assert(/Dry NMP \/ oil mass\s+0\.597/.test(extracted.text));
assert(/Water \/ oil mass\s+0\.003/.test(extracted.text));
assert(extracted.text.includes('Raffinate sulfur target (ppm)'));
assert(extracted.text.includes('BASIS MISMATCH'));
assert(extracted.text.includes('NOT demonstrated product-concentration compliance'));
assert(extracted.text.includes('DIFFERENT BASIS, reference only'));
assert(!extracted.text.includes('Allocation sulfur target'));
assert(!extracted.text.includes('Primary termination CONVERGED'));
assert(extracted.text.includes('RDKit ETKDGv3/MMFF94s'));
for (let n = 1; n <= 10; n++) {
  assert(extracted.text.includes(`Appendix A.${n}.1`));
  assert(extracted.text.includes(`Appendix A.${n}.2`));
  assert(extracted.text.includes(`Appendix A.${n}.3`));
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN READ ONLY');
const { rows } = await client.query(
  'SELECT input_snapshot,result_snapshot FROM ecr_pre_pilot_predictive_nt_jobs WHERE id=$1 AND design_id=$2',
  [job.id, 269],
);
await client.query('ROLLBACK');
await client.end();
const after = { input: hash(rows[0].input_snapshot), result: hash(rows[0].result_snapshot) };
assert.deepEqual(after, before);
const proof = { jobId: job.id, designId: 269, before, after,
  unchanged: true, predictiveNt: snapshot.result.predictiveNt,
  trialCount: trials.length, stageCountTotal: trials.reduce((n, t) => n + t.stages.length, 0),
  pdfPages: extracted.total, pdfSha256: createHash('sha256').update(pdf).digest('hex'),
  assertionStatus: 'PASS', databaseAccess: 'SELECT in READ ONLY transaction; no writes or reruns' };
writeFileSync(directory + 'verification.json', JSON.stringify(proof, null, 2));
writeFileSync(directory + 'report-text.txt', extracted.text);
console.log(proof);