import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const families = ['SAT', 'MONO', 'DI', 'POLY', 'PA'];

/** Read-only presentation adapter. Never changes the persisted result or evaluates acceptance. */
export function reportTrials(result: any): any[] {
  return result.trials.map((original: any) => {
    const trial = structuredClone(original);
    const order = result.componentOrder ?? [...families, 'NMP'];
    const feed = trial.boundaryStreams?.oilFeed;
    const raffinate = trial.boundaryStreams?.finalRaffinate;
    const metrics = trial.productMetrics ??= {};
    const extraction = metrics.componentExtractionPct ??= {};
    for (const family of families) {
      const i = order.indexOf(family);
      const f = feed?.componentMoles?.[i];
      const r = raffinate?.componentMoles?.[i];
      const removal = finite(f) && f > 0 && finite(r) ? 100 * (f - r) / f : null;
      if (family === 'SAT') metrics.satLossPct ??= removal;
      else extraction[family] ??= removal;
    }
    if (!finite(metrics.nmpFreeHydrocarbonRecoveryPct)) {
      const f = families.map(key => feed?.componentMass?.[order.indexOf(key)]);
      const r = families.map(key => raffinate?.componentMass?.[order.indexOf(key)]);
      if (f.every(finite) && r.every(finite) && f.reduce((a, b) => a + b, 0) > 0) {
        metrics.nmpFreeHydrocarbonRecoveryPct = 100 * r.reduce((a, b) => a + b, 0) / f.reduce((a, b) => a + b, 0);
      }
    }
    trial.targetCompliance ??= {};
    trial.targetCompliance.minimumNmpFreeRecoveryPct ??= trial.targetCompliance.minimumRecoveryPct;
    // 7C matrix contract stores both-endpoint closure in residualClosureStatus, and
    // reproduction separately. Do not apply this mapping to unrelated engine contracts.
    if (/^7C-1\.[2456]\.0$/.test(result.engineContractVersion ?? '')
        && finite(trial.secondaryMaximumScaledEquationResidual)) {
      const bothClosed = trial.residualClosureStatus === 'CLOSED' ? true
        : trial.residualClosureStatus === 'UNCLOSED' ? false : undefined;
      trial.multistartEvidence ??= {
        bothStartsClosed: bothClosed,
        combinedTerminationStatus: trial.solverTerminationStatus,
        combinedClosureStatus: trial.residualClosureStatus,
        primary: {
          terminationStatus: 'Not separately recorded',
          residualClosureStatus: bothClosed === true ? 'CLOSED' : 'Not separately recorded',
          maximumScaledEquationResidual: trial.maximumScaledEquationResidual,
        },
        secondary: {
          terminationStatus: 'Not separately recorded',
          residualClosureStatus: bothClosed === true ? 'CLOSED' : 'Not separately recorded',
          maximumScaledEquationResidual: trial.secondaryMaximumScaledEquationResidual,
        },
        branchComparisonStatus: bothClosed === true ? 'EVALUATED'
          : bothClosed === false ? 'NOT_EVALUABLE_ENDPOINT_UNCLOSED' : 'MISSING_EVIDENCE',
      };
      trial.multistartProductRelativeDifference ??= trial.branchProductRelativeDifference;
    }
    trial.reportingDisposition = [
      `Persisted accepted: ${trial.accepted === true ? 'yes' : trial.accepted === false ? 'no' : 'not recorded'}`,
      `numerical acceptance: ${String(trial.numericalAcceptancePassed ?? 'not recorded')}`,
      `targets: ${String(trial.allCalculableTargetsPass ?? 'not recorded')}`,
      ...(trial.stages ?? []).filter((s: any) => s.accepted === false)
        .map((s: any) => `stage ${s.stageFromFeedEnd} acceptance: false`
          + (s.postSplitTpdSearch?.raffinate?.allRefinementsAccepted === false
            ? `; raffinate TPD refinements: false (${s.postSplitTpdSearch.raffinate.classification ?? 'classification not recorded'})` : '')
          + (s.postSplitTpdSearch?.extract?.allRefinementsAccepted === false
            ? `; extract TPD refinements: false (${s.postSplitTpdSearch.extract.classification ?? 'classification not recorded'})` : '')),
    ].join('; ');
    return trial;
  });
}

/** External artifacts are usable only when their bytes match this job's frozen digest. */
export async function frozenMolecularBasis(input: any, result: any) {
  const integrity = result.scientificIntegrity ?? {};
  const manifests = [
    ['sixGenerationManifestSha256', 'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/generation-manifest.json'],
    ['h2oGenerationManifestSha256', 'server/research/ecr-pre-pilot-seven-component-h2o-profile/generated/generation-manifest.json'],
  ];
  const components: any[] = [];
  const provenance: Array<[string, string]> = [];
  for (const [key, path] of manifests) {
    const digest = integrity[key];
    if (!digest) {
      provenance.push([key, 'Not recorded in frozen job; no current artifact substituted']);
      continue;
    }
    provenance.push([key, digest]);
    try {
      const bytes = await readFile(path);
      if (createHash('sha256').update(bytes).digest('hex') !== digest) {
        provenance.push(['Artifact verification', `${path}: HASH MISMATCH; details withheld`]);
        continue;
      }
      const manifest = JSON.parse(bytes.toString());
      provenance.push(['Hash-verified source', path], ['Molecular generation route', manifest.method],
        ['Profile conversion', JSON.stringify(manifest.profileConversion)]);
      for (const c of manifest.components ?? [manifest.component]) {
        if (c && integrity.profileSha256ByFamily?.[c.family] === c.profileSha256) components.push(c);
      }
    } catch {
      provenance.push(['Artifact verification', `${path}: unavailable; details not substituted`]);
    }
  }
  for (const family of result.componentOrder ?? []) {
    if (!components.some(c => c.family === family)) components.push({
      family, name: family === 'SAT' ? input.satIdentity : family === 'MONO' ? input.monoIdentity
        : family === 'PA' ? input.stage1Authority?.source?.polarAromaticsAdmission?.representative?.commonName
          : 'Identity not recorded in available frozen evidence',
      profileSha256: integrity.profileSha256ByFamily?.[family],
    });
  }
  return { components, provenance };
}