# Overview
This is a comprehensive Quality Management System (QMS) for THERMOPAC, a manufacturing and engineering company. The system manages projects, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. It aims to provide enterprise-grade insights and streamline operations across various business modules, enabling data-driven decisions and operational improvements.

# User Preferences
Preferred communication style: Simple, everyday language.

# Recent Changes
## August 7, 2025 - Enhanced Data Integrity & Relevance Protocol Implementation COMPLETED
- **Universal Rule Applied**: All LLM prompts must indicate data unavailability OR irrelevance rather than generating fabricated content
- **Relevance Validation**: Enhanced protocol to detect when data exists but is not relevant to the specific analysis
- **Template Enhancement**: Added DATA INTEGRITY PROTOCOL section to all 19 active LLM prompt templates with relevance checking
- **Error Handling Standardization**: Implemented consistent error responses for no data, empty data, and irrelevant data scenarios
- **Data Validation**: Enhanced llm-prompt-engine.ts to detect empty/null/irrelevant data and provide appropriate error messages
- **Fabrication Prevention**: System-wide prohibition against generating placeholder, fictional, or speculative content
- **Relevance Standards**: Never force analysis using irrelevant or inappropriate data, even if data exists
- **Professional Error Messages**: Clear indication of data limitations with actionable recommendations
- **Quality Assurance**: All prompts now maintain strict authenticity AND relevance standards

## August 7, 2025 - LLM Prompt ID 8 Data Pipeline Fix COMPLETED
- **Critical Issue Identified**: Data pipeline break between database query and LLM processing layer
- **Root Cause**: preparePromptData function missing specific handling for PENDING_COMMITMENTS data structure
- **Pipeline Fix**: Added Meeting Efficiency data recognition in preparePromptData function (lines 230-253)
- **Data Validation Enhanced**: Added validation for commitment data completeness (meeting_title, assigned_to, commitment_description)
- **Data Integrity Protocol**: Implemented "DATA UNAVAILABLE" response when no authentic data found (instead of generating fake examples)
- **Template Updated**: Enhanced to explicitly reject fictional examples (jsmith, adoe, bwhite) and mandate real THERMOPAC employee names
- **Verification Complete**: 10 real pending commitments confirmed in database (Jawahar: 4, Rohan: 3, Pallab: 1, Sanjeev: 2)
- **Error Handling**: System now indicates data limitations rather than generating placeholder content
- **Output Format GUARANTEED**: Clean list format: "Meeting Name: [title] – [date], Commitment: [description], Assigned To: [person], Status: Pending"
- **Data Flow FIXED**: Database → Query validation → Data processing → Template enforcement → Authentic output
- **System Architecture**: Data-driven foundation → LLM intelligence layer → Superuser monitoring → Task assignment to system users

# System Architecture
## Core Architectural Decisions
- Full-stack web application.
- Prioritizes organized, hierarchical data structures, especially for document management and project items.
- Focuses on consistent UI/UX with standardized component usage.
- Emphasizes data integrity and real-time synchronization across related modules.
- Utilizes role-based access control for feature visibility and functionality.
- Implements comprehensive validation systems for data quality.
- Design patterns for forms include dialog-based editing with pre-population and clear visual indicators for required/read-only fields.
- Automated generation and management of unique IDs (e.g., MI-XXXX, TP-YYYY-NNN, NCR-NNN, WO-YYYY-X-Y-Z).

## Technical Implementations
- **Backend**: Express.js with TypeScript, PostgreSQL database (Drizzle ORM), session-based authentication, Google Cloud Storage (GCS) for file storage, RESTful API.
- **Frontend**: React with TypeScript, Wouter for routing, TanStack Query for state management, Radix UI components with Tailwind CSS, React Hook Form with Zod validation, Vite for builds.
- **Data Storage**: PostgreSQL on Neon (serverless) for primary data, GCS bucket (`thermopac_storage`) for files, database-backed sessions.
- **UI/UX Decisions**:
    - **Color Schemes**: Consistent use of blue for primary elements, green for success/positive actions, red for destructive actions/warnings, yellow/orange for warnings/pending.
    - **Templates**: Standardized hierarchical display for project items and work orders (card-based layout with color-coded badges, indentation).
    - **Design Approaches**: Unified dropdowns for user/employee selection (role-based grouping, alphabetical sorting, department info), consistent table layouts with streamlined action columns, professional dialogs with scrolling support and clear form structures.
    - **File Management**: Standardized file upload/replacement workflows with automatic GCS cleanup and clear user feedback.
    - **Reporting**: Professional PDF and Excel report generation with branded formatting, detailed data breakdowns, and visual analytics.

## Feature Specifications
- **Project Management**: Project/item/work order tracking, hierarchical organization.
- **Quality Management**: Inspection orders (Visual, NDT, Weld, Hydrotest, NCR, Shop Inspection), material identification, welder management, WPS/PQR/WPQR documents.
- **Production Management**: Work order generation, resource assignment.
- **Finance Management**: Invoicing, payments, allocations, BRC tracking.
- **HR Management**: User management, attendance, daily work activity reports, payroll.
- **Document Management**: GCS integration with hierarchical structure (Financial year/Project/Department/Sub-directory), metadata tracking, template system, access control.
- **Sales & Marketing**: Leads, campaigns, customer management.
- **Business Intelligence**: LLM Prompt Engine with specialized prompts for various modules (Meetings, SAP B1, Finance, Project Management, HR, etc.), real-time analytics, actionable insights, A/B testing.
- **Travel Management**: Business trip and visa management with EU 180-day rule compliance.
- **Design Management**: Drawing Registry (version control, CAD file management), review/approval workflows, standards/templates, drawing transmittals, project backup.
- **API Security**: Prevention of SQL injection and XSS vulnerabilities, proper authentication middleware, secure credential management.

# External Dependencies
- **Google Cloud Services**:
    - Google Cloud Storage (for `thermopac_storage` bucket)
    - Google Calendar API (for meeting synchronization and Google Meet generation)
    - Google OAuth 2.0 (for authentication with Google Calendar)
- **Database Services**:
    - Neon (PostgreSQL hosting)
- **Third-Party Libraries**:
    - SendGrid (for email notifications)
    - PDF-lib (for PDF generation)
    - Stripe (payment processing)
    - Radix UI (UI components)
    - Lucide React (icons)
    - date-fns (date manipulation)
    - TanStack Query (server state management)
    - Wouter (client-side routing)
    - React Hook Form & Zod (form management and validation)
    - Vite (frontend build tool)
    - Drizzle ORM (PostgreSQL ORM)
    - Multer (multipart form data handling)
    - bcrypt (password hashing)
    - nodemailer (email sending)
    - XLSX (Excel file generation)
    - jsPDF (PDF generation)
    - chart.js (charting for reports)
    - mssql (for SAP B1 SQL Server connectivity in middleware)