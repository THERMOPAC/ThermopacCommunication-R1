# Overview
This project is a comprehensive Quality Management System (QMS) for THERMOPAC, designed to streamline operations, enhance efficiency, and provide enterprise-grade insights across various business modules. It supports project management, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. The system aims to drive data-driven decisions, offer advanced sales and marketing features with AI-powered lead generation, integrate with Google Ads, provide a global re-refining opportunity radar, and incorporate a multi-agent intelligence layer for proactive business management, ultimately securing a competitive edge.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture
## Core Architectural Decisions
The system is a full-stack web application built with organized, hierarchical data structures, ensuring consistent UI/UX through standardized components, robust data integrity, and real-time synchronization. It features role-based access control, comprehensive validation, and dialog-based editing with form pre-population. Unique IDs are auto-generated. Google Cloud Storage (GCS) is the single source of truth for file metadata, with the database storing only GCS keys. Security is managed via signed URLs, and client-side caching optimizes performance.

## Technical Implementations
- **Backend**: Express.js with TypeScript, PostgreSQL (Drizzle ORM), session-based authentication, Google Cloud Storage, and a RESTful API.
- **Frontend**: React with TypeScript, Wouter for routing, TanStack Query for state management, Radix UI components with Tailwind CSS, React Hook Form with Zod validation, and Vite for builds.
- **Data Storage**: PostgreSQL on Neon, a dedicated GCS bucket (`thermopac_storage`) for files, and database-backed sessions.
- **UI/UX Decisions**: Consistent color schemes (blue, green, red, yellow/orange), hierarchical card-based layouts, unified dropdowns, consistent table structures, professional dialogs, standardized file upload/replacement workflows, and branded professional report generation (PDF/Excel).
- **Feature Specifications**:
    - **Project Management**: Tracks projects, items, and work orders.
    - **Quality Management**: Manages inspection orders (Visual, NDT, Weld, Hydrotest, NCR, Shop), material identification, welder management, and welding procedures.
    - **Production Management**: Generates work orders and assigns resources.
    - **Finance Management**: Handles invoicing, payments, allocations, BRC tracking, GL Mapping, and Statutory Compliance (TDS, PF, ESIC, PT) with future multi-entity support. Includes a comprehensive Company Income Tax Compliance module for estimates, advance tax, provisions, and returns.
    - **HR Management**: Provides user management, attendance tracking with regularization workflows, daily work activity reports, and an enhanced payroll engine supporting dual tax regimes, tax declarations, and investment proof verification.
    - **Loan & Advance Management**: Manages the full lifecycle of employee loans and salary advances, integrated into payroll deductions with priority and minimum take-home protection.
    - **Document Management**: Integrates with GCS for hierarchical storage, metadata tracking, template systems, and access control.
    - **Sales & Marketing**: Features AI-powered lead generation (GPT-4o, website crawling), a product database with attribute-based codes, and an offer/quotation module.
    - **Google Ads Integration**: Direct integration via Google Ads API v18 for campaign, ad group, keyword, and metric synchronization.
    - **Global Re-Refining Opportunity Radar**: A system for discovering and classifying waste oil recyclers using multilingual crawling and AI, with opportunity scoring and alerts.
    - **Business Intelligence**: Utilizes an LLM Prompt Engine for analytics.
    - **Travel Management**: Manages business trips and visas.
    - **Design Management**: Provides a Drawing Registry for version control, CAD file management, and review/approval workflows.
    - **SAP B1 Integration**: Full integration for Purchase Module (dashboard, quotations, orders, goods receipt, invoices) with real-time sync, and Customer/Business Partner sync to SAP B1 Service Layer.
    - **Email Management System**: AI-powered Gmail integration for intelligent priority classification, analysis, and multi-style reply generation.
    - **Multi-Agent Intelligence & Automation Layer**: Features 8 agents (Project Control, Predictive Project Control, Communications, Finance Control, Executive MIS, Sales & Marketing, Production Management, Quality Management) with conflict control, an event bus, finding management, insight/recommendation management, and an audit logger. Agents use a dynamic, policy-based escalation framework.
    - **TaskAutoArchive Maintenance Job**: A daily cron job that archives completed tasks older than 30 days, using `is_archived` as a visibility flag.
    - **Alert Management System**: A full alert system with priority levels, categories, and a 3-state workflow (new → seen → acknowledged), integrated with various modules.
    - **API Security**: Implements measures against SQL injection, XSS, authentication middleware, and secure credential management.

# External Dependencies
- **Google Cloud Services**: Google Cloud Storage, Google Calendar API, Google OAuth 2.0, Google Custom Search JSON API.
- **Database Services**: Neon (PostgreSQL hosting).
- **Third-Party Libraries**: SendGrid, PDF-lib, Stripe, Radix UI, Lucide React, date-fns, TanStack Query, Wouter, React Hook Form, Zod, Vite, Drizzle ORM, Multer, bcrypt, nodemailer, XLSX, jsPDF, chart.js, mssql, OpenAI GPT-4o.