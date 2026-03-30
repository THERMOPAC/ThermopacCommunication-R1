# Overview
This project is a comprehensive Quality Management System (QMS) for THERMOPAC, designed to streamline operations, enhance efficiency, and provide enterprise-grade insights across various business modules. It supports project management, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. The system aims to drive data-driven decisions, offer advanced sales and marketing features with AI-powered lead generation, integrate with Google Ads, provide a global re-refining opportunity radar, and incorporate a multi-agent intelligence layer for proactive business management, ultimately securing a competitive edge.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture
## Core Architectural Decisions
The system is a full-stack web application built with organized, hierarchical data structures, ensuring consistent UI/UX through standardized components, robust data integrity, and real-time synchronization. It features role-based access control, comprehensive validation, and dialog-based editing with form pre-population. Google Cloud Storage (GCS) is the single source of truth for file metadata, with the database storing only GCS keys. Security is managed via signed URLs, and client-side caching optimizes performance. UI/UX emphasizes consistent color schemes, card-based layouts, unified dropdowns, and branded professional report generation.

## Technical Implementations
- **Backend**: Express.js with TypeScript, PostgreSQL (Drizzle ORM), session-based authentication, Google Cloud Storage, and a RESTful API.
- **Frontend**: React with TypeScript, Wouter for routing, TanStack Query for state management, Radix UI components with Tailwind CSS, React Hook Form with Zod validation, and Vite for builds. Lazy loading is implemented for module files.
- **Error Handling Framework**: Centralized, structured error handling on both backend (error classes, helper functions, global Express handler) and frontend (ApiError class, structured message extraction). Errors follow a standard JSON format and raw SQL/stack traces are never exposed.
- **Data Storage**: PostgreSQL on Neon, a dedicated GCS bucket (`thermopac_storage`) for files, and database-backed sessions.
- **Feature Specifications**:
    - **Project Management**: Tracks projects, items, and work orders.
    - **Quality Management**: Manages inspection orders, material identification, welder management, and welding procedures.
    - **Production Management**: Generates work orders and assigns resources.
    - **Finance Management**: Handles invoicing, payments, allocations, BRC tracking, GL Mapping, Statutory Compliance (TDS, PF, ESIC, PT), and Company Income Tax Compliance, including two-phase TDS reconciliation.
    - **HR Management**: Provides user management, attendance tracking with regularization, daily work activity reports (DWAR), and an enhanced payroll engine supporting dual tax regimes, tax declarations, and investment proof verification. Includes a shared attendance status engine, attendance status source tracking, no-show row generation, late arrival/early departure flags, and original punch data preservation.
    - **DWAR Daily Work Indicators**: Provides operational indicators (Productivity, Quality, Efficiency, Collaboration, Follow-Through) based on activity tracking, separate from appraisal KPIs.
    - **Loan & Advance Management**: Manages employee loans and salary advances, integrated into payroll deductions.
    - **Document Management**: Integrates with GCS for hierarchical storage, metadata tracking, templates, and access control.
    - **Sales & Marketing**: Features AI-powered lead generation, a product database, and an offer/quotation module.
    - **Google Ads Integration**: Direct integration via Google Ads API for campaign and metric synchronization.
    - **Global Re-Refining Opportunity Radar**: System for discovering and classifying waste oil recyclers using multilingual crawling and AI.
    - **Business Intelligence**: Utilizes an LLM Prompt Engine for analytics.
    - **Travel Management**: Manages business trips and visas.
    - **Design Management**: Provides a Drawing Registry for version control, CAD file management, and review/approval workflows.
    - **EPC Drawing Control Layer**: Upstream governance layer linking design drawings to project items with a defined lifecycle. Supports revision control (revision_code A→B→...Z→AA, is_current flag, partial unique index).
    - **EPC BOM Control Layer**: Bill of Materials governance linked to drawing controls and master items, with support for various BOM types, lifecycle management, and revision control matching DWG model.
    - **EPC Coding & Numbering Standard (v3)**: Project-scoped operational codes (`TP-{continent}-{country}-{customer_short_code}-{YYZZ}-{seq}`) and document numbers (`{operational_code}-{DOC_TYPE}-{seq}`) for all 16 EPC doc types (PLN, BUY, MFG, QPL, POP, WOP, DWG, BOM, PO, WO, INS, DR, DSP, CR, BR, INV). Generation logic in `server/epc-coding.ts`. Customer `short_code` is immutable once set. DWG and BOM use revision model (same doc number + incrementing revision_code); all other types use supersede/cancel lifecycle. All sequences generated inside `db.transaction()` with UNIQUE constraints as safety net.
    - **EPC Document Attachment & Retrieval System**: GCS-backed file storage for all 16 EPC doc types with database as document control layer. GCS path: `EPC/{op_code}/{TYPE}/{doc_number}/rev-{code_or_na}/{seq}-{label}.{ext}`. Features: upload with SHA-256 duplicate detection, context-aware download (procurement/manufacturing/inspection/general contexts for DWG/BOM), signed URL or binary stream delivery, revision-grouped listing, full audit history, withdraw/reinstate lifecycle (no hard deletes), access logging (GM/Superuser only). Supersession cascade: when DWG/BOM revision is superseded, all active attachments on the old revision are automatically marked superseded. Routes in `server/epc-document-routes.ts`, utilities (`buildEpcGcsPath`, `resolveContextualRevision`, `REVISION_CONTROLLED_TYPES`) in `server/epc-coding.ts`. Tables: `epc_document_attachments`, `epc_document_access_log`.
    - **SAP B1 Integration**: Full integration for Purchase Module (dashboard, quotations, orders, goods receipt, invoices) and Customer/Business Partner sync, with real-time data and optimized search.
    - **Email Management System**: AI-powered Gmail integration for intelligent priority classification, analysis, and multi-style reply generation.
    - **Multi-Agent Intelligence & Automation Layer**: Features 11 agents (9 business, Master Control, Advisor) with conflict control, event bus, finding management, and audit logging, utilizing a dynamic, policy-based escalation framework.
    - **L1 Worker Agents Dashboard**: Event-driven L1 worker layer for real-time human action validation (task quality, DWAR presubmit, leave overlap, appraisal chain).
    - **Live EPC Risks Dashboard**: Read-only monitoring dashboard for `epc_agent_findings` with summary statistics, various tabs, filters, and linked task display.
    - **Task Auto-Archive Maintenance Job**: Daily cron job to archive completed tasks.
    - **Employee Appraisal Module**: Standalone module with a hierarchical workflow, supporting appraisal cycles, KPI/competency scoring, increment policies, and L3 decision support. Includes a KPI Template Library and PDF Final Report generation.
    - **Alert Management System**: A full alert system with priority levels, categories, and a 3-state workflow.
    - **API Security**: Implements measures against SQL injection, XSS, authentication middleware, and secure credential management.
    - **Two-Factor Authentication (2FA)**: TOTP-based 2FA with JWT challenge tokens, AES-256-GCM encrypted secrets, bcrypt-hashed recovery codes, rate limiting, and OTP lockout. Enforced for critical roles.

# External Dependencies
- **Google Cloud Services**: Google Cloud Storage, Google Calendar API, Google OAuth 2.0, Google Custom Search JSON API.
- **Database Services**: Neon (PostgreSQL hosting).
- **Third-Party Libraries**: SendGrid, PDF-lib, Stripe, Radix UI, Lucide React, date-fns, TanStack Query, Wouter, React Hook Form, Zod, Vite, Drizzle ORM, Multer, bcrypt, nodemailer, XLSX, jsPDF, chart.js, mssql, OpenAI GPT-4o, otpauth, jsonwebtoken, qrcode, express-rate-limit.