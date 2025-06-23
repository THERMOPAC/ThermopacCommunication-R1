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

# User Preferences
Preferred communication style: Simple, everyday language.