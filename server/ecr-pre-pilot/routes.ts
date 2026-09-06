import type { Express, Request, Response } from 'express';
import { ensureAuthenticated } from '../auth-middleware';
import {
  allocateEcrPrePilotDesign,
  getLatestSavedEcrPrePilotDesign,
  saveEcrPrePilotStage1,
  createKuhniHydrodynamicRun,
  getKuhniHydrodynamicRuns,
  createKuhniGeometryResolverRun,
  getKuhniGeometryResolverRuns,
  evaluateEcrPrePilotJobA,
  evaluateEcrPrePilotJobB,
  evaluateEcrPrePilotJobC,
} from '../ecr-pre-pilot-service';
import {
  enqueuePredictiveNtJobFromSavedStage1,
  getLatestPredictiveNtJob,
  getPredictiveNtJob,
  getPredictiveNtJobReport,
  PREDICTIVE_NT_MOLECULAR_REGISTRY,
  startPredictiveNtWorker,
  stopPredictiveNtJob,
} from './predictive-nt-job-service';
import { PRE_PILOT_MODEL, PRE_PILOT_MULTISTAGE_MODEL } from './model';
import {
  SIX_COMPONENT_COSMO_SAC_BASIS,
  SIX_COMPONENT_COSMO_SAC_BASIS_MANIFEST_SHA256,
} from './six-component-cosmo-sac-basis';
import { setupKuhniResolverPreview } from './kuhni-resolver-preview';
import {
  cancelJobC,
  enqueueJobC,
  getJobC,
  getLatestJobC,
  startJobCWorker,
} from './job-c-job-service';

