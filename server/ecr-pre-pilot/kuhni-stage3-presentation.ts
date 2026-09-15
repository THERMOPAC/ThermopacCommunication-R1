import type { HydrodynamicProcessBasis } from './kuhni-hydrodynamics';
import {
  assessReverseExtrapolatedModelRoot,
  KUHNI_GEOMETRY_RESOLVER_V150_HASH,
  KUHNI_GEOMETRY_RESOLVER_V150_VERSION,
} from './kuhni-geometry-resolver-v150';

type JsonRecord = Record<string, any>;

export type KuhniStage3PresentationLimitation = {
  group: string;
  title: string;
  details: string[];
};

export const KUHNI_STAGE3_PRESENTATION_CLASSIFICATION =
  'CALCULATED_PRE_PILOT_WITH_MAJOR_SCALE_UP_EXTRAPOLATION' as const;
export const KUHNI_STAGE3_PRESENTATION_LABEL =
  'CALCULATED PRE-PILOT WITH MAJOR SCALE-UP EXTRAPOLATION' as const;

export type KuhniStage3PresentationCandidate = {
  available: true;
  status: typeof KUHNI_STAGE3_PRESENTATION_CLASSIFICATION;
  label: typeof KUHNI_STAGE3_PRESENTATION_LABEL;
  qualification: typeof KUHNI_STAGE3_PRESENTATION_CLASSIFICATION;
  source: 'CALCULATED_IN_RANGE_TRIAL' | 'V150_EXTRAPOLATED_MODEL_ROOT';
  governed: false;
  stage4Input: false;
  columnDiameterM: number;
  rotorDiameterM: number | null;
  compartmentHeightM: number | null;
  rpm: number;
  d32M: number | null;
  floodHoldup: number | null;
  actualLoading: number | null;
  tipSpeedMS: number | null;
  powerVolumeWM3: number | null;
  massFluxKgM2S: number | null;
  trialStatus: string;
  independentCheck: 'PASSED';
};

export type KuhniStage3PresentationQualification = {
  schemaVersion: 'ECR_STAGE3_PRESENTATION_QUALIFICATION_V1';
  status:
    | typeof KUHNI_STAGE3_PRESENTATION_CLASSIFICATION
    | 'NO_PREPILOT_CANDIDATE';
  label: typeof KUHNI_STAGE3_PRESENTATION_LABEL | 'NO PRE-PILOT CANDIDATE';
  candidate: KuhniStage3PresentationCandidate | null;
  governedOutput: {
    status: 'UNCHANGED_GOVERNED_OUTPUT';
    candidateIsNotGoverned: true;
    stage4Input: false;
    message: string;
  };
  lineage: {
    status: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
    runStage1SnapshotHash: string | null;
    currentStage1SnapshotHash: string | null;
    engineVersion: string | null;
    engineImplementationHash: string | null;
  };
  limitations: KuhniStage3PresentationLimitation[];
  failure?: {
    code: string;
    message: string;
  };
};

