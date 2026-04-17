// ─────────────────────────────────────────────────────────────────────────────
// Drawing Verifier — Orchestrator
// DDS gate → AI extraction → Layer 1 + Layer 2 rule engine → report assembly
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../db';
import { eq } from 'drizzle-orm';
import { epcDrawingControls, designDataSheets, epcDrawingVerifications } from '@shared/schema';
import type { DesignDataSheet } from '@shared/schema';
import { extractDrawingData } from './drawing-ai-extractor';
import { runRuleEngine } from './drawing-rule-engine';
import type { RuleEngineOutput } from './drawing-rule-engine';
import type { DrawingExtraction } from './drawing-ai-extractor';

export type VerificationGateError = {
  gateResult: 'dds_missing' | 'dds_not_saved' | 'equipment_config_missing';
  message: string;
};

export type VerificationResult = {
  verificationId: number;
  overallStatus: 'pass' | 'fail';
  equipmentConfig: string;
  extractionEngine: string;
  extraction: DrawingExtraction;
  ruleOutput: RuleEngineOutput;
  dds: DesignDataSheet;
};

// ── DDS Gate ──────────────────────────────────────────────────────────────────

async function checkDdsGate(drawingControlId: number): Promise<
  { ok: true; dds: DesignDataSheet } | { ok: false; error: VerificationGateError }
> {
  const rows = await db
    .select()
    .from(designDataSheets)
    .where(eq(designDataSheets.dwgControlId, drawingControlId))
    .limit(1);

  if (!rows.length) {
    return {
      ok: false,
      error: {
        gateResult: 'dds_missing',
        message: 'Design Data Sheet must be completed before drawing upload.',
      },
    };
  }

  const dds = rows[0];

  // Check if DDS has been saved with meaningful data (status must not be 'draft' with empty mech data)
  const mech = dds.mechanicalData as any;
  const hasMechData = mech?.shell?.internalDesignPressureMawp !== undefined;
  if (!hasMechData && dds.status === 'draft') {
    return {
      ok: false,
      error: {
        gateResult: 'dds_not_saved',
        message: 'Design Data Sheet has not been saved — complete and save the DDS first.',
      },
    };
  }

  if (!dds.equipmentConfig) {
    return {
      ok: false,
      error: {
        gateResult: 'equipment_config_missing',
        message: 'Equipment Configuration is not set in the Design Data Sheet — set it and save before uploading.',
      },
    };
  }

  return { ok: true, dds };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function verifyDrawing(
  drawingControlId: number,
  pdfBuffer: Buffer,
  pdfFilename: string,
  attemptedBy: string,
): Promise<{ ok: true; result: VerificationResult } | { ok: false; gateError: VerificationGateError; verificationId?: number }> {

  // Step 1: DDS gate
  const gate = await checkDdsGate(drawingControlId);
  if (!gate.ok) {
    // Record the failed gate attempt
    const [row] = await db.insert(epcDrawingVerifications).values({
      drawingControlId,
      ddsId: null,
      equipmentConfig: null,
      pdfFilename,
      pdfSizeBytes: pdfBuffer.length,
      extractionEngine: 'none',
      extractionResult: null,
      layer1Results: null,
      layer2Results: null,
      overallStatus: gate.error.gateResult,
      criticalFailures: 0,
      highFailures: 0,
      totalWarnings: 0,
      totalSkipped: 0,
      ddsGateResult: gate.error.gateResult,
      ddsGateMessage: gate.error.message,
      attemptedBy,
      attemptedAt: new Date(),
      accepted: false,
    }).returning();
    return { ok: false, gateError: gate.error, verificationId: row.id };
  }

  const dds = gate.dds;
  const equipmentConfig = dds.equipmentConfig;

  // Step 2: Extract drawing data
  console.log(`[drawing-verifier] Starting extraction for drawing control ${drawingControlId}, file=${pdfFilename}`);
  const extraction = await extractDrawingData(pdfBuffer);
  console.log(`[drawing-verifier] Extraction complete, engine=${extraction.engine}`);

  // Step 3: Run rule engine
  const ruleOutput = runRuleEngine(dds, extraction, equipmentConfig);
  console.log(`[drawing-verifier] Rule engine complete, status=${ruleOutput.overallStatus}, critFail=${ruleOutput.criticalFailures}`);

  // Step 4: Persist verification record
  const [row] = await db.insert(epcDrawingVerifications).values({
    drawingControlId,
    ddsId: dds.id,
    equipmentConfig,
    pdfFilename,
    pdfSizeBytes: pdfBuffer.length,
    extractionEngine: extraction.engine,
    extractionResult: JSON.parse(JSON.stringify(extraction)),
    layer1Results: JSON.parse(JSON.stringify(ruleOutput.layer1)),
    layer2Results: JSON.parse(JSON.stringify(ruleOutput.layer2)),
    overallStatus: ruleOutput.overallStatus,
    criticalFailures: ruleOutput.criticalFailures,
    highFailures: ruleOutput.highFailures,
    totalWarnings: ruleOutput.totalWarnings,
    totalSkipped: ruleOutput.totalSkipped,
    ddsGateResult: 'passed',
    ddsGateMessage: null,
    attemptedBy,
    attemptedAt: new Date(),
    accepted: false,
  }).returning();

  return {
    ok: true,
    result: {
      verificationId: row.id,
      overallStatus: ruleOutput.overallStatus,
      equipmentConfig,
      extractionEngine: extraction.engine,
      extraction,
      ruleOutput,
      dds,
    },
  };
}

// ── Mark a verified drawing as accepted (called after user clicks Accept & Upload) ───

export async function markVerificationAccepted(verificationId: number, attachmentId: number): Promise<void> {
  await db.update(epcDrawingVerifications)
    .set({ accepted: true, acceptedAt: new Date(), attachmentId })
    .where(eq(epcDrawingVerifications.id, verificationId));
}
