import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = import.meta.dirname;
const parentPath = path.join(root, 'research-results/solvent-sensitivity-parent-input-db.json');
const qualityPath = path.join(root, 'research-results/prepilot-sizing-equilibrium-duty-db.json');
const basisPath = path.join(root, 'research-results/prepilot-sizing-current-basis-db.json');
const runtimeRoot = path.join(root, 'dist/predictive-nt-runtime-7c-1-5');
const workerRelative = 'server/ecr-pre-pilot/predictive-nt-seven-component-v1-5/worker.py';
const expectedEngineHash = '4f0b57dd41a2d768e1964e49ecee23e87de358ad7de697a2b315ab94a79091ac';
const expectedModelHash = 'f165f0d23eeae810e40341f1cc86a2b97514bc21b74838d4a08eab1760e6e1af';
const expectedParentHash = 'a717f993f983648c72bbbe82c1edcf7a3b3d0f8ec334301aaff24a20a426d3f3';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileSha256(file) {
  return sha256(fs.readFileSync(file));
}

function parseCsvWrapper(file) {
  const wrapper = JSON.parse(fs.readFileSync(file, 'utf8'));
  const output = wrapper.output;
  if (typeof output !== 'string' || !output.startsWith('input_snapshot\n')) {
    throw new Error('PARENT_INPUT_CSV_WRAPPER_INVALID');
  }
  let csv = output.slice('input_snapshot\n'.length).trim();
  if (!csv.startsWith('"') || !csv.endsWith('"')) throw new Error('PARENT_INPUT_CSV_FIELD_INVALID');
  csv = csv.slice(1, -1).replaceAll('""', '"');
  return { wrapper, input: JSON.parse(csv) };
}

function snapshotHash(snapshot) {
  const { immutableHash: _ignored, ...immutable } = snapshot;
  return sha256(canonical(immutable));
}

function changedPaths(left, right, prefix = '') {
  if (Object.is(left, right)) return [];
  if (left && right && typeof left === 'object' && typeof right === 'object'
      && canonical(left) === canonical(right)) return [];
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
      || Array.isArray(left) || Array.isArray(right)) return [prefix];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) => changedPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
}

const { wrapper, input: parent } = parseCsvWrapper(parentPath);
const quality = JSON.parse(fs.readFileSync(qualityPath, 'utf8'));
const currentBasis = JSON.parse(fs.readFileSync(basisPath, 'utf8'));
const source = parent.stage1Authority?.source;
const actualParentHash = snapshotHash(source);
if (actualParentHash !== source?.immutableHash
    || actualParentHash !== parent.stage1Authority?.snapshotHash
    || actualParentHash !== expectedParentHash
    || quality.stage1SnapshotHash !== actualParentHash) {
  throw new Error(`PARENT_STAGE1_AUTHORITY_HASH_MISMATCH:${actualParentHash}`);
}
if (wrapper.parentJobId !== quality.jobId) throw new Error('PARENT_QUALITY_JOB_MISMATCH');
if (parent.modelHash !== expectedModelHash || parent.engineContractVersion !== '7C-1.5.0') {
  throw new Error('PARENT_MODEL_OR_ENGINE_CONTRACT_MISMATCH');
}
if (parent.ntTest !== 10 || parent.maximumStages !== 10
    || source.stage1.maximumStages !== 10 || source.stage1.designFeedRateLph !== 4000
    || source.stage1.operatingTemperatureC !== 25 || source.stage1.temperatureK !== 298.15
    || source.stage1.nmpInFeedWt !== 0 || source.stage1.nmpWaterWt !== 1.5
    || source.stage1.nmpPurityWt !== 98.5) {
  throw new Error('PARENT_REQUIRED_BASIS_MISMATCH');
}