type QualificationInput = {
  result: JsonRecord | null | undefined;
  processBasis: HydrodynamicProcessBasis | JsonRecord | null | undefined;
  runStage1SnapshotHash: string | null | undefined;
  currentStage1SnapshotHash: string | null | undefined;
  integrityVerified: boolean;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveFinite(value: unknown): value is number {
  return finite(value) && value > 0;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function finiteOrNull(value: unknown): number | null {
  return finite(value) ? value : null;
}

function lineageFor(input: QualificationInput): KuhniStage3PresentationQualification['lineage'] {
  const result = asRecord(input.result);
  const engine = asRecord(result?.engine);
  const runHash = typeof input.runStage1SnapshotHash === 'string'
    ? input.runStage1SnapshotHash
    : null;
  const basisHash = typeof input.processBasis?.stage1SnapshotHash === 'string'
    ? input.processBasis.stage1SnapshotHash
    : null;
  const currentHash = typeof input.currentStage1SnapshotHash === 'string'
    ? input.currentStage1SnapshotHash
    : null;
  const current = Boolean(
    input.integrityVerified
    && runHash
    && basisHash
    && currentHash
    && runHash === basisHash
    && runHash === currentHash,
  );
  return {
    status: current ? 'CURRENT' : currentHash ? 'STALE' : 'UNAVAILABLE',
    runStage1SnapshotHash: runHash,
    currentStage1SnapshotHash: currentHash,
    engineVersion: typeof engine?.version === 'string' ? engine.version : null,
    engineImplementationHash: typeof engine?.implementationHash === 'string'
      ? engine.implementationHash
      : null,
  };
}

function baseLimitations(reverse: boolean): KuhniStage3PresentationLimitation[] {
  const orientationDetails = reverse
    ? [
      'RRBO-continuous / wet-NMP-dispersed is a reverse phase orientation relative to the reviewed source route.',
      'The signed force balance and countercurrent direction are retained as diagnostics; reverse drop shape, phase control, entrainment and inversion behavior are not validated.',
    ]
    : [
      'The historical heavy-continuous / light-dispersed orientation does not make the target RRBO/NMP full chain a validated commercial design.',
      'The selected result remains a pre-pilot prediction even where its phase-direction convention is the reviewed source orientation.',
    ];
  return [
    {
      group: 'SCALE_UP',
      title: 'Major scale-up extrapolation',
      details: [
        'The calculated diameter is a pre-pilot estimate, not a proof of physical feasibility or a validated commercial diameter.',
        'Perry’s 60 mm pilot mapping supports targets up to 1 m as a recommendation, not a universal correlation-validity guarantee.',
      ],
    },
    {
      group: 'ORIENTATION_AND_PHASE_CONTROL',
      title: reverse ? 'Reverse orientation remains unvalidated' : 'Full-chain phase qualification remains open',
      details: orientationDetails,
    },
    {
      group: 'GEOMETRY_AND_CORRELATIONS',
      title: 'Geometry and correlation envelope',
      details: [
        'The current h_c/D = 0.50 is outside Perry’s published 0.20–0.30 recommendation and requires vendor or pilot confirmation.',
        'Myint/Garthe drop, characteristic-velocity, swarm/holdup and flooding closures remain extrapolated for this target service and scale.',
      ],
    },
    {
      group: 'DOWNSTREAM_GOVERNANCE',
      title: 'Not a governed Stage-3 or Stage-4 input',
      details: [
        'This presentation candidate is separate from governed hydraulic acceptance and does not unlock Stage 4 or mass-transfer readiness.',
        'Final RPM, physical compartments, active height and transfer efficiency remain dependency-blocked until their existing approved model is available.',
      ],
    },
  ];
}

function unavailable(
  input: QualificationInput,
  lineage: KuhniStage3PresentationQualification['lineage'],
  code: string,
  message: string,
): KuhniStage3PresentationQualification {
  const reverse = input.processBasis?.phaseConfiguration === 'rrbo-continuous-nmp-dispersed';
  return {
    schemaVersion: 'ECR_STAGE3_PRESENTATION_QUALIFICATION_V1',
    status: 'NO_PREPILOT_CANDIDATE',
    label: 'NO PRE-PILOT CANDIDATE',
    candidate: null,
    governedOutput: {
      status: 'UNCHANGED_GOVERNED_OUTPUT',
      candidateIsNotGoverned: true,
      stage4Input: false,
      message: 'No presentation candidate was admitted; existing governed output and dependency gates remain unchanged.',
    },
    lineage,
    limitations: baseLimitations(reverse),
    failure: { code, message },
  };
}

function candidateFromTrial(
  trial: JsonRecord,
  source: KuhniStage3PresentationCandidate['source'],
): KuhniStage3PresentationCandidate | null {
  const requiredFiniteFields = source === 'V150_EXTRAPOLATED_MODEL_ROOT'
    ? [
      'columnDiameterM',
      'rotorDiameterM',
      'compartmentHeightM',
      'rpm',
      'd32M',
      'floodHoldup',
      'actualLoading',
      'tipSpeedMS',
      'powerVolumeWM3',
      'massFluxKgM2S',
    ]
    : ['columnDiameterM', 'rpm'];
  if (
    requiredFiniteFields.some((field) => !finite(trial[field]))
    || !positiveFinite(trial.columnDiameterM)
    || !positiveFinite(trial.rpm)
    || trial.status !== (source === 'V150_EXTRAPOLATED_MODEL_ROOT'
      ? 'CALCULATED_EXTRAPOLATED'
      : 'CALCULATED_IN_RANGE')
  ) {
    return null;
  }
  return {
    available: true,
    status: KUHNI_STAGE3_PRESENTATION_CLASSIFICATION,
    label: KUHNI_STAGE3_PRESENTATION_LABEL,
    qualification: KUHNI_STAGE3_PRESENTATION_CLASSIFICATION,
    source,
    governed: false,
    stage4Input: false,
    columnDiameterM: trial.columnDiameterM,
    rotorDiameterM: finiteOrNull(trial.rotorDiameterM),
    compartmentHeightM: finiteOrNull(trial.compartmentHeightM),
    rpm: trial.rpm,
    d32M: finiteOrNull(trial.d32M),
    floodHoldup: finiteOrNull(trial.floodHoldup),
    actualLoading: finiteOrNull(trial.actualLoading),
    tipSpeedMS: finiteOrNull(trial.tipSpeedMS),
    powerVolumeWM3: finiteOrNull(trial.powerVolumeWM3),
    massFluxKgM2S: finiteOrNull(trial.massFluxKgM2S),
    trialStatus: source === 'V150_EXTRAPOLATED_MODEL_ROOT'
      ? 'CALCULATED_EXTRAPOLATED'
      : 'CALCULATED_IN_RANGE',
    independentCheck: 'PASSED',
  };
}

function validInRangeCandidate(result: JsonRecord): KuhniStage3PresentationCandidate | null {
  const envelope = Array.isArray(result.hydraulicRpmEnvelope)
    ? result.hydraulicRpmEnvelope.map(asRecord).filter((value): value is JsonRecord => Boolean(value))
    : [];
  const point = asRecord(result.hydraulicDiagnosticPoint);
  const candidate = point?.status === 'CALCULATED_IN_RANGE'
    ? point
    : envelope
      .filter((trial) => trial.status === 'CALCULATED_IN_RANGE')
      .sort((left, right) =>
        Number(left.columnDiameterM) - Number(right.columnDiameterM)
        || Number(left.rpm) - Number(right.rpm))[0];
  if (!candidate) return null;
  const matchingEnvelopeTrial = envelope.find((trial) =>
    trial.status === 'CALCULATED_IN_RANGE'
    && trial.rpm === candidate.rpm
    && trial.columnDiameterM === candidate.columnDiameterM);
  return matchingEnvelopeTrial
    ? candidateFromTrial(matchingEnvelopeTrial, 'CALCULATED_IN_RANGE_TRIAL')
    : null;
}

function validV150ReverseCandidate(
  result: JsonRecord,
  basis: HydrodynamicProcessBasis,
): KuhniStage3PresentationCandidate | null {
  const engine = asRecord(result.engine);
  if (
    engine?.version !== KUHNI_GEOMETRY_RESOLVER_V150_VERSION
    || engine.implementationHash !== KUHNI_GEOMETRY_RESOLVER_V150_HASH
    || basis.phaseConfiguration !== 'rrbo-continuous-nmp-dispersed'
  ) return null;
  const selection = asRecord(result.illustrativeModelRootSelection);
  const root = asRecord(result.illustrativeExtrapolatedModelRoot);
  const diagnostics = asRecord(result.reverseOrientationDiagnostics);
  if (
    selection?.status !== 'EXTRAPOLATED_MODEL_ROOT_SELECTED_FOR_ILLUSTRATION'
    || diagnostics?.excludedFromHydraulicEnvelope !== true
    || !root
    || selection.selectedRpm !== root.rpm
    || selection.selectedColumnDiameterM !== root.columnDiameterM
  ) return null;
  const assessment = assessReverseExtrapolatedModelRoot(root, basis);
  if (
    assessment.status !== 'EXTRAPOLATED_MODEL_ROOT'
    || assessment.sourceQualification !== 'CALCULATED_EXTRAPOLATED'
  ) return null;
  return candidateFromTrial(root, 'V150_EXTRAPOLATED_MODEL_ROOT');
}

/**
 * Additive read-only qualification for an already integrity-verified resolver
 * snapshot. This deliberately does not modify the stored result, resolver
 * hash, scientific admission, or Stage-4 dependency checks.
 */
export function qualifyKuhniStage3Presentation(
  input: QualificationInput,
): KuhniStage3PresentationQualification {
  const result = asRecord(input.result);
  const basis = input.processBasis as HydrodynamicProcessBasis | undefined;
  const lineage = lineageFor(input);
  const reverse = basis?.phaseConfiguration === 'rrbo-continuous-nmp-dispersed';
  if (!result || !basis) {
    return unavailable(input, lineage, 'PRESENTATION_SNAPSHOT_MISSING', 'No complete resolver snapshot was available for presentation qualification.');
  }
  if (lineage.status !== 'CURRENT') {
    return unavailable(input, lineage, 'PRESENTATION_STAGE1_LINEAGE_NOT_CURRENT', 'The resolver snapshot is not tied to the current saved Stage-1 snapshot; no presentation candidate is shown.');
  }
  if (!input.integrityVerified) {
    return unavailable(input, lineage, 'PRESENTATION_SNAPSHOT_NOT_VERIFIED', 'The resolver snapshot did not pass its immutable replay checks; no presentation candidate is shown.');
  }

  // V1.5 reverse candidates must come from the persisted diagnostic's own
  // selected root and pass the independent primitive-basis re-check. No
  // request or client-provided point can enter this branch.
  const candidate = reverse
    ? validV150ReverseCandidate(result, basis)
    : validInRangeCandidate(result);
  if (!candidate) {
    return unavailable(
      input,
      lineage,
      reverse ? 'REVERSE_PREPILOT_CANDIDATE_NOT_INDEPENDENTLY_CHECKED' : 'PREPILOT_CANDIDATE_NOT_AVAILABLE',
      reverse
        ? 'The existing V1.5 diagnostic contains no finite independently checked reverse model root; the orientation prerequisite remains visible.'
        : 'The existing resolver snapshot contains no finite calculated hydraulic trial suitable for a pre-pilot presentation.',
    );
  }
  return {
    schemaVersion: 'ECR_STAGE3_PRESENTATION_QUALIFICATION_V1',
    status: KUHNI_STAGE3_PRESENTATION_CLASSIFICATION,
    label: KUHNI_STAGE3_PRESENTATION_LABEL,
    candidate,
    governedOutput: {
      status: 'UNCHANGED_GOVERNED_OUTPUT',
      candidateIsNotGoverned: true,
      stage4Input: false,
      message: 'Presentation-only pre-pilot candidate; governed hydraulic output, Stage 4 admission, and mass-transfer readiness are unchanged.',
    },
    lineage,
    limitations: baseLimitations(reverse),
  };
}

export type KuhniStage3PresentationQualificationInput = QualificationInput;