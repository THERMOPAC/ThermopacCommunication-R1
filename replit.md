# Overview
This is a comprehensive Quality Management System (QMS) for THERMOPAC, a manufacturing and engineering company. The system manages projects, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. It aims to provide enterprise-grade insights and streamline operations across various business modules, enabling data-driven decisions and operational improvements.

# User Preferences
Preferred communication style: Simple, everyday language.

# Recent Changes
- **August 5, 2025: SAP B1 FIREWALL ISSUE DIAGNOSED AND AUTHENTICATION FULLY RESOLVED**: Successfully fixed authentication issues and identified root cause of connection failures as firewall blocking external access.
  ✅ **Authentication Completely Fixed**: Session validation working perfectly for all SAP endpoints (/connection/test, /connection/status, /vpn/status)
  ✅ **Root Cause Identified**: SAP Service Layer running and accessible from local network but firewall blocks external connections from Replit servers
  ✅ **Enhanced Diagnostics**: Updated connection test with accurate firewall-specific troubleshooting guidance
  ✅ **Service Layer Confirmed**: User verified SAP Business One Service Layer documentation accessible at https://192.168.1.100:50000
  ✅ **Network Analysis Complete**: Local network access working, external access blocked by firewall on port 50000
  🎯 **System Status**: Authentication working perfectly - firewall configuration needed to allow external connections to SAP Service Layer
- **August 4, 2025: BRC MANAGEMENT INSIGHT GENERATOR FULLY OPERATIONAL WITH COMPLETE DELAYED INVOICES DATA**: Successfully eliminated "Table and details missing" responses and deployed fully functional BRC analytics with comprehensive authentic data integration including complete delayed invoices tracking.
  ✅ **Root Cause Fixed**: Replaced complex UNION queries with simplified structured format ensuring reliable data transmission to LLM
  ✅ **Data Integration Perfected**: BRC overview (56 records, $10.89M total, 3 banks), delayed invoices (Agas Lubes 2732 days, Afroking 2403 days, Biobase 2224 days), bank performance metrics
  ✅ **Query Optimization Complete**: Streamlined query structure with section-based formatting (BRC_OVERVIEW, DELAYED_INVOICES, BANK_PERFORMANCE) for reliable LLM parsing
  ✅ **Template Enhancement**: Updated prompt template with explicit instructions to use authentic provided data and eliminate generic placeholder responses
  ✅ **Performance Verified**: Individual query components tested and confirmed working with real financial data
  ✅ **Bank Analysis Operational**: Bank of Baroda leading with 47 BRCs ($8.3M), complete bank performance comparison available
  ✅ **Delayed Invoices Integration**: Added authentic overdue invoice tracking with customer names (bp_name), amounts, days overdue, and status from invoices/customers tables
  ✅ **Quarterly Metrics Active**: Current quarter 8 BRCs vs previous quarter 12 BRCs with detailed amount analysis
  ✅ **SAP Invoice Integration**: Enhanced Cash Flow Predictor (Prompt ID 3) to include SAP Invoice Numbers in invoice details for complete financial tracking
  🎯 **System Status**: BRC Management Insight Generator fully operational with authentic data-driven reports including comprehensive delayed invoices analysis, no more template responses
- **August 4, 2025: CASH FLOW PREDICTOR SAP INVOICE INTEGRATION COMPLETED**: Successfully fixed SAP Invoice Number display issue in Cash Flow Predictor (Prompt ID 3) output.
  ✅ **SAP Invoice Numbers Now Visible**: Fixed data formatting in llm-prompt-engine.ts to include SAP Invoice Numbers in both invoice titles and dedicated fields
  ✅ **Database Query Enhanced**: Updated query to include sap_invoice_no field from invoices table (50/20-21, 10-2526, EXP/016/17-18, etc.)
  ✅ **Template Integration**: Updated prompt template to explicitly request SAP Invoice Numbers in invoice details sections
  ✅ **Data Formatting Fixed**: Corrected missing SAP invoice number inclusion in the formatted output sent to LLM
  ✅ **Masking Override Confirmed**: Verified prompt ID 3 properly bypasses data masking to show authentic SAP numbers
  ✅ **Enhanced Token Allocation**: Maintained 6000 tokens for comprehensive report generation with SAP details
  🎯 **System Status**: Cash Flow Predictor now displays complete invoice details including SAP Invoice Numbers (EXP/016/17-18, 50/20-21, 10-2526) in all analytical sections
- **August 1, 2025: TASK INTELLIGENCE TRUNCATION ISSUE RESOLVED**: Successfully fixed critical truncation problem in Prompt 19 user performance reports.
  ✅ **Truncation Issue Fixed**: Resolved problem where reports cut off at user #25 "Lawrence", missing last 2 users out of 27 total
  ✅ **Enhanced Anti-Truncation Template**: Updated Prompt 19 with explicit instructions to include all 27 users and verification checks
  ✅ **Increased Token Limits**: Implemented 8000 max tokens for Prompt 19 (up from 2000) to ensure complete report generation
  ✅ **SecureLLMWrapper Enhanced**: Added maxTokens parameter to execution interface and propagated through OpenAI/Anthropic methods
  ✅ **Previous Enhancements Maintained**: All Task Intelligence improvements remain intact (total tasks summary, self-assigned format, PDF visibility)
  🎯 **System Status**: Task Intelligence system ready for production with complete 27-user reporting capability and enhanced token management

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