import type { Express, Request, Response } from 'express';
import { setupStage5GeometryRoutes } from './stage5-geometry-routes';
import { ensureAuthenticated } from '../auth-middleware';
import {
  allocateEcrPrePilotDesign,
  getLatestSavedEcrPrePilotDesign,
  saveEcrPrePilotStage1,
  createKuhniHydrodynamicRun,
  getKuhniHydrodynamicRuns,
  getKuhniGeometryResolverRuns,
  createStage3Stage4OptimizerRun,
  getStage3Stage4OptimizerRuns,
  getLatestCompletedJobCPhysicalSizing,
  getLatestPartialTransferPhysicalSizing,
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
  getJobC,
  getLatestJobC,
  startJobCWorker,
} from './job-c-job-service';
import {
  cancelSinglePartialTransferQualification,
  getSinglePartialTransferQualification,
  startPartialTransferQualificationRetirementCleanup,
} from './partial-transfer-qualification-service';
import {
  calculateStage4PrePilotSizing,
  getLiveStage4PrePilotSizing,
  retryStage4PrePilotSizing,
  stopStage4PrePilotSizing,
} from './stage4-pre-pilot-sizing-service';

export function retiredEcrPrePilotResponse(res: Response, capability: string) {
  return res.status(410).json({
    error: 'ECR_PRE_PILOT_JOB_RETIRED',
    capability,
    message: 'ECR Pre-Pilot Jobs A/B/C and partial-transfer qualification are retired. Historical owned results remain read-only.',
  });
}

