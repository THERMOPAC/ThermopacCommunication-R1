import type { Express, Request, Response } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import { getStage5Basis, getStage5Revisions, previewStage5, saveStage5Revision, Stage5Error, STAGE5_VIEWS } from './stage5-geometry-service';
import { createStage5Pdf } from './stage5-geometry-report';
import { R1GeometryError } from '../../shared/ecr-stage5-r1';
import { stage5DrawingPresentation } from './stage5-drawing-presentation';

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
        const known = error instanceof Stage5Error || error instanceof R1GeometryError || /^(STAGE4_|STAGE1_|ECR_PRE_PILOT_)/.test(error?.message ?? '');
        return res.status(error instanceof Stage5Error ? error.status : known ? 409 : 500)
          .json({ error: known ? error.message : 'STAGE5_REQUEST_FAILED' });
      }
    };
  app.get(`${base}/basis`, ensureAuthenticated, handle(async (_q, r, u, d) => r.json(await getStage5Basis(u, d))));
  app.get(`${base}/revisions`, ensureAuthenticated, handle(async (_q, r, u, d) => r.json(await getStage5Revisions(u, d))));
  app.get(`${base}/revisions/:revisionId`, ensureAuthenticated, handle(async (q, r, u, d) =>
    r.json(stage5DrawingPresentation((await getStage5Revisions(u, d, String(q.params.revisionId)))[0], d, q.query.presentation))));
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
    return r.status(201).json(await saveStage5Revision(u, d, undefined, q.body?.expectedSourceHash, q.body?.notes));
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
}