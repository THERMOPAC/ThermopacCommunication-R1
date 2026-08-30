import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SIX_COMPONENT_COSMO_SAC_ORDER = [
  'SAT',
  'MONO',
  'DI',
  'POLY',
  'PA',
  'NMP',
] as const;

export type SixComponentCosmoSacFamily = typeof SIX_COMPONENT_COSMO_SAC_ORDER[number];

const PROFILE_ROOT =
  'server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles/sigma3';

const mutableBasis = {
  schemaVersion: 'ECR_PRE_PILOT_SIX_COMPONENT_COSMO_SAC_BASIS_V1',
  model: 'COSMO-SAC-2010',
  componentOrder: SIX_COMPONENT_COSMO_SAC_ORDER,
  components: [
    ['SAT', 'n-dodecane', '112-40-3', 'SNRUBQQJIBEYMU-UHFFFAOYSA-N', '6f51a75fbfa70df9b410fae88614e5c27d003eea228bc91318edb2854b5c26c2'],
    ['MONO', 'n-propylbenzene', '103-65-1', 'ODLMAHJVESYWTB-UHFFFAOYSA-N', '0afc9a2a69c0f3c7827ecdd7553f7ebf1a6e35f8b64597ffc8a6b780c324c275'],
    ['DI', '1-methylnaphthalene', '90-12-0', 'QPUYECUOLPXSFR-UHFFFAOYSA-N', '7e8664f594afa70a232f845dfafbfbb1efd2e10e13c586187b556102a97503ed'],
    ['POLY', 'pyrene', '129-00-0', 'BBEAQIROQSPTKN-UHFFFAOYSA-N', '682828484416f124e3207f246d23954197502cba83d9b4744ace239d91fe8854'],
    ['PA', "4,4'-Bis(alpha,alpha-dimethylbenzyl)diphenylamine", '10081-67-1', 'UJAWGGOCYUPCPS-UHFFFAOYSA-N', '474736e63fd99749f7dad0cd5569959e9dd47a8a2dfe55b6ef80642ed3d1c03e'],
    ['NMP', 'N-methyl-2-pyrrolidone', '872-50-4', 'SECXISVLQFMRJM-UHFFFAOYSA-N', '58dcecc755994f7955aec100dfb26de62c3ad933dcfd25c11f68ddec3b1efa69'],
  ].map(([family, name, cas, inchiKey, profileSha256]) => ({
    family,
    name,
    cas,
    inchiKey,
    profile: {
      available: true,
      format: 'NIST_DELWARE_SIGMA3',
      path: `${PROFILE_ROOT}/${inchiKey}.sigma`,
      sha256: profileSha256,
    },
  })),
  provenance: {
    generationManifestSha256: '65baa44c36ffae817e52f60a32591f3fc1be7c140517c8b37c95458c834d1fa9',
    generationProtocolSha256: '4a9cd2dbb5da63fbd30f18234763b09e05819256511d639c01958b86ca2ab216',
    complistSha256: '365a84301ee4ab5aa1a9811851468672aea736760239c63de7ad087b3ac633f1',
    profileVerificationSha256: 'd07ea132252d1a56549629c630b658dcc4d9538e44ca6767f6b9b1fbdb15a0e9',
    nistCosmoSacSourceCommit: '1b82456be38026719b16cad4076109bef3fcb309',
  },
  qualification: {
    profileSemanticsGate: 'PASSED',
    researchOnly: true,
    calibrationRequired: true,
    pilotValidated: false,
    releaseEligible: false,
  },
} as const;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  }
  return value;
}

export const SIX_COMPONENT_COSMO_SAC_BASIS = deepFreeze(mutableBasis);
export type SixComponentCosmoSacBasis = typeof SIX_COMPONENT_COSMO_SAC_BASIS;
export const SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256 =
  '7683442c0419659d83320cfa4433fe8cf298f285f596c4676cf39bb5042838fc' as const;
if (sha256(SIX_COMPONENT_COSMO_SAC_BASIS) !== SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256) {
  throw new Error('SIX_COMPONENT_COSMO_SAC_CANONICAL_BASIS_CHANGED');
}

export function validateSixComponentCosmoSacBasis(
  candidate: unknown,
  claimedManifestSha256?: unknown,
): asserts candidate is SixComponentCosmoSacBasis {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('SIX_COMPONENT_COSMO_SAC_BASIS_REQUIRED');
  }
  const basis = candidate as Record<string, any>;
  if (
    !Array.isArray(basis.componentOrder)
    || basis.componentOrder.length !== SIX_COMPONENT_COSMO_SAC_ORDER.length
    || basis.componentOrder.some((family: unknown, index: number) =>
      family !== SIX_COMPONENT_COSMO_SAC_ORDER[index])
    || !Array.isArray(basis.components)
    || basis.components.length !== SIX_COMPONENT_COSMO_SAC_ORDER.length
  ) {
    throw new Error('SIX_COMPONENT_COSMO_SAC_ORDER_MISMATCH');
  }
  const identities = new Set<string>();
  for (let index = 0; index < SIX_COMPONENT_COSMO_SAC_ORDER.length; index += 1) {
    const component = basis.components[index];
    if (!component || component.family !== SIX_COMPONENT_COSMO_SAC_ORDER[index]) {
      throw new Error('SIX_COMPONENT_COSMO_SAC_ORDER_MISMATCH');
    }
    if (typeof component.inchiKey !== 'string' || identities.has(component.inchiKey)) {
      throw new Error('SIX_COMPONENT_COSMO_SAC_IDENTITY_NOT_UNIQUE');
    }
    identities.add(component.inchiKey);
    if (
      component.profile?.available !== true
      || typeof component.profile.path !== 'string'
      || !/^[a-f0-9]{64}$/.test(component.profile.sha256)
    ) {
      throw new Error('SIX_COMPONENT_COSMO_SAC_PROFILE_UNAVAILABLE');
    }
  }
  const actualHash = sha256(candidate);
  if (
    actualHash !== SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256
    || claimedManifestSha256 !== SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256
  ) {
    throw new Error('SIX_COMPONENT_COSMO_SAC_BASIS_HASH_MISMATCH');
  }
}

