import type { Express, Request, Response } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import { getP1CandidateBasis, getP1Candidates, startP1Candidate, startStage3Candidate } from './p1-candidate-service';

export function setupP1CandidateRoutes(app: Express) {
  for (const endpoint of ['stage3-candidates', 'stage3-p1-candidates']) {
  const p1Path = `/api/ecr-pre-pilot/designs/:id/${endpoint}`;
  for (const suffix of ['', '/basis', '/:candidateId']) {
    app.get(p1Path + suffix, ensureAuthenticated, async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isSafeInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid design id' });
      try {
        const userId = Number((req.user as any).id);
        if (suffix === '/basis') return res.json(await getP1CandidateBasis(userId, designId));
        const rows = await getP1Candidates(userId, designId, req.params.candidateId);
        if (suffix && !rows.length) return res.status(404).json({ error: 'P1_CANDIDATE_NOT_FOUND' });
        return res.json(suffix ? rows[0] : rows.map(({ result, ...row }: any) => ({ ...row, resultStatus: result?.status })));
      } catch (error: any) {
        return res.status(error.message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404 : 422).json({ error: error.message });
      }
    });
  }
  app.post(p1Path, ensureAuthenticated, async (req: Request, res: Response) => {
    const designId = Number(req.params.id);
    if (!Number.isSafeInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid design id' });
    try {
      const start = endpoint === 'stage3-candidates' ? startStage3Candidate : startP1Candidate;
      return res.status(202).json(await start(Number((req.user as any).id), designId, req.body));
    } catch (error: any) {
      return res.status(error.message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404 : error.message === 'P1_CANDIDATE_ALREADY_RUNNING' ? 409 : 422).json({ error: error.message });
    }
  });
  }
}