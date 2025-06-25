# Overview

This is a comprehensive Quality Management System (QMS) for THERMOPAC, a manufacturing and engineering company. The system manages projects, production, quality control, inspections, welding procedures, materials, finance, HR, and document management. It's built as a full-stack web application with React frontend and Express backend.

# System Architecture

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based authentication with secure user management
- **File Storage**: Google Cloud Storage (GCS) for document management
- **API Design**: RESTful endpoints organized by functional modules

## Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state management
- **UI Components**: Radix UI components with Tailwind CSS styling
- **Forms**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds

## Data Storage Solutions
- **Primary Database**: PostgreSQL hosted on Neon (serverless)
- **File Storage**: Google Cloud Storage bucket (`thermopac_storage`)
- **Session Storage**: Database-backed sessions
- **Document Management**: Hierarchical folder structure in GCS with metadata tracking

# Key Components

## Core Modules
1. **Project Management**: Projects, items, work orders, and production tracking
2. **Quality Management**: Inspection orders, WPQR documents, WPS/PQR procedures
3. **Production Management**: Work orders, resource assignments, material usage
4. **Finance Management**: Invoices, payments, allocations, write-offs, BRC tracking
5. **HR Management**: Users, attendance, DWAR (Daily Work Activity Reports), payroll
6. **Document Management**: GCS integration with organized directory structures
7. **Sales & Marketing**: Leads, campaigns, customer management

## Quality Control Features
- **Inspection Orders**: Comprehensive inspection tracking with multiple data tabs
- **Material Identification**: Traceability system with auto-generated IDs
- **Welder Management**: Certification tracking and qualification records
- **WPS/PQR Documents**: Welding procedure specifications and qualification records
- **WPQR Documents**: Welder Performance Qualification Records
- **Non-Conformance Reports**: Issue tracking and resolution

## Document Management
- **Hierarchical Structure**: Financial year/Project/Department/Sub-directory organization
- **Google Cloud Storage**: Centralized file storage with metadata tracking
- **Template System**: Directory templates for consistent organization
- **Access Control**: Public/private file access management

# Data Flow

## File Upload Process
1. Files uploaded through React frontend with drag-and-drop interface
2. Multer middleware processes multipart form data
3. Files stored in Google Cloud Storage with organized path structure
4. Database records track file metadata and relationships
5. Signed URLs generated for secure file access

## Quality Management Workflow
1. Projects created with associated items and specifications
2. Inspection orders generated from project requirements
3. Multiple inspection types supported (Visual, NDT, Weld, Material, etc.)
4. Documents attached to inspection records with GCS storage
5. Status tracking throughout inspection lifecycle

## Financial Tracking
1. Invoices created with line items and customer information
2. Payments recorded with allocation to specific invoices
3. Outstanding amounts calculated automatically
4. Write-offs tracked for bad debts
5. Export documentation (BRC) linked to export invoices

# External Dependencies

## Google Cloud Services
- **Google Cloud Storage**: Primary file storage solution
- **Service Account**: `thermopac-cloud@thermopac-communication-system.iam.gserviceaccount.com`
- **Bucket**: `thermopac_storage`
- **Permissions**: Storage Object Creator/Viewer roles required

## Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL database
- **Connection**: Via DATABASE_URL environment variable
- **ORM**: Drizzle for type-safe database operations

## Third-Party Libraries
- **SendGrid**: Email service for notifications
- **PDF-lib**: PDF generation for reports and documents
- **Stripe**: Payment processing (configured but not actively used)
- **Various UI Libraries**: Radix UI, Lucide React icons, date-fns

# Deployment Strategy

## Development Environment
- **Platform**: Replit with Node.js 20 runtime
- **Hot Reload**: Vite dev server on port 5000
- **Database**: Neon PostgreSQL with development connection

## Production Environment
- **Target**: Google Cloud Run (configured in .replit)
- **Build Process**: Vite build + esbuild for server bundling
- **Port Configuration**: Internal 5000, external 80
- **Environment Variables**: Production secrets managed separately

## Environment Configuration
- **Development**: Uses .env file for local configuration
- **Production**: Requires proper GCS credentials and database URL
- **Critical Variables**: GOOGLE_CLOUD_CREDENTIALS, GOOGLE_CLOUD_BUCKET, DATABASE_URL

