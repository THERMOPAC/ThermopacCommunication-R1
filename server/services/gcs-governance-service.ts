/**
 * GCS Governance Service — Phase 0
 * Monitor-only mode: logs uploads, validates paths against rules, never blocks.
 */

import { db } from '../db';
import {
  gcsGovernanceRules,
  gcsGovernanceTokenRegistry,
  gcsUploadMonitorLog,
  type GcsGovernanceRule,
  type InsertGcsUploadMonitorLog,
} from '@shared/schema';
import { eq, desc, and, or, ilike, isNull, sql } from 'drizzle-orm';

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
  const [row] = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                        AS total,
      COUNT(*) FILTER (WHERE path_conforms = true)::int                   AS conforming,
      COUNT(*) FILTER (WHERE path_conforms = false)::int                  AS violations,
      COUNT(*) FILTER (WHERE matched_rule_id IS NULL)::int                AS unmatched
    FROM gcs_upload_monitor_log
  `);
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
];

const SEED_RULES = [
  // EPC — correct TPEL root
  { moduleKey: 'epc', submoduleKey: 'documents',    documentType: 'EPC_DOCUMENT',    displayName: 'EPC Project Document',        rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}',       revisionMode: 'numeric',   notes: 'Built by buildEpcGcsPath() in epc-coding.ts' },
  { moduleKey: 'epc', submoduleKey: 'drawings',     documentType: 'DRAWING',         displayName: 'EPC Engineering Drawing',     rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}',               revisionMode: 'alphabetic',notes: 'Built by buildDrawingGcsPath() in epc-coding.ts' },
  { moduleKey: 'epc', submoduleKey: 'dds',          documentType: 'DDS',             displayName: 'Design Data Sheet PDF',       rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DDS/{DrawingNo}_dds-rev-{rev}.pdf',              revisionMode: 'alphabetic',notes: 'Built by buildDdsGcsPath() in dds-pdf-service.ts' },
  { moduleKey: 'epc', submoduleKey: 'co',           documentType: 'CO_DOCUMENT',     displayName: 'Customer Order Document',     rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/CO/{CO}/rev-{rev}/{Seq}-{Label}.{ext}',                    revisionMode: 'numeric',   notes: 'customer-order-document-routes.ts' },
  { moduleKey: 'epc', submoduleKey: 'ecr',          documentType: 'ECR',             displayName: 'Engineering Change Request',  rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECR/{DocNumber}/rev-{rev}/{filename}',                      revisionMode: 'numeric',   notes: 'engineering-change-routes.ts' },
  { moduleKey: 'epc', submoduleKey: 'dispatch',     documentType: 'DISPATCH',        displayName: 'Dispatch Document',           rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DISPATCH/{DocNumber}/rev-{rev}/{filename}',                  revisionMode: 'numeric',   notes: 'dispatch-routes.ts' },
  { moduleKey: 'epc', submoduleKey: 'procurement',  documentType: 'DATASHEET',       displayName: 'PPPC Procurement Datasheet',  rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}', revisionMode: 'numeric', notes: 'pppc-routes.ts — hardcoded, correct root' },
  { moduleKey: 'epc', submoduleKey: 'quotation',    documentType: 'QUOTATION',       displayName: 'EPC Quotation PDF',           rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/Quotations/{filename}/rev-{rev}/{Seq}-{Label}.pdf',               revisionMode: 'alphabetic',notes: 'buildQuotationGcsPath() in epc-coding.ts' },
  // DVS
  { moduleKey: 'dvs', submoduleKey: 'staging',      documentType: 'DVS_STAGING',     displayName: 'DVS Drawing Staging',         rootPrefix: 'TPEL/STAGING', pathTemplate: 'TPEL/STAGING/DRAWINGS/{ProjectCode}/{DrawingNo}/rev-{rev}/original/{filename}',        revisionMode: 'numeric',   notes: 'drawing-verification-routes.ts' },
  // QMS — correct QMS root
  { moduleKey: 'qms', submoduleKey: 'wpqr',         documentType: 'WPQR',            displayName: 'Welding Procedure Record',    rootPrefix: 'QMS', pathTemplate: 'QMS/WPQR/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}',                                        revisionMode: 'numeric',   notes: 'wpqr-routes.ts via qms-file-governance.ts' },
  { moduleKey: 'qms', submoduleKey: 'pma',          documentType: 'PMA',             displayName: 'Production Management Agent Doc', rootPrefix: 'QMS', pathTemplate: 'QMS/PMA/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}',                                    revisionMode: 'numeric',   notes: 'pma-routes.ts via qms-file-governance.ts' },
  { moduleKey: 'qms', submoduleKey: 'calibration',  documentType: 'CALIBRATION_CERT',displayName: 'Calibration Certificate',     rootPrefix: 'QMS', pathTemplate: 'QMS/Instrument/{filename}',                                                                 revisionMode: 'none',      notes: 'calibration-routes.ts — flat, no rev folder' },
  { moduleKey: 'qms', submoduleKey: 'inspection',   documentType: 'INSPECTION_DOC',  displayName: 'Inspection Record Document',  rootPrefix: 'QMS', pathTemplate: 'QMS/Inspections_Records/{ProjectCode}/{IONum}/{TabName}/{filename}',                         revisionMode: 'none',      notes: 'inspection-document-routes.ts' },
  { moduleKey: 'qms', submoduleKey: 'dossier',      documentType: 'FINAL_DOSSIER',   displayName: 'Final Inspection Dossier PDF',rootPrefix: 'QMS', pathTemplate: 'QMS/Inspections_Records/{ProjectCode}/{IONum}/Final_Dossier/{filename}',                    revisionMode: 'none',      notes: 'final-dossier-generator.ts' },
  { moduleKey: 'qms', submoduleKey: 'welder_cert',  documentType: 'WELDER_CERT',     displayName: 'Welder Qualification Certificate', rootPrefix: 'QMS', pathTemplate: 'QMS/WelderCertificates/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}',                  revisionMode: 'numeric',   notes: 'welder-certificate-routes.ts via qms-file-governance.ts' },
  { moduleKey: 'qms', submoduleKey: 'welder_photo', documentType: 'WELDER_PHOTO',    displayName: 'Welder ID Photo',             rootPrefix: 'QMS', pathTemplate: 'QMS/WELDERS/{WelderCode}/{filename}',                                                       revisionMode: 'none',      notes: 'welder-photo-routes.ts' },
  { moduleKey: 'qms', submoduleKey: 'material_id',  documentType: 'MATERIAL_CERT',   displayName: 'Material Identification Doc', rootPrefix: 'QMS', pathTemplate: 'QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}',                                revisionMode: 'none',      notes: 'material-identification-routes.ts' },
  { moduleKey: 'qms', submoduleKey: 'test_proc',    documentType: 'TEST_PROCEDURE',  displayName: 'Test Procedure Document',     rootPrefix: 'QMS', pathTemplate: 'QMS/TestProcedures/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}',                             revisionMode: 'numeric',   notes: 'test-procedures-routes.ts via qms-file-governance.ts' },
  { moduleKey: 'qms', submoduleKey: 'wps_pqr',      documentType: 'WPS_PQR',         displayName: 'Welding Spec / PQR Document', rootPrefix: 'QMS', pathTemplate: 'QMS/WPQR/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}',                                       revisionMode: 'numeric',   notes: 'wps-pqr-routes.ts' },
  // Design — note: some sub-modules use wrong root (flagged)
  { moduleKey: 'design', submoduleKey: 'drawings',  documentType: 'DESIGN_DRAWING',  displayName: 'Design Drawing (governed)',   rootPrefix: 'TPEL', pathTemplate: 'TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}',               revisionMode: 'alphabetic',notes: 'design-drawing-routes.ts — uses buildDrawingGcsPath' },
  { moduleKey: 'design', submoduleKey: 'basic',     documentType: 'BASIC_DRAWING',   displayName: 'Basic/Preliminary Drawing',   rootPrefix: 'Design_Management', pathTemplate: 'Design_Management/{ProjectCode}/Basic_Drawings/{Discipline}/{filename}',        revisionMode: 'none',      notes: '⚠ Wrong root — needs migration to TPEL/DESIGN/…' },
  { moduleKey: 'design', submoduleKey: 'transmittal',documentType: 'TRANSMITTAL',    displayName: 'Design Transmittal',          rootPrefix: 'Design_Management', pathTemplate: 'Design_Management/Transmittals/{DocNumber}/{filename}',                         revisionMode: 'none',      notes: '⚠ Wrong root — needs migration to TPEL/DESIGN/…' },
  { moduleKey: 'design', submoduleKey: 'backup',    documentType: 'DESIGN_BACKUP',   displayName: 'Design Project Backup',       rootPrefix: 'Design_Management', pathTemplate: 'Design_Management/{ProjectCode}/Backups/{DocNumber}/{filename}',                revisionMode: 'none',      notes: '⚠ Wrong root — needs migration to TPEL/DESIGN/…' },
  // Admin / HR — wrong roots flagged
  { moduleKey: 'hr',    submoduleKey: 'business_trip',documentType: 'TRIP_DOCUMENT', displayName: 'Business Trip Document',      rootPrefix: 'Business_Trips', pathTemplate: 'Business_Trips/{BizYear}/{EmployeeName}/{DocType}/{filename}',                   revisionMode: 'none',      notes: '⚠ Wrong root — needs migration to TPEL/ADMIN/HR/…' },
  { moduleKey: 'hr',    submoduleKey: 'visa',        documentType: 'VISA_DOCUMENT',   displayName: 'Visa / Travel Document',      rootPrefix: 'Visa_Documents',  pathTemplate: 'Visa_Documents/{EmployeeName}/{Category}/{filename}',                          revisionMode: 'none',      notes: '⚠ Wrong root — needs migration to TPEL/HR/…' },
  { moduleKey: 'legal', submoduleKey: 'contracts',   documentType: 'LEGAL_DOCUMENT',  displayName: 'Legal Document',              rootPrefix: 'Legal_Documents', pathTemplate: 'Legal_Documents/{Category}/{EntityName}/{filename}',                           revisionMode: 'none',      notes: '⚠ Wrong root — needs migration to TPEL/LEGAL/…' },
  // Finance — critical violations flagged
  { moduleKey: 'finance', submoduleKey: 'brc',       documentType: 'BRC_DOCUMENT',    displayName: 'Bank Realisation Certificate',rootPrefix: 'Accounts', pathTemplate: 'Accounts/{FY}/{filename}',                                                            revisionMode: 'none',      notes: '🚨 Frontend constructs path — critical violation; needs Phase 3 fix' },
  // Sales
  { moduleKey: 'sales', submoduleKey: 'offer_template',documentType: 'OFFER_TEMPLATE',displayName: 'Offer / Quotation Template',  rootPrefix: 'Offer_Templates', pathTemplate: 'Offer_Templates/{Seq}/{filename}',                                            revisionMode: 'none',      notes: '⚠ Non-standard root — needs migration to TPEL/SALES/…' },
  // SAP
  { moduleKey: 'sap',   submoduleKey: 'attachments', documentType: 'SAP_ATTACHMENT',  displayName: 'SAP Purchase Attachment',     rootPrefix: 'Vendor_Quotes',   pathTemplate: 'Vendor_Quotes/{Seq}/{Seq}/{filename}',                                        revisionMode: 'none',      notes: '⚠ Wrong root — needs migration to TPEL/SAP/…' },
  // Legacy file storage
  { moduleKey: 'legacy',submoduleKey: 'file_storage',documentType: 'LEGACY_FILE',     displayName: 'Legacy File Storage',         rootPrefix: 'THERMOPAC_PROJECTS', pathTemplate: 'THERMOPAC_PROJECTS/{FY}/{ProjectCode}/{Discipline}/{Seq}/{filename}',      revisionMode: 'none',      notes: '⚠ Legacy root — needs migration to TPEL/… in future phase' },
];

export async function seedGovernanceData(): Promise<void> {
  try {
    // Seed tokens (upsert by tokenName)
    for (const token of SEED_TOKENS) {
      await db.insert(gcsGovernanceTokenRegistry)
        .values(token)
        .onConflictDoNothing();
    }

    // Seed rules (upsert by moduleKey + documentType)
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

      if (existing.length === 0) {
        await db.insert(gcsGovernanceRules).values({
          ...rule,
          allowedTokens: extractTemplateTokens(rule.pathTemplate),
          requiredTokens: [],
        });
      }
    }

    console.log('[GCS-Governance] Seed complete — tokens and rules loaded.');
  } catch (err) {
    console.warn('[GCS-Governance] Seed failed (non-fatal):', err);
  }
}
