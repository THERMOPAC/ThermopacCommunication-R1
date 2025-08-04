# Overview
This is a comprehensive Quality Management System (QMS) for THERMOPAC, a manufacturing and engineering company. The system manages projects, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. It aims to provide enterprise-grade insights and streamline operations across various business modules, enabling data-driven decisions and operational improvements.

# User Preferences
Preferred communication style: Simple, everyday language.

# Recent Changes
- **August 4, 2025: BRC MANAGEMENT INSIGHT GENERATOR FULLY OPERATIONAL**: Successfully deployed and fixed LLM Prompt (ID 20) for comprehensive Bank Realization Certificate analytics under Finance category.
  ✅ **BRC Intelligence Module**: Created specialized prompt for export transaction compliance and BRC processing insights
  ✅ **SQL Query Issues Resolved**: Fixed multiple column reference errors and data type compatibility issues in UNION queries
  ✅ **Robust Query Structure**: Implemented simplified query design focusing on core BRC metrics with consistent column alignment
  ✅ **Real Data Integration**: Connected to 56 BRC records ($10.89M total realized), 97 invoices (84 requiring BRC), and 3 banks
  ✅ **Multi-dimensional Reporting**: Bank-wise performance, currency distribution (USD/INR), recent activity patterns (30/90-day trends)
  ✅ **Production Ready**: Query executes successfully with authentic financial data, providing comprehensive export compliance analytics
  🎯 **System Status**: BRC Management Insight Generator fully operational and ready for comprehensive export compliance intelligence
- **August 4, 2025: CASH FLOW PREDICTOR COMPREHENSIVE ENHANCEMENT COMPLETED**: Successfully enhanced Cash Flow Predictor (Prompt ID 3) to generate complete analytical insights with detailed invoice breakdowns.
  ✅ **Comprehensive Template Update**: Enhanced prompt template to require all 5 mandatory sections (Invoice Breakdown, High-Risk Accounts, Payment Trends, Recommendations, Summary Statistics)
  ✅ **Unpaid Invoices Focus**: Updated data query to show only unpaid invoices with outstanding amounts > 0, including days overdue calculation
  ✅ **Enhanced Token Allocation**: Increased to 6000 tokens specifically for Cash Flow Predictor to ensure complete report generation
  ✅ **Detailed Data Formatting**: Added days overdue information and structured formatting for comprehensive analysis
  ✅ **Masking Override Maintained**: Preserved special handling for prompt ID 3 to disable data masking for authentic financial data
  🎯 **System Status**: Cash Flow Predictor fully operational with detailed invoice listings AND comprehensive analytical insights for high-risk accounts, payment trends, and actionable recommendations
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