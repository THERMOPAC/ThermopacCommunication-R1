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

// Register the Thermopac preliminary screening packing records (SMV/SMVP —
// literature-based screening records, not vendor-certified rating data).
import { registerPreliminaryPackingRecords, ecpDefaultFields, ecrDefaultFields, PRELIM_DEFAULT_REF, PRELIM_HETS_REF } from './llx-preliminary-screening-defaults';
{
  const issues = registerPreliminaryPackingRecords();
  if (issues.length > 0) console.error('[DS] Preliminary packing record registration issues:', issues);
}

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

  // ── Sulzer SMV/SMVP preliminary packing screening (Stage 7, literature-based) ─
  // Pure screening arithmetic (B = Q/A + threshold checks) against controlled
  // Rauber/AIChE 2006 records — no C2–C6 engine equations involved or duplicated.
  app.get('/api/design-software/revisions/:id/sulzer-screening', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const revisionId = parseInt(req.params.id);
      const { runSulzerPackingScreening } = await import('./llx-sulzer-packing-screening');
      const [inputRows, resultRows] = await Promise.all([svc.listInputs(revisionId), svc.listResults(revisionId)]);
      const inputs: Record<string, any> = {};
      for (const row of inputRows) Object.assign(inputs, row.data);
      const num = (v: unknown): number | null => {
        const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
        return isFinite(n) ? n : null;
      };

      // Upstream values (Stage 2/3/4/5) — bindings only
      const feedLph = num(inputs.design_capacity_lph ?? inputs.design_capacity ?? inputs.feed_flow);
      const soVol = num(String(inputs.so_ratio ?? '').trim() !== '' ? inputs.so_ratio : '1.5');
      const margin = num(inputs.design_margin) ?? 20;
      const nts = num(inputs.theoretical_stages) ?? num(inputs.stages) ?? 6;
      if (feedLph === null || feedLph <= 0 || soVol === null || soVol <= 0) {
        return res.status(422).json({ message: 'A positive feed flow (Design Basis) and positive S/O ratio (Process Design) are required before Sulzer screening.' });
      }
      if (margin === null || margin < 0 || nts === null || nts <= 0) {
        return res.status(422).json({ message: 'Design margin must be ≥ 0 and theoretical stages must be positive before Sulzer screening.' });
      }
      const normalTotal = (feedLph / 1000) * (1 + soVol);
      const maximumTotal = feedLph / 1000 + (feedLph / 1000) * soVol * (1 + margin / 100);

      // Stage 5 trial diameters: screening-band rows from the accepted Common
      // Hydraulic sweep, plus the engineer-selected trial diameter when present.
      const hyd = resultRows.find((r: any) => r.section === 'hydraulics_common')?.data;
      const hydNormal = hyd?.normalCase ?? hyd?.cases?.normal;
      const sweepRows: any[] = hydNormal?.diameters ?? [];
      const bandDs = sweepRows
        .filter((r: any) => r.feasibility === 'within_screening_band')
        .map((r: any) => Number(r.diameter_m))
        .filter((d: number) => isFinite(d) && d > 0);
      const engineerTrial = num(inputs.column_diameter);
      const minFeasible = num(hydNormal?.summary?.minimumFeasibleDiameter_m);
      const selectedTrial = engineerTrial ?? minFeasible;
      const diameterSet = Array.from(new Set(
        [...bandDs, ...(selectedTrial !== null ? [selectedTrial] : [])].map(d => Math.round(d * 1000) / 1000),
      )).sort((a, b) => a - b);
      if (diameterSet.length === 0) {
        return res.status(422).json({ message: 'No Stage 5 trial diameters available — run the Common Hydraulic Design sweep (Stage 5) first. Packing is not selected from total plant flow alone.' });
      }

      const contRho = num(inputs.nmp_density_value);
      const dispRho = num(inputs.rrbo_density_value);
      // Back-mixing risk: explicit query param (from the live UI control) wins
      // over the persisted section value — avoids stale-save races.
      const riskParam = String(req.query.risk ?? '').toLowerCase();
      const risk = ['low', 'moderate', 'high'].includes(riskParam)
        ? riskParam
        : String(inputs.backmixing_risk ?? 'moderate').toLowerCase();
      const out = runSulzerPackingScreening({
        normalTotalFlow_m3_h: normalTotal,
        maximumTotalFlow_m3_h: maximumTotal,
        trialDiameters_m: diameterSet,
        selectedTrialDiameter_m: selectedTrial !== null ? Math.round(selectedTrial * 1000) / 1000 : null,
        theoreticalStages: nts,
        phaseRatioVolumetric: soVol,
        backMixingRisk: (['low', 'moderate', 'high'].includes(risk) ? risk : 'moderate') as any,
        densityDifference_kg_m3: contRho !== null && dispRho !== null ? Math.abs(contRho - dispRho) : null,
        continuousViscosity_mPas: num(inputs.nmp_viscosity_dynamic_value),
        dispersedViscosity_mPas: num(inputs.rrbo_viscosity_dynamic_value),
        interfacialTension_mN_m: num(inputs.interfacial_tension ?? inputs.interfacial_tension_value),
      });
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? 'Sulzer screening failed' });
    }
  });

  // ── Thermopac preliminary screening defaults (Stage 7 ECP/ECR) ─────────────
  // Applies/clears the visible, editable, Assumed-tagged preliminary input set
  // and keeps the assumptions register in sync. Engine validation is untouched.
  app.post('/api/design-software/revisions/:id/preliminary-defaults', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const revisionId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const scope = String(req.body.scope ?? '');
      const action = String(req.body.action ?? '');
      if (!['ecp', 'ecr'].includes(scope)) return res.status(400).json({ error: "scope must be 'ecp' or 'ecr'" });
      if (!['apply', 'clear'].includes(action)) return res.status(400).json({ error: "action must be 'apply' or 'clear'" });
      const section = scope === 'ecp' ? 'ecp_design' : 'ecr_design';

      const [inputRows, resultRows] = await Promise.all([svc.listInputs(revisionId), svc.listResults(revisionId)]);
      const merged: Record<string, any> = {};
      for (const row of inputRows) Object.assign(merged, row.data);
      const sectionRow = inputRows.find((r: any) => r.section === section);
      const sectionData: Record<string, any> = { ...(sectionRow?.data ?? {}) };

      // Stage 5 column diameter (engineer trial or minimum feasible) for the ECR rotor diameter
      let stage5D: number | null = null;
      if (scope === 'ecr') {
        const n = parseFloat(String(merged.column_diameter ?? ''));
        const hydNormal = (resultRows.find((r: any) => r.section === 'hydraulics_common')?.data ?? {}).normalCase;
        const minF = parseFloat(String(hydNormal?.summary?.minimumFeasibleDiameter_m ?? ''));
        stage5D = isFinite(n) && n > 0 ? n : isFinite(minF) && minF > 0 ? minF : null;
      }
      const fields = scope === 'ecp' ? ecpDefaultFields() : ecrDefaultFields(stage5D);

      const existing = await svc.listAssumptions(revisionId);
      const isDefaultAssumption = (a: any) =>
        a.section === section && [PRELIM_DEFAULT_REF, PRELIM_HETS_REF].includes(a.source_reference);

      // Rotor diameter is engine-calculated from the ratio — remove any earlier
      // default-written rotor_diameter entry (and its register row) on both actions.
      if (scope === 'ecr' && sectionData['rotor_diameter_source_reference'] === PRELIM_DEFAULT_REF) {
        delete sectionData['rotor_diameter'];
        delete sectionData['rotor_diameter_source_reference'];
      }
      for (const a of existing) {
        if (a.section === section && a.parameter_key === 'rotor_diameter' && isDefaultAssumption(a)) {
          await svc.deleteAssumption(a.id, userId);
        }
      }

      if (action === 'apply') {
        for (const f of fields) {
          sectionData[f.key] = f.value;
          if (f.key !== 'packing_id') sectionData[`${f.key}_source_reference`] = f.ref;
        }
        if (scope === 'ecp') {
          sectionData['hets_source'] = 'Assumed';
          sectionData['hets_source_reference'] = PRELIM_HETS_REF;
        }
        await svc.upsertInput(revisionId, section, sectionData, '1.0.0', userId);
        // Assumptions register — one entry per default, no duplicates
        for (const f of fields) {
          const already = existing.some((a: any) => a.section === section && a.parameter_key === f.key && isDefaultAssumption(a));
          if (!already) {
            await svc.addAssumption(revisionId, {
              section,
              parameterKey: f.key,
              parameterLabel: f.label,
              assumedValue: f.value,
              unit: f.unit,
              sourceType: 'Assumed',
              sourceReference: f.ref,
              engineeringBasis: 'Thermopac preliminary equipment screening default — starting value only, Pending Validation until replaced by approved vendor, measured, or project data',
            }, userId);
          }
        }
      } else {
        for (const f of fields) {
          delete sectionData[f.key];
          delete sectionData[`${f.key}_source_reference`];
        }
        if (scope === 'ecp') {
          if (sectionData['hets_source_reference'] === PRELIM_HETS_REF) {
            delete sectionData['hets_source'];
            delete sectionData['hets_source_reference'];
          }
        }
        await svc.upsertInput(revisionId, section, sectionData, '1.0.0', userId);
        for (const a of existing) {
          if (isDefaultAssumption(a)) await svc.deleteAssumption(a.id, userId);
        }
      }

      res.json({ section, data: sectionData, applied: action === 'apply', fieldCount: fields.length });
    } catch (err: any) {
      const status = err.message?.includes('frozen') ? 409 : err.message?.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
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

  /** Stage 9 — fully automatic nozzle generation & preliminary sizing from
   *  controlled Thermopac nozzle master data. Returns rows + validation issues;
   *  the client saves them via the ordinary input-save path. */
  app.post('/api/design-software/revisions/:id/nozzles/generate', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await svc.generateNozzleSchedule(parseInt(req.params.id)));
    } catch (err: any) {
      const status = err.message?.includes('not found') ? 404 : err.message?.includes('Select the technology') || err.message?.includes('No accepted') || err.message?.includes('complete those stages') ? 422 : 500;
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
