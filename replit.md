# Overview
This project is a comprehensive Quality Management System (QMS) designed for THERMOPAC, a manufacturing and engineering company. Its primary purpose is to streamline operations, enhance efficiency, and provide enterprise-grade insights across various business modules, including project management, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. The system aims to drive data-driven decisions and operational improvements, securing a competitive edge in the market. Key capabilities include advanced sales and marketing features with AI-powered lead generation, Google Ads integration, a global re-refining opportunity radar, and a multi-agent intelligence and automation layer for proactive business management.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture
## Core Architectural Decisions
The system is a full-stack web application built on organized, hierarchical data structures, prioritizing consistent UI/UX through standardized component usage, robust data integrity, and real-time synchronization. It implements role-based access control, comprehensive validation systems, and dialog-based editing with pre-population for forms. Unique IDs are auto-generated for entities. All file metadata is managed through Google Cloud Storage (GCS) as the single source of truth, with the database storing only GCS keys and UI displaying GCS-derived file details. Security relies on signed URLs, and client-side caching is used for performance.

## Technical Implementations
- **Backend**: Express.js with TypeScript, PostgreSQL database (Drizzle ORM), session-based authentication, Google Cloud Storage (GCS) for file storage, and a RESTful API.
- **Frontend**: React with TypeScript, Wouter for routing, TanStack Query for state management, Radix UI components with Tailwind CSS, React Hook Form with Zod validation, and Vite for builds.
- **Data Storage**: PostgreSQL on Neon (serverless) for primary data, a dedicated GCS bucket (`thermopac_storage`) for files, and database-backed sessions.
- **UI/UX Decisions**: Consistent color schemes (blue, green, red, yellow/orange), standardized hierarchical display using card-based layouts, unified dropdowns, consistent table layouts, and professional dialogs. Standardized file upload/replacement workflows and professional report generation (PDF/Excel) with branding.

## Feature Specifications
- **Project Management**: Tracking projects, items, and work orders.
- **Quality Management**: Inspection orders (Visual, NDT, Weld, Hydrotest, NCR, Shop), material identification, welder management, and welding procedure documents.
- **Production Management**: Work order generation and resource assignment.
- **Finance Management**: Invoicing, payments, allocations, and BRC tracking.
- **HR Management**: User management, attendance, daily work activity reports, and payroll.
- **Document Management**: GCS integration, hierarchical structure, metadata tracking, template system, and access control.
- **Sales & Marketing**:
    - **Lead Generation**: AI-powered system (GPT-4o, website crawling) for company classification, 5-factor scoring, duplicate detection, and CSV export.
    - **Product Database**: Attribute-based product codes, parent-child hierarchy, and offer/quotation module (auto-numbered, multi-currency, line items, discounts, revision tracking, status workflow).
- **Google Ads Integration**: Direct Google Ads API v18 integration via REST, full OAuth 2.0 flow, and a sync engine for campaigns, ad groups, keywords, and metrics.
- **Global Re-Refining Opportunity Radar**: Comprehensive waste oil recycler discovery and intelligence system. Features include multilingual discovery, controlled website crawling, AI classification, project signal detection, evidence-based confidence scoring, opportunity scoring, deduplication, and an alert engine.
- **Business Intelligence**: LLM Prompt Engine for analytics.
- **Travel Management**: Business trip and visa management.
- **Design Management**: Drawing Registry for version control, CAD file management, review/approval workflows, and transmittals.
- **SAP B1 Integration**: Full integration for Purchase Module (dashboard, quotations, orders, goods receipt, invoices) with real-time sync and error handling. Customer/Business Partner sync to SAP B1 Service Layer.
- **Email Management System**: AI-powered Gmail integration for intelligent priority classification, parallel processing, real-time sync, full HTML display, AI analysis, multi-style reply generation, and bulk actions.
- **Multi-Agent Intelligence & Automation Layer**: An intelligence layer with 8 agents: Project Control, Predictive Project Control, Communications, Finance Control, Executive MIS, Sales & Marketing, Production Management, and Quality Management. Features include conflict control, event bus, finding management with deduplication, insight/recommendation management with policy-based approval, and an audit logger. Quality Management Agent covers 5 control groups (Q1 Inspection, Q2 Calibration, Q3 Welding Qualification, Q4 Document/Procedure, Q5 Material Traceability) with 5-category finding classification (compliance_risk, operational_risk, master_data_hygiene, traceability_gap, document_control_gap), 4-level dynamic escalation (Entity Owner → Production Manager → Project Manager → GM), and 3 task patterns (single-entity, project-summary, escalation-summary). Agents operate in an observe-only capacity in Phase 1.
- **Task Closure & Verification Framework**: Prevents false task closures with a structured verification workflow. High/Critical priority tasks and agent-generated tasks require independent verification (verifier ≠ assignee). Features include: "Submit for Verification" workflow with evidence collection (6 evidence types), manager/creator verification with approve/reject actions, closure attempt tracking with auto-escalation after 3 failed attempts, verification audit trail via task_history, and a `task_verification_evidence` table for evidence records. Low/Medium tasks auto-verify on completion. Status flow: pending → in_progress → pending_verification → completed (verified) or back to in_progress (rejected).
- **API Security**: Measures against SQL injection, XSS, authentication middleware, and secure credential management.

# External Dependencies
- **Google Cloud Services**: Google Cloud Storage, Google Calendar API, Google OAuth 2.0, Google Custom Search JSON API.
- **Database Services**: Neon (PostgreSQL hosting).
- **Third-Party Libraries**: SendGrid, PDF-lib, Stripe, Radix UI, Lucide React, date-fns, TanStack Query, Wouter, React Hook Form, Zod, Vite, Drizzle ORM, Multer, bcrypt, nodemailer, XLSX, jsPDF, chart.js, mssql, OpenAI GPT-4o.