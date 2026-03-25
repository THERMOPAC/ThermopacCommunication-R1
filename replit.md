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
- **Error Handling Framework**: Centralized, structured error handling across the system:
    - **Backend**: `server/utils/app-errors.ts` defines error classes (`ValidationError`, `PermissionError`, `NotFoundError`, `BusinessRuleError`, `IntegrationError`, `AuthenticationError`). `server/utils/error-response.ts` provides helper functions (`sendError`, `sendValidationError`, `sendNotFound`, `sendPermissionError`, `sendBusinessError`). `server/utils/error-middleware.ts` provides the global Express error handler. All API errors follow a standard JSON format: `{ success: false, errorCode, message, details?, action? }`. Raw SQL/stack traces are never exposed to users; `wrapUnknownError()` auto-classifies database constraint violations, timeouts, etc.
    - **Frontend**: `client/src/lib/queryClient.ts` exports `ApiError` class, `getErrorMessage(error)`, `getErrorDetails(error)`, and `getErrorAction(error)` for structured error display. Use `getErrorMessage(e)` in `onError` callbacks instead of `e.message`.
- **Data Storage**: PostgreSQL on Neon, a dedicated GCS bucket (`thermopac_storage`) for files, and database-backed sessions.
- **Feature Specifications**:
    - **Project Management**: Tracks projects, items, and work orders.
    - **Quality Management**: Manages inspection orders, material identification, welder management, and welding procedures.
    - **Production Management**: Generates work orders and assigns resources.
    - **Finance Management**: Handles invoicing, payments, allocations, BRC tracking, GL Mapping, Statutory Compliance (TDS, PF, ESIC, PT), and Company Income Tax Compliance. Includes a two-phase reconciliation for TDS.
    - **HR Management**: Provides user management, attendance tracking with regularization, daily work activity reports (DWAR), and an enhanced payroll engine supporting dual tax regimes, tax declarations, and investment proof verification. Payroll follows a status-based workflow with audit trails. Statutory applicability is managed by a central rule engine.
    - **DWAR Daily Work Indicators**: DWAR scores are classified as operational indicators / daily work signals, NOT formal appraisal KPIs. UI section labeled "Daily Work Indicators" with explicit disclaimer. Five indicators: (1) Productivity = weighted completion ratio using priority weights (High=3, Medium=2, Low=1); (2) Quality = system score: (CompletionAccuracy×0.4)+(FollowThrough×0.4)+(LogQuality×0.2), manager can optionally override, LogQuality checks description>10chars + time>0 + valid priority + tomorrow plans filled, FollowThrough defaults to 50 (neutral fallback) when no prior-day plan exists; (3) Efficiency = weightedCompleted/hoursWorked×10, capped at 100; (4) Collaboration = primary signal from `collaborative` boolean on activities (weight 1.0), keyword fallback when flag absent (weight 0.5); (5) Follow-Through = keyword matching of yesterday plans vs today activities (40% threshold). Activities have `collaborative` boolean in JSONB. Tomorrow's Plan has specific description guidance, soft >5 task warning, re-add hint. DWAR indicators fully separated from Appraisal KPIs — no data connection.
    - **Loan & Advance Management**: Manages employee loans and salary advances, integrated into payroll deductions.
    - **Document Management**: Integrates with GCS for hierarchical storage, metadata tracking, templates, and access control.
    - **Sales & Marketing**: Features AI-powered lead generation, a product database, and an offer/quotation module.
    - **Google Ads Integration**: Direct integration via Google Ads API for campaign and metric synchronization.
    - **Global Re-Refining Opportunity Radar**: System for discovering and classifying waste oil recyclers using multilingual crawling and AI.
    - **Business Intelligence**: Utilizes an LLM Prompt Engine for analytics.
    - **Travel Management**: Manages business trips and visas.
    - **Design Management**: Provides a Drawing Registry for version control, CAD file management, and review/approval workflows.
    - **SAP B1 Integration**: Full integration for Purchase Module (dashboard, quotations, orders, goods receipt, invoices) with real-time sync, and Customer/Business Partner sync. All SAP data is live. GRPO creation is gated by specific conditions. Search functionality is optimized to prevent excessive SAP API calls.
    - **Email Management System**: AI-powered Gmail integration for intelligent priority classification, analysis, and multi-style reply generation.
    - **Multi-Agent Intelligence & Automation Layer**: Features 11 agents: 9 business agents, a Master Control Agent for governance, and an Advisor Agent for executive decision support. Includes conflict control, an event bus, finding management, and an audit logger. Agents use a dynamic, policy-based escalation framework.
    - **Task Auto-Archive Maintenance Job**: Daily cron job to archive completed tasks older than 30 days.
    - **Employee Appraisal Module**: Standalone module with a L1→L2→L3 hierarchy-based workflow, supporting appraisal cycles, KPI and competency scoring, increment policies, and L3 decision support with system recommendations. Includes a KPI Template Library, audit trail for changes, and a PDF Final Report generator (`GET /api/appraisals/:id/report`) available for approved/closed appraisals with server-side access control.
    - **Alert Management System**: A full alert system with priority levels, categories, and a 3-state workflow.
    - **API Security**: Implements measures against SQL injection, XSS, authentication middleware, and secure credential management.

# External Dependencies
- **Google Cloud Services**: Google Cloud Storage, Google Calendar API, Google OAuth 2.0, Google Custom Search JSON API.
- **Database Services**: Neon (PostgreSQL hosting).
- **Third-Party Libraries**: SendGrid, PDF-lib, Stripe, Radix UI, Lucide React, date-fns, TanStack Query, Wouter, React Hook Form, Zod, Vite, Drizzle ORM, Multer, bcrypt, nodemailer, XLSX, jsPDF, chart.js, mssql, OpenAI GPT-4o.