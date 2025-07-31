# Overview

This is a comprehensive Quality Management System (QMS) for THERMOPAC, a manufacturing and engineering company. The system manages projects, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. It's built as a full-stack web application. The business vision is to streamline complex industrial processes, enhance quality control, and provide robust management capabilities for improved operational efficiency and market competitiveness. The project aims to deliver an integrated solution that supports end-to-end business operations, from initial project planning to after-sales service, leveraging advanced analytics and automation for data-driven decision-making.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based authentication with secure user management
- **File Storage**: Google Cloud Storage (GCS) for document management
- **API Design**: RESTful endpoints organized by functional modules
- **Key Backend Features**:
    - Comprehensive GST tracking for purchase orders with line-level details, automated calculations, and ITC eligibility.
    - Robust SAP B1 integration with direct Service Layer connectivity, full authentication, and real-time data synchronization for Purchase Orders, Vendors, and Customer data.
    - EU 180-Day Rule Tracker for visa compliance with overlap prevention and accurate day counting.
    - Automated salary calculation engine for monthly and daily workers, including bonus separation and leave integration.
    - Intelligent conflict detection for meeting scheduling, allowing warnings while preventing hard overlaps.
    - MD Meeting planning automation with role-based participant assignment, scheduling constraints, and Monday-start week logic.
    - Comprehensive Module Permissions analytics with user access reporting and role hierarchy sorting.

## Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state management
- **UI Components**: Radix UI components with Tailwind CSS styling
- **Forms**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds
- **UI/UX Decisions**:
    - Consistent left padding (pl-4 class) across all critical pages for visual alignment.
    - Standardized card-based hierarchical display for production planning and inspection orders.
    - Unified table sizing and layout across management interfaces (e.g., Item Master, Customers).
    - Professional, consistent dialog design with vertical scrolling (max-h-[80vh] overflow-y-auto) for accessibility.
    - Role-based grouping and alphabetical sorting for all user/employee dropdowns with blue-colored headers.
    - Streamlined action button systems (View, Edit, Upload, Download, Delete) with color-coding for clarity.
    - Real-time data validation indicators for inspection documents, showing count matches and mismatches.
    - Automated field auto-population for various forms (e.g., Material Identification project, ITP item description, PMA).
    - Professional financial reporting with formatted numbers, dynamic currency conversion, and multi-sheet Excel/PDF exports.
    - Comprehensive ROI Calculator with detailed cost breakdowns, financing analysis, and graphical summaries.
    - Automated Google Meet link generation and Google Calendar event synchronization.
    - Real-time live user tracking with heartbeat system.

## Data Storage Solutions
- **Primary Database**: PostgreSQL hosted on Neon (serverless)
- **File Storage**: Google Cloud Storage bucket (`thermopac_storage`)
- **Session Storage**: Database-backed sessions
- **Document Management**: Hierarchical folder structure in GCS with metadata tracking, including project-based organization for inspection records and design documents.

## Core Modules & Features
- **Project Management**: Projects, items, work orders, production tracking, project item status auto-sync.
- **Quality Management**: Inspection orders, WPQR, WPS/PQR, NDT, visual, hydrotest, NCR, material traceability, document management with file replacement functionality, Final Dossier generation.
- **Production Management**: Work orders, resource assignments, material usage, hierarchical work order display.
- **Finance Management**: Invoices, payments, allocations, write-offs, BRC tracking, ROI Calculator, turnover reports.
- **HR Management**: Users, attendance, DWAR, payroll, leave management, business trips, visa management, welder management.
- **Document Management**: GCS integration with organized directory structures, template system, access control.
- **Sales & Marketing**: Leads, campaigns, customer management, sales performance analytics.
- **Business Intelligence**: LLM Prompt Engine for AI-driven insights across all modules, active alerts, business recommendations.

# External Dependencies

- **Google Cloud Services**:
    - **Google Cloud Storage**: Primary file storage solution (bucket: `thermopac_storage`).
    - **Google Calendar API**: For meeting synchronization and event management.
    - **Google Meet API**: For generating video conference links.
    - **Service Account**: `thermopac-cloud@thermopac-communication-system.iam.gserviceaccount.com` for GCS operations.
- **Database Services**:
    - **Neon PostgreSQL**: Serverless PostgreSQL database.
- **Third-Party Libraries**:
    - **Drizzle ORM**: For type-safe database operations.
    - **SendGrid**: Email service for notifications.
    - **PDF-lib**: PDF generation for reports and documents.
    - **Stripe**: Payment processing (configured).
    - **Radix UI**: UI component library.
    - **Tailwind CSS**: For styling.
    - **React Hook Form**: For form management.
    - **Zod**: For schema validation.
    - **TanStack Query**: For server state management.
    - **Wouter**: For client-side routing.
    - **Vite**: For build processes.
    - **Lucide React**: For icons.
    - **date-fns**: For date manipulation.
    - **XLSX (SheetJS)**: For Excel file generation.
    - **mssql**: For direct SQL Server connectivity to SAP B1.
    - **bcrypt**: For password hashing.
    - **nodemailer**: For email notifications (e.g., password reset).