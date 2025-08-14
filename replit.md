# Overview
This project is a comprehensive Quality Management System (QMS) designed for THERMOPAC, a manufacturing and engineering company. Its primary purpose is to streamline operations and provide enterprise-grade insights across various business modules, including project management, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. The system aims to facilitate data-driven decisions and operational improvements.

## Recent Changes (August 2025)
- **Vacuum Pump Sizing Tool**: Added comprehensive engineering calculator with accurate physics-based formulas to Design Tools → Mechanical Design tab. Features corrected time-based speed calculation (St = (V/t_sec) × ln(p1/p2)) and proper unit conversion (L/s × 3.6 = m³/h)
- **SAP B1 Integration**: Fixed CommonJS import errors, improved error handling, increased timeout values (30s HTTPS, 25s HTTP, 20s public IP fallback), and added public IP fallback connectivity (59.152.52.58) for cloud deployment scenarios

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture
## Core Architectural Decisions
The system is a full-stack web application that prioritizes organized, hierarchical data structures, particularly for document management and project items. It emphasizes consistent UI/UX through standardized component usage, robust data integrity, and real-time synchronization across modules. Role-based access control governs feature visibility, and comprehensive validation systems ensure data quality. Form design utilizes dialog-based editing with pre-population and clear visual indicators. Automated generation manages unique IDs for various entities.

## Technical Implementations
- **Backend**: Express.js with TypeScript, PostgreSQL database (Drizzle ORM), session-based authentication, Google Cloud Storage (GCS) for file storage, and a RESTful API.
- **Frontend**: React with TypeScript, Wouter for routing, TanStack Query for state management, Radix UI components with Tailwind CSS, React Hook Form with Zod validation, and Vite for builds.
- **Data Storage**: PostgreSQL on Neon (serverless) for primary data, a dedicated GCS bucket (`thermopac_storage`) for files, and database-backed sessions.
- **UI/UX Decisions**:
    - **Color Schemes**: Consistent use of blue (primary), green (success), red (destructive/warnings), and yellow/orange (warnings/pending).
    - **Templates**: Standardized hierarchical display for project items and work orders using card-based layouts with color-coded badges.
    - **Design Approaches**: Unified dropdowns with role-based grouping and alphabetical sorting, consistent table layouts with streamlined action columns, and professional dialogs.
    - **File Management**: Standardized upload/replacement workflows with GCS integration and user feedback.
    - **Reporting**: Professional PDF and Excel report generation with branded formatting and visual analytics.

## Feature Specifications
- **Project Management**: Tracking of projects, items, and work orders with hierarchical organization.
- **Quality Management**: Management of various inspection orders (Visual, NDT, Weld, Hydrotest, NCR, Shop), material identification, welder management, and welding procedure documents (WPS/PQR/WPQR).
- **Production Management**: Work order generation and resource assignment.
- **Finance Management**: Invoicing, payments, allocations, and BRC tracking.
- **HR Management**: User management, attendance tracking, daily work activity reports, and payroll.
- **Document Management**: GCS integration with hierarchical structure, metadata tracking, template system, and access control.
- **Sales & Marketing**: Management of leads, campaigns, and customers.
- **Business Intelligence**: An LLM Prompt Engine with specialized prompts for various modules (Meetings, Finance, Project Management, HR, etc.), providing real-time analytics and actionable insights.
- **Travel Management**: Business trip and visa management, including EU 180-day rule compliance.
- **Design Management**: Drawing Registry for version control and CAD file management, review/approval workflows, and drawing transmittals.
- **API Security**: Measures to prevent SQL injection and XSS vulnerabilities, proper authentication middleware, and secure credential management.

# External Dependencies
- **Google Cloud Services**: Google Cloud Storage (`thermopac_storage`), Google Calendar API, Google OAuth 2.0.
- **Database Services**: Neon (PostgreSQL hosting).
- **Third-Party Libraries**: SendGrid (email), PDF-lib (PDF generation), Stripe (payment processing), Radix UI (components), Lucide React (icons), date-fns (date manipulation), TanStack Query (state management), Wouter (routing), React Hook Form & Zod (forms/validation), Vite (build tool), Drizzle ORM, Multer (file uploads), bcrypt (hashing), nodemailer (email), XLSX (Excel generation), jsPDF (PDF generation), chart.js (charts), mssql (SAP B1 connectivity).