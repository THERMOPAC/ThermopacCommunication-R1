# Overview
This project is an enterprise-grade Quality Management System (QMS) for THERMOPAC, designed to optimize operations, enhance efficiency, and provide data-driven insights. It integrates core business modules such as project management, production, quality control, finance, HR, and document management. The system aims to facilitate data-driven decision-making, offer advanced sales and marketing features including AI-powered lead generation and Google Ads integration, provide a global re-refining opportunity radar, and incorporate a multi-agent intelligence layer for proactive business management.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture
## Core Architectural Decisions
The system is a full-stack web application employing organized, hierarchical data structures, standardized UI/UX components, robust data integrity, and real-time synchronization. It features role-based access control, comprehensive validation, and dialog-based editing with form pre-population. Google Cloud Storage (GCS) serves as the single source of truth for file metadata, with security managed via signed URLs and client-side caching for performance. UI/UX emphasizes consistent color schemes, card-based layouts, unified dropdowns, and branded professional report generation.

## Technical Implementations
- **Backend**: Express.js with TypeScript, PostgreSQL (Drizzle ORM), session-based authentication, Google Cloud Storage, and a RESTful API.
- **Frontend**: React with TypeScript, Wouter for routing, TanStack Query for state management, Radix UI components with Tailwind CSS, React Hook Form with Zod validation, and Vite for builds.
- **Error Handling**: Centralized, structured error handling on both backend and frontend, following a standard JSON format without exposing sensitive details.
- **Data Storage**: PostgreSQL on Neon, a dedicated GCS bucket for files, and database-backed sessions.
- **Key Modules & Features**:
    - **Project & Quality Management**: Manages projects, items, work orders, inspection orders, material identification, welder management, and welding procedures.
    - **Finance & HR Management**: Covers invoicing, payments, allocations, BRC tracking, GL Mapping, Statutory Compliance, TDS reconciliation, user management, attendance, DWAR, and an enhanced payroll engine.
    - **Document Management**: Integrates with GCS for hierarchical storage, metadata tracking, templates, and access control. Includes a Drawing Registry with version control and CAD management, and EPC Document Attachment & Retrieval with GCS-backed storage, SHA-256 duplicate detection, and audit history. Features a DocType-based document control system for 21 EPC DocTypes with revision and supersession tracking.
    - **Sales & Marketing**: Includes AI-powered lead generation, product database, offer/quotation module, Google Ads integration, and Commercial Change Order (CCO) control with financial traceability and a commercial chain model.
    - **EPC Project Numbering & Sequence Engine**: Implements a structured project coding system (`{FY}-{NNN}`) and a concurrency-safe sequence engine for over 20 document types, ensuring unique identifiers and GCS path derivation.
    - **EPC Control Layers**: Enforces governance for design drawings (revision control via Drawing-Level ECR/ECN workflows), Bill of Materials (BOM lifecycle management), and project-scoped document numbering. Features a snapshot-based cancellation cascade for project status management and restoration.
    - **EPC Execution Plan (Unified Automation)**: Automates DO/WO/PO/IO draft generation and activation at Offer-to-Project conversion with a full-auto execution pipeline orchestrator, supporting both manual and full_auto modes. Includes automated triggers for BOM creation, dispatch readiness, and billing readiness.
    - **Multi-Agent Intelligence & Automation**: Features 11 agents with conflict control, an event bus, finding management, and audit logging, providing live EPC risks and dashboards.
    - **Employee Appraisal Module**: Supports hierarchical workflow, KPI/competency scoring, increment policies, and PDF report generation.
    - **Alert Management System**: A comprehensive system with priority levels and a 3-state workflow.
    - **Security & Access Control**: Includes API security measures (SQL injection, XSS protection), TOTP-based 2FA, EPC Permission Control Dashboard (role-based, department-based, user-override), and EPC Record-Level Ownership Filtering.
    - **EPC Control Tower**: A program-level monitoring dashboard for project summaries, pipeline analysis, bottleneck identification, and risk indicators.
    - **EPC Cutover Readiness Dashboard**: Monitors migration progress, adoption of EPC features, and legacy system usage.
    - **Enterprise Document Control Framework (EDCF)**: Defines governed GCS roots, document types, and non-negotiable rules for document management, with an architecture for document registry, type registry, audit log, and access grants.
    - **GCS Governance Remediation (Rev 4 baseline — FINAL, Zero-Trust Compliant)**: Reference document: `docs/gcs-governance-rev4-closure.md`. All governed writes enforce `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/…` root (G1). Eight covered document families: DWG, QTN, INS, ECR, ECN, DSP, CO, TEMPLATE. Ten non-negotiable rules in force (G1–G10): TPEL root mandatory, one builder per family (`buildDrawingGcsPath`, `buildEpcGcsPath`, `buildEpcQtnGcsPath`, `uploadTemplateToGcs`), `assertGcsPath()` called on every path, legacy prefixes (`QMS/`, `EPC/`, `THERMOPAC_PROJECTS/`, `engineering_changes/`) blocked by guardrail, G8 controlled vocabulary enforced with HTTP 422 on all upload routes, signed URLs only, ECR/ECN require `project_id` (HTTP 422 if absent), no silent fallback on geo resolution failure. Vocabulary source of truth: `shared/gcs-label-vocabulary.ts`. Zero-Trust audit confirmed: 287/287 `epc_document_attachments` rows at TPEL paths; zero non-TPEL paths in any governed table. Any new document flow must comply with `docs/gcs-governance-rev4-closure.md` — no deviations without formal review.
    - **Agent Usage Tracker**: Local budget monitoring for Replit Agent Usage with configurable monthly/daily limits, warning thresholds at 50%/75%/90%/100%, soft-block messages, sidebar progress indicator (Superuser only), manual daily usage logging, and projected monthly cost display. Route: `/usage-tracker`, API: `/api/usage-tracker`.

