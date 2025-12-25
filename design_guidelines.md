# THERMOPAC QMS Design Guidelines

## Design Approach: Enterprise Design System

**Selected Framework**: Carbon Design System (IBM) + shadcn/ui foundation
**Rationale**: Purpose-built for data-heavy enterprise applications with complex workflows, manufacturing operations, and business intelligence - perfect match for QMS with SAP integration.

**Core Principles**:
- Information density with clarity
- Rapid task completion
- Hierarchical data presentation
- Consistent patterns across modules

---

## Typography System

**Font Stack**: Inter (via Google Fonts CDN)
- **Headings**: 
  - H1: text-2xl font-semibold (Dashboard titles)
  - H2: text-xl font-semibold (Module sections)
  - H3: text-lg font-medium (Card headers, table titles)
- **Body**: text-sm font-normal (primary content, table cells)
- **Labels**: text-xs font-medium uppercase tracking-wide (form labels, badges)
- **Data/Metrics**: text-3xl font-bold (KPI cards), tabular-nums class for tables

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8 (p-2, gap-4, mb-6, p-8)
- Card padding: p-6
- Section spacing: mb-8
- Form field gaps: gap-4
- Table cell padding: p-4

**Grid Structure**:
- Dashboard: 12-column grid (grid-cols-12) for flexible layouts
- Stats cards: 4-column on desktop (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
- Main content: 2/3 width, sidebar: 1/3 for detail views
- Max container: max-w-7xl mx-auto

---

## Component Library

### Navigation
**Sidebar (Fixed Left)**:
- Width: w-64, collapsed: w-16
- Module groups with icons (Heroicons - use CDN)
- Active state: bg-blue-50 with left border indicator
- Nested menu support for sub-modules

**Top Header**:
- Height: h-16
- Contains: Company logo, breadcrumbs, search, notifications bell, user profile dropdown
- Sticky: sticky top-0 z-50

### Dashboard Components

**KPI Cards**:
- White background (bg-white), subtle shadow
- Icon circle in corner (top-right) with semi-transparent background
- Large metric number, small label below
- Trend indicator (arrow + percentage) if applicable
- Border-left accent using blue shade for categorization

**Data Tables**:
- Striped rows (even:bg-gray-50)
- Fixed header on scroll
- Sortable columns with arrow indicators
- Row actions (edit, delete) on hover - right-aligned icons
- Pagination footer with results count
- Filter pills above table for active filters
- Bulk selection checkboxes (left column)

**Forms**:
- Two-column layout on desktop (grid-cols-2 gap-6)
- Label above input pattern
- Required field asterisk (text-red-500)
- Helper text below inputs (text-xs text-gray-500)
- Action buttons right-aligned (Cancel + Primary)
- Section dividers with headings for grouped fields

**Charts (BI Module)**:
- Use Chart.js or Recharts library
- Card wrapper with title and date range selector
- Types: Line (trends), Bar (comparisons), Donut (distributions), Heatmap (attendance)
- Legend below chart, grid lines subtle (gray-200)

### Module-Specific Components

**HR Attendance**:
- Calendar heatmap view (full-month grid)
- Daily attendance table with time in/out columns
- Status badges: Present (green), Absent (red), Late (yellow), Leave (blue)

**DWAR (Daily Work Activity Report)**:
- Timeline view with entry cards
- Expandable sections for detailed activities
- Attachment preview thumbnails
- Approval workflow indicators (pending/approved chips)

**Email Management**:
- Three-column layout: folder list (w-1/6), email list (w-1/3), preview pane (w-1/2)
- Unread count badges on folders
- Priority flags and labels
- Compact list items with truncated subject lines

**Finance Module**:
- Summary cards with currency formatting
- Transaction tables with debit/credit columns
- Invoice status workflow (Draft → Pending → Approved → Paid)
- Export button for reports (Excel/PDF icons)

### Interactive Elements

**Buttons**:
- Primary: bg-blue-600 hover:bg-blue-700, px-4 py-2, rounded-md
- Secondary: border border-gray-300 hover:bg-gray-50
- Icon-only: p-2 rounded-full hover:bg-gray-100
- Destructive: bg-red-600 hover:bg-red-700

**Modals/Dialogs**:
- Centered overlay (backdrop-blur-sm)
- Max width: max-w-2xl for forms, max-w-md for confirmations
- Close X in top-right corner
- Footer with actions (Cancel left, Primary right)

**Badges & Status**:
- Pill shape: rounded-full px-3 py-1 text-xs
- Color coding: Success (green-100/green-800), Warning (yellow-100/yellow-800), Error (red-100/red-800), Info (blue-100/blue-800)

---

## No Hero Section
This is an authenticated enterprise dashboard application - no hero imagery or marketing elements. Login page uses simple centered form with company logo above.

---

## Icons
**Library**: Heroicons (via CDN) - outline style for navigation, solid for buttons/actions
**Size**: w-5 h-5 (standard), w-4 h-4 (compact tables), w-6 h-6 (large headers)

---

## Critical Implementation Notes
- All data tables must support export functionality
- Forms include field-level validation with error states
- Loading states: skeleton screens for tables, spinner for actions
- Empty states: centered icon + message + action button
- Responsive: Sidebar collapses to hamburger menu below lg breakpoint
- Print-friendly: @media print styles for reports