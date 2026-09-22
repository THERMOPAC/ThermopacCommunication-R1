import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ensureAuthenticated } from '../auth-middleware';
import { getStage5Basis, getStage5Revisions, getStage5FrozenRevision, getStage5RevisionSummaries, previewStage5, saveStage5Revision, Stage5Error, STAGE5_VIEWS } from './stage5-geometry-service';
import { createStage5Pdf } from './stage5-geometry-report';
import { R1GeometryError } from '../../shared/ecr-stage5-r1';
import { stage5DrawingPresentation } from './stage5-drawing-presentation';
import { createStage5DesignDataPdf } from './stage5-design-data-report';
import { getAutomaticStage5EndSections, readEndSelections } from './stage5-end-sections-service';
import { renderEndSchematic } from '../../shared/ecr-stage5-end-schematic';

/** Transport projection only. Never used to validate/hash/save a revision.
 * Full source snapshots remain server authority and legacy responses are intact. */
export function stage5SummaryPayload(record: any, kind: 'basis' | 'revision' | 'history') {
  if (kind === 'basis') return { basis: record.basis, sourceHash: record.sourceHash };
  const { sourceStage3, sourceStage4, ...presentation } = record;
  if (kind === 'history') {
    const { geometry, drawings, inputs, rulesManifest, ...summary } = presentation;
    return { ...summary, geometry: { ruleset: geometry?.ruleset } };
  }
  return presentation;
}

