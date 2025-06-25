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
- June 25, 2025. Excluded Total Connected Load from Step 2 Tank Farm & Utilities cost calculations. Total Connected Load is now set to $0 cost with explanatory note "Used only for power cost estimation, not added to capital cost". Updated utilities and combined totals to filter out Total Connected Load, clarifying that it's used only for Step 4 operating cost power consumption calculations, not capital investment requirements.
- June 25, 2025. Fixed Operating Cost Breakdown calculation logic in Step 6 ROI Calculator to show realistic monthly and annual costs. Corrected feedstock cost calculation from displaying $3 monthly to proper calculation ($3/liter × capacity × 24 hours × operating days), updated consumables cost to use monthly values instead of per-liter calculations, and fixed PDF report generation to use same corrected calculations. Operating costs now display accurate amounts for 1000 LPH plant: feedstock $1,800,000 monthly, with proper currency conversion and realistic totals.
- June 25, 2025. Added ROI Project Delete functionality to Load Saved ROI Project dialog with confirmation modal, trash icon buttons next to each project entry, backend API endpoint /api/roi/delete-project/:roiProjectId for database deletion, and automatic project list refresh after deletion. Users can now permanently delete unwanted ROI projects with "Are you sure?" confirmation dialog and proper error handling.
- June 25, 2025. Enhanced ROI PDF Report generation to include comprehensive user inputs from all 6 calculator steps. Added detailed sections for Step 1 (Plant Configuration with all project costs), Step 2 (Tank Farm & Utilities configurations), Step 3 (Additional Equipment breakdown), Step 4 (Operating Costs with monthly values), Step 5 (Product Yields & Pricing for all products), and Step 6 (Financial Configuration). Reports now include calculation summaries showing total investment from all steps, monthly/annual operating costs, total product yields, plant utilization, and validation notes. PDF filename updated to "Comprehensive_ROI_Report" to reflect complete data inclusion.
- June 25, 2025. Added comprehensive charts and tabular data visualization to ROI PDF Reports with "GRAPHICAL SUMMARY" section including: Product Yield Breakdown pie chart showing percentage distribution of all product yields, Revenue by Product bar chart displaying annual revenue calculations in selected currency, Operating Cost Breakdown pie chart with monthly cost components (feedstock, power, fuel, chemicals, labor, maintenance), CAPEX Allocation bar chart showing investment breakdown across plant equipment/tank farm/utilities/additional equipment/project costs, and Financial Summary Table with 10 key metrics including plant capacity, operating days, annual processing, total CAPEX, monthly OpEx, annual revenue, product yield, ROI, and payback period. All charts use real-time values from user inputs and reflect current currency and plant capacity selections.
- June 25, 2025. Enhanced ROI PDF Reports with comprehensive "Tank Farm & Utilities Cost Breakdown" section featuring detailed tabular data from Step 2. Added Tank Farm Details table displaying tank description, % of plant capacity, storage days, required capacity (KL), suggested tank size (KL), suggested quantity, cost per tank, and total cost in selected currency. Included Utilities & Equipment Details table showing equipment specifications, quantities, unit costs, and total costs. Added Tank Farm & Utilities Summary with individual and combined cost totals. All monetary values display in user-selected currency (GBP, EUR, INR, USD) with proper formatting and automatic page breaks for multi-page reports.
- June 25, 2025. Added comprehensive "Project Cost Breakdown (Step 1)" section to ROI PDF Reports featuring complete project information display including project name, customer name, plant capacity, and selected currency. Added base plant cost details showing both USD and local currency amounts. Created detailed Additional Project Costs table displaying all 14 cost components (Freight & Insurance, Import Duty & VAT, Plot Cost, Civil Cost, Refinery Shed, Utility Shed, Office Building, Mechanical & Electrical, Fire Suppression, Insulation, Legal Fees, Pre Formation Expenses, Commissioning & Travel, Contingency) with individual amounts and total summary. Included Step 1 Cost Summary with base plant cost, additional costs total, and complete Step 1 investment total in selected currency. All tables feature professional formatting with headers, borders, and proper currency display.
- June 25, 2025. Added comprehensive "Additional Equipment Breakdown (Step 3)" section to ROI PDF Reports featuring detailed equipment costs table with all 14 equipment components including Pumps (Centrifugal & Positive Displacement), Pressure/Temperature/Level/Flow Transmitters, Motor Control Center, Distribution Board, Pipes/Valves/Flanges, Tank Level Transmitters, Additional Pumps & Filters, Quality Control Equipment, Labor Erection & Commissioning, and Electrical Cables & Accessories. Created professional table format showing only non-zero costs with individual amounts and total equipment cost summary. Added Step 3 Equipment Summary with total additional equipment investment in selected currency. Includes conditional display showing "No additional equipment costs specified" message when no equipment costs are entered.
- June 25, 2025. Added comprehensive remaining steps (4, 5, 6, 7) to ROI PDF Reports with complete data breakdown. Added "Operating Costs Breakdown (Step 4)" section featuring feedstock cost per liter, monthly power/fuel/chemical/labor/maintenance costs with right-aligned numerical values. Created "Product Yields & Pricing (Step 5)" section with detailed product table showing yield percentages and pricing for all 6 products (Naphtha/Gas Oil, Light/Heavy Base Oil, Residue, Waste Water, Process Loss) including total yield calculation. Added "Financial Results & ROI Analysis (Step 7)" section displaying Annual ROI, Payback Period, IRR, and NPV with professional formatting. Implemented right-aligned numerical formatting for all monetary values, percentages, and financial metrics throughout the entire PDF report for improved readability and professional presentation. All tables feature consistent styling with headers, borders, and proper currency display in user-selected currency.
- June 25, 2025. Transformed ROI Report into professional Profit & Loss Statement format with standard financial structure. Replaced basic financial results with comprehensive P&L statement featuring Revenue breakdown by product (Naphtha/Gas Oil, Light/Heavy Base Oil, Residue, Waste Water), Cost of Goods Sold (feedstock costs), Operating Expenses (power, fuel, chemical, labor, maintenance), and calculated Gross Profit, EBITDA, and Net Profit. Added Key Financial Metrics section with Gross Margin, Net Margin, Annual ROI, Payback Period, IRR, and NPV. Enhanced with Financial Analysis Charts including Product-wise Revenue Contribution bars, Cost Structure Analysis breakdown, and Profitability Analysis visualization. All values calculated from existing Step 4 (Operating Costs) and Step 5 (Product Yields) data with consistent decimal precision and currency formatting throughout the professional P&L statement.
- June 25, 2025. Applied comprehensive right-alignment formatting to all numerical fields in ROI PDF report tables. Implemented proper text width calculations and right-alignment positioning for costs, revenues, percentages, quantities, and totals across all sections including Tank Farm & Utilities table, Additional Equipment breakdown, Operating Costs table, Product Yields & Pricing table, and P&L Statement Amount column. Maintained left-alignment for labels and descriptions while ensuring all numerical data follows standard financial report conventions for improved readability and professional presentation.
- June 25, 2025. Eliminated all duplicate ROI step information from pages 1 and 2 of PDF reports. Removed redundant step-by-step summaries that were duplicating detailed tabular data presented later in the report. Report now starts directly with comprehensive tabular sections, creating a cleaner, more professional document structure without repetitive content and improved page flow.
- June 25, 2025. Fixed PDF Report page 3 'Utilities & Equipment Details' missing content issue by updating PDF generation to properly map utility data properties (description/specification instead of name/specifications). Equipment and Specifications columns now display complete information including Compressor specifications, Heater capacity details, and Total Connected Load information instead of empty cells.
- June 25, 2025. Successfully implemented 5 industry-standard ROI Calculator enhancements: (1) ROI Sensitivity Analysis with ±10% impact scenarios on pricing and costs showing calculated ROI changes, (2) Working Capital Analysis with detailed formula breakdown and step-by-step calculations with component tables, (3) Unit Cost Comparison featuring cost per liter analysis with annual totals and profit margins, (4) Annual Operating Cost Analysis with comprehensive breakdown by category including percentages and monthly averages, (5) Enhanced Key Assumptions displaying complete operational and financial assumptions with data sources. All improvements integrated into both web interface and PDF report generation for professional financial analysis.
- June 25, 2025. Enhanced Excel export functionality to create comprehensive 7-sheet XLSX workbook replacing basic CSV export. Implemented professional formatting with auto-adjusted column widths, currency symbols, and structured data across Plant Configuration, Tank Farm & Utilities, Additional Equipment, Operating Costs, Product Yield, ROI Summary, and Charts sheets. Each sheet follows same field order and layout as on-screen steps with proper units and calculations. Updated button text to "Export to Excel (7 Sheets)" for clarity. All monetary values display in user-selected currency with proper formatting throughout the workbook.
- June 25, 2025. Enhanced ROI Calculator with comprehensive financing costs and depreciation analysis for realistic financial modeling. Added debt financing ratio field (default 70% debt, 30% equity), depreciation method selection (straight-line, declining balance, none), interest calculations on debt and working capital, and complete P&L statement structure in PDF reports. Updated calculations to show Net Profit after financing costs and depreciation, separate from EBITDA. Added EBITDA, Return on Equity, annual financing costs, and investment structure displays in Step 7. PDF reports now include financing costs and depreciation as separate line items with detailed breakdown of debt interest, working capital interest, and depreciation expenses, providing accurate post-financing payback periods and ROI calculations for professional financial analysis.
- June 25, 2025. Verified Step 4 monthly costs are fully accounted for in final ROI P&L reports and completed comprehensive cost verification. Added missing cost fields (Media Cost, Transportation Cost, Vehicle Maintenance Cost, Miscellaneous Cost) to PDF generation operatingCostItems array, ensuring all 10 operating cost categories are properly included in financial calculations. Confirmed ENDA UK project shows correct post-financing payback period of 4.0 years (not 0.89 years pre-financing), providing realistic business analysis that accounts for debt financing costs, working capital interest, and depreciation expenses. System now delivers complete financial modeling with professional P&L statement structure suitable for business presentations.
- June 25, 2025. Enhanced payback period display precision by switching from rounded years to precise months across entire system. Updated UI cards, PDF reports, Excel exports, and all financial summaries to show payback period in months with one decimal place (e.g., 57.6 months instead of 4.0 years). This provides much better granularity for investment analysis and cash flow planning, allowing investors to see exact recovery timeframes rather than rounded annual figures. All instances consistently updated including Key Financial Metrics tables, P&L statements, and business presentation materials.
- June 25, 2025. Fixed P&L statement Operating Expenses calculation to include all 10 operating cost categories. Added missing Media Cost, Transportation Cost, Vehicle Maintenance Cost, and Miscellaneous Cost to both totalOperatingExpenses calculation and P&L statement display. P&L statement now shows comprehensive Operating Expenses section with complete cost breakdown ensuring accurate EBITDA, Net Profit, and financial analysis calculations. All operating costs from Step 4 are now fully integrated into professional P&L statement structure.
- June 25, 2025. Enhanced GRAPHICAL SUMMARY section with two additional advanced charts on new page: (1) Cash Flow Timeline - 5-year cumulative cash flow projection showing monthly progression from initial investment through break-even point with visual break-even marker and axis labeling, (2) ROI Sensitivity Analysis - tornado chart displaying ±10% impact scenarios for 5 key variables (Product Pricing, Feedstock Cost, Plant Capacity, Operating Costs, Investment Cost) with color-coded positive/negative impact bars and ROI percentage ranges. Charts use real project data and follow two-charts-per-page layout for optimal presentation. Both charts provide critical investment decision insights for stakeholders.
- June 25, 2025. Fixed Step 4 save functionality for missing cost fields by adding Transportation Cost, Vehicle Maintenance Cost, and Miscellaneous Cost form inputs to ROI Calculator Step 4. Updated getCurrentStepData function to include all 14 Step 4 fields (plantOperationDays, feedstockCost, powerCost, fuelCost, chemicalCost, laborCost, maintenanceCost, mediaCost, transportationCost, vehicleMaintenanceCost, miscellaneousCost, rateOfInterest, debtFinancingRatio, depreciationMethod) ensuring complete data persistence. All operating cost fields and financing parameters now properly save to database and persist across sessions.
- June 25, 2025. Enhanced PDF report layout with improved bottom page margins (increased from 30mm to 50mm), enforced two-charts-per-page layout for GRAPHICAL SUMMARY section, and ensured first chart (Cash Flow Timeline) always starts on new page. Second chart (ROI Sensitivity Analysis) appears on same page if space allows, otherwise starts new page. Professional page layout optimization prevents chart content from being cut off at page boundaries while maintaining readable spacing throughout the comprehensive financial reports.
- June 25, 2025. Implemented comprehensive PDF chart layout and pagination rules with professional formatting: (1) Strict 2-charts-per-page limit with automatic page breaks, (2) Consistent 25mm bottom margins throughout document, (3) Center-aligned chart titles with bold formatting, (4) Dedicated "ADVANCED FINANCIAL ANALYSIS CHARTS" section header, (5) Professional spacing and padding between charts, (6) Page numbering ("Page X of Y") in footer on all pages, (7) Smart pagination prevents charts from being split across pages. Enhanced visual clarity and prevented overcrowding while maintaining professional presentation standards for business reports.

# User Preferences
Preferred communication style: Simple, everyday language.