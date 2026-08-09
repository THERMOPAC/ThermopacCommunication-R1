// ═══════════════════════════════════════════════════════════════════════════════
// Design Software — API Routes
// ═══════════════════════════════════════════════════════════════════════════════

import { Express, Request, Response } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import * as svc from './design-software-service';
import * as reports from './design-reports/report-service';
import * as vv from './vv/regression-service';
import * as vvRegister from './vv/equation-register-service';
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

  // ── Reference Papers (Step 15 — controlled literature library, GLOBAL) ─────
  // The single governed source for all LLX literature references. No DELETE
  // route by design — papers are superseded/withdrawn, never removed, so
  // existing citations (REF-NNN) remain resolvable.
  app.get('/api/design-software/reference-papers', ensureAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json(await svc.listReferencePapers());
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? 'Reference paper listing failed' });
    }
  });

  app.post('/api/design-software/reference-papers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.status(201).json(await svc.createReferencePaper(req.body, (req.user as any).id));
    } catch (e: any) {
      const msg = e?.message ?? 'Reference paper creation failed';
      res.status(/duplicate key/i.test(msg) ? 409 : 422).json({
        message: /duplicate key/i.test(msg) ? 'That reference code is already registered' : msg,
      });
    }
  });

  app.patch('/api/design-software/reference-papers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!isFinite(id)) return res.status(400).json({ message: 'Invalid reference paper id' });
      res.json(await svc.updateReferencePaper(id, req.body));
    } catch (e: any) {
      const msg = e?.message ?? 'Reference paper update failed';
      res.status(/not found/i.test(msg) ? 404 : 422).json({ message: msg });
    }
  });

  // ── CPS Sizing Tool — Knowledge Engine (Phase 1, GLOBAL) ───────────────────
  // Single controlled source of all CPS engineering parameters. Reads are open
  // to authenticated users (future sizing engine + read-only UI); all writes
  // are Superuser-only, enforced HERE server-side (client hiding of Edit
  // controls is a UI convenience only). No DELETE — deactivate via is_active.
  const requireSuperuser = (req: Request, res: Response, next: () => void) => {
    if ((req.user as any)?.role !== 'Superuser') {
      return res.status(403).json({ message: 'Only a Superuser may modify Knowledge Engine parameters' });
    }
    next();
  };

  app.get('/api/design-software/cps/parameters', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await svc.listCpsParameters(req.query.category as string | undefined));
    } catch (e: any) {
      res.status(422).json({ message: e?.message ?? 'CPS parameter listing failed' });
    }
  });

  app.post('/api/design-software/cps/parameters', ensureAuthenticated, requireSuperuser, async (req: Request, res: Response) => {
    try {
      res.status(201).json(await svc.createCpsParameter(req.body, (req.user as any).id));
    } catch (e: any) {
      const msg = e?.message ?? 'CPS parameter creation failed';
      res.status(/duplicate key/i.test(msg) ? 409 : 422).json({
        message: /duplicate key/i.test(msg) ? 'That parameter code is already registered' : msg,
      });
    }
  });

  app.patch('/api/design-software/cps/parameters/:id', ensureAuthenticated, requireSuperuser, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!isFinite(id)) return res.status(400).json({ message: 'Invalid parameter id' });
      res.json(await svc.updateCpsParameter(id, req.body, (req.user as any).id));
    } catch (e: any) {
      const msg = e?.message ?? 'CPS parameter update failed';
      res.status(/not found/i.test(msg) ? 404 : 422).json({ message: msg });
    }
  });

  // ── CPS Sizing Tool — Customer Input cases. Input capture only (no sizing
  // logic). Any authenticated Design Software user may create/edit cases —
  // these are project data, not Knowledge Engine constants. The conditional
  // sulphur validation is enforced server-side in the service.
  app.get('/api/design-software/cps/sizing-cases', ensureAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json(await svc.listCpsSizingCases());
    } catch (e: any) {
      res.status(422).json({ message: e?.message ?? 'Sizing case listing failed' });
    }
  });

  app.get('/api/design-software/cps/sizing-cases/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!isFinite(id)) return res.status(400).json({ message: 'Invalid sizing case id' });
      res.json(await svc.getCpsSizingCase(id));
    } catch (e: any) {
      const msg = e?.message ?? 'Sizing case lookup failed';
      res.status(/not found/i.test(msg) ? 404 : 422).json({ message: msg });
    }
  });

  app.post('/api/design-software/cps/sizing-cases', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.status(201).json(await svc.createCpsSizingCase(req.body, (req.user as any).id));
    } catch (e: any) {
      res.status(422).json({ message: e?.message ?? 'Sizing case creation failed' });
    }
  });

  app.patch('/api/design-software/cps/sizing-cases/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!isFinite(id)) return res.status(400).json({ message: 'Invalid sizing case id' });
      res.json(await svc.updateCpsSizingCase(id, req.body, (req.user as any).id));
    } catch (e: any) {
      const msg = e?.message ?? 'Sizing case update failed';
      res.status(/not found/i.test(msg) ? 404 : 422).json({ message: msg });
    }
  });

  app.delete('/api/design-software/cps/sizing-cases/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!isFinite(id)) return res.status(400).json({ message: 'Invalid sizing case id' });
      res.json(await svc.deleteCpsSizingCase(id));
    } catch (e: any) {
      const msg = e?.message ?? 'Sizing case deletion failed';
      res.status(/not found/i.test(msg) ? 404 : 422).json({ message: msg });
    }
  });

  // POST — atomically save ke_snapshot + calculated_output after a successful recalculation.
  // Body: { treatment_scope, ke_snapshot, calculated_output }.
  // A failed calculation must NOT call this — enforced on the client.
  // Both columns are written in one UPDATE; calculation_stale is reset to FALSE.
  app.post('/api/design-software/cps/sizing-cases/:id/calculation-snapshot', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!isFinite(id)) return res.status(400).json({ message: 'Invalid sizing case id' });
      const { treatment_scope, ke_snapshot, calculated_output } = req.body;
      if (!treatment_scope || typeof ke_snapshot !== 'object')
        return res.status(400).json({ message: 'treatment_scope and ke_snapshot (object) are required' });
      if (typeof calculated_output !== 'object' || calculated_output === null)
        return res.status(400).json({ message: 'calculated_output (object) is required' });
      const result = await svc.updateCpsSizingCaseKeSnapshot(
        id, treatment_scope, ke_snapshot, calculated_output, (req.user as any).id,
      );
      res.status(200).json(result);
    } catch (e: any) {
      const msg = e?.message ?? 'KE snapshot update failed';
      res.status(/not found/i.test(msg) ? 404 : 422).json({ message: msg });
    }
  });

  app.get('/api/design-software/cps/parameters/:id/history', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!isFinite(id)) return res.status(400).json({ message: 'Invalid parameter id' });
      res.json(await svc.listCpsParameterHistory(id));
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? 'CPS parameter history failed' });
    }
  });

  // ── Reference paper PDF upload / download (GCS-backed) ─────────────────────
  {
    const multer = (await import('multer')).default;
    const refPaperUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are accepted for reference papers'));
      },
    });

    app.post('/api/design-software/reference-papers/:id/document', ensureAuthenticated,
      (req: Request, res: Response, next) => refPaperUpload.single('file')(req, res, (err: any) => {
        if (err) return res.status(422).json({ message: err?.message ?? 'Upload failed' });
        next();
      }),
      async (req: Request, res: Response) => {
        try {
          const id = parseInt(req.params.id);
          if (!isFinite(id)) return res.status(400).json({ message: 'Invalid reference paper id' });
          if (!req.file) return res.status(422).json({ message: 'A PDF file is required (field name: file)' });
          const paper = (await svc.listReferencePapers()).find((p: any) => p.id === id);
          if (!paper) return res.status(404).json({ message: 'Reference paper not found' });

          const storage = (await import('./utils/storage-config')).default;
          const { bucketName } = await import('./utils/storage-config');
          const safeName = req.file.originalname.replace(/[^\w.\- ]+/g, '_');
          const gcsPath = `TPEL/DESIGN_SOFTWARE/REFERENCE_PAPERS/${paper.ref_code}/${safeName}`;
          await storage.bucket(bucketName).file(gcsPath).save(req.file.buffer, {
            contentType: 'application/pdf',
            resumable: false,
          });
          const updated = await svc.setReferencePaperDocument(id, gcsPath, req.file.originalname);
          res.json(updated);
        } catch (e: any) {
          res.status(500).json({ message: e?.message ?? 'Reference paper upload failed' });
        }
      });

    app.get('/api/design-software/reference-papers/:id/document', ensureAuthenticated, async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (!isFinite(id)) return res.status(400).json({ message: 'Invalid reference paper id' });
        const paper = (await svc.listReferencePapers()).find((p: any) => p.id === id);
        if (!paper) return res.status(404).json({ message: 'Reference paper not found' });
        if (!paper.file_path) return res.status(404).json({ message: 'No document uploaded for this reference paper' });

        const storage = (await import('./utils/storage-config')).default;
        const { bucketName } = await import('./utils/storage-config');
        const file = storage.bucket(bucketName).file(paper.file_path);
        const [exists] = await file.exists();
        if (!exists) return res.status(404).json({ message: 'Stored document not found in object storage' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${(paper.file_name ?? `${paper.ref_code}.pdf`).replace(/"/g, '')}"`);
        const stream = file.createReadStream();
        stream.on('error', (err) => {
          console.error('[DS] Reference paper stream error:', err);
          if (!res.headersSent) res.status(500).json({ message: 'Document streaming failed' });
          else res.end();
        });
        stream.pipe(res);
      } catch (e: any) {
        res.status(500).json({ message: e?.message ?? 'Reference paper download failed' });
      }
    });
  }

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
      // Deletions must be explicit null tombstones — input saves use field-level
      // merge semantics, so omitting a key preserves it (see section-merge.ts).
      if (scope === 'ecr' && sectionData['rotor_diameter_source_reference'] === PRELIM_DEFAULT_REF) {
        sectionData['rotor_diameter'] = null;
        sectionData['rotor_diameter_source_reference'] = null;
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
          sectionData[f.key] = null;
          sectionData[`${f.key}_source_reference`] = null;
        }
        if (scope === 'ecp') {
          if (sectionData['hets_source_reference'] === PRELIM_HETS_REF) {
            sectionData['hets_source'] = null;
            sectionData['hets_source_reference'] = null;
          }
        }
        await svc.upsertInput(revisionId, section, sectionData, '1.0.0', userId);
        for (const a of existing) {
          if (isDefaultAssumption(a)) await svc.deleteAssumption(a.id, userId);
        }
      }

      // Strip null tombstones from the response — they represent deleted keys.
      for (const k of Object.keys(sectionData)) if (sectionData[k] === null) delete sectionData[k];
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

  // ── DS-SEL — Autonomous Design Selection (Engineering Decision Record) ─────

  /** Latest (non-superseded) autonomous selection record for a revision. */
  app.get('/api/design-software/revisions/:id/design-selection', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { getLatestSelection } = await import('./design-selection/design-selection-service');
      res.json(await getLatestSelection(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Regenerate the autonomous selection record from the latest frozen runs. */
  app.post('/api/design-software/revisions/:id/design-selection/run', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { generateSelectionRecord } = await import('./design-selection/design-selection-service');
      res.json(await generateSelectionRecord(parseInt(req.params.id), (req.user as any).id));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** DS-SEL-006 — governed user diameter selection: validates (50 mm series,
   *  ≥ autonomous minimum), re-runs all applicable calculations with the
   *  effective diameter, supersedes the record (decision resets to pending)
   *  and reconciles the affected reports. */
  app.post('/api/design-software/revisions/:id/design-selection/user-diameter', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { applyUserDiameterSelection } = await import('./design-selection/design-selection-service');
      res.json(await applyUserDiameterSelection(parseInt(req.params.id), (req.user as any).id, req.body ?? {}));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Engineer decision on a selection record: approve / request_verification / override. */
  app.post('/api/design-software/design-selection/:recordId/decision', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { recordDecision } = await import('./design-selection/design-selection-service');
      res.json(await recordDecision(parseInt(req.params.recordId), (req.user as any).id, req.body ?? {}));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
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

  // ── Stage 13 — Engineering Reports (snapshot architecture) ─────────────────
  /** List generated reports for a revision. */
  app.get('/api/design-software/revisions/:id/reports', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await reports.listReports(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Generate (or regenerate, while draft) a report from a frozen payload. */
  app.post('/api/design-software/revisions/:id/reports', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { docType } = req.body;
      if (!docType) return res.status(400).json({ error: 'docType is required' });
      res.json(await reports.generateReport(parseInt(req.params.id), String(docType), (req.user as any).id));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Render the persisted payload to PDF (read-only — allowed in any status). */
  app.get('/api/design-software/reports/:reportId/pdf', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { pdf, fileName } = await reports.renderReportById(parseInt(req.params.reportId));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.send(pdf);
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Advance report status: draft → for_review → approved → issued. */
  app.post('/api/design-software/reports/:reportId/advance-status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await reports.advanceReportStatus(parseInt(req.params.reportId), (req.user as any).id));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  // ── V&V — Phase A (Regression Harness) + Phase B (Equation Register) ──────

  /** List regression cases with their latest run result. */
  app.get('/api/design-software/vv/regression/cases', ensureAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json(await vv.listCases());
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Run one regression case. */
  app.post('/api/design-software/vv/regression/cases/:caseId/run', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      res.json(await vv.runCase(parseInt(req.params.caseId), user.fullName ?? user.username ?? String(user.id)));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Run ALL active regression cases (release gate). */
  app.post('/api/design-software/vv/regression/run-all', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      res.json(await vv.runAll(user.fullName ?? user.username ?? String(user.id)));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Equation register — list (optionally per engine via ?engineId=). */
  app.get('/api/design-software/vv/equation-register', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await vvRegister.listRegister(req.query.engineId as string | undefined));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Record one evidence pillar on one equation (named engineer + reference required). */
  app.post('/api/design-software/vv/equation-register/:equationId/evidence', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const by = req.body.by ?? user.fullName ?? user.username ?? String(user.id);
      res.json(await vvRegister.recordEvidence(parseInt(req.params.equationId), req.body.pillar, by, req.body.reference, user.id));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Approve a recorded (draft) evidence pillar — approver must differ from the recorder. */
  app.post('/api/design-software/vv/equation-register/:equationId/evidence/approve', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const approvedBy = req.body.approvedBy ?? user.fullName ?? user.username ?? String(user.id);
      res.json(await vvRegister.approveEvidence(parseInt(req.params.equationId), req.body.pillar, approvedBy, user.id));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Verification findings — list / raise / close (open critical findings block Verified). */
  app.get('/api/design-software/vv/findings', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json(await vvRegister.listFindings(req.query.engineId as string | undefined));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });
  app.post('/api/design-software/vv/findings', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const raisedBy = req.body.raisedBy ?? user.fullName ?? user.username ?? String(user.id);
      res.json(await vvRegister.raiseFinding({
        engineId: req.body.engineId, equationRef: req.body.equationRef,
        severity: req.body.severity, description: req.body.description, raisedBy,
      }));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });
  app.post('/api/design-software/vv/findings/:id/close', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const closedBy = req.body.closedBy ?? user.fullName ?? user.username ?? String(user.id);
      res.json(await vvRegister.closeFinding(parseInt(req.params.id), closedBy, req.body.closureReference));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Independent engine-version approval (immutable, one per engine+version) — required for Verified. */
  app.post('/api/design-software/vv/engine-version-approvals', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const approvedBy = req.body.approvedBy ?? user.fullName ?? user.username ?? String(user.id);
      res.json(await vvRegister.approveEngineVersion(req.body.engineId, req.body.engineVersion, approvedBy, req.body.reference));
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  /** Computed Software Verification status per engine (never asserted). */
  app.get('/api/design-software/vv/verification-status', ensureAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json(await vvRegister.verificationStatus());
    } catch (err: any) {
      res.status(err.statusCode ?? 500).json({ error: err.message });
    }
  });

  console.log('✅ Design Software routes registered');
}
