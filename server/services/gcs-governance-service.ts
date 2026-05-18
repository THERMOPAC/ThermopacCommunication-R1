/**
 * GCS Governance Service — Phase 0 + Phase 1
 * Monitor-only mode: logs uploads, validates paths against rules, never blocks.
 * Phase 1: upload token issuance and validation.
 */

import { db } from '../db';
import {
  gcsGovernanceRules,
  gcsGovernanceTokenRegistry,
  gcsUploadMonitorLog,
  gcsUploadTokens,
  gcsGovernanceRuleVersions,
  type GcsGovernanceRule,
  type GcsUploadToken,
  type InsertGcsUploadMonitorLog,
} from '@shared/schema';
import { eq, desc, and, or, ilike, isNull, sql, lt, isNotNull, gte } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';

// ─── Token substitution ───────────────────────────────────────────────────

export function resolvePathTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? `{${key}}`);
}

export function extractTemplateTokens(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g) ?? [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

export function validatePathAgainstTemplate(
  path: string,
  template: string,
  rootPrefix: string,
): { conforms: boolean; reason?: string } {
  if (!path.startsWith(rootPrefix.replace(/\{[^}]+\}/g, ''))) {
    const staticRoot = rootPrefix.split('{')[0].replace(/\/$/, '');
    if (staticRoot && !path.startsWith(staticRoot)) {
      return { conforms: false, reason: `Path does not start with expected root prefix '${staticRoot}'` };
    }
  }

  // Build a regex from the template by converting {TOKEN} → capture groups
  const regexStr = '^' + template
    .replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === '{' || c === '}') ? c : `\\${c}`)
    .replace(/\\\{[^}]+\\\}/g, '[^/]+') // token → one path segment
    .replace(/\{[^}]+\}/g, '[^/]+')
    + '(/.*)?$';

  try {
    const regex = new RegExp(regexStr);
    if (!regex.test(path)) {
      return { conforms: false, reason: 'Path structure does not match rule template' };
    }
  } catch {
    return { conforms: false, reason: 'Template regex compilation failed' };
  }

  return { conforms: true };
}

// ─── Rule matching ────────────────────────────────────────────────────────

export async function matchRuleForPath(path: string): Promise<GcsGovernanceRule | null> {
  const rules = await db.select().from(gcsGovernanceRules).where(eq(gcsGovernanceRules.active, true));

  // Try to find a rule whose static root prefix matches the path
  for (const rule of rules) {
    const staticRoot = rule.rootPrefix.split('{')[0].replace(/\/$/, '');
    if (staticRoot && path.startsWith(staticRoot)) {
      return rule;
    }
  }
  return null;
}

// ─── Monitor logging ──────────────────────────────────────────────────────

export async function logUploadEvent(params: {
  gcsPath: string;
  moduleKey?: string;
  documentType?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  uploadedBy?: number;
  routeFile?: string;
}): Promise<void> {
  try {
    const rule = await matchRuleForPath(params.gcsPath);
    let pathConforms: boolean | undefined = undefined;
    let violationReason: string | undefined = undefined;

    if (rule) {
      const result = validatePathAgainstTemplate(params.gcsPath, rule.pathTemplate, rule.rootPrefix);
      pathConforms = result.conforms;
      violationReason = result.reason;
    }

    const entry: InsertGcsUploadMonitorLog = {
      matchedRuleId: rule?.id ?? null,
      moduleKey: params.moduleKey ?? rule?.moduleKey ?? null,
      documentType: params.documentType ?? rule?.documentType ?? null,
      detectedGcsPath: params.gcsPath,
      pathConforms: pathConforms ?? null,
      violationReason: violationReason ?? null,
      fileSizeBytes: params.fileSizeBytes ?? null,
      mimeType: params.mimeType ?? null,
      uploadedBy: params.uploadedBy ?? null,
      routeFile: params.routeFile ?? null,
    };

    await db.insert(gcsUploadMonitorLog).values(entry);
  } catch (err) {
    // Monitor log failures must never affect the actual upload
    console.warn('[GCS-Governance] Monitor log write failed:', err);
  }
}

// ─── Path preview ─────────────────────────────────────────────────────────

export function previewPath(template: string, tokens: Record<string, string>): {
  resolved: string;
  unresolvedTokens: string[];
} {
  const unresolvedTokens: string[] = [];
  const resolved = template.replace(/\{(\w+)\}/g, (_, key) => {
    if (tokens[key] !== undefined && tokens[key] !== '') return tokens[key];
    unresolvedTokens.push(key);
    return `{${key}}`;
  });
  return { resolved, unresolvedTokens };
}

// ─── Monitor stats ────────────────────────────────────────────────────────

