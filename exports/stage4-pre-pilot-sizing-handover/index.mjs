import { sizeSelectedGeometry } from './sizing-core.mjs';

const reject = code => { throw new Error(code); };
const lineageFields = ['stage1SnapshotHash', 'selectionImplementation', 'selectionResultHash'];

/**
 * Local replay boundary, NOT an authenticated authority loader.
 * Production adapters must resolve currentLineage from trusted server state.
 */
export function replayStage4(input) {
  if (!input || input.provenance !== 'PORTABLE_REPLAY_NOT_SAVED_PROJECT236_STAGE4_RUN') {
    reject('PORTABLE_REPLAY_PROVENANCE_REQUIRED');
  }
  const selected = input.selectedStage3;
  for (const field of lineageFields) {
    const current = input.currentLineage?.[field];
    if (typeof current !== 'string' || !current.trim() ||
        selected?.lineage?.[field] !== current) {
      reject('CURRENT_SELECTED_STAGE3_LINEAGE_REQUIRED');
    }
  }
  const reference = input.actualStage2NtReference;
  if (reference != null && (!Number.isInteger(reference.value) || reference.value <= 0 ||
      typeof reference.evidenceId !== 'string' || !reference.evidenceId.trim() ||
      typeof reference.resultHash !== 'string' || !reference.resultHash.trim())) {
    reject('STAGE4_ACTUAL_STAGE2_NT_REFERENCE_INVALID');
  }
  const sizing = sizeSelectedGeometry(selected?.geometry);
  // Additional adapter guard: extreme positive values must not round to zero.
  if (sizing.installedActiveHeightM <= 0) reject('PORTABLE_ACTIVE_HEIGHT_NOT_POSITIVE');
  return {
    provenance: input.provenance,
    status: 'CALCULATED_COMPARTMENT_EFFICIENCY_PRE_PILOT_SIZING',
    authority: 'LOCAL_REPLAY_CONSISTENCY_ONLY_NOT_AUTHENTICATED_SAVED_AUTHORITY',
    selectedStage3: structuredClone(selected),
    sizing,
    actualStage2NtReference: reference == null ? null : { ...reference, status: 'REFERENCE_ONLY_NOT_SIZING_INPUT' },
    limitations: [
      'Adopted efficiency 0.35 is an engineering assumption, not calculated performance or a published system constant.',
      'Implied installed HETS is diagnostic only, not an input.',
      'No hydraulic qualification, physical or pilot validation, outlet prediction, target compliance or final mechanical design.',
      'Active height excludes disengagement zones and is not total vessel height.',
    ],
  };
}