// ═══════════════════════════════════════════════════════════════════════════════
// Design Software — API Routes
// ═══════════════════════════════════════════════════════════════════════════════

import { Express, Request, Response } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import * as svc from './design-software-service';
import { getProperty, containsAssumedData } from './engine-framework/epd/database';

// Register all LLX engines with the global registry at module load time
import './engines/llx/index';
import './engines/common/index';

export async function setupDesignSoftwareRoutes(app: Express): Promise<void> {

  // ── Engine registry info ────────────────────────────────────────────────────
  app.get('/api/design-software/engines', ensureAuthenticated, (_req: Request, res: Response) => {
    res.json(svc.listEngines());
  });

  // ── EPD lookup — NMP properties at a given temperature (read-only) ─────────
  // Used by the Fluid Properties workspace step to auto-populate NMP density
  // and dynamic viscosity from the source-tagged EPD tabular data. Values with
  // Assumed points involved are flagged pendingValidation.
  app.get('/api/design-software/epd/nmp', ensureAuthenticated, (req: Request, res: Response) => {
    const tc = Number(req.query.tc);
    if (!isFinite(tc)) return res.status(400).json({ message: 'Query parameter tc (temperature °C) is required' });
    try {
      const density = getProperty('nmp', 'density', tc);
      const visc = getProperty('nmp', 'dynamicViscosity', tc);
      res.json({
        temperatureC: tc,
        density: {
          value: density.value, // kg/m³
          unit: 'kg/m³',
          source: density.source,
          pendingValidation: containsAssumedData(density.warnings),
        },
        dynamicViscosity: {
          value: visc.value * 1000, // Pa·s → mPa·s
          unit: 'mPa·s',
          source: visc.source,
          pendingValidation: containsAssumedData(visc.warnings),
        },
      });
    } catch (e: any) {
      res.status(422).json({ message: e?.message ?? 'EPD lookup failed' });
    }
  });

  // ── Packing Database (read-only registry listing) ──────────────────────────
  // Vendor packing records registered in the in-memory Packing Database.
  // Shipped empty by design — vendor data is registered, never invented.
  app.get('/api/design-software/packings', ensureAuthenticated, async (_req: Request, res: Response) => {
    try {
      const { listPackings } = await import('./engine-framework/packing/database');
      res.json(listPackings().map((p: any) => ({
        id: p.id,
        manufacturer: p.manufacturer,
        productFamily: p.productFamily,
        productName: p.productName,
        packingType: p.packingType,
        geometryClass: p.geometryClass,
        material: p.material,
        size: p.size ?? null,
        specificSurfaceArea: p.specificSurfaceArea ?? null,
        voidFraction: p.voidFraction ?? null,
        maximumBedHeight: p.maximumBedHeight ?? null,
        hydraulicCapacityReference: p.hydraulicCapacityData?.source ?? p.hydraulicCapacityData?.sourceReference ?? null,
        pressureDropReference: p.pressureDropData?.wet?.source ?? p.pressureDropData?.wet?.sourceReference ?? null,
        source: p.source ?? null,
        revision: p.revision ?? null,
      })));
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? 'Packing Database listing failed' });
    }
  });

  // ── Designs ────────────────────────────────────────────────────────────────

  /** List designs with optional filters. */
  app.get('/api/design-software/designs', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const result = await svc.listDesigns({
        moduleType: req.query.moduleType as string | undefined,
        designType: req.query.designType as string | undefined,
        status: req.query.status as string | undefined,
        projectId: req.query.projectId ? parseInt(req.query.projectId as string) : undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 25,
      });
      res.json(result);
    } catch (err: any) {
      console.error('[DS] listDesigns error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /** Create a new design with initial revision. */
  app.post('/api/design-software/designs', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const {
        moduleType, designType, title, projectId, projectCode,
        capacity, rndReference, rndCustomerName, rndCapacity, rndLocation, rndNotes,
      } = req.body;

      if (!moduleType) return res.status(400).json({ error: 'moduleType is required' });
      if (!designType) return res.status(400).json({ error: 'designType is required' });
      if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
      if (designType === 'project' && !projectId) {
        return res.status(400).json({ error: 'projectId is required for project-type designs' });
      }

      const design = await svc.createDesign({
        moduleType, designType, title: title.trim(), projectId: projectId ?? null,
        projectCode: projectCode ?? null, capacity: capacity ?? null,
        rndReference: rndReference ?? null, rndCustomerName: rndCustomerName ?? null,
        rndCapacity: rndCapacity ?? null, rndLocation: rndLocation ?? null,
        rndNotes: rndNotes ?? null, createdBy: userId,
      });
      res.status(201).json(design);
    } catch (err: any) {
      console.error('[DS] createDesign error:', err);
      res.status(err.message?.includes('required') ? 400 : 500).json({ error: err.message });
    }
  });

  /** Get a single design with its current revision. */
  app.get('/api/design-software/designs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const design = await svc.getDesign(id);
      if (!design) return res.status(404).json({ error: 'Design not found' });
      res.json(design);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Update design metadata. */
  app.patch('/api/design-software/designs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as any).id;
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const design = await svc.updateDesign(id, req.body, userId);
      res.json(design);
    } catch (err: any) {
      res.status(err.message === 'Design not found' ? 404 : 500).json({ error: err.message });
    }
  });

  /** Delete a design (and all its revisions/inputs via cascade). */
  app.delete('/api/design-software/designs/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      await svc.deleteDesign(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(err.message === 'Design not found' ? 404 : 500).json({ error: err.message });
    }
  });

  // ── Revisions ──────────────────────────────────────────────────────────────

  /** List all revisions for a design. */
  app.get('/api/design-software/designs/:id/revisions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const designId = parseInt(req.params.id);
      if (isNaN(designId)) return res.status(400).json({ error: 'Invalid id' });
      res.json(await svc.listRevisions(designId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Create a new revision (copies inputs & assumptions from current). */
  app.post('/api/design-software/designs/:id/revisions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const designId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      if (isNaN(designId)) return res.status(400).json({ error: 'Invalid id' });
      const revision = await svc.createRevision(designId, req.body, userId);
      res.status(201).json(revision);
    } catch (err: any) {
      res.status(err.message?.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  // ── Inputs ─────────────────────────────────────────────────────────────────

  /** List all input sections for a revision. */
  app.get('/api/design-software/revisions/:id/inputs', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await svc.listInputs(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Upsert a specific input section (PUT with section in URL). */
  app.put('/api/design-software/revisions/:id/inputs/:section', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const revisionId = parseInt(req.params.id);
      const { section } = req.params;
      const userId = (req.user as any).id;
      const { data, engineVersion } = req.body;
      if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object required' });
      const result = await svc.upsertInput(revisionId, section, data, engineVersion ?? '1.0.0', userId);
      res.json(result);
    } catch (err: any) {
      const status = err.message?.includes('frozen') ? 409 : err.message?.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  /** Upsert a specific input section (POST with section in body — client convenience). */
  app.post('/api/design-software/revisions/:id/inputs', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const revisionId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { section, data, engineVersion } = req.body;
      if (!section) return res.status(400).json({ error: 'section is required' });
      if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object required' });
      const result = await svc.upsertInput(revisionId, section, data, engineVersion ?? '1.0.0', userId);
      res.json(result);
    } catch (err: any) {
      const status = err.message?.includes('frozen') ? 409 : err.message?.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // ── Results ────────────────────────────────────────────────────────────────

  /** List accepted results for a revision. */
  app.get('/api/design-software/revisions/:id/results', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await svc.listResults(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Calculation ────────────────────────────────────────────────────────────

  /** Run a calculation engine for a specific calculation type. */
  app.post('/api/design-software/revisions/:id/calculate', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const revisionId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { calculationType } = req.body;
      if (!calculationType) return res.status(400).json({ error: 'calculationType is required' });
      const result = await svc.runCalculation(revisionId, calculationType, userId);
      res.json(result);
    } catch (err: any) {
      const status = err.message?.includes('No engine') ? 422 : err.message?.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  /** List calculation run history for a revision. */
  app.get('/api/design-software/revisions/:id/runs', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await svc.listCalculationRuns(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Assumptions ────────────────────────────────────────────────────────────

  /** List assumptions for a revision. */
  app.get('/api/design-software/revisions/:id/assumptions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await svc.listAssumptions(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Add an assumption. */
  app.post('/api/design-software/revisions/:id/assumptions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const revisionId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { section, parameterKey, parameterLabel, assumedValue, unit, sourceType, sourceReference, engineeringBasis } = req.body;
      if (!section || !parameterKey || !parameterLabel || assumedValue === undefined || !sourceType) {
        return res.status(400).json({ error: 'section, parameterKey, parameterLabel, assumedValue, sourceType are required' });
      }
      res.status(201).json(await svc.addAssumption(revisionId, { section, parameterKey, parameterLabel, assumedValue, unit, sourceType, sourceReference, engineeringBasis }, userId));
    } catch (err: any) {
      const status = err.message?.includes('frozen') ? 409 : err.message?.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  /** Delete an assumption. */
  app.delete('/api/design-software/assumptions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      await svc.deleteAssumption(parseInt(req.params.id), userId);
      res.json({ success: true });
    } catch (err: any) {
      const status = err.message?.includes('frozen') ? 409 : err.message?.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Advance revision through lifecycle state machine. */
  app.post('/api/design-software/revisions/:id/lifecycle', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const revisionId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { action, comments } = req.body;
      if (!action) return res.status(400).json({ error: 'action is required' });
      const revision = await svc.advanceLifecycle(revisionId, action, userId, comments);
      res.json(revision);
    } catch (err: any) {
      const status =
        err.message?.includes('not found') ? 404 :
        err.message?.includes('Cannot perform') ? 422 :
        err.message?.includes('Unknown lifecycle') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  /** List lifecycle audit trail for a revision. */
  app.get('/api/design-software/revisions/:id/approvals', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await svc.listApprovals(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log('✅ Design Software routes registered');
}