export async function getMonitorStats(): Promise<{
  total: number;
  conforming: number;
  violations: number;
  unmatched: number;
}> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                        AS total,
      COUNT(*) FILTER (WHERE path_conforms = true)::int                   AS conforming,
      COUNT(*) FILTER (WHERE path_conforms = false)::int                  AS violations,
      COUNT(*) FILTER (WHERE matched_rule_id IS NULL)::int                AS unmatched
    FROM gcs_upload_monitor_log
  `);
  const [row] = result.rows as any[];
  return {
    total:      Number((row as any).total ?? 0),
    conforming: Number((row as any).conforming ?? 0),
    violations: Number((row as any).violations ?? 0),
    unmatched:  Number((row as any).unmatched ?? 0),
  };
}

// ─── Seed data (idempotent) ───────────────────────────────────────────────

const SEED_TOKENS = [
  { tokenName: 'CC',           description: 'Continent code',              exampleValue: 'EPC',          sourceDescription: 'Project cost centre code' },
  { tokenName: 'CO',           description: 'Customer order number',       exampleValue: 'C10357',       sourceDescription: 'Customer order / project reference' },
  { tokenName: 'Cust',         description: 'Customer short code',         exampleValue: 'ApolloRef',    sourceDescription: 'Customer name slug from project record' },
  { tokenName: 'FY',           description: 'Financial year',              exampleValue: '2627',         sourceDescription: 'Financial year in YYZZ format' },
  { tokenName: 'NNN',          description: 'Project sequence number',     exampleValue: '017',          sourceDescription: '3-digit sequence from project record' },
  { tokenName: 'EmployeeCode', description: 'Employee code',               exampleValue: 'EMP042',       sourceDescription: 'Employee code from user/employee record' },
  { tokenName: 'EmployeeName', description: 'Employee name slug',          exampleValue: 'john-doe',     sourceDescription: 'Sanitised employee display name' },
  { tokenName: 'QmsModule',    description: 'QMS sub-module key',          exampleValue: 'WPQR',         sourceDescription: 'One of: Calibration, WPQR, PMA, TestProcedures, WelderCertificates, WelderPhotos, WelderManagement' },
  { tokenName: 'DocNumber',    description: 'Document number',             exampleValue: 'WPQR-2024-001',sourceDescription: 'Document number from the source record' },
  { tokenName: 'DrawingNo',    description: 'Drawing or part number',      exampleValue: 'DWG-0042',     sourceDescription: 'Drawing / part number from design record' },
  { tokenName: 'rev',          description: 'Revision identifier',         exampleValue: '01',           sourceDescription: 'Numeric (01,02) or alphabetic (A,B) per rule' },
  { tokenName: 'ext',          description: 'File extension',              exampleValue: 'pdf',          sourceDescription: 'Derived from the uploaded file\'s MIME type' },
  { tokenName: 'filename',     description: 'Sanitised file name',         exampleValue: 'report.pdf',   sourceDescription: 'Sanitised original filename from upload' },
  { tokenName: 'Tag',          description: 'Equipment tag (PPPC)',        exampleValue: 'PT-001',       sourceDescription: 'Tag number from PPPC buy-list line' },
  { tokenName: 'Seq',          description: 'Sequence counter',            exampleValue: '1',            sourceDescription: 'Sequential index within a document group' },
  { tokenName: 'Label',        description: 'Document label slug',         exampleValue: 'purchase-order',sourceDescription: 'Controlled vocabulary label for doc type' },
  { tokenName: 'BizYear',      description: 'Business trip year',          exampleValue: '2026',         sourceDescription: 'Calendar year of the business trip' },
  { tokenName: 'Category',     description: 'Legal document category',     exampleValue: 'NDA',          sourceDescription: 'Legal category slug' },
  { tokenName: 'EntityName',   description: 'Legal entity name slug',      exampleValue: 'vendor-abc',   sourceDescription: 'Sanitised entity name from legal record' },
  { tokenName: 'ProjectCode',  description: 'Full project code string',    exampleValue: 'TPEL-EPC-2627-017', sourceDescription: 'Composite project code for standalone use' },
  { tokenName: 'IONum',        description: 'Inspection order number',     exampleValue: 'IO-2024-001',  sourceDescription: 'Inspection order number from QMS record' },
  { tokenName: 'TabName',      description: 'Inspection tab name',         exampleValue: 'Welding',      sourceDescription: 'One of: MaterialTraceability, ShopInspection, Welding, NDT, etc.' },
  { tokenName: 'ListNo',       description: 'Buy list number',             exampleValue: 'BL-001',       sourceDescription: 'PPPC buy list identifier' },
  { tokenName: 'WelderCode',   description: 'Welder identification code',  exampleValue: 'WLD-042',      sourceDescription: 'Welder code from QMS welder management' },
  { tokenName: 'Discipline',   description: 'Engineering discipline',      exampleValue: 'Mechanical',   sourceDescription: 'Discipline code from design management' },
  { tokenName: 'OfferNo',      description: 'Offer / quotation number',    exampleValue: 'QTN-2025-042', sourceDescription: 'Offer or quotation number from the EPC quotation record' },
  { tokenName: 'VendorCode',   description: 'SAP vendor / BP code',        exampleValue: 'V10042',       sourceDescription: 'Vendor code from SAP Business Partner record' },
  // New tokens added 2026-05 (Option C governance clarification)
  { tokenName: 'CompanyFY',    description: 'Company financial year (April-March)', exampleValue: '2526',    sourceDescription: 'Derived from April-March FY cycle. Format: YYZZ where YY=start year last 2 digits, ZZ=end year last 2 digits.' },
  { tokenName: 'TransmittalNo',description: 'Design transmittal number',     exampleValue: 'TR-2025-042',  sourceDescription: 'Transmittal number from design_transmittals table' },
  { tokenName: 'BackupType',   description: 'Design backup type slug',        exampleValue: 'full-project', sourceDescription: 'Backup type selected by user (e.g. full-project, cad-files, renderings)' },
  { tokenName: 'DrawingType',  description: 'Basic drawing type code',        exampleValue: 'GA',           sourceDescription: 'Drawing type code from design basic drawing record (e.g. GA, PID, ISO)' },
  { tokenName: 'Destination',  description: 'Business trip destination slug', exampleValue: 'dubai',        sourceDescription: 'Sanitised destination city/country from business trip record' },
  { tokenName: 'ContractType', description: 'Legal contract type slug',       exampleValue: 'NDA',          sourceDescription: 'Contract type from legal_contracts table (e.g. NDA, Service, Employment, Purchase)' },
  { tokenName: 'TemplateSlug', description: 'Offer template name slug',       exampleValue: 'heat-exchanger-offer', sourceDescription: 'Sanitised template name from offer_templates table' },
  { tokenName: 'DocType',      description: 'Document/attachment type discriminator', exampleValue: 'QUOTE', sourceDescription: 'Controlled vocabulary: QUOTE, GRPO, PO, GENERAL — used in SAP attachment paths and EPC document paths' },
  { tokenName: 'StandardName', description: 'Design standard document name slug', exampleValue: 'vessel-nozzle-schedule', sourceDescription: 'Sanitised standard name from design_standards record' },
  { tokenName: 'QmsType',      description: 'QMS sub-type segment for TPEL paths', exampleValue: 'WPQR',   sourceDescription: 'Controlled vocabulary for QMS TPEL target paths: WPQR, PMA, WPS-PQR, CALIBRATION, WELDER-CERTS, WELDERS, TEST-PROCEDURES, INSPECTIONS, MATERIAL-ID, DOSSIER' },
  { tokenName: 'NcrNumber',    description: 'Non-Conformance Report number',       exampleValue: 'NCR-2025-001', sourceDescription: 'NCR document number from non-conformance report record. Format: NCR-YYYY-NNN' },
];

const SEED_RULES = [
  // EPC — correct TPEL root
  { moduleKey: 'epc', submoduleKey: 'documents',    documentType: 'EPC_DOCUMENT',    displayName: 'EPC Project Document',        rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',       revisionMode: 'numeric',   notes: 'Built by buildEpcGcsPath() in epc-coding.ts. Revision is filename suffix (2026-05).' },
  { moduleKey: 'epc', submoduleKey: 'drawings',     documentType: 'DRAWING',         displayName: 'EPC Engineering Drawing (DEPRECATED)',  rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}',               revisionMode: 'alphabetic', active: false, notes: 'DEPRECATED 2026-05 — renamed to EPC_DRAWING. Use EPC_DRAWING.' },
  { moduleKey: 'epc', submoduleKey: 'epc_drawing',  documentType: 'EPC_DRAWING',     displayName: 'EPC Engineering Drawing',     rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}',               revisionMode: 'alphabetic', notes: 'Renamed from DRAWING 2026-05. Built by buildDrawingGcsPath() in epc-coding.ts. Also covers design module uploads (project-item-detail-routes.ts) — same builder, same path. DESIGN_DRAWING was retired and merged here.' },
  { moduleKey: 'epc', submoduleKey: 'ecn',          documentType: 'ECN',             displayName: 'Engineering Change Notice',   rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECN/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                      revisionMode: 'numeric',   notes: 'Added 2026-05. Separate lifecycle stage from ECR — ECN is the approved change notice issued after ECR is processed. drawing-ecr-ecn-routes.ts. Revision is filename suffix (2026-05).' },
  { moduleKey: 'epc', submoduleKey: 'rfq_attachment', documentType: 'RFQ_ATTACHMENT', displayName: 'RFQ Email Attachment (Reference)',rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}', revisionMode: 'none', active: false, notes: 'REFERENCE-ONLY TYPE — no new GCS objects created. rfq-email-service.ts freezeAttachments() copies gcs_path verbatim from buy_list_line_selections.datasheet_gcs_object_path (a DATASHEET-governed path). plc_rfq_attachments table stores immutable snapshots. Files already governed as DATASHEET. Added 2026-05 for audit tracking.' },
  { moduleKey: 'epc', submoduleKey: 'dds',          documentType: 'DDS',             displayName: 'Design Data Sheet PDF',       rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DDS/{DrawingNo}_dds-rev-{rev}.pdf',              revisionMode: 'alphabetic',notes: 'Built by buildDdsGcsPath() in dds-pdf-service.ts' },
  { moduleKey: 'epc', submoduleKey: 'co',           documentType: 'CO_DOCUMENT',     displayName: 'Customer Order Document',     rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{Code}/Order_Contract/{Seq}-{Label}-rev-{rev}.pdf',              revisionMode: 'numeric',   notes: 'customer-order-document-routes.ts. Revision is filename suffix (2026-05). {Code}=EPC project code.' },
  { moduleKey: 'epc', submoduleKey: 'ecr',          documentType: 'ECR',             displayName: 'Engineering Change Request',  rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECR/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                      revisionMode: 'numeric',   notes: 'engineering-change-routes.ts. Revision is filename suffix (2026-05).' },
  { moduleKey: 'epc', submoduleKey: 'dispatch',     documentType: 'DISPATCH',        displayName: 'Dispatch Document',           rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DISPATCH/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                  revisionMode: 'numeric',   notes: 'dispatch-routes.ts. Revision is filename suffix (2026-05).' },
  { moduleKey: 'epc', submoduleKey: 'procurement',  documentType: 'DATASHEET',       displayName: 'PPPC Procurement Datasheet',  rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}', revisionMode: 'numeric', notes: 'pppc-routes.ts — hardcoded, correct root' },
  { moduleKey: 'epc', submoduleKey: 'quotation',     documentType: 'QUOTATION',     displayName: 'Offer PDF (Standalone)',              rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/Open_Quotations/{OfferNo}/{Seq}-{Label}-rev-{rev}.pdf', revisionMode: 'numeric',   notes: 'buildQuotationGcsPath() in epc-coding.ts. Unified Open_Quotations root (2026-05). Revision is filename suffix, not folder prefix. Example: TPEL/SA/BR/10357/2627/Open_Quotations/OFR-2627-0017/001-combined-quotation-rev-00.pdf' },
  { moduleKey: 'epc', submoduleKey: 'epc_quotation', documentType: 'EPC_QUOTATION', displayName: 'Offer PDF (Project-Linked)',           rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/Open_Quotations/{OfferNo}/{Seq}-{Label}-rev-{rev}.pdf', revisionMode: 'numeric',   notes: 'buildEpcQtnGcsPath() in epc-coding.ts. Unified Open_Quotations root (2026-05). Revision is filename suffix, not folder prefix. Example: TPEL/SA/BR/10357/2627/Open_Quotations/OFR-2627-0017/001-quotation-document-rev-00.pdf' },
  // DVS
  { moduleKey: 'dvs', submoduleKey: 'staging',      documentType: 'DVS_STAGING',     displayName: 'DVS Drawing Staging',         rootPrefix: 'TPEL/STAGING', pathTemplate: 'TPEL/STAGING/DRAWINGS/{ProjectCode}/{DrawingNo}/rev-{rev}/original/{filename}',        revisionMode: 'numeric',   notes: 'drawing-verification-routes.ts' },
  // QMS — TRANSITIONAL ROOT: QMS/ is approved for existing files only.
  // Family classification confirmed 2026-05 (Option C). Target paths documented below.
  // No new modules may use QMS/ root. Migration is a separate approved phase.
  //   Family B (company-level): WPQR, PMA, WPS/PQR, Calibration, WelderCerts, WelderPhotos, TestProcedures
  //   Family A (project-specific): Inspections, MaterialID, FinalDossier
  { moduleKey: 'qms', submoduleKey: 'wpqr',         documentType: 'WPQR',            displayName: 'Welder Performance Qualification Record', rootPrefix: 'QMS', pathTemplate: 'QMS/WPQR/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                           revisionMode: 'numeric',   notes: 'TRANSITIONAL ROOT — Family B (company-level). wpqr-routes.ts via qms-file-governance.ts. Revision is filename suffix (2026-05). Family B target: TPEL/QMS/{CompanyFY}/WPQR/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}' },
  { moduleKey: 'qms', submoduleKey: 'pma',          documentType: 'PMA',             displayName: 'Particular Material Appraisal', rootPrefix: 'QMS', pathTemplate: 'QMS/PMA/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                                      revisionMode: 'numeric',   notes: 'TRANSITIONAL ROOT — Family B (company-level). pma-routes.ts via qms-file-governance.ts. Revision is filename suffix (2026-05). Family B target: TPEL/QMS/{CompanyFY}/PMA/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}' },
  { moduleKey: 'qms', submoduleKey: 'calibration',  documentType: 'CALIBRATION_CERT',displayName: 'Calibration Certificate',     rootPrefix: 'QMS', pathTemplate: 'QMS/Calibration/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                                   revisionMode: 'numeric',   notes: 'CORRECTED 2026-05 — Phase 2B standard: createRevision(module=Calibration). Revision is filename suffix (2026-05). Legacy flat files at QMS/Instrument/{INST-XXXXX}.pdf retained as orphans. TRANSITIONAL ROOT — Family B (company-level). Family B target: TPEL/QMS/{CompanyFY}/CALIBRATION/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}' },
  { moduleKey: 'qms', submoduleKey: 'inspection',   documentType: 'INSPECTION_DOC',  displayName: 'Inspection Record Document',  rootPrefix: 'QMS', pathTemplate: 'QMS/Inspections_Records/{ProjectCode}/{IONum}/{TabName}/{filename}',                         revisionMode: 'none',      notes: 'TRANSITIONAL ROOT — Family A (project-specific). inspection-document-routes.ts. Requires project_id FK; routes fetch full project hierarchy. Family A target: TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/QMS/INSPECTIONS/{IONum}/{TabName}/{filename}' },
  { moduleKey: 'qms', submoduleKey: 'dossier',      documentType: 'FINAL_DOSSIER',   displayName: 'Final Inspection Dossier PDF',rootPrefix: 'QMS', pathTemplate: 'QMS/Inspections_Records/{ProjectCode}/{IONum}/Final_Dossier/{filename}',                    revisionMode: 'none',      notes: 'TRANSITIONAL ROOT — Family A (project-specific). final-dossier-generator.ts. Linked to inspection_order_number → project_id. Family A target: TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/QMS/DOSSIER/{IONum}/{filename}' },
  { moduleKey: 'qms', submoduleKey: 'welder_cert',  documentType: 'WELDER_CERT',     displayName: 'Welder Qualification Certificate', rootPrefix: 'QMS', pathTemplate: 'QMS/WelderManagement/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',               revisionMode: 'numeric',   notes: 'CORRECTED 2026-05 — actual path from createRevision(module=WelderManagement). Revision is filename suffix (2026-05). TRANSITIONAL ROOT — Family B (company-level). welder-certificate-routes.ts via qms-file-governance.ts. Family B target: TPEL/QMS/{CompanyFY}/WELDER-CERTS/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}' },
  { moduleKey: 'qms', submoduleKey: 'welder_photo', documentType: 'WELDER_PHOTO',    displayName: 'Welder ID Photo',             rootPrefix: 'QMS', pathTemplate: 'QMS/WELDERS/{WelderCode}/{filename}',                                                       revisionMode: 'none',      notes: 'TRANSITIONAL ROOT — Family B (company-level). welder-photo-routes.ts. Flat file, no revision. Linked to welder personnel record. Family B target: TPEL/QMS/{CompanyFY}/WELDERS/{WelderCode}/{filename}' },
  { moduleKey: 'qms', submoduleKey: 'material_id',  documentType: 'MATERIAL_CERT',   displayName: 'Material Identification Doc (DEPRECATED)', rootPrefix: 'QMS', pathTemplate: 'QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}',                          revisionMode: 'none',      active: false, notes: 'DEPRECATED 2026-05 — renamed to MATERIAL_ID_DOC. CERT suffix was misleading; this is an identification document, not a certificate. Use MATERIAL_ID_DOC.' },
  { moduleKey: 'qms', submoduleKey: 'material_id_doc', documentType: 'MATERIAL_ID_DOC', displayName: 'Material Identification Document', rootPrefix: 'QMS', pathTemplate: 'QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}',                              revisionMode: 'none',      notes: 'Renamed from MATERIAL_CERT 2026-05. TRANSITIONAL ROOT — Family A (project-specific). material-identification-routes.ts. Linked to project via project_id FK. Family A target: TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/QMS/MATERIAL-ID/{Seq}/{filename}' },
  { moduleKey: 'qms', submoduleKey: 'ncr',          documentType: 'NCR',             displayName: 'Non-Conformance Report',      rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QMS/NCR/{NcrNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                    revisionMode: 'numeric',   notes: 'Added 2026-05. Family A — project-specific. NcrNumber format: NCR-YYYY-NNN. Revision is filename suffix (2026-05).' },
  { moduleKey: 'qms', submoduleKey: 'test_proc',    documentType: 'TEST_PROCEDURE',  displayName: 'Test Procedure Document',     rootPrefix: 'QMS', pathTemplate: 'QMS/TestProcedures/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                             revisionMode: 'numeric',   notes: 'TRANSITIONAL ROOT — Family B (company-level). test-procedures-routes.ts via qms-file-governance.ts. Revision is filename suffix (2026-05). Family B target: TPEL/QMS/{CompanyFY}/TEST-PROCEDURES/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}' },
  { moduleKey: 'qms', submoduleKey: 'wps_pqr',      documentType: 'WPS_PQR',         displayName: 'Welding Procedure Spec / PQR',rootPrefix: 'QMS', pathTemplate: 'QMS/WPS/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}',                                        revisionMode: 'numeric',   notes: 'TRANSITIONAL ROOT — Family B (company-level). wps-pqr-routes.ts. Revision is filename suffix (2026-05). Family B target: TPEL/QMS/{CompanyFY}/WPS-PQR/{DocNumber}/{Seq}-{Label}-rev-{rev}.{ext}' },
  // Design — TPEL-governed drawing uses correct root; Basic/Transmittal/Backup target paths
  // set per Governance Clarification Plan 2026-05 (Option C). Existing files remain at old
  // roots until a dedicated migration phase is approved.
  { moduleKey: 'design', submoduleKey: 'drawings',   documentType: 'DESIGN_DRAWING',  displayName: 'Design Drawing (RETIRED)',     rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}',               revisionMode: 'alphabetic', active: false, notes: 'RETIRED 2026-05 — merged into EPC_DRAWING. Code inspection confirmed both design-drawing-routes.ts and project-item-detail-routes.ts use the same buildDrawingGcsPath() builder producing identical path templates. Same physical GCS files. Having two active rules caused monitor ambiguity. EPC_DRAWING is now the single canonical type for all drawing uploads.' },
  { moduleKey: 'design', submoduleKey: 'basic',      documentType: 'BASIC_DRAWING',   displayName: 'Basic/Preliminary Drawing',    rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/BASIC/{Discipline}/{DrawingType}_R{rev}.{ext}',     revisionMode: 'numeric',    notes: 'Family A — project-specific. design-basic-drawings-routes.ts. Target path set 2026-05 (Option C). Existing files: Design_Management/{ProjectCode}/Basic_Drawings/{Discipline}/... — migration pending.' },
  { moduleKey: 'design', submoduleKey: 'transmittal',documentType: 'TRANSMITTAL',     displayName: 'Design Transmittal',           rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/TRANSMITTAL/{TransmittalNo}/{filename}',            revisionMode: 'none',       notes: 'Family A — project-specific. design-transmittal-routes.ts. Target path set 2026-05 (Option C). Existing files: Design_Management/Transmittals/{TransmittalNo}/... — migration pending.' },
  { moduleKey: 'design', submoduleKey: 'backup',     documentType: 'DESIGN_BACKUP',   displayName: 'Design Project Backup',        rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/BACKUP/{BackupType}_R{rev}/{filename}',             revisionMode: 'numeric',    notes: 'Family A — project-specific. design-backup-routes.ts. Target path set 2026-05 (Option C). Existing files: Design_Management/{ProjectCode}/Backups/... — migration pending.' },
  { moduleKey: 'design', submoduleKey: 'standards',  documentType: 'DESIGN_STANDARD', displayName: 'Design Standard / Company Template', rootPrefix: 'TPEL/DESIGN/STANDARDS', pathTemplate: 'TPEL/DESIGN/STANDARDS/{Category}/{StandardName}/{filename}',      revisionMode: 'none',       notes: 'Family B — company-wide evergreen library. No FY segment (approved 2026-05 Decision 1). design-standards-routes.ts. Existing files: Design_Management/Standards/{Category}/{StandardName}/... — migration pending.' },
  // Admin / HR — target paths set per Governance Clarification Plan 2026-05 (Option C).
  // {CompanyFY} = April-March FY e.g. 2526. Existing files remain at old roots until migration.
  { moduleKey: 'hr',    submoduleKey: 'business_trip',documentType: 'TRIP_DOCUMENT',  displayName: 'Business Trip Document',       rootPrefix: 'TPEL/ADMIN/HR', pathTemplate: 'TPEL/ADMIN/HR/{CompanyFY}/TRIPS/{EmployeeName}/{Destination}/{DocType}/{filename}', revisionMode: 'none',       notes: 'Family B — company HR. trip-management-routes.ts. Target path set 2026-05 (Option C). Existing files: Business_Trips/{BizYear}/{EmployeeName}/{Destination}/{FromDate}/{DocType}/... — migration pending.' },
  { moduleKey: 'hr',    submoduleKey: 'visa',         documentType: 'VISA_DOCUMENT',   displayName: 'Visa / Travel Document',       rootPrefix: 'TPEL/ADMIN/HR', pathTemplate: 'TPEL/ADMIN/HR/{CompanyFY}/VISA/{EmployeeName}/{Category}/{filename}',              revisionMode: 'none',       notes: 'Family B — company HR. visa-management-routes.ts. Target path set 2026-05 (Option C). Existing files: Visa_Documents/{EmployeeName}/{Category}/... — migration pending.' },
  { moduleKey: 'legal', submoduleKey: 'contracts',    documentType: 'LEGAL_DOCUMENT',  displayName: 'Legal Document / Contract',    rootPrefix: 'TPEL/LEGAL',    pathTemplate: 'TPEL/LEGAL/{CompanyFY}/{ContractType}/{EntityName}/{filename}',                  revisionMode: 'none',       notes: 'Family B — company legal. legal-management-routes.ts. Target path set 2026-05 (Option C). {ContractType}: NDA, Service, Purchase, Employment, Civil, Criminal, IP. Existing files: Legal_Documents/{Category}/{EntityName}/... — migration pending.' },
  // Finance — critical violations flagged; Phase 3 migration approved, not yet executed
  { moduleKey: 'finance', submoduleKey: 'brc',        documentType: 'BRC_DOCUMENT',    displayName: 'Bank Realisation Certificate', rootPrefix: 'Accounts',      pathTemplate: 'Accounts/{FY}/{filename}',                                                      revisionMode: 'none',       notes: '🚨 WRONG ROOT — Phase 3 migration approved but not yet executed. Target: TPEL/FINANCE/BRC/{CompanyFY}/{filename}. Route: server/finance-routes-fixed.ts (Phase 2A lock-down in place).' },
  // SAP — {DocType} discriminator added per Decision 2 (2026-05).
  // {DocType} controlled vocabulary: QUOTE, GRPO, PO, GENERAL.
  // Existing files: Vendor_Quotes/{VendorCode}/{Seq}/{filename} — migration pending.
  { moduleKey: 'sap',   submoduleKey: 'attachments',  documentType: 'SAP_ATTACHMENT',  displayName: 'SAP Purchase Attachment',     rootPrefix: 'TPEL/SAP',      pathTemplate: 'TPEL/SAP/{CompanyFY}/VENDOR-DOCS/{VendorCode}/{DocType}/{Seq}/{filename}',     revisionMode: 'none',       notes: 'Family B — company SAP/procurement. sap-purchase-routes.ts. {VendorCode} = SAP BP code. {DocType}: QUOTE, GRPO, PO, GENERAL. Target path set 2026-05 (Decision 2). Existing files: Vendor_Quotes/{VendorCode}/{Seq}/... — migration pending.' },
  // Legacy file storage
  { moduleKey: 'legacy',submoduleKey: 'file_storage',documentType: 'LEGACY_FILE',     displayName: 'Legacy File Storage',         rootPrefix: 'THERMOPAC_PROJECTS', pathTemplate: 'THERMOPAC_PROJECTS/{FY}/{ProjectCode}/{Discipline}/{Seq}/{filename}',      revisionMode: 'none',      notes: '⚠ Legacy root — pre-TPEL standard. Read-only archive. Needs migration to TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/... in future phase.' },
  // Internal / Ephemeral — not subject to document governance
  { moduleKey: 'internal', submoduleKey: 'slddrw_jobs', documentType: 'SLDDRW_JOB_RESULT', displayName: 'SolidWorks Extraction Job Result', rootPrefix: 'epc-slddrw', pathTemplate: 'epc-slddrw/{DrawingControlId}/{Timestamp}-{filename}', revisionMode: 'none', active: false, notes: 'EPHEMERAL — internal SolidWorks extraction job results (JSON). Not a governed document. Processing artefacts only: input .slddrw downloaded, output JSON uploaded by local Windows agent. Recommended TTL: 30 days. Cleanup via scheduled admin job. Never expose via signed URL to end users. Do NOT migrate to TPEL/. Rule kept inactive — monitor will never match these paths.' },
];

export async function seedGovernanceData(): Promise<void> {
  try {
    // Remove retired Sales module rules from DB (CUSTOMER_ORDER, SALES_CONTRACT, OFFER_TEMPLATE
    // were removed 2026-05 — delete versions (FK child) before rules (FK parent).
    const salesRules = await db.select({ id: gcsGovernanceRules.id })
      .from(gcsGovernanceRules)
      .where(eq(gcsGovernanceRules.moduleKey, 'sales'));
    for (const r of salesRules) {
      await db.delete(gcsGovernanceRuleVersions).where(eq(gcsGovernanceRuleVersions.ruleId, r.id));
    }
    await db.delete(gcsGovernanceRules).where(eq(gcsGovernanceRules.moduleKey, 'sales'));

    // Seed tokens (upsert by tokenName)
    for (const token of SEED_TOKENS) {
      await db.insert(gcsGovernanceTokenRegistry)
        .values(token)
        .onConflictDoNothing();
    }

    // Seed rules (insert new / refresh correctable fields on existing rows)
    for (const rule of SEED_RULES) {
      const existing = await db.select({ id: gcsGovernanceRules.id })
        .from(gcsGovernanceRules)
        .where(
          and(
            eq(gcsGovernanceRules.moduleKey, rule.moduleKey),
            eq(gcsGovernanceRules.documentType, rule.documentType),
          )
        )
        .limit(1);

      const derivedTokens = extractTemplateTokens(rule.pathTemplate);

      if (existing.length === 0) {
        await db.insert(gcsGovernanceRules).values({
          ...rule,
          allowedTokens: derivedTokens,
          requiredTokens: [],
        });
      } else {
        // Always refresh these fields so seed corrections propagate to existing rows
        await db.update(gcsGovernanceRules)
          .set({
            submoduleKey:  rule.submoduleKey,
            displayName:   rule.displayName,
            rootPrefix:    rule.rootPrefix,
            pathTemplate:  rule.pathTemplate,
            revisionMode:  rule.revisionMode as any,
            allowedTokens: derivedTokens,
            notes:         rule.notes ?? null,
            ...(rule.active === false ? { active: false } : {}),
          })
          .where(
            and(
              eq(gcsGovernanceRules.moduleKey, rule.moduleKey),
              eq(gcsGovernanceRules.documentType, rule.documentType),
            )
          );
      }
    }

    // ── Seed v1 versions for any rules that don't have a version yet ──────
    const allRules = await db.select().from(gcsGovernanceRules);
    let seededVersions = 0;
    for (const rule of allRules) {
      const existingVersion = await db
        .select({ id: gcsGovernanceRuleVersions.id })
        .from(gcsGovernanceRuleVersions)
        .where(eq(gcsGovernanceRuleVersions.ruleId, rule.id))
        .limit(1);

      if (existingVersion.length === 0) {
        await db.insert(gcsGovernanceRuleVersions).values({
          ruleId: rule.id,
          versionNumber: 1,
          pathTemplate: rule.pathTemplate,
          revisionMode: rule.revisionMode,
          rootPrefix: rule.rootPrefix,
          displayName: rule.displayName,
          notes: `v1: Phase 0 bootstrap from rule definition. ${rule.notes ?? ''}`.trim(),
          status: 'active',
          activatedAt: new Date(),
        });
        seededVersions++;
      }
    }
    if (seededVersions > 0) {
      console.log(`[GCS-Governance] Seeded ${seededVersions} v1 version(s) for rules without any version.`);
    }

    console.log('[GCS-Governance] Seed complete — tokens, rules, and v1 versions loaded.');
  } catch (err) {
    console.warn('[GCS-Governance] Seed failed (non-fatal):', err);
  }
}

// ─── Phase 1: Upload Token Issuance ──────────────────────────────────────

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function issueUploadToken(params: {
  ruleId: number;
  tokenValues: Record<string, string>;
  issuedTo: number;
  ttlSeconds?: number;
  notes?: string;
}): Promise<{
  rawToken: string;
  resolvedPath: string;
  expiresAt: Date;
  tokenId: number;
  unresolvedTokens: string[];
  versionId: number;
  versionNumber: number;
}> {
  const { ruleId, tokenValues, issuedTo, ttlSeconds = 300, notes } = params;

  // Load the governance rule (identity: moduleKey, documentType, active check)
  const [rule] = await db.select().from(gcsGovernanceRules).where(eq(gcsGovernanceRules.id, ruleId)).limit(1);
  if (!rule) throw new Error(`Governance rule ${ruleId} not found`);
  if (!rule.active) throw new Error(`Governance rule ${ruleId} is inactive`);

  // Load the active VERSION — sole source of pathTemplate and rootPrefix (Phase 0+)
  const [version] = await db
    .select()
    .from(gcsGovernanceRuleVersions)
    .where(and(
      eq(gcsGovernanceRuleVersions.ruleId, ruleId),
      eq(gcsGovernanceRuleVersions.status, 'active'),
    ))
    .limit(1);

  if (!version) {
    throw new Error(
      `[GCS Governance] No active version found for rule ${ruleId} ` +
      `(${rule.moduleKey}/${rule.documentType}). Upload rejected — ` +
      `run seed-v1 or create and activate a version first.`,
    );
  }

  // Resolve the path template from the active version
  const { resolved, unresolvedTokens } = previewPath(version.pathTemplate, tokenValues);

  if (unresolvedTokens.length > 0) {
    throw new Error(`Unresolved tokens: ${unresolvedTokens.map(t => `{${t}}`).join(', ')}. Provide values for all tokens.`);
  }

  // Generate the raw token (32 bytes = 64 hex chars)
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

  const [inserted] = await db.insert(gcsUploadTokens).values({
    ruleId,
    tokenHash,
    resolvedPath: resolved,
    rootPrefix: version.rootPrefix,
    moduleKey: rule.moduleKey,
    documentType: rule.documentType,
    tokenValues: tokenValues as any,
    maxFileSizeBytes: rule.maxFileSizeMb ? rule.maxFileSizeMb * 1024 * 1024 : null,
    allowedMimeTypes: rule.allowedMimeTypes ?? null,
    issuedTo,
    expiresAt,
    notes: notes ?? null,
    versionId: version.id,
  }).returning();

  return {
    rawToken,
    resolvedPath: resolved,
    expiresAt,
    tokenId: inserted.id,
    unresolvedTokens,
    versionId: version.id,
    versionNumber: version.versionNumber,
  };
}

// ─── Phase 1: Upload Token Validation ────────────────────────────────────

export async function validateUploadToken(params: {
  rawToken: string;
  actualPath: string;
}): Promise<{
  valid: boolean;
  tokenId?: number;
  resolvedPath?: string;
  reason?: 'not_found' | 'expired' | 'already_used' | 'path_mismatch';
}> {
  const { rawToken, actualPath } = params;
  const tokenHash = hashToken(rawToken);

  const [token] = await db.select().from(gcsUploadTokens)
    .where(eq(gcsUploadTokens.tokenHash, tokenHash))
    .limit(1);

  if (!token) return { valid: false, reason: 'not_found' };
  if (new Date() > token.expiresAt) return { valid: false, tokenId: token.id, reason: 'expired' };
  if (token.usedAt !== null) return { valid: false, tokenId: token.id, reason: 'already_used' };
  if (token.resolvedPath !== actualPath) {
    return { valid: false, tokenId: token.id, reason: 'path_mismatch', resolvedPath: token.resolvedPath };
  }

  // Mark as used
  await db.update(gcsUploadTokens)
    .set({ usedAt: new Date(), usedForPath: actualPath })
    .where(eq(gcsUploadTokens.id, token.id));

  return { valid: true, tokenId: token.id, resolvedPath: token.resolvedPath };
}

// ─── Phase 1: Issued Token Queries ───────────────────────────────────────

export async function getIssuedTokenStats(): Promise<{
  total: number;
  live: number;
  used: number;
  expired: number;
}> {
  const now = new Date();
  const tokenResult = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                                       AS total,
      COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at > NOW())::int               AS live,
      COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int                                  AS used,
      COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at <= NOW())::int              AS expired
    FROM gcs_upload_tokens
  `);
  const [row] = tokenResult.rows as any[];
  return {
    total:   Number((row as any).total   ?? 0),
    live:    Number((row as any).live    ?? 0),
    used:    Number((row as any).used    ?? 0),
    expired: Number((row as any).expired ?? 0),
  };
}

