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
- **Vendor Classification via SAP UDF**: `vendor_type` is sourced exclusively from the SAP Business Partner UDF field `U_ERP_Group` at sync time. Single-char code stored in DB; full label derived from the mapping. Do NOT manually assign or infer from SAP GroupCode/GroupName. Mapping: `R`=Raw Materials, `P`=Pumps Blowers, `M`=Motors, `I`=Instruments, `V`=Valves, `E`=Electrical Control, `B`=Packages. Vendors with a null/blank `U_ERP_Group` are synced with `vendor_type = null`. SAP sync excludes GroupCodes 105 (Employees) and 106 (Employees Loan).
- **SAP Service Layer UDF Behaviour (SQL Server)**: SAP B1 on MS SQL Server returns `U_ERP_Group` ONLY on bulk list fetches with NO `$select` and NO `$orderby`. Adding either parameter causes SAP to strip all UDF columns from the response silently. Filtering via `$filter=U_ERP_Group eq 'R'` is also silently ignored (all records returned). The `Test SAP` button always forces a fresh login (`invalidateSharedSapSession()` before login) to prevent session contamination from Full Sync (which uses `$select`). Full Scan paginates all vendors in memory and filters by `U_ERP_Group` locally. These rules are non-negotiable — do NOT add `$select` or `$orderby` to the Test SAP bulk scan query.

## Product
- **Core Modules**: Project & Quality Management, Finance & HR Management, Document Management.
- **Advanced Features**: AI-powered lead generation, Google Ads integration, global re-refining opportunity radar, multi-agent intelligence layer for proactive business management.
- **Document Control**: Drawing Registry with version control, EPC Document Attachment & Retrieval (GCS-backed, SHA-256 duplicate detection), DocType-based revision/supersession tracking.
- **Procurement Control**: 6-phase Project Procurement Package Control (PPPC) with buy-lists, item selection, datasheet uploads, and PR raising.
- **Automation**: EPC Execution Plan for automated DO/WO/PO/IO draft generation, BOM creation, dispatch/billing readiness.
- **Security**: Role-based access control, TOTP 2FA, EPC Permission Control Dashboard, record-level ownership filtering.
- **Reporting & Analytics**: EPC Control Tower dashboard, EPC Cutover Readiness Dashboard, employee appraisal PDF generation.

## User preferences
Preferred communication style: Simple, everyday language.

## Gotchas
- **Date Display**: Always use `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts` for UI date displays; direct `toLocaleDateString()` or other formats are prohibited.
- **GCS Paths**: All new document flows must strictly comply with the GCS governance defined in `docs/gcs-governance-rev4-closure.md` (`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/...` root).
- **SolidWorks Agent**: Requires a dedicated Windows PC with SolidWorks installed to run the local agent for `.slddrw` extraction.
- **Cost Roll-up Freezing**: Freezing BOM cost roll-up (`POST /api/projects/:id/cost-rollup/freeze`) writes `rolledUpCost` to the database; ensure costs are approved before freezing.
- **Test Data Visibility**: Test records (`is_test = true`) are hidden by default from UI and API responses unless the "Show/Hide Test Data" toggle is active (Superuser only).
- **Tag No Control (PPPC)**: Tags auto-generated using `server/tag-generation-service.ts`; prefix map: PT/TT/FT/LT/XV/CV/PSV/P/CT/JB/M. Raw Materials group → no tag. Qty>1 on taggable subgroups → N separate lines each qty=1 with sequential tags. All tag generation uses `pg_advisory_xact_lock(projectId)`. Manual changes audited in `tag_no_audit_log`. Project-wide uniqueness enforced by partial unique index + 409 responses. Taggable subgroup codes defined in both `tag-generation-service.ts` and `TAGGABLE_SUBGROUP_CODES` constant in buy-list-control-page.

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
- **Drizzle ORM Docs**: `https://orm.drizzle.team/`
- **Radix UI Docs**: `https://www.radix-ui.com/`
- **TanStack Query Docs**: `https://tanstack.com/query/latest`