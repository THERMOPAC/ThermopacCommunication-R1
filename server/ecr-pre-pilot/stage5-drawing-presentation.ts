import { renderStage5Svg } from '../../shared/ecr-stage5-drawings';
import { R1_RULESET, R2_RULESET, R3_RULESET } from '../../shared/ecr-stage5-r1';
import {
  APPROVED_COMPONENT_RULESET, HISTORICAL_APPROVED_COMPONENT_RULESET,
  PRELIMINARY_COMPONENT_RULESET,
} from '../../shared/ecr-stage5-approved-components';
import { STAGE5_VIEWS, Stage5Error, stage5Hash } from './stage5-geometry-service';

export const STAGE5_PRESENTATION_VERSION = 'dimensioned-v2';

/** A new presentation of a verified saved dataset, never a new scientific revision. */
export function stage5DrawingPresentation(record: any, designId: number, requested?: unknown) {
  if (requested === undefined || requested === 'original') return record;
  if (requested !== STAGE5_PRESENTATION_VERSION)
    throw new Stage5Error('STAGE5_UNKNOWN_DRAWING_PRESENTATION', 400);
  if (![
    R1_RULESET, R2_RULESET, R3_RULESET,
    HISTORICAL_APPROVED_COMPONENT_RULESET, APPROVED_COMPONENT_RULESET,
    PRELIMINARY_COMPONENT_RULESET,
  ].includes(record.geometry?.ruleset))
    throw new Stage5Error('STAGE5_DIMENSIONED_PRESENTATION_REQUIRES_SAVED_R1', 409);
  const geometryHash = stage5Hash(record.geometry);
  if (record.geometryHash && geometryHash !== record.geometryHash)
    throw new Stage5Error('STAGE5_R1_DATASET_MANIFEST_INTEGRITY_FAILURE', 409);
  const context = {
    designId: String(designId), revision: String(record.revision),
    date: new Date(record.createdAt).toISOString().slice(0, 10), sourceHash: record.sourceHash,
    presentationVersion: STAGE5_PRESENTATION_VERSION,
  };
  const drawings = Object.fromEntries(STAGE5_VIEWS.map(view => {
    const svg = renderStage5Svg(record.geometry, view, context);
    const metadata = JSON.stringify({ ...context, geometryHash }).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return [view, svg.replace(/(<svg\b[^>]*>)/, `$1<metadata>${metadata}</metadata>`)];
  }));
  if (stage5Hash(record.geometry) !== geometryHash)
    throw new Stage5Error('STAGE5_PRESENTATION_MUTATED_GEOMETRY', 500);
  return { ...record, drawings, presentationVersion: STAGE5_PRESENTATION_VERSION, geometryHash };
}