export function setupEcrPrePilotRoutes(app: Express): void {
  setupStage5GeometryRoutes(app);
  startPredictiveNtWorker();
  // Job C is retired. Startup performs an idempotent terminalization pass
  // instead of resuming or claiming historical queue entries.
  startJobCWorker();
  // Recovery is terminal only and also retires work left by an older process.
  startPartialTransferQualificationRetirementCleanup();
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
        // New runs use the bounded Stage-3/4 optimizer. The resolver service
        // remains available below only for immutable historical replay.
        return res.status(201).json(await createStage3Stage4OptimizerRun(
          Number((req.user as any).id),
          designId,
          req.body,
        ));
      } catch (error: any) {
        return res.status(error.message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404 : 422).json({ error: error.message });
      }
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/stage3-stage4-optimizer/runs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      try {
        return res.status(201).json(await createStage3Stage4OptimizerRun(
          Number((req.user as any).id),
          designId,
          req.body,
        ));
      } catch (error: any) {
        const message = error?.message ?? 'ECR_STAGE3_STAGE4_OPTIMIZER_FAILED';
        const status = message === 'ECR_PRE_PILOT_DESIGN_NOT_FOUND' ? 404 : 422;
        return res.status(status).json({ error: message });
      }
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/stage3-stage4-optimizer/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      try {
        const run = await getStage3Stage4OptimizerRuns(
          Number((req.user as any).id),
          designId,
          true,
        );
        return run ? res.json(run) : res.status(404).json({ error: 'Stage3/4 optimizer run not found' });
      } catch (error: any) {
        return res.status(409).json({
          error: error?.message ?? 'ECR_STAGE3_STAGE4_OPTIMIZER_INTEGRITY_FAILURE',
        });
      }
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/stage3-stage4-optimizer/runs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      try {
        return res.json(await getStage3Stage4OptimizerRuns(
          Number((req.user as any).id),
          designId,
        ));
      } catch (error: any) {
        return res.status(409).json({
          error: error?.message ?? 'ECR_STAGE3_STAGE4_OPTIMIZER_INTEGRITY_FAILURE',
        });
      }
    },
  );
  const jobAHandler = async (req: Request, res: Response) => {
    const designId = Number(req.params.id);
    if (!Number.isInteger(designId) || designId <= 0) {
      return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
    }
    // Job A was recomputed on demand and has no persisted result row. In
    // particular, the legacy "latest" GET must not restart that runtime.
    return retiredEcrPrePilotResponse(
      res,
      req.method === 'GET' ? 'JOB_A_HISTORICAL_RESULT_UNAVAILABLE' : 'JOB_A_EVALUATION',
    );
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
    return retiredEcrPrePilotResponse(res, 'JOB_B_EVALUATION');
  };
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-b/evaluate',
    ensureAuthenticated,
    jobBHandler,
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/diagnostic/jobs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      return retiredEcrPrePilotResponse(res, 'JOB_C_DIAGNOSTIC_ENQUEUE');
    },
  );
  // Preserve the earlier strict partial-transfer diagnostic separately.  It
  // still requires all four scientific gates and repeated exact confirmation.
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/diagnostic/strict/jobs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      return retiredEcrPrePilotResponse(res, 'JOB_C_STRICT_DIAGNOSTIC_ENQUEUE');
    },
  );
  // This is an explicit, body-free continuation request.  The server selects
  // and verifies an owned immutable strict-diagnostic source; callers cannot
  // nominate a job, checkpoint, lambda, or any scientific input.
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/continuation/strict-anchor/jobs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      return retiredEcrPrePilotResponse(res, 'JOB_C_STRICT_CONTINUATION_ENQUEUE');
    },
  );
  // The governed Job-C endpoint deliberately remains the lambda=1 scientific
  // route.  The UI's temporary diagnostic control uses the separate route
  // above, so no partial endpoint can redefine ordinary acceptance.
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/jobs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      return retiredEcrPrePilotResponse(res, 'JOB_C_ENQUEUE');
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/job-c/physical-sizing/evaluate',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      return retiredEcrPrePilotResponse(res, 'JOB_C_PHYSICAL_SIZING');
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
    '/api/ecr-pre-pilot/designs/:id/job-c/physical-sizing/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      try {
        const physicalSizing = await getLatestCompletedJobCPhysicalSizing(
          Number((req.user as any).id), designId,
        );
        return physicalSizing
          ? res.json(physicalSizing)
          : res.status(404).json({ error: 'JOB_C_PHYSICAL_SIZING_RESULT_NOT_FOUND' });
      } catch (error: any) {
        return res.status(409).json({ error: error?.message ?? 'JOB_C_PHYSICAL_SIZING_RESULT_INTEGRITY_FAILURE' });
      }
    },
  );
  // This separately-owned, direct nonlinear candidate operation consumes the
  // persisted strict lambda=8e-9 / 2m anchor only as a seed. It deliberately
  // has no Job-C enqueue, resume, continuation, or full-lambda prerequisite.
  app.post(
    '/api/ecr-pre-pilot/designs/:id/partial-transfer-physical-sizing/evaluate',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'PARTIAL_TRANSFER_PHYSICAL_SIZING_CLIENT_INPUT_PROHIBITED' });
      }
      return retiredEcrPrePilotResponse(res, 'PARTIAL_TRANSFER_PHYSICAL_SIZING_SEARCH');
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/partial-transfer-physical-sizing/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      try {
        const result = await getLatestPartialTransferPhysicalSizing(
          Number((req.user as any).id), designId,
        );
        return result ? res.json(result) : res.status(404)
          .json({ error: 'PARTIAL_TRANSFER_PHYSICAL_SIZING_RESULT_NOT_FOUND' });
      } catch (error: any) {
        return res.status(409).json({
          error: error?.message ?? 'PARTIAL_TRANSFER_PHYSICAL_SIZING_RESULT_INTEGRITY_FAILURE',
        });
      }
    },
  );
  // The latest read is intentionally read-only. The explicit empty-body POST
  // persists a synchronous deterministic HETS screening calculation and, when
  // needed, runs the existing bounded Stage-3/4 optimizer first; it never
  // starts a finite-rate or background scientific job.
  app.get(
    '/api/ecr-pre-pilot/designs/:id/stage4/pre-pilot-sizing/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      try {
        return res.json(await getLiveStage4PrePilotSizing(Number((req.user as any).id), designId));
      } catch (error: any) {
        return res.status(409).json({
          error: error?.message ?? 'STAGE4_PRE_PILOT_SIZING_RESULT_INTEGRITY_FAILURE',
        });
      }
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/stage4/pre-pilot-sizing/calculate',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'STAGE4_PRE_PILOT_SIZING_CLIENT_SCIENTIFIC_INPUT_PROHIBITED' });
      }
      try {
        return res.status(200).json(await calculateStage4PrePilotSizing(
          Number((req.user as any).id), designId,
        ));
      } catch (error: any) {
        return res.status(409).json({
          error: error?.message ?? 'STAGE4_PRE_PILOT_SIZING_CALCULATION_START_FAILED',
        });
      }
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/stage4/pre-pilot-sizing/retry',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'STAGE4_PRE_PILOT_SIZING_CLIENT_SCIENTIFIC_INPUT_PROHIBITED' });
      }
      try {
        return res.status(200).json(await retryStage4PrePilotSizing(
          Number((req.user as any).id), designId,
        ));
      } catch (error: any) {
        return res.status(409).json({
          error: error?.message ?? 'STAGE4_PRE_PILOT_SIZING_RETRY_START_FAILED',
        });
      }
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/stage4/pre-pilot-sizing/stop',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'STAGE4_PRE_PILOT_SIZING_CLIENT_SCIENTIFIC_INPUT_PROHIBITED' });
      }
      try {
        return res.json(await stopStage4PrePilotSizing(
          Number((req.user as any).id), designId,
        ));
      } catch (error: any) {
        return res.status(409).json({
          error: error?.message ?? 'STAGE4_PRE_PILOT_SIZING_STOP_FAILED',
        });
      }
    },
  );
  // The first accepted-anchor qualification is a separate persisted lifecycle,
  // not the older D/H sizing search and never a Job-C enqueue endpoint.
  app.post(
    '/api/ecr-pre-pilot/designs/:id/partial-transfer-qualification/jobs',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      return retiredEcrPrePilotResponse(res, 'PARTIAL_TRANSFER_QUALIFICATION');
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/partial-transfer-qualification/jobs/latest',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      const job = await getSinglePartialTransferQualification(
        Number((req.user as any).id), designId,
      );
      return job ? res.json(job) : res.status(404).json({ error: 'SINGLE_QUALIFICATION_NOT_FOUND' });
    },
  );
  app.get(
    '/api/ecr-pre-pilot/designs/:id/partial-transfer-qualification/jobs/:jobId',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      const job = await getSinglePartialTransferQualification(
        Number((req.user as any).id), designId, req.params.jobId,
      );
      return job ? res.json(job) : res.status(404).json({ error: 'SINGLE_QUALIFICATION_NOT_FOUND' });
    },
  );
  app.post(
    '/api/ecr-pre-pilot/designs/:id/partial-transfer-qualification/jobs/:jobId/cancel',
    ensureAuthenticated,
    async (req: Request, res: Response) => {
      const designId = Number(req.params.id);
      if (!Number.isInteger(designId) || designId <= 0) {
        return res.status(400).json({ error: 'Invalid ECR Pre-Pilot design id' });
      }
      if (req.body && (typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).length)) {
        return res.status(400).json({ error: 'SINGLE_QUALIFICATION_CANCEL_BODY_PROHIBITED' });
      }
      const job = await cancelSinglePartialTransferQualification(
        Number((req.user as any).id), designId, req.params.jobId,
      );
      return job ? res.json(job) : res.status(404).json({ error: 'SINGLE_QUALIFICATION_NOT_FOUND' });
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
      return retiredEcrPrePilotResponse(res, 'JOB_C_EVALUATION');
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
        // Legacy resolver GET is replay-only. New generation is routed through
        // the versioned Stage-3/4 optimizer above.
        const run = await getKuhniGeometryResolverRuns(Number((req.user as any).id), designId, true, true);
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
        // Legacy resolver GET is replay-only.
        return res.json(await getKuhniGeometryResolverRuns(Number((req.user as any).id), designId, false, true));
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
        const errorCode = error instanceof Error ? error.message : '';
        if (
          errorCode === 'PREDICTIVE_NT_REPORT_PROJECT_NUMBER_INVALID'
          || errorCode === 'PREDICTIVE_NT_REPORT_JOB_ID_INVALID'
        ) {
          return res.status(422).json({ error: errorCode });
        }
        return res.status(500).json({ error: 'Predictive N_T report download failed' });
      }
    },
  );
}