## Administration GCS Governance

- **Reference document**: `docs/admin-gcs-remediation-plan-v2.md` (Rev 2 — Approved Baseline, 2026-04-14)
- **Implementation checklist**: `docs/admin-gcs-implementation-checklist.md`
- **Root**: All Administration module files must use `ADMIN/` root only. No other root is permitted for any Admin-domain upload.
- **ID rule**: Stable system-assigned IDs only in all path segments. Names, display strings, usernames, and user-entered text are never permitted in any path segment.
- **Guardrail**: `assertAdminGcsPath()` in `server/admin-guardrails.ts` must be called before every `bucket.file()` call in all Administration route files. Throws `AdminGcsPathViolation` on any blocked or malformed path.
- **Blocked legacy roots**: `Business_Trips/`, `Business_Visa/`, `visa-documents/`, `contracts/`, `compliance/`, `posh-cases/`, `legal-notices/`, `policy-templates/`, `nda-agreements/`, `exclusivity-agreements/`
- **Active modules**: Travel Documents (75 live files — migrate), Visa Records (16 live files — migrate)
- **Phase 1 IN PROGRESS (as of 2026-04-14)**: Bug fixes done; path compliance maximally applied within current schema. TEMP-P2 items remain open.
  - ✅ All 14 Legal call sites: param order, return fields, ADMIN root, entity ID in path (two-step insert), `{seq:03d}-{label}.{ext}` filename format, vocabulary validation
  - ✅ Compliance, NDA, Exclusivity: fully correct paths (permanent seq semantics, no child table needed)
  - ✅ Visa: two-step insert for createVisaRecord; `buildVisaDocumentGcsPath` + `resolveVisaLabel` in all three visa upload flows; `makePublic()` removed; signed URLs used
  - ✅ Trip: `resolveTripLabel` + `buildTripDocumentGcsPath` in `uploadTripDocument`
  - ✅ `server/admin-guardrails.ts`: `assertAdminGcsPath`, `LEGAL_LABEL_VOCAB`, `VISA_LABEL_VOCAB`, `TRIP_LABEL_VOCAB`, `resolveLegalLabelAndSeq`, `resolveVisaLabel`, `resolveTripLabel`, `buildLegalGcsPath`, `buildVisaDocumentGcsPath`, `buildTripDocumentGcsPath`
  - ⚠️ [TEMP-P2] seq increment blocked for: Contracts, POSH, Notices, PolicyTemplates, Visa, Trip — requires Phase 2 child tables (contract_documents, posh_documents, notice_documents, visa_documents; seq column on trip_documents)
- **Broken modules** (all now write to ADMIN/ root with `{entityId}/{seq:03d}-{label}.{ext}` format — seq fixed at 001 for TEMP-P2 modules): Legal Contracts, Compliance Register, POSH Cases, Legal Notices, Policy Templates, NDA Agreements, Exclusivity Agreements, Visa secondary upload
- **Future modules**: Trip Expenses, Leave Attachments, Payslips, Loans, Advances, Investment Proofs, Statutory Challans, Advance Tax, Appraisal Letters
- **Not-needed modules** (no GCS): Attendance, Payroll compute, Tax Declarations, DWAR, Schengen, Work Locations, Permissions, 2FA, Notifications

# External Dependencies
- **Google Cloud Services**: Google Cloud Storage, Google Calendar API, Google OAuth 2.0, Google Custom Search JSON API.
- **Database Services**: Neon (PostgreSQL hosting).
- **Third-Party Libraries**: SendGrid, PDF-lib, Stripe, Radix UI, Lucide React, date-fns, TanStack Query, Wouter, React Hook Form, Zod, Vite, Drizzle ORM, Multer, bcrypt, nodemailer, ExcelJS (replaced vulnerable xlsx@0.18.5), jsPDF, chart.js, mssql, OpenAI GPT-4o, otpauth, jsonwebtoken, qrcode, express-rate-limit.