# Changelog
- June 19, 2025. Initial setup
- June 23, 2025. Added Exchange Rate and Amount LC fields to invoice management system with auto-calculation functionality and database persistence
- June 23, 2025. Added Marketing Tools sub-tab under Sales and Marketing with categorized layout similar to Design Tools page
- June 23, 2025. Created comprehensive ROI Calculator tool for re-refining plant projects with 6-step wizard, real-time calculations, and report generation capabilities
- June 23, 2025. Integrated ROI Calculator as a tab within Marketing Tools page instead of separate page for better user experience
- June 23, 2025. Implemented auto-calculation for Tank Farm & Utilities in ROI Calculator with formula-based capacity calculations, standard tank size optimization, and editable parameters
- June 23, 2025. Enhanced tank calculation logic with smart rounding (rounds UP to nearest 50/100 KL), quantity minimization algorithm, and safety checks to prevent zero capacities
- June 23, 2025. Added automatic utility calculations for Step 2: Compressor (20×LPH/1000), Heater (600,000×LPH/1000), Total Connected Load (350×LPH/1000) with real-time updates based on plant capacity
- June 23, 2025. Updated heater selection logic for large plants (>3000 LPH) to require minimum 2 heaters while optimizing for fewest quantity, providing operational redundancy and flexibility
- June 24, 2025. Created database-driven plant costs management system with edit dialog for ROI Calculator, replacing hardcoded pricing with dynamic database storage and admin interface
- June 24, 2025. Enhanced ROI Calculator Plant Configuration section with comprehensive cost breakdown including 14 additional cost fields (Freight & Insurance, Import Duty & VAT, Plot Cost, Civil Cost, Refinery Shed, Utility Shed, Office Building, Mechanical & Electrical, Fire Suppression, Insulation, Legal Fees, Pre Formation Expenses, Commissioning & Travel, Contingency) with real-time total project cost calculation
- June 24, 2025. Added new "Additional Equipments" step (Step 3) to ROI Calculator with 14 equipment cost fields including pumps, transmitters, electrical components, mechanical equipment, and commissioning costs, updating all subsequent step numbers and maintaining total project cost integration
- June 24, 2025. Fixed tank pricing display issue in ROI Calculator Step 2 by adding missing tankPrices schema definition, implementing proper API routes, and resolving frontend data processing bugs. Tank Farm & Utilities table now correctly displays USD pricing from database instead of $0
- June 24, 2025. Added comprehensive cost totals display to ROI Calculator Step 2 including Total Tank Cost summary at bottom of tank list, Total Utilities Cost summary, and enhanced combined total showing breakdown of Tank Farm + Utilities costs for better financial visibility
- June 24, 2025. Built comprehensive Final ROI Report Page (Step 7) with professional design featuring gradient header with project metadata, color-coded financial summary cards (Revenue, Operating Cost, Gross Profit, ROI, Payback Period), interactive visualizations (Revenue Breakdown by Product with percentage bars, Profit vs Expense Analysis with color coding), detailed financial tables (Product analysis with yield/pricing/tons/revenue, Operating cost breakdown with monthly/annual figures), enhanced PDF export with branded formatting and complete financial analysis, comprehensive Excel/CSV export with all metrics and breakdowns, and print-ready responsive layout. Fixed runtime error by replacing undefined Building icon with Factory icon.
- June 24, 2025. Enhanced PDF generation with professional design including THERMOPAC branded header with blue gradient background and logo placeholder, organized section dividers (Project Summary, Financial Summary, Key Performance Indicators, Product Revenue Breakdown, Operating Cost Breakdown), embedded visualizations (color-coded financial summary cards, circular ROI/Payback displays, product revenue bar charts, operating cost progress bars), modern formatting with clean Helvetica fonts and proper spacing, and complete integration of all calculated values reflecting selected plant capacity and currency. All reports now generate professional, client-ready documents suitable for business presentations.
- June 24, 2025. Implemented step-by-step ROI save logic functionality with backend database table roi_project_steps, API endpoints for saving/loading step data (/api/roi/save-step, /api/roi/load-project/:id, /api/roi/project-progress/:id), and frontend integration featuring auto-save on step navigation, progress indicators showing completed steps (✓), current step (→), and pending steps (○), manual save buttons, project ID tracking with UUID generation, and auto-fill forms on project load. Users can now save progress at each step, resume work later, and prevent data loss throughout the 6-step ROI Calculator workflow.
- June 24, 2025. Enhanced dropdown project selection functionality with database fixes, authentication improvements, and comprehensive PDF report generation. Fixed state variable naming issues (setROIData vs setRoiData), corrected database column references (updated_by vs user_id), and implemented professional multi-page PDF reports featuring complete financial analysis with investment breakdown, revenue analysis by product, operating cost details, key performance indicators (ROI, payback period, profit margin), and tank farm specifications. Reports now include all saved step data from loaded projects with proper calculations and professional formatting.
- June 25, 2025. Fixed feedstock cost calculation logic to properly use user input from "Plant Operation per (Month)" field instead of hardcoded 30 days. Updated working capital calculation formula to use dynamic operating days, enhanced feedstock cost display with real-time calculation preview, and corrected formula descriptions throughout the system. Monthly feedstock cost now accurately calculates as: Feedstock Cost per Liter × Plant Capacity × 24 hours × User's Operating Days per Month.
- June 25, 2025. Implemented complete currency conversion system for ROI Calculator Step 2 tank and utilities costs. Fixed hardcoded USD pricing to dynamically display costs in selected currency from Step 1, updated table headers to show current currency, applied proper exchange rate conversions to all cost calculations, and added comprehensive utilities cost table with specifications and converted pricing. Tank Farm + Utilities costs now correctly display in EUR, GBP, INR, or USD based on user selection with accurate currency conversion from database USD pricing.
- June 25, 2025. Updated heater cost formula in ROI Calculator utilities calculation from $0.50 to $0.050 USD per Kcal/hr, reducing heater costs by 90% to more realistic pricing levels. Formula now calculates as: Heater Cost = Total Heat Load × $0.050 USD per Kcal/hr, making 1000 LPH plants cost $30,000 instead of $300,000 for heater equipment.
- June 25, 2025. Updated compressor cost formula in ROI Calculator utilities calculation from $1,500 to $500 USD per HP, reducing compressor costs by 67% to more economical pricing. Formula now calculates as: Compressor Cost = Compressor HP × $500 USD per HP, making 1000 LPH plants cost $10,000 instead of $30,000 for compressor equipment.

# User Preferences
Preferred communication style: Simple, everyday language.