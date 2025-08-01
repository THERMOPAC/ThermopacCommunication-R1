# Overview
This is a comprehensive Quality Management System (QMS) for THERMOPAC, a manufacturing and engineering company. The system manages projects, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. It aims to provide enterprise-grade insights and streamline operations across various business modules, enabling data-driven decisions and operational improvements.

# User Preferences
Preferred communication style: Simple, everyday language.

# Recent Changes
- **August 1, 2025: TASK MANAGEMENT INTELLIGENCE ENHANCED WITH DELEGATION ANALYSIS**: Expanded Task Management Intelligence prompt (ID 18) with comprehensive delegation tracking and leadership effectiveness analysis.
  ✅ Root cause identified and fixed: LLM generating fake data instead of real THERMOPAC usernames
  ✅ Enhanced SQL query with delegation analysis (tasks assigned to others vs self-assigned)
  ✅ Added role-based delegation metrics and non-delegating leader identification
  ✅ Updated template to force use of real data (Saurabh, Pallab, Vijaynathan, Rohan, Pravin)
  ✅ Added mandatory Role-Based Task Assignment Analysis section
  ✅ Added mandatory Non-Delegating Users section with 6 employees identified
  ✅ Verified data pipeline captures: Employee (20 users), Manager (3), Senior Manager (2), GM (1)
  🎯 System now generates comprehensive reports with real data and delegation analytics

# System Architecture
## Core Architectural Decisions
- Full-stack web application.
- Prioritizes organized, hierarchical data structures, especially for document management and project items.
- Focuses on consistent UI/UX with standardized component usage (e.g., dropdowns, action buttons).
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
    - Stripe (payment processing, configured)
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
    - jsPDF (PDF generation, used in ROI Calculator)
    - chart.js (charting for reports)
    - mssql (for SAP B1 SQL Server connectivity in middleware)