export function setupStage5GeometryRoutes(app: Express) {
  const base = '/api/ecr-pre-pilot/designs/:id/stage5';
  const handle = (action: (req: Request, res: Response, user: number, design: number) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const user = Number((req.user as any)?.id);
        const design = Number(req.params.id);
        if (!Number.isSafeInteger(user) || user <= 0) return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
        if (!Number.isSafeInteger(design) || design <= 0) throw new Stage5Error('INVALID_DESIGN_ID', 400);
        if (req.params.revisionId && !/^[1-9]\d*$/.test(String(req.params.revisionId))) throw new Stage5Error('INVALID_REVISION_ID', 400);
        res.setHeader('Cache-Control', 'private, no-store');
        return await action(req, res, user, design);
      } catch (error: any) {
        const reference = randomUUID();
        const known = error instanceof Stage5Error || error instanceof R1GeometryError || /^(STAGE5_END_|STAGE4_|STAGE1_|ECR_PRE_PILOT_)/.test(error?.message ?? '');
        // Never log query parameters, snapshots, credentials or raw DB messages.
        // Stack frames and an opaque reference retain actionable diagnostics.
        console.error('[Stage5 request failure]', {
          reference, route: req.route?.path, name: error?.name,
          code: typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined,
          stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(1).filter((line: string) => /^\s+at /.test(line)).join('\n') : undefined,
        });
        if (['55P03', '40P01', '57014'].includes(error?.code)) {
          res.setHeader('Retry-After', '3');
          return res.status(503).json({ error: 'STAGE5_AUTHORITY_BUSY', reference });
        }
        return res.status(error instanceof Stage5Error ? error.status : known ? 409 : 500)
          .json({ error: known ? error.message : 'STAGE5_REQUEST_FAILED', reference });
      }
    };
  app.get(`${base}/basis`, ensureAuthenticated, handle(async (q, r, u, d) => {
    const record = await getStage5Basis(u, d);
    return r.json(q.query.payload === 'summary' ? stage5SummaryPayload(record, 'basis') : record);
  }));
  app.get(`${base}/revisions/:revisionId/end-sections`, ensureAuthenticated, handle(async (q, r, u, d) => {
    if (Object.keys(q.query).length)
      throw new Stage5Error('STAGE5_END_UNSUPPORTED_INPUT', 400);
    return r.json(await getAutomaticStage5EndSections(u, d, String(q.params.revisionId)));
  }));
  app.get(`${base}/end-sections/selections`, ensureAuthenticated, handle(async (_q, r, u, d) => {
    return r.json(await readEndSelections(u, d));
  }));
  app.post(`${base}/revisions/:revisionId/end-sections`, ensureAuthenticated, handle(async (q, r, u, d) => {
    throw new Stage5Error('STAGE5_END_MANUAL_SELECTIONS_RETIRED', 410);
  }));
  for (const mode of ['assemblies', 'ga'] as const) app.get(`${base}/revisions/:revisionId/end-sections/${mode === 'ga' ? 'ga.svg' : 'export.svg'}`, ensureAuthenticated, handle(async (q, r, u, d) => {
    if (Object.keys(q.query).some(k => k !== 'expectedSourceHash'))
      throw new Stage5Error('STAGE5_END_UNSUPPORTED_INPUT', 400);
    const result = await getAutomaticStage5EndSections(u, d, String(q.params.revisionId));
    if (q.query.expectedSourceHash !== result.sourceHash) throw new Stage5Error('STAGE5_END_SOURCE_CHANGED');
    r.setHeader('Content-Disposition', `attachment; filename="${mode === 'ga' ? 'stage5-current-conditional-ga' : 'stage5-conditional-end-assemblies'}.svg"`);
    return r.type('image/svg+xml').send(renderEndSchematic(result, mode));
  }));
  app.get(`${base}/revisions`, ensureAuthenticated, handle(async (q, r, u, d) => {
    return r.json(q.query.payload === 'summary'
      ? await getStage5RevisionSummaries(u, d) : await getStage5Revisions(u, d));
  }));
  app.get(`${base}/revisions/:revisionId`, ensureAuthenticated, handle(async (q, r, u, d) => {
    const record = stage5DrawingPresentation((await getStage5Revisions(u, d, String(q.params.revisionId)))[0], d, q.query.presentation);
    return r.json(q.query.payload === 'summary' ? stage5SummaryPayload(record, 'revision') : record);
  }));
  const requireAutomaticBody = (body: any, allowed: string[]) => {
    if (body != null && (typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !allowed.includes(key))))
      throw new Stage5Error('STAGE5_R1_CONSTRUCTION_OVERRIDES_FORBIDDEN', 400);
  };
  app.post(`${base}/preview`, ensureAuthenticated, handle(async (q, r, u, d) => {
    requireAutomaticBody(q.body, []);
    return r.json(await previewStage5(u, d));
  }));
  app.post(`${base}/revisions`, ensureAuthenticated, handle(async (q, r, u, d) => {
    requireAutomaticBody(q.body, ['expectedSourceHash', 'notes']);
    const record = await saveStage5Revision(u, d, undefined, q.body?.expectedSourceHash, q.body?.notes);
    return r.status(201).json(q.query.payload === 'summary' ? stage5SummaryPayload(record, 'revision') : record);
  }));
  app.get(`${base}/revisions/:revisionId/export.svg`, ensureAuthenticated, handle(async (q, r, u, d) => {
    const view = String(q.query.view ?? 'ga');
    if (!STAGE5_VIEWS.includes(view as any)) throw new Stage5Error('INVALID_DRAWING_VIEW', 400);
    const revision = stage5DrawingPresentation((await getStage5Revisions(u, d, String(q.params.revisionId)))[0], d, q.query.presentation);
    if (!revision.drawings?.[view]) throw new Stage5Error('STAGE5_FROZEN_DRAWING_MISSING');
    r.setHeader('Content-Disposition', `attachment; filename="stage5-r${revision.revision}-${revision.presentationVersion ?? 'original'}-${view}.svg"`);
    r.setHeader('X-Stage5-Currentness', revision.currentness);
    return r.type('image/svg+xml').send(revision.drawings[view]);
  }));
  app.get(`${base}/revisions/:revisionId/export.pdf`, ensureAuthenticated, handle(async (q, r, u, d) => {
    const revision = stage5DrawingPresentation((await getStage5Revisions(u, d, String(q.params.revisionId)))[0], d, q.query.presentation);
    const pdf = await createStage5Pdf(revision);
    r.setHeader('Content-Disposition', `attachment; filename="stage5-r${revision.revision}-${revision.presentationVersion ?? 'original'}.pdf"`);
    r.setHeader('X-Stage5-Currentness', revision.currentness);
    return r.type('application/pdf').send(pdf);
  }));
  app.get(`${base}/revisions/:revisionId/design-data.pdf`, ensureAuthenticated, handle(async (q, r, u, d) => {
    const revision = await getStage5FrozenRevision(u, d, String(q.params.revisionId));
    if (!revision.geometry?.r1Model) throw new Stage5Error('STAGE5_DESIGN_DATA_REQUIRES_SAVED_R1_GEOMETRY', 409);
    const pdf = await createStage5DesignDataPdf(revision, d);
    r.setHeader('Content-Disposition', `attachment; filename="stage5-r${revision.revision}-design-data.pdf"`);
    r.setHeader('X-Stage5-Currentness', revision.currentness);
    return r.type('application/pdf').send(pdf);
  }));
}