const allowed = [
  'solventMolarRatio',
  'sourceSolventOilMassRatio',
  'stage1Authority.snapshotHash',
  'stage1Authority.source.immutableHash',
  'stage1Authority.source.stage1.solventOilRatio',
  'wetSolventConstruction.dryNmpMassPerUnitFeedMass',
  'wetSolventConstruction.massClosureResidual',
  'wetSolventConstruction.totalWetSolventMassPerUnitFeedMass',
  'wetSolventConstruction.waterMassPerUnitFeedMass',
].sort();
const ratios = [0.75, 1.0];
const cases = [];
for (const ratio of ratios) {
  const input = structuredClone(parent);
  input.stage1Authority.source.stage1.solventOilRatio = ratio;
  input.stage1Authority.source.immutableHash = snapshotHash(input.stage1Authority.source);
  input.stage1Authority.snapshotHash = input.stage1Authority.source.immutableHash;
  input.sourceSolventOilMassRatio = ratio;
  const waterFraction = input.solventSpecificationAudit.nmpWaterMassPercent / 100;
  const nmpFraction = input.solventSpecificationAudit.nmpPurityMassPercent / 100;
  input.wetSolventConstruction = {
    basis: 'FIXED_TOTAL_WET_SOLVENT_MASS',
    totalWetSolventMassPerUnitFeedMass: ratio,
    dryNmpMassPerUnitFeedMass: ratio * nmpFraction,
    waterMassPerUnitFeedMass: ratio * waterFraction,
    massClosureResidual: Math.abs(ratio - ratio * nmpFraction - ratio * waterFraction),
  };
  const molesPer100Feed = parent.feedMoleFractions.reduce((sum, fraction, index) => {
    const molecularWeights = [170.34, 120.19, 142.1971, 202.2506, 405.58, 99.1311, 18.01528];
    const masses = [85, 7, 4, 2, 2, 0, 0];
    return sum + masses[index] / molecularWeights[index];
  }, 0);
  input.solventMolarRatio = (
    ratio * nmpFraction / 99.1311 + ratio * waterFraction / 18.01528
  ) / (molesPer100Feed / 100);
  const differences = changedPaths(parent, input).sort();
  if (JSON.stringify(differences) !== JSON.stringify(allowed)) {
    throw new Error(`INPUT_DIFF_ALLOWLIST_FAILED:${ratio}:${JSON.stringify(differences)}`);
  }
  const request = {
    ...input,
    engineHash: expectedEngineHash,
    _checkpointProtocol: 'ACK_V3_ENGINE_CONTRACT',
    _resume: null,
  };
  const id = ratio === 1 ? 'so-1.0' : `so-${ratio}`;
  const inputPath = path.join(outDir, `${id}-input.json`);
  const requestPath = path.join(outDir, `${id}-request.json`);
  fs.writeFileSync(inputPath, `${JSON.stringify(input)}\n`, { flag: 'wx' });
  fs.writeFileSync(requestPath, `${JSON.stringify(request)}\n`, { flag: 'wx' });
  cases.push({
    id,
    label: 'RESEARCH_SENSITIVITY',
    solventOilMassRatio: ratio,
    parentJobId: wrapper.parentJobId,
    parentStage1SnapshotHash: actualParentHash,
    sensitivityStage1SnapshotHash: input.stage1Authority.snapshotHash,
    lineageClassification: 'COPY_OF_PARENT_AUTHORITY_NOT_DB_GOVERNED_NEW_DESIGN',
    changedPaths: differences,
    inputPath: path.relative(root, inputPath),
    inputSha256: fileSha256(inputPath),
    requestPath: path.relative(root, requestPath),
    requestSha256: fileSha256(requestPath),
  });
}
const preflightPath = path.join(outDir, 'preflight.json');
fs.copyFileSync('/tmp/ss-preflight.json', preflightPath, fs.constants.COPYFILE_EXCL);
const preflight = JSON.parse(fs.readFileSync(preflightPath, 'utf8'));
if (preflight.status !== 'PASS' || preflight.python !== '3.12'
    || preflight.engineHash !== expectedEngineHash
    || preflight.engineContractVersion !== '7C-1.5.0'
    || preflight.runtimeManifestStatus !== 'PACKAGED_MANIFEST_VERIFIED'
    || preflight.checkpointProtocol !== 'ACK_V3_ENGINE_CONTRACT') {
  throw new Error('RUNTIME_PREFLIGHT_AUTHORITY_MISMATCH');
}
const manifest = {
  schemaVersion: 'OFFLINE_SOLVENT_SENSITIVITY_MANIFEST_V1',
  frozenAt: new Date().toISOString(),
  classification: 'RESEARCH_SENSITIVITY',
  restrictions: {
    databaseWrites: false,
    productionDesignClaim: false,
    physicalNtHeightRpmClaim: false,
    rerunOnTimeout: false,
    solverGateWeakening: false,
  },
  projectReference: '236',
  designReference: '269',
  stage: 2,
  parentJobId: wrapper.parentJobId,
  parentRuntimeSeconds: 884,
  parentStage1SnapshotHash: actualParentHash,
  parentAuthorityVerifiedWithJsNumberSemantics: true,
  parentQualityEvidence: path.relative(root, qualityPath),
  currentBasisEvidence: path.relative(root, basisPath),
  currentBasisEvidenceSha256: fileSha256(basisPath),
  parentInputEvidenceSha256: fileSha256(parentPath),
  parentQualityEvidenceSha256: fileSha256(qualityPath),
  engineContractVersion: '7C-1.5.0',
  engineHash: expectedEngineHash,
  modelHash: expectedModelHash,
  python: '3.12',
  runtimeRoot: path.relative(root, runtimeRoot),
  runtimeManifestSha256: fileSha256(path.join(runtimeRoot, 'predictive-nt-runtime-manifest.json')),
  workerRelative,
  workerSha256: fileSha256(path.join(runtimeRoot, workerRelative)),
  preflightSha256: fileSha256(preflightPath),
  ntTest: 10,
  maximumStages: 10,
  maximumScientificWallSecondsPerCase: 2400,
  executionPlan: 'TWO_INDEPENDENT_CASES_IN_PARALLEL',
  cases,
  currentBasisLoaded: Boolean(currentBasis),
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
for (const file of [...cases.flatMap((row) => [row.inputPath, row.requestPath])
  .map((file) => path.join(root, file)), preflightPath, path.join(outDir, 'manifest.json')]) {
  fs.chmodSync(file, 0o444);
}
console.log(JSON.stringify({ status: 'PREPARED', cases, manifest: path.relative(root, path.join(outDir, 'manifest.json')) }));