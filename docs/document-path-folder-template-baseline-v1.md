# THERMOPAC Document Path & Folder Template — Baseline v1.0

**Status**: Approved for implementation  
**Author**: THERMOPAC ERP  
**Date**: 2026-05-15  

---

## 1. Current Legacy Folder Problem

The legacy SAP/VB macro creates folders **directly on the local Windows file server** under a hardcoded UNC root:

```
\\Server\d\THERMOPAC\SALES\Customer and Lead\TBPL...
```

Problems:
- Hardcoded UNC path in VB macro — breaks on server rename or migration
- No ERP-side governance — folder creation not tracked in the database
- No revision-folder enforcement — engineers manually create `rev-00`, `rev-01`, etc.
- No dynamic assembly expansion — folders are hand-created per project
- No audit trail for folder lifecycle
- Local agent tightly coupled to server path — not cloud-ready

---

## 2. Target Architecture

```
┌──────────────────────────────────────────────────────────┐
│   THERMOPAC Cloud ERP (this system)                     │
│                                                          │
│   Document Path Templates  ──→  Relative path resolver  │
│   Folder Templates         ──→  Folder tree resolver    │
│   resolved_project_folders ──→  ERP audit record        │
│                                                          │
│   NO UNC paths stored. NO local filesystem writes here. │
└──────────────────────────────────────┬───────────────────┘
                                       │  REST API
                                       │  (resolved relative paths)
                         ┌─────────────▼───────────────┐
                         │  Local Windows Document Agent │
                         │  (to be built separately)     │
                         │                               │
                         │  Reads resolved relative paths│
                         │  from ERP API                 │
                         │  Full local path =            │
                         │  allowedRootPath +            │
                         │  Doc Governance template      │
                         │  Creates actual folders       │
                         └───────────────────────────────┘
```

---

## 3. ERP-Owned Relative Path Governance

**Rule**: The ERP stores **only relative path templates**. The `allowedRootPath` is configured in the Windows agent's `config.json` and is never stored in the ERP database.

**Path resolution formula:**
```
Full local path = allowedRootPath + Doc Governance relative template
```

**Example:**
```
allowedRootPath : \\SERVER\d\THERMOPAC
template        : {COMPANY}/{CC}/{CO}/{Cust}/{FY}/{NNN}/2_Design/3_PID
resolved        : \\SERVER\d\THERMOPAC\TPEL\IN\MH\BPCL\2526\042\2_Design\3_PID
```

| Layer | Responsibility | Example |
|---|---|---|
| ERP | Relative path template | `{COMPANY}/{CC}/{CO}/{Cust}/{FY}/{NNN}/1_Sales` |
| ERP | Resolved relative path | `TPEL/EPC/C10357/ApolloRefinery/2627/017/1_Sales` |
| Agent config | `allowedRootPath` | `\\SERVER\d\THERMOPAC` |
| Agent | Full local path | `\\SERVER\d\THERMOPAC\TPEL\EPC\C10357\...` |

> **Important:** `{COMPANY}` is a real token that resolves to the company code (e.g. `TPEL`). It is **not** the Windows root and must not be stripped from templates.

---

## 4. Agent-Owned Physical Root Path

The `allowedRootPath` is owned by the Windows agent and is **never stored in the ERP database**.

The agent config file (on the Windows server) contains:
```json
{
  "allowedRootPath": "\\\\SERVER\\d\\THERMOPAC",
  "erpBaseUrl": "https://erp.thermopac.in/api",
  "pollIntervalSeconds": 30
}
```

The agent prepends `allowedRootPath` to every resolved relative template at runtime to form the full local path.

---

## 5. Document Path Templates

A Document Path Template defines:
- The **relative folder path** for a document type (with tokens)
- The **file name pattern** (with tokens)
- The **revision mode** (`folder` = revision embedded in path, `suffix` = revision in filename)
- The **file extension**

### Token Definitions

| Token | Source | Example |
|---|---|---|
| `{COMPANY}` | Company master | `TPEL` |
| `{CC}` | EPC discipline code | `EPC` |
| `{CO}` | Customer BP code | `C10357` |
| `{Cust}` | Customer short name | `ApolloRefinery` |
| `{FY}` | Financial year (2-digit) | `2627` |
| `{NNN}` | Project sequence (3-digit) | `017` |
| `{PROJECT_CODE}` | Full project code | `TPEL-EPC-C10357-2627-017` |
| `{DocNum}` | Document number | `DDS-001` |
| `{rev}` | Revision number (2-digit) | `00`, `01` |
| `{ItemCode}` | Item/equipment code | `V-001` |
| `{CodeBars}` | Drawing code | `C1EPC7-UOR-005-FEV-3000` |
| `{Assembly}` | Assembly name | `Assembly_1` |
| `{DocumentType}` | Document type code | `OFFER`, `DDS`, `DWG` |
| `{YYMMDD}` | Date stamp | `260515` |
| `{ext}` | File extension | `pdf`, `dwg` |