export async function getIssuedTokens(filters: {
  moduleKey?: string;
  status?: 'live' | 'used' | 'expired' | 'all';
  limit?: number;
  offset?: number;
}): Promise<GcsUploadToken[]> {
  const { moduleKey, status = 'all', limit = 100, offset = 0 } = filters;

  const conditions: any[] = [];
  if (moduleKey) conditions.push(eq(gcsUploadTokens.moduleKey, moduleKey));
  if (status === 'used')    conditions.push(isNotNull(gcsUploadTokens.usedAt));
  if (status === 'live')    conditions.push(
    sql`${gcsUploadTokens.usedAt} IS NULL AND ${gcsUploadTokens.expiresAt} > NOW()`
  );
  if (status === 'expired') conditions.push(
    sql`${gcsUploadTokens.usedAt} IS NULL AND ${gcsUploadTokens.expiresAt} <= NOW()`
  );

  return conditions.length > 0
    ? db.select().from(gcsUploadTokens)
        .where(and(...conditions))
        .orderBy(desc(gcsUploadTokens.issuedAt))
        .limit(limit)
        .offset(offset)
    : db.select().from(gcsUploadTokens)
        .orderBy(desc(gcsUploadTokens.issuedAt))
        .limit(limit)
        .offset(offset);
}
