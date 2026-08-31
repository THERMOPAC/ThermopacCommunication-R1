import type { Express, Request, Response } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import { allocateEcrPrePilotDesign, saveEcrPrePilotStage1 } from '../ecr-pre-pilot-service';
import {
  enqueuePredictiveNtJobFromSavedStage1,
  getPredictiveNtJob,
  PREDICTIVE_NT_MOLECULAR_REGISTRY,
  startPredictiveNtWorker,
} from './predictive-nt-job-service';
import { PRE_PILOT_MODEL } from './model';
import {
  SIX_COMPONENT_COSMO_SAC_BASIS,
  SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
} from './six-component-cosmo-sac-basis';

export function setupEcrPrePilotRoutes(app: Express): void {
  startPredictiveNtWorker();
  app.get('/api/ecr-pre-pilot/predictive-nt/basis', ensureAuthenticated, (_req: Request, res: Response) => {
    return res.json({
      model: PRE_PILOT_MODEL,
      molecularRegistry: PREDICTIVE_NT_MOLECULAR_REGISTRY,
      predictiveEngineComponentContract: {
        componentCount: 6,
        families: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
        thermodynamicModel: 'FROZEN_SIX_COMPONENT_COSMO_SAC_2010',
        sixComponentCosmoSacGate: 'RESEARCH_DIAGNOSTIC_ONLY',
      },
      sixComponentCosmoSacBasis: SIX_COMPONENT_COSMO_SAC_BASIS,
      sixComponentCosmoSacBasisManifestSha256:
        SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
      maximumStages: 10,
    });
  });

  app.post('/api/ecr-pre-pilot/designs', ensureAuthenticated, async (req: Request, res: Response) => {
    const userId = Number((req.user as any)?.id);
    const allocationKey = String(req.get('Idempotency-Key') ?? '').trim();
    if (!allocationKey) {
      return res.status(400).json({ message: 'Idempotency-Key header is required.' });
    }

    try {
      const allocation = await allocateEcrPrePilotDesign(userId, allocationKey);
      return res.status(allocation.existing ? 200 : 201).json({
        id: allocation.id,
        projectNumber: String(allocation.projectNumber),
        status: allocation.status,
        inputData: allocation.inputData,
        sulfurPrediction: {
          status: 'NOT_CALCULABLE',
          calibrationStatus: 'CALIBRATION_REQUIRED',
        },
      });
    } catch (error: any) {
      const message = error?.message ?? 'ECR Pre-Pilot design could not be allocated.';
      if (message.includes('Idempotency-Key')) {
        return res.status(400).json({ message });
      }
      console.error('[ECR Pre-Pilot] Project-number allocation failed:', error);
      return res.status(500).json({ message: 'ECR Pre-Pilot project number could not be allocated.' });
    }
  });

  app.put('/api/ecr-pre-pilot/designs/:id/stage-1', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      const snapshot = await saveEcrPrePilotStage1(
        Number((req.user as any).id),
        designId,
        req.body,
      );
      return res.json(snapshot);
    } catch (error: any) {
      const status = error.message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404 : 422;
      return res.status(status).json({ error: error.message });
    }
  });

  app.post(
    '/api/ecr-pre-pilot/designs/:id/predictive-nt/jobs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const designId = Number(req.params.id);
        if (!Number.isInteger(designId) || designId <= 0) {
          return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
        }
        const job = await enqueuePredictiveNtJobFromSavedStage1(
          Number((req.user as any).id),
          designId,
        );
        return res.status(202).json(job);
      } catch (error: any) {
        const status = error.message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404
          : error.message === 'PREDICTIVE_NT_QUEUE_FULL' ? 503
          : error.message === 'PREDICTIVE_NT_USER_JOB_LIMIT' ? 429
          : 422;
        return res.status(status).json({ error: error.message });
      }
    },
  );

  app.get(
    '/api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/:jobId',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const designId = Number(req.params.id);
        if (!Number.isInteger(designId) || designId <= 0) {
          return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
        }
        const job = await getPredictiveNtJob(req.params.jobId, Number((req.user as any).id), designId);
        if (!job) return res.status(404).json({ error: 'Predictive N_T job not found' });
        return res.json(job);
      } catch (error) {
        console.error('[ECR Pre-Pilot] Predictive N_T job lookup failed:', error);
        return res.status(500).json({ error: 'Predictive N_T job lookup failed' });
      }
    },
  );
}