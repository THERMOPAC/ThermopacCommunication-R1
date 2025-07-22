# Inspection Order GCS Path Structure Documentation

## Overview

This document provides comprehensive documentation for the GCS (Google Cloud Storage) path structure used for all inspection order document uploads. The system uses a hierarchical folder structure to organize inspection documents by project, inspection order, and tab type.

## Base Path Structure

All inspection documents follow this hierarchical path format:

```
QMS/Inspections_Records/{project_code}/{inspection_order_number}/{tab_name}/{record_id}.{extension}
```

## Tab Name Mappings

The following tab names from the frontend are mapped to specific folder names in GCS:

| Frontend Tab Name | GCS Folder Name | Description |
|-------------------|----------------|-------------|
| Material Traceability | MaterialTraceability | Material identification and traceability records |
| Shop Inspection | ShopInspection | Shop floor inspection records |
| Welding | Welding | Welding inspection records and weld maps |
| NDT | NDT | Non-destructive testing records |
| Visual | Visual | Visual inspection records |
| Hydrotest | Hydrotest | Hydrostatic test records |
| NonConformance | NCR | Non-conformance reports |
| Approved Drawing | ApprovedDrawing | Approved engineering drawings |
| DVR | DVR | Design Verification Records |

## Example Paths

### Material Traceability Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/MaterialTraceability/MT-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/MaterialTraceability/MT-002.pdf
```

### Shop Inspection Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/ShopInspection/SI-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/ShopInspection/SI-002.pdf
```

### Welding Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/Welding/W-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/Welding/W-002.pdf
```

### NDT Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/NDT/NDT-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/NDT/NDT-002.pdf
```

### Visual Inspection Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/Visual/VI-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/Visual/VI-002.pdf
```

### Hydrotest Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/Hydrotest/HT-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/Hydrotest/HT-002.pdf
```

### Non-Conformance Reports
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/NCR/NCR-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/NCR/NCR-002.pdf
```

### Approved Drawing Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/ApprovedDrawing/AD-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/ApprovedDrawing/AD-002.pdf
```

### DVR Documents
```
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/DVR/DVR-001.pdf
QMS/Inspections_Records/2025-1/IO-2025-1-M-1/DVR/DVR-002.pdf
```

## Path Components

### Project Code
- Format: `{year}-{project_number}` (e.g., `2025-1`, `2025-2`)
- Fallback: `UNKNOWN` if project code is not available

### Inspection Order Number
- Format: `IO-{year}-{project}-{type}-{sequence}` (e.g., `IO-2025-1-M-1`, `IO-2025-1-B-42`)
- Types: `M` (Manufacturing), `B` (Buy)

### Tab Name
- Mapped according to the table above
- Consistent with database storage and file organization

### Record ID
- Unique identifier for each record within a tab
- Format varies by tab type (e.g., `MT-001`, `SI-001`, `W-001`)

### File Extension
- Preserved from original upload
- Common extensions: `.pdf`, `.jpg`, `.png`, `.doc`, `.docx`

## Implementation Files

The following files handle GCS path structure:

1. **server/utils/inspection-document-upload.ts** - Main upload utility
2. **server/quality/inspection-document-routes.ts** - API endpoints for upload/download/delete
3. **server/utils/final-dossier-generator.ts** - Final dossier compilation

## Backend Tab Name Mapping

All three main functions (upload, download, delete) use consistent tab name mapping:

```javascript
let formattedTabName = tabName;
if (tabName === 'Visual') {
  formattedTabName = 'Visual';
} else if (tabName === 'NonConformance') {
  formattedTabName = 'NCR';
} else if (tabName === 'Shop Inspection') {
  formattedTabName = 'ShopInspection'; // Format for GCS path consistency
} else if (tabName === 'Approved Drawing') {
  formattedTabName = 'ApprovedDrawing'; // Format for GCS path consistency
} else if (tabName === 'DVR') {
  formattedTabName = 'DVR'; // DVR tab maintains same name for GCS path consistency
}
```

## Final Dossier Integration

The Final Dossier generator includes all inspection tabs with their corresponding GCS paths:

```javascript
const inspectionSections = [
  { name: 'Material Traceability', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/MaterialTraceability` },
  { name: 'Shop Inspection', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/ShopInspection` },
  { name: 'Welding', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Welding` },
  { name: 'NDT', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/NDT` },
  { name: 'Visual Inspection', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Visual` },
  { name: 'Hydrotest', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/Hydrotest` },
  { name: 'NCR', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/NCR` },
  { name: 'Approved Drawing', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/ApprovedDrawing` },
  { name: 'DVR', path: `QMS/Inspections_Records/${projectCode}/${inspectionOrderNumber}/DVR` }
];
```

## Status

✅ **ALL 9 INSPECTION TABS FULLY SUPPORTED**

All nine inspection tabs are now properly integrated with:
- Upload functionality
- Download functionality  
- Delete functionality
- Final Dossier generation
- Consistent GCS path structure
- Project-based hierarchical organization

Complete tab integration includes:
1. Material Traceability
2. Shop Inspection  
3. Welding & Weld Maps
4. NDT (Non-Destructive Testing)
5. Visual Inspection
6. Hydrotest
7. NCR (Non-Conformance Reports)
8. Approved Drawing
9. DVR (Design Verification Records)

Last updated: July 22, 2025