---

## 6. Folder Templates

A Folder Template defines a **named, versioned tree of folders** that should exist for every project using that template.

- Template code: `EPC_STANDARD_V1`
- Applied per project at project creation or on-demand
- Dynamic nodes (`is_dynamic = true`) are expanded at resolution time using project data (assemblies, dates)
- Revision-controlled nodes include a `/rev-00` subfolder by default

---

## 7. Folder Hierarchy — EPC_STANDARD_V1

```
{COMPANY}/{CC}/{CO}/{Cust}/{FY}/{NNN}/
├── 1_Sales/
│   ├── 1_Pre_Order_Communication/
│   ├── 2_Final_Offer/rev-00/
│   ├── 3_Contract_PO/rev-00/
│   ├── 4_LC_or_Bank/rev-00/
│   ├── 5_Order_Confirmation/rev-00/
│   ├── 6_DP_Proforma_Invoice/rev-00/
│   ├── 7_Minutes_of_Meeting/{YYMMDD}/
│   ├── 8_Document_Submission/
│   ├── 9_Non_Compliance_Report/
│   └── 10_Sales_Internal_Memo/
├── 2_Design/
│   ├── 0_3D_Model_Assembly/
│   ├── 1_BEDD/rev-00/
│   ├── 2_Relevant_Standards/
│   ├── 3_PID/rev-00/
│   ├── 4_Material_and_Heat_Balance/rev-00/
│   ├── 5_HAZOP/rev-00/
│   ├── 6_QAP/rev-00/
│   ├── 7_Tiein_Points/rev-00/
│   ├── 8_GA/rev-00/
│   ├── 9_Foundation/rev-00/
│   ├── 10_Electrical/rev-00/
│   ├── 11_Progress_Report/
│   │   ├── Snaps/rev-00/
│   │   └── PDF/rev-00/
│   ├── 12_Cause_Effect/rev-00/
│   ├── 13_Data_Sheet_For_Approval/rev-00/
│   ├── 14_Inspection_Reports/rev-00/
│   ├── 15_Design_Calculation/
│   │   ├── Structural_Design/rev-00/
│   │   └── {Assembly}/           ← dynamic per project assemblies
│   │       ├── Drawing_PDF/rev-00/
│   │       └── PVElite/rev-00/
│   └── 16_Operation_Maintenance_Manual/rev-00/
├── 3_Purchase/
│   ├── BOQ/
│   │   └── {Assembly}/rev-00/    ← dynamic
│   ├── Purchase_Orders/rev-00/
│   ├── RFQ/rev-00/
│   ├── TBE/rev-00/
│   └── CBE/rev-00/
├── 4_Production/
│   ├── 1_Project_Scheduling/rev-00/
│   ├── 2_CNC_Cutting/
│   │   └── {Assembly}/rev-00/    ← dynamic
│   ├── 3_Production_Drawings/
│   │   └── {Assembly}/rev-00/    ← dynamic
│   ├── 4_Asbuilt/
│   │   └── {Assembly}/rev-00/    ← dynamic
│   └── 5_MDR/
│       └── {Assembly}/rev-00/    ← dynamic
├── 5_Accounts/
│   ├── Invoice/
│   ├── Packing_List/
│   ├── Airway_Bill_BL/
│   └── Payment_Receipt/
└── 6_After_Sales/
    ├── PLC/
    │   └── PLC_Program/rev-00/
    ├── SCADA/
    │   └── SCADA_Program/rev-00/
    └── Test_Run_Commissioning/
```

---

## 7A. Initial Project Folder Template — Approved Mandatory Path List

**Every listed path shall be included in the initial project folder template.**

Paths are relative to:

```
TPEL/PROJECTS/{CC}/{CO}/{Cust}/{FY}/SOR_{NNN}/
```

No additional folders or subfolders shall be created unless explicitly approved by the
Project Owner. No listed folder shall be omitted.

Intermediate parent directories not listed below (e.g. `2_Design`, `3_Purchase`,
`4_Production`, `5_Accounts`, `6_After_Sales`, `2_Design/11_Progress_Report`,
`2_Design/15_Design_Calculation`, `6_After_Sales/PLC`, `6_After_Sales/Scada`) shall be
created by the agent as required to satisfy the listed paths. They are not themselves
mandatory template entries.

### Mandatory Paths (41 total — Project Owner approved 2026-07-30)

```
 1  1_Sales
 2  1_Sales/1_Pre_Order_Communication
 3  1_Sales/2_Final_Offer
 4  1_Sales/3_Contract_PO
 5  1_Sales/4_LC_or_Bank
 6  1_Sales/5_Order_Conformation
 7  1_Sales/6_DP_Proforma_Invoice
 8  1_Sales/7_Minutes_of_meeting
 9  1_Sales/8_Document_Submission
10  1_Sales/9_Non_Compliance_Report
11  1_Sales/10_Sales_Internal_Memo

12  2_Design/0_3D_Model_Assembly
13  2_Design/1_BEDD
14  2_Design/2_Relevant_Standards
15  2_Design/3_P_ID
16  2_Design/4_Material_and_heat_balance
17  2_Design/5_Hazop
18  2_Design/6_QAP
19  2_Design/7_Tiein_points
20  2_Design/8_GA
21  2_Design/9_Foundation
22  2_Design/10_Electrical
23  2_Design/11_Progress_Report/Snaps
24  2_Design/12_Cause_Effect
25  2_Design/13_Data_sheet_for_approval
26  2_Design/14_Inspection_Reports
27  2_Design/15_Design_Calculation/Structural_Design
28  2_Design/16_Operation_Maintenance_Manual

29  3_Purchase/Purchase_Orders

30  4_Production/1_Project_Scheduling
31  4_Production/2_CNC_Cutting
32  4_Production/3_Production_Drawings
33  4_Production/4_Asbuilt
34  4_Production/5_MDR

35  5_Accounts/Invoice
36  5_Accounts/Packing_List
37  5_Accounts/Airway_Bill_BL
38  5_Accounts/Payment_Receipt

39  6_After_Sales/PLC/PLC_program
40  6_After_Sales/Scada/Scada_program
41  6_After_Sales/Test_Run_Commissioning
```

---

## 8. Dynamic Assembly Rule

- Assembly folders (`{Assembly}`) are **not hardcoded**
- At resolution time, the resolver reads the project's assembly master
- If no assemblies exist: no assembly folders created unless `fallback_assembly_enabled = true` in config (creates `Assembly_1` only)
- Assembly names are validated — no special characters, no path separators

---

## 9. Security Rules

The path resolver enforces these rules on every template and every resolved path:

| Rule | Description |
|---|---|
| No UNC paths | Reject paths starting with `\\` |
| No drive paths | Reject paths starting with `C:\`, `D:\`, etc. |
| No traversal | Reject any segment containing `..` |
| No blank segments | Reject paths with `//` or leading/trailing `/` segments |
| No unknown tokens | Reject any `{TOKEN}` that is not in the allowed token list |
| No unresolved tokens | Reject any `{TOKEN}` remaining after resolution |
| Normalize separators | Replace `\` with `/` everywhere |
| No invalid Windows chars | Reject `<`, `>`, `:`, `"`, `|`, `?`, `*` in path segments |
| No absolute paths | Relative paths only — no leading `/` |

---

## 10. Acceptance Tests

| Test | Expected |
|---|---|
| Valid OFFER path resolves | `TPEL/EPC/C10357/ApolloRefinery/2627/017/1_Sales/2_Final_Offer/rev-00` |
| Valid DDS path resolves | `TPEL/EPC/C10357/ApolloRefinery/2627/017/V-001/DDS` |
| Valid DWG path resolves | `TPEL/EPC/C10357/ApolloRefinery/2627/017/V-001/DWG` |
| Invalid token rejected | `{UNKNOWN}` → error |
| `../` path rejected | error |
| `C:\` path rejected | error |
| `\\Server` path rejected | error |
| Dynamic assembly expansion | Assembly_1, Assembly_2 folders generated |
| `resolved_project_folders` records created | DB rows confirmed |
| No local filesystem write | Confirmed — no `fs.mkdir`, no SMB, no UNC in service |

---

## 11. Phase Delivery Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Baseline document | ✅ Complete |
| Phase 2 | Database tables | ✅ Complete |
| Phase 3 | Path Resolver Service | ✅ Complete |
| Phase 4 | Folder Template Seed Data | ✅ Complete |
| Phase 5 | Document Path Template Seed Data | ✅ Complete |
| Phase 6 | UI Admin Page | ✅ Complete |
| Phase 7 | Folder Resolution Service | ✅ Complete |
| Phase 8 | Security & Validation | ✅ Complete |
| Local Document Agent | Windows agent for physical folder creation | ⏳ Future phase |
| SMB / UNC write | Physical server write | ⏳ Future phase |
| SolidWorks integration | Not in scope here | ⏳ Future phase |