export type SixComponentCosmoSacStage1Binding = {
  schemaVersion: 'ECR_PRE_PILOT_SIX_COMPONENT_COSMO_SAC_STAGE1_BINDING_V1';
  componentOrder: readonly SixComponentCosmoSacFamily[];
  status: 'VERIFIED' | 'BLOCKED';
  components: readonly {
    family: SixComponentCosmoSacFamily;
    identity: string;
    inchiKey: string | null;
    profile: {
      available: boolean;
      path: string | null;
      sha256: string | null;
    };
    blocker: string | null;
  }[];
};

const CANONICAL_BY_FAMILY = new Map(
  SIX_COMPONENT_COSMO_SAC_BASIS.components.map((component) => [component.family, component]),
);

function selectedComponent(
  family: 'SAT' | 'MONO',
  identity: string,
) {
  const canonical = CANONICAL_BY_FAMILY.get(family)!;
  if (identity === canonical.name) {
    return {
      family,
      identity,
      inchiKey: canonical.inchiKey,
      profile: { ...canonical.profile },
      blocker: null,
    };
  }
  return {
    family,
    identity,
    inchiKey: null,
    profile: { available: false, path: null, sha256: null },
    blocker: `${family}_IDENTITY_PROFILE_NOT_VERIFIED`,
  };
}

export function resolveStage1SixComponentCosmoSacBinding(
  stage1: { satIdentity: string; monoIdentity: string },
): SixComponentCosmoSacStage1Binding {
  const components = SIX_COMPONENT_COSMO_SAC_ORDER.map((family) => {
    if (family === 'SAT') return selectedComponent('SAT', stage1.satIdentity);
    if (family === 'MONO') return selectedComponent('MONO', stage1.monoIdentity);
    const canonical = CANONICAL_BY_FAMILY.get(family)!;
    return {
      family,
      identity: canonical.name,
      inchiKey: canonical.inchiKey,
      profile: { ...canonical.profile },
      blocker: null,
    };
  });
  return {
    schemaVersion: 'ECR_PRE_PILOT_SIX_COMPONENT_COSMO_SAC_STAGE1_BINDING_V1',
    componentOrder: SIX_COMPONENT_COSMO_SAC_ORDER,
    status: components.every((component) => component.profile.available)
      ? 'VERIFIED'
      : 'BLOCKED',
    components,
  };
}

export function stage1SixComponentCosmoSacBindingHash(binding: SixComponentCosmoSacStage1Binding): string {
  return sha256(binding);
}

export function validateStage1SixComponentCosmoSacBinding(
  binding: unknown,
  claimedBindingHash: unknown,
  stage1: { satIdentity: string; monoIdentity: string },
) {
  if (!binding || typeof binding !== 'object' || typeof claimedBindingHash !== 'string') {
    throw new Error('SIX_COMPONENT_COSMO_SAC_BINDING_REQUIRED');
  }
  const expected = resolveStage1SixComponentCosmoSacBinding(stage1);
  if (canonicalJson(binding) !== canonicalJson(expected)) {
    throw new Error('SIX_COMPONENT_COSMO_SAC_BINDING_MISMATCH');
  }
  if (stage1SixComponentCosmoSacBindingHash(binding as SixComponentCosmoSacStage1Binding) !== claimedBindingHash) {
    throw new Error('SIX_COMPONENT_COSMO_SAC_BINDING_HASH_MISMATCH');
  }
}

export type SixComponentProfileFileReader = (relativePath: string) => Buffer;

export function verifyStage1SixComponentCosmoSacProfileFiles(
  binding: SixComponentCosmoSacStage1Binding,
  readProfile: SixComponentProfileFileReader = (relativePath) =>
    fs.readFileSync(path.resolve(process.cwd(), relativePath)),
) {
  if (binding.status !== 'VERIFIED') throw new Error('SIX_COMPONENT_COSMO_SAC_BINDING_BLOCKED');
  for (const component of binding.components) {
    if (!component.profile.available || !component.profile.path || !component.profile.sha256) {
      throw new Error(`SIX_COMPONENT_COSMO_SAC_${component.family}_PROFILE_UNAVAILABLE`);
    }
    let bytes: Buffer;
    try {
      bytes = readProfile(component.profile.path);
    } catch {
      throw new Error(`SIX_COMPONENT_COSMO_SAC_${component.family}_PROFILE_FILE_MISSING`);
    }
    if (createHash('sha256').update(bytes).digest('hex') !== component.profile.sha256) {
      throw new Error(`SIX_COMPONENT_COSMO_SAC_${component.family}_PROFILE_HASH_MISMATCH`);
    }
  }
}