export function setupEcrPrePilotRoutes(app: Express): void {
  startPredictiveNtWorker();
  startJobCWorker();
  setupKuhniResolverPreview(app);
  app.get('/api/ecr-pre-pilot/predictive-nt/basis', ensureAuthenticated, (_req: Request, res: Response) => {
    return res.json({
      model: PRE_PILOT_MULTISTAGE_MODEL,
      molecularRegistry: PREDICTIVE_NT_MOLECULAR_REGISTRY,
      predictiveEngineComponentContract: {
        engineContractVersion: '7C-1.5.0',
        componentCount: 7,
        families: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
        thermodynamicModel: 'NATIVE_SEVEN_COMPONENT_COSMO_SAC_2010_ADDITIVE_RK_H2O',
        modelIdentity: 'NATIVE_SEVEN_COMPONENT_CCOSMO_2010_PLUS_ADDITIVE_REDLICH_KISTER',
        nativeGibbsContributionRetained: true,
        interactionArtifact: 'TASK-238-NMP-OIL-RK-0.2.0',
        implementationStatus: 'IMPLEMENTED',
        predictiveQualification: 'PRE_PILOT_MULTISTAGE',
        governanceStatus: 'PRE-PILOT MULTISTAGE PREDICTIVE MODEL',
        supportedWaterWeightPercentRange: { minimum: 0.5, maximum: 5.0 },
        computationalQualificationWaterWeightPercent:
          [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
        directWaterBearingLleValidated: false,
        experimentalOrDesignQualificationClaimed: false,
        releaseEligible: false,
      },
      historicalSixComponentContract: {
        replayable: true,
        componentCount: 6,
        families: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP'],
        thermodynamicModel: 'FROZEN_SIX_COMPONENT_COSMO_SAC_2010',
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

  app.get('/api/ecr-pre-pilot/designs/latest-saved', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const design = await getLatestSavedEcrPrePilotDesign(Number((req.user as any)?.id));
      if (!design) return res.status(404).json({ message: 'No saved ECR Pre-Pilot design found.' });
      return res.json({
        id: design.id,
        projectNumber: String(design.projectNumber),
        status: design.status,
        inputData: design.inputData,
      });
    } catch (error) {
      console.error('[ECR Pre-Pilot] Latest saved design lookup failed:', error);
      return res.status(500).json({ message: 'Saved ECR Pre-Pilot design could not be loaded.' });
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
    '/api/ecr-pre-pilot/designs/:id/kuhni-hydrodynamics/runs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      try {
        return res.status(201).json(await createKuhniHydrodynamicRun(Number((req.user as any).id), designId, req.body));
      } catch (error: any) {
        return res.status(error.message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404 : 422).json({ error: error.message });
      }
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/kuhni-hydrodynamics/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      try {
        const run = await getKuhniHydrodynamicRuns(Number((req.user as any).id), designId, true);
        return run ? res.json(run) : res.status(404).json({ error: 'Kuhni hydrodynamic run not found' });
      } catch (error: any) {
        const status = error.message === 'ECR_PRE_PILOT_KUHNI_INTEGRITY_FAILURE' ? 409 : 500;
        return res.status(status).json({ error: error.message });
      }
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/kuhni-geometry-resolver/runs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      try {
        return res.status(201).json(await createKuhniGeometryResolverRun(Number((req.user as any).id), designId));
      } catch (error: any) {
        return res.status(error.message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404 : 422).json({ error: error.message });
      }
    },
  );
  const jobAHandler = async (req: Request, res: Response) => {
    const designId = Number(req.params.id);
    if (!Number.isInteger(designId) || designId <= 0) {
      return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
    }
    if (req.method === 'POST' && req.body && Object.keys(req.body).length) {
      return res.status(400).json({ error: 'JOB_A_CLIENT_PHYSICAL_INPUT_PROHIBITED' });
    }
    try {
      return res.json(await evaluateEcrPrePilotJobA(
        Number((req.user as any).id),
        designId,
      ));
    } catch (error: any) {
      const message = error?.message ?? 'JOB_A_EVALUATION_FAILED';
      const status = message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404
        : message.startsWith('JOB_A_DEPENDENCY_BLOCKED:') ? 409
        : message === 'ECR_PRE_PILOT_KUHNI_RESOLVER_INTEGRITY_FAILURE' ? 409
        : 422;
      return res.status(status).json({ error: message });
    }
  };
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-a/evaluate',
    ensureAuthenticated,
    jobAHandler,
  );
  const jobBHandler = async (req: Request, res: Response) => {
    const designId = Number(req.params.id);
    if (!Number.isInteger(designId) || designId <= 0) {
      return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
    }
    if (req.method === 'POST' && req.body && Object.keys(req.body).length) {
      return res.status(400).json({ error: 'JOB_B_CLIENT_PHYSICAL_INPUT_PROHIBITED' });
    }
    try {
      return res.json(await evaluateEcrPrePilotJobB(
        Number((req.user as any).id),
        designId,
      ));
    } catch (error: any) {
      const message = error?.message ?? 'JOB_B_EVALUATION_FAILED';
      const status = message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404
        : message.startsWith('JOB_B_DEPENDENCY_BLOCKED:')
          || message.startsWith('JOB_B_BOUNDARY_STATE_BLOCKED:')
          || message.startsWith('JOB_A_DEPENDENCY_BLOCKED:') ? 409 : 422;
      return res.status(status).json({
        error: message,
        ...(error?.details && typeof error.details === 'object'
          ? { details: error.details } : {}),
      });
    }
  };
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-b/evaluate',
    ensureAuthenticated,
    jobBHandler,
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/jobs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'JOB_C_ENQUEUE_BODY_PROHIBITED' });
      }
      try {
        return res.status(202).json(await enqueueJobC(Number((req.user as any).id), designId));
      } catch (error: any) {
        const message = error?.message ?? 'JOB_C_ENQUEUE_FAILED';
        const status = message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404
          : message.includes('DEPENDENCY_BLOCKED:')
            || message.startsWith('JOB_B_BOUNDARY_STATE_BLOCKED:') ? 409 : 422;
        return res.status(status).json({ error: message, ...(error?.details ? { details: error.details } : {}) });
      }
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/job-c/jobs/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const job = await getLatestJobC(Number((req.user as any).id), Number(req.params.id));
      return job ? res.json(job) : res.status(404).json({ error: 'JOB_C_JOB_NOT_FOUND' });
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/job-c/jobs/:jobId',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const job = await getJobC(req.params.jobId, Number((req.user as any).id), Number(req.params.id));
      return job ? res.json(job) : res.status(404).json({ error: 'JOB_C_JOB_NOT_FOUND' });
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/jobs/:jobId/cancel',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'JOB_C_CANCEL_BODY_PROHIBITED' });
      }
      const job = await cancelJobC(req.params.jobId, Number((req.user as any).id), Number(req.params.id));
      return job ? res.json(job) : res.status(404).json({ error: 'JOB_C_JOB_NOT_FOUND' });
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/evaluate',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'JOB_C_CLIENT_PHYSICAL_INPUT_PROHIBITED' });
      }
      try {
        return res.json(await evaluateEcrPrePilotJobC(
          Number((req.user as any).id), designId,
        ));
      } catch (error: any) {
        const message = error?.message ?? 'JOB_C_EVALUATION_FAILED';
        const status = message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404
          : message.startsWith('JOB_C_DEPENDENCY_BLOCKED:')
            || message.startsWith('JOB_A_DEPENDENCY_BLOCKED:')
            || message.startsWith('JOB_B_DEPENDENCY_BLOCKED:')
            || message.startsWith('JOB_B_BOUNDARY_STATE_BLOCKED:') ? 409 : 422;
        return res.status(status).json({
          error: message,
          ...(error?.details && typeof error.details === 'object'
            ? { details: error.details } : {}),
        });
      }
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/job-a/latest',
    ensureAuthenticated,
    jobAHandler,
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/kuhni-geometry-resolver/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      try {
        const run = await getKuhniGeometryResolverRuns(Number((req.user as any).id), designId, true);
        return run ? res.json(run) : res.status(404).json({ error: 'Kuhni geometry resolver run not found' });
      } catch (error: any) {
        return res.status(error.message === 'ECR_PRE_PILOT_KUHNI_RESOLVER_INTEGRITY_FAILURE' ? 409 : 500).json({ error: error.message });
      }
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/kuhni-geometry-resolver/runs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      try {
        return res.json(await getKuhniGeometryResolverRuns(Number((req.user as any).id), designId));
      } catch (error: any) {
        return res.status(error.message === 'ECR_PRE_PILOT_KUHNI_RESOLVER_INTEGRITY_FAILURE' ? 409 : 500).json({ error: error.message });
      }
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/kuhni-hydrodynamics/runs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      try {
        return res.json(await getKuhniHydrodynamicRuns(Number((req.user as any).id), designId));
      } catch (error: any) {
        const status = error.message === 'ECR_PRE_PILOT_KUHNI_INTEGRITY_FAILURE' ? 409 : 500;
        return res.status(status).json({ error: error.message });
      }
    },
  );
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
    '/api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const designId = Number(req.params.id);
        if (!Number.isInteger(designId) || designId <= 0) {
          return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
        }
        const job = await getLatestPredictiveNtJob(Number((req.user as any).id), designId);
        if (!job) return res.status(404).json({ error: 'Predictive N_T job not found' });
        return res.json(job);
      } catch (error) {
        console.error('[ECR Pre-Pilot] Latest Predictive N_T job lookup failed:', error);
        return res.status(500).json({ error: 'Predictive N_T job lookup failed' });
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

  app.post(
    '/api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/:jobId/stop',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const designId = Number(req.params.id);
        if (!Number.isInteger(designId) || designId <= 0) {
          return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
        }
        const job = await stopPredictiveNtJob(
          req.params.jobId,
          Number((req.user as any).id),
          designId,
        );
        if (!job) return res.status(404).json({ error: 'Predictive N_T job not found' });
        return res.json(job);
      } catch (error) {
        console.error('[ECR Pre-Pilot] Predictive N_T job stop failed:', error);
        return res.status(500).json({ error: 'Predictive N_T job could not be stopped' });
      }
    },
  );

  app.get(
    '/api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/:jobId/report',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      try {
        const designId = Number(req.params.id);
        if (!Number.isInteger(designId) || designId <= 0) {
          return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
        }
        const report = await getPredictiveNtJobReport(
          req.params.jobId,
          Number((req.user as any).id),
          designId,
        );
        if (!report) return res.status(404).json({ error: 'Predictive N_T report not found' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
        res.setHeader('Content-Length', String(report.pdf.length));
        res.setHeader('Digest', `sha-256=${Buffer.from(report.sha256, 'hex').toString('base64')}`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(report.pdf);
      } catch (error) {
        console.error('[ECR Pre-Pilot] Predictive N_T report download failed:', error);
        return res.status(500).json({ error: 'Predictive N_T report download failed' });
      }
    },
  );
}