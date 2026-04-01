# Overview
This project is a comprehensive Quality Management System (QMS) for THERMOPAC, designed to streamline operations, enhance efficiency, and provide enterprise-grade insights. It supports core business modules including project management, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. The system aims to drive data-driven decisions, offer advanced sales and marketing features with AI-powered lead generation, integrate with Google Ads, provide a global re-refining opportunity radar, and incorporate a multi-agent intelligence layer for proactive business management.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture
## Core Architectural Decisions
The system is a full-stack web application with organized, hierarchical data structures, ensuring consistent UI/UX through standardized components, robust data integrity, and real-time synchronization. It features role-based access control, comprehensive validation, and dialog-based editing with form pre-population. Google Cloud Storage (GCS) is the single source of truth for file metadata, with the database storing only GCS keys. Security is managed via signed URLs, and client-side caching optimizes performance. UI/UX emphasizes consistent color schemes, card-based layouts, unified dropdowns, and branded professional report generation.

## Technical Implementations
- **Backend**: Express.js with TypeScript, PostgreSQL (Drizzle ORM), session-based authentication, Google Cloud Storage, and a RESTful API.
- **Frontend**: React with TypeScript, Wouter for routing, TanStack Query for state management, Radix UI components with Tailwind CSS, React Hook Form with Zod validation, and Vite for builds. Lazy loading is implemented for module files.
- **Error Handling**: Centralized, structured error handling on both backend (error classes, global Express handler) and frontend (ApiError class). Errors follow a standard JSON format without exposing raw SQL/stack traces.
- **Data Storage**: PostgreSQL on Neon, a dedicated GCS bucket for files, and database-backed sessions.
- **Key Modules & Features**:
    - **Project & Quality Management**: Tracks projects, items, work orders, inspection orders, material identification, welder management, and welding procedures.
    - **Finance & HR Management**: Handles invoicing, payments, allocations, BRC tracking, GL Mapping, Statutory Compliance, two-phase TDS reconciliation, user management, attendance tracking with regularization, DWAR, and an enhanced payroll engine supporting dual tax regimes, tax declarations, and investment proof verification. Includes loan and advance management.
    - **Document Management**: Integrates with GCS for hierarchical storage, metadata tracking, templates, and access control. Includes Drawing Registry for version control, CAD management, and review workflows; and EPC Document Attachment & Retrieval with GCS-backed storage, SHA-256 duplicate detection, contextual download, revision-grouped listing, and audit history.
    - **Sales & Marketing**: AI-powered lead generation, product database, offer/quotation module, and Google Ads integration.
    - **EPC Control Layers**:
        - **EPC Drawing Control Layer**: Upstream governance linking design drawings to project items with revision control (A→Z→AA).
        - **EPC BOM Control Layer**: Bill of Materials governance linked to drawing controls and master items, supporting various BOM types and lifecycle management (Draft → Locked).
        - **EPC Coding & Numbering Standard**: Project-scoped operational codes and document numbers for 16 EPC document types, with specific generation logic and revision/supersede models.
    - **Multi-Agent Intelligence & Automation**: Features 11 agents with conflict control, event bus, finding management, and audit logging. Includes an L1 Worker Agents Dashboard and a Live EPC Risks Dashboard.
    - **Employee Appraisal Module**: Hierarchical workflow, KPI/competency scoring, increment policies, L3 decision support, and PDF report generation.
    - **Alert Management System**: Full alert system with priority levels and a 3-state workflow.
    - **Security & Access Control**: API Security (SQL injection, XSS protection), TOTP-based Two-Factor Authentication (2FA), EPC Permission Control Dashboard (production-ready, locked — see architecture below), EPC Page-Level Permission Control (role + department based access with user overrides), EPC Project Membership Enforcement (record-level visibility via project membership), and EPC Record-Level Ownership Filtering (fine-grained record visibility within projects based on ownership scope). Includes Access Denied Audit Logging and Permission Change Audit Trail.

### EPC Permission Control Dashboard — Final Architecture (Production-Ready, Locked)
**Status**: Production-approved. Do not expand scope or refactor unless specifically requested.

**Phase 1 — Visibility & Intelligence** (read-only):
- Full RBAC matrix: pages × roles, actions × roles, data visibility rules
- Role simulation (view-as any role)
- Gap/finding tracker with severity classification
- Department × Page access matrix (live view from `department_page_permissions`)
- Per-user override management (`page_permissions`)

**Phase 2 — Editable Control + Approval Workflow + Audit Trail**:
- **Edit Mode** (Superuser only): queues permission changes as batch change requests instead of applying immediately. Unsaved changes warning dialog on exit.
- **Approval workflow**: Pending → Approved (by different user, self-approval blocked) → Applied. Batch-level approve/reject. Rejection requires reason.
- **Emergency override**: Superuser-only, skips pending state, requires reason, fully audit-logged.
- **Snapshots & rollback**: Auto-snapshot before apply, manual snapshot capture, Superuser-only restore with pre-restore backup.
- **Audit trail**: Permanent log for all actions (create, approve, reject, apply, rollback, emergency_override, snapshot, direct_change). Paginated, filterable, CSV-exportable.
- **Transactional integrity**: All permission-changing operations (create, approve, reject, apply, restore) run inside `db.transaction()`. Audit writes are inside the transaction for critical operations — if audit fails, the permission change rolls back.
- **Pending matrix indicator**: Matrix cells with pending change requests show orange highlight + clock icon.

**Emergency Direct-Change Path** (bypass approval workflow):
- Restricted to **Superuser only** (not General Manager).
- Mandatory `auditReason` field — request rejected without it.
- Logged as `direct_change` in audit trail with full details (endpoint, reason, previous/new value).
- Runs inside `db.transaction()` — audit write failure rolls back the change.
- Endpoints: `PUT /api/page-permissions/department-matrix`, `PUT /api/page-permissions/user-override`, `DELETE /api/page-permissions/user-override`.

**DB Tables**: `permission_change_requests`, `permission_snapshots`, `permission_audit_log` (all additive — no existing tables modified).
**Backend**: `server/epc-permission-routes.ts` (10 endpoints), `server/module-permission-routes.ts` (3 restricted direct endpoints).
**Frontend**: `client/src/pages/epc-permission-dashboard.tsx` (PageAccessControlTab, ChangeRequestsTab, AuditHistoryTab, SnapshotsPanel).

# External Dependencies
- **Google Cloud Services**: Google Cloud Storage, Google Calendar API, Google OAuth 2.0, Google Custom Search JSON API.
- **Database Services**: Neon (PostgreSQL hosting).
- **Third-Party Libraries**: SendGrid, PDF-lib, Stripe, Radix UI, Lucide React, date-fns, TanStack Query, Wouter, React Hook Form, Zod, Vite, Drizzle ORM, Multer, bcrypt, nodemailer, XLSX, jsPDF, chart.js, mssql, OpenAI GPT-4o, otpauth, jsonwebtoken, qrcode, express-rate-limit.