# THERMOPAC QMS
An enterprise-grade Quality Management System optimizing operations, enhancing efficiency, and providing data-driven insights for THERMOPAC.

## Run & Operate
- **Run Dev**: `npm run dev`
- **Build**: `npm run build`
- **Typecheck**: `npm run typecheck`
- **Codegen**: `npm run generate:db-schema` (Drizzle ORM schema)
- **DB Push**: `drizzle-kit push:pg`
- **Env Vars**: `DATABASE_URL`, `GCS_BUCKET_NAME`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `SENDGRID_API_KEY`, `OPENAI_API_KEY`, `NODE_ENV`

## Stack
- **Backend**: Express.js (TypeScript), PostgreSQL (Drizzle ORM), Node.js (runtime)
- **Frontend**: React (TypeScript), Wouter, TanStack Query, Radix UI, Tailwind CSS, React Hook Form, Zod, Vite
- **Build Tool**: Vite
- **ORM**: Drizzle ORM
- **Validation**: Zod

## Where things live
- `client/`: Frontend React application
- `server/`: Backend Express.js application
- `shared/`: Shared types, utilities, and schemas (e.g., `shared/schema.ts` for DB schema definitions, `shared/gcs-label-vocabulary.ts` for GCS vocabulary)
- `docs/`: Architecture and governance documents (e.g., `docs/gcs-governance-rev4-closure.md` for GCS policies, `docs/slddrw-extraction-agent-baseline-v3.md` for SolidWorks agent)
- `client/src/lib/date-format.ts`: UI date formatting utilities (source of truth for date display)
- `server/utils/date-ist.ts`: Server-side IST-aware date utilities
- `server/project-routes.ts`: Project-related API endpoints
- `server/pppc-routes.ts`: Procurement control API endpoints
- `server/epc-slddrw-job-routes.ts`: SolidWorks Agent API endpoints
- `server/dds-pdf-service.ts`: DDS PDF generation logic
- `server/leave-service.ts`: Central leave state machine — all mutations, sandwich engine, CL accrual, LWP exemption
- `server/payroll-salary-core.ts`: Pure `computeEmployeeSalaryNumbers()` — single source of all payroll arithmetic (v2.0.0). Called by both trial and official pipelines.
- `server/payroll-trial-routes.ts`: Trial payroll lifecycle — `POST /trial/run`, `GET /trial/history/:periodId/:userId`, `POST /trial/:recordId/cancel`
- `server/payroll-run-engine.ts`: Official pipeline; `stepSalaryCalculation()` delegates arithmetic to core; filters `record_type='official'` on DB reads/writes

## Architecture decisions
- **Data Integrity & Consistency**: Google Cloud Storage (GCS) is the single source of truth for file metadata; security via signed URLs. All GCS paths enforce a strict `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/…` root and controlled vocabulary.
- **UI/UX Standardisation**: Consistent color schemes, card-based layouts, unified dropdowns, and branded professional report generation via Radix UI and Tailwind CSS.
- **Date Handling**: Strict global date standard (DD/MM/YYYY for UI, YYYY-MM-DD for DB) enforced by shared utilities and non-negotiable rules to prevent `toLocaleDateString()` and ensure consistency.
- **SolidWorks Integration**: Dedicated local Windows agent polls cloud for jobs, extracts data via SolidWorks COM API, and uploads JSON results, decoupling heavy SolidWorks processing from the cloud application.
- **Commercial Pricing Layer**: Implemented with immutable versioned price sheets (snapshots) and a clear formula for `selling_price_inr` and `selling_price`, ensuring financial traceability and auditability.
- **Leave Management Service Layer**: All leave state mutations (apply/approve/reject/cancel/revoke/accrue) go through `server/leave-service.ts`. Sandwich deduction stored in `leave_deductions` table (forward-only from 2026-05-01). CL accrues at 1.25/month via nightly cron + manual admin trigger. LWP exemption for Superuser/GM/SM roles (or explicit DB grant) zeroes LOP in payroll. Admin bypass routes in `admin-routes.ts` are service-layer-backed.
- **Payroll Governance v4.1**: `server/payroll-salary-core.ts` is the single source of all payroll arithmetic. Trial runs (`record_type='trial'`) are fully isolated from official records (`record_type='official'`). `/run/single-user` → 410. Pre-flight drift check at `GET /api/payroll/run/preflight/:periodId`. Parity verification at `POST /api/admin/payroll/verify/trial-vs-official`.
- **EPC Project Naming Governance v2**: Canonical project display name = `{code} — {customer_name} — {offer_subject}` (em dash U+2014, never hyphen). Three source fields (`offer_subject`, `customer_name`, `project_display_name`) stored in `projects` table. `project_display_name` is computed server-side by `computeProjectDisplayName()` on every create/update — **read-only outside Project Master; never accepted raw from client**. All UI modules MUST use `getProjectDisplayName(p)` from `client/src/lib/project-utils.ts`; direct string concatenation of `code + name` is prohibited. `offer_subject` is sourced from the offer's `subject` field at conversion time. Legacy records backfilled 2026-05-18. `ProjectLike` type in `project-utils.ts` retains `shortDescription`/`short_description` as legacy fallback aliases for backward compat with old API responses.
- **Vendor Classification via SAP UDF**: `vendor_type` is sourced exclusively from the SAP Business Partner UDF field `U_ERP_Group` at sync time. Single-char code stored in DB; full label derived from the mapping. Do NOT manually assign or infer from SAP GroupCode/GroupName. Mapping: `R`=Raw Materials, `P`=Pumps Blowers, `M`=Motors, `I`=Instruments, `V`=Valves, `E`=Electrical Control, `B`=Packages. Vendors with a null/blank `U_ERP_Group` are synced with `vendor_type = null`. SAP sync excludes GroupCodes 105 (Employees) and 106 (Employees Loan).
- **SAP Service Layer UDF Behaviour (SQL Server)**: SAP B1 on MS SQL Server returns `U_ERP_Group` ONLY on bulk list fetches with NO `$select` and NO `$orderby`. Adding either parameter causes SAP to strip all UDF columns from the response silently. Filtering via `$filter=U_ERP_Group eq 'R'` is also silently ignored (all records returned). The `Test SAP` button always forces a fresh login (`invalidateSharedSapSession()` before login) to prevent session contamination from Full Sync (which uses `$select`). Full Scan paginates all vendors in memory and filters by `U_ERP_Group` locally. These rules are non-negotiable — do NOT add `$select` or `$orderby` to the Test SAP bulk scan query.
- **Dual-Storage Policy (Approved)**: Every GCS-governed document — user-uploaded or system-generated — must be mirrored to the Windows file server via the Local Document Agent. Control rules: (1) GCS is always written first. (2) GCS failure → reject operation, no DB record created, no agent job created. (3) GCS success → create DB record, enqueue `SAVE_FILE` agent job (`document_agent_jobs`). (4) Mirror failure → document remains valid (GCS authoritative); `mirror_status = failed` on source record; retry allowed by original uploader or Superuser. (5) GCS is never rolled back on mirror failure. (6) No signed URL stored in DB — generated fresh on `jobs/claim`. (7) GCS relative path = agent `local_relative_path` (identical strings; no translation). Full policy: `docs/dual-storage-policy-proposal-v1.0.md`.
- **GCS-to-Doc Governance Sync v1.0**: GCS Doc Governance is the single source of truth for path definitions. Creating/editing/deactivating/activating a GCS Governance Rule automatically creates/updates/deactivates/activates the matching `document_path_templates` row. Link column: `document_path_templates.gcs_rule_id` (nullable FK to `gcs_governance_rules.id`). Path conversion: `relativePathTemplate = '{COMPANY}' + gcsRule.pathTemplate.substring(gcsRule.rootPrefix.length)`. `templateCode` derived as `{moduleKey}_{documentType}` or `{moduleKey}_{submoduleKey}_{documentType}` (lowercase, underscores). `fileExtension` and `fileNameTemplate` default to null on auto-create (user may fill manually). Sync failure does NOT fail the GCS operation — logged as `[GCS-DocSync]` and returned as `docTemplateSyncError` field in the response. GCS-managed templates (`gcs_rule_id IS NOT NULL`) are read-only in the Doc Governance UI. Full policy: `docs/gcs-doc-governance-sync-v1.0.md`.

## Product
- **Core Modules**: Project & Quality Management, Finance & HR Management, Document Management.
- **Advanced Features**: AI-powered lead generation, Google Ads integration, global re-refining opportunity radar, multi-agent intelligence layer for proactive business management.
- **Document Control**: Drawing Registry with version control, EPC Document Attachment & Retrieval (GCS-backed, SHA-256 duplicate detection), DocType-based revision/supersession tracking.
- **Procurement Control**: 6-phase Project Procurement Package Control (PPPC) with buy-lists, item selection, datasheet uploads, and PR raising.
- **Automation**: EPC Execution Plan for automated DO/WO/PO/IO draft generation, BOM creation, dispatch/billing readiness.
- **Security**: Role-based access control, TOTP 2FA, EPC Permission Control Dashboard, record-level ownership filtering.
- **Reporting & Analytics**: EPC Control Tower dashboard, EPC Cutover Readiness Dashboard, employee appraisal PDF generation.
- **Mirror Health Dashboard** (Document Control → Mirror Health Dashboard): Monitors GCS ↔ Windows mirror status across all governed modules. Shows pending mirrors, failed mirrors, per-module mirror KPIs, and provides retry controls. This is a Document Control function — NOT part of Worker Agents Dashboard. Worker Agents Dashboard covers only: agent health, heartbeats, connectivity, version management, and agent job processing.

## User preferences
Preferred communication style: Simple, everyday language.

## Gotchas
- **Date Display**: Always use `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts` for UI date displays; direct `toLocaleDateString()` or other formats are prohibited.
- **GCS Paths**: All new document flows must strictly comply with the GCS governance defined in `docs/gcs-governance-rev4-closure.md` (`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/...` root).
- **SolidWorks Agent**: Requires a dedicated Windows PC with SolidWorks installed to run the local agent for `.slddrw` extraction.
- **Cost Roll-up Freezing**: Freezing BOM cost roll-up (`POST /api/projects/:id/cost-rollup/freeze`) writes `rolledUpCost` to the database; ensure costs are approved before freezing.
- **Test Data Visibility**: Test records (`is_test = true`) are hidden by default from UI and API responses unless the "Show/Hide Test Data" toggle is active (Superuser only).
- **Tag No Control (PPPC)**: Tags auto-generated using `server/tag-generation-service.ts`; prefix map: PT/TT/FT/LT/XV/CV/PSV/P/CT/JB/M. Raw Materials group → no tag. Qty>1 on taggable subgroups → N separate lines each qty=1 with sequential tags. All tag generation uses `pg_advisory_xact_lock(projectId)`. Manual changes audited in `tag_no_audit_log`. Project-wide uniqueness enforced by partial unique index + 409 responses. Taggable subgroup codes defined in both `tag-generation-service.ts` and `TAGGABLE_SUBGROUP_CODES` constant in buy-list-control-page.
- **Dual-Storage Control Rules**: Every GCS write (upload or generate) must follow this sequence: (1) Write to GCS first. (2) GCS fail → abort entirely, no DB record, no agent job. (3) GCS success → INSERT DB record, then INSERT `document_agent_jobs` row (job_type=SAVE_FILE). Never reverse this order. Never create the DB record before GCS succeeds. Mirror failure never invalidates the DB record or GCS copy.
- **Document Immutability**: Existing documents must never be overwritten in either GCS or Windows Server. Every replacement creates a new revision at a new path (e.g. `rev-01/`, `rev-02/`). The Windows agent must refuse to overwrite any existing file — identical SHA-256 → `FILE_ALREADY_EXISTS_IDENTICAL`, different SHA-256 → `FILE_ALREADY_EXISTS_CONFLICT`. Latest revision is determined by DB metadata (`is_active`, `revision_number`) only — never by file inspection or overwriting. All revision rows in source tables and `document_agent_jobs` are permanent; `is_active` is flipped but rows are never deleted.
- **Mirror Health Dashboard vs Worker Agents Dashboard**: Mirror Health Dashboard lives under Document Control and shows GCS↔Windows mirror job status (pending/failed/retry). Worker Agents Dashboard is Agent Management only (health, heartbeat, connectivity, version, job processing). Do NOT merge these two dashboards or move mirror status into Worker Agents.
- **GCS-Managed Doc Path Templates**: `document_path_templates` rows with `gcs_rule_id IS NOT NULL` are auto-managed by GCS Doc Governance. Never edit them directly in the Doc Governance UI — all path/revision changes go through GCS Doc Governance only. `fileExtension` and `fileNameTemplate` are the only fields users may fill in manually on a GCS-managed template (supplementary, not derivable from GCS).

## Operating Protocol
All discussion and implementation work follows **`docs/operating-protocol-v1.0.md`**.  
Read it before starting any discussion or implementation.

## Pointers
- **Document Path & Folder Template Baseline v1.0**: `docs/document-path-folder-template-baseline-v1.md`
- **GCS Governance Rev 5**: `docs/gcs-governance-rev5-option-c-baseline.md`
- **Document Type Vocabulary v2.0 (FROZEN)**: `docs/document-type-vocabulary-v2.0.md`
- **SolidWorks Agent Baseline**: `docs/slddrw-extraction-agent-baseline-v3.md`
- **Leave Management Correction Plan**: `docs/leave-management-correction-plan-baseline-v1.0.md`
- **Payroll Governance v4.1 Baseline**: `docs/payroll-governance-v4.1-baseline.md`
- **PPPC Phase 6 Generate/Sync Baseline v1.0**: `docs/pppc-phase6-generate-sync-baseline-v1.0.md`
- **BUY Item Code Generation Baseline v1.3**: `docs/item-code-generation-baseline-v1.3.md`
- **RFQ Email Dispatch Baseline v1.0**: `docs/rfq-email-dispatch-baseline-v1.0.md`
- **QMS Upload Hardening Phase 2B Baseline v1.0**: `docs/qms-upload-hardening-phase2b-baseline-v1.0.md`
- **EPC Project Naming Governance v1.0**: `docs/epc-project-naming-governance-v1.0.md`
- **BP Sync Governance Baseline v1.0**: `docs/bp-sync-governance-baseline-v1.md`
- **UI Product Identity Display Standard v1.0**: `docs/ui-product-identity-display-standard.md`
- **Dual-Storage Policy v1.0 (Approved)**: `docs/dual-storage-policy-proposal-v1.0.md`
- **GCS-to-Doc Governance Sync v1.0**: `docs/gcs-doc-governance-sync-v1.0.md`
- **Drizzle ORM Docs**: `https://orm.drizzle.team/`
- **Radix UI Docs**: `https://www.radix-ui.com/`
- **TanStack Query Docs**: `https://tanstack.com/query/latest`