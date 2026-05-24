# Automation Engineering Module — Execution Plan v1.0

**Status:** PLAN — NOT IMPLEMENTED  
**Date:** 2026-05-24  
**Author:** THERMOPAC QMS Agent  
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 1. Module Overview

### 1.1 Name
Automation Engineering

### 1.2 Objective
Convert BUY List items into complete automation engineering deliverables:
Instrument/Equipment Register → IO List → PLC Tag DB → SCADA Tag DB → Interlocks → FAT/SAT

### 1.3 Primary Flow
```
BUY List
  └─► Auto-Classification Engine
        ├─► Instrument Register
        ├─► Equipment Register
        └─► IO List
              ├─► PLC Tag Database
              │     ├─► Digital Tags (DI/DO)
              │     ├─► Analog Tags (AI/AO)
              │     ├─► Alarm Tags
              │     ├─► Interlock Tags
              │     ├─► Command Tags
              │     └─► Status Tags
              ├─► SCADA Tag Database
              │     ├─► Alarm Mapping
              │     ├─► Trend Mapping
              │     ├─► Faceplate Mapping
              │     └─► Operator Display Mapping
              ├─► Interlock Matrix
              ├─► PLC Hardware Sizing
              │     └─► PLC BOM
              └─► FAT/SAT Checklists
```

### 1.4 Navigation Placement
Below **Project Management** in `client/src/components/layout.tsx`.  
Inserted after line 487 (end of Project Management block), before line 488 (Drawing Verification block).

```tsx
// New block inserted between Project Management and Drawing Verification:
...(hasViewPermission("Automation Engineering") ? [{
  icon: Cpu,
  label: "Automation Engineering",
  isSubmenu: true,
  isOpen: isAutomationMenuOpen,
  toggle: () => setIsAutomationMenuOpen(!isAutomationMenuOpen),
  children: [
    { icon: BarChart4, label: "AE Dashboard", href: "/automation/dashboard" },
    { icon: List, label: "Instrument Register", href: "/automation/instrument-register" },
    { icon: Settings, label: "Equipment Register", href: "/automation/equipment-register" },
    { icon: Layers, label: "IO List", href: "/automation/io-list" },
    { icon: Database, label: "PLC Tag Database", href: "/automation/plc-tags" },
    { icon: Monitor, label: "SCADA Tag Database", href: "/automation/scada-tags" },
    { icon: Shield, label: "Interlock Matrix", href: "/automation/interlocks" },
    { icon: Cpu, label: "PLC Hardware Sizing", href: "/automation/plc-sizing" },
    { icon: FileText, label: "PLC BOM", href: "/automation/plc-bom" },
    { icon: CheckSquare, label: "FAT/SAT", href: "/automation/fat-sat" },
  ]
}] : []),
```

---

## 2. Auto-Classification Rules

### 2.1 Source
`project_buy_list_lines` joined to `buy_groups` and `buy_subgroups`.

### 2.2 Classification Map

| buy_subgroup_code | Automation Class | Register | IO Generated |
|---|---|---|---|
| `pressure` | Instrument — PT | Instrument Register | AI (4–20mA) or DI |
| `temperature` | Instrument — TT | Instrument Register | AI (4–20mA) or DI (thermocouple) |
| `flow` | Instrument — FT | Instrument Register | AI (4–20mA) or DI (pulse) |
| `level` | Instrument — LT | Instrument Register | AI (4–20mA) or DI |
| `isolation` | Valve — XV | Equipment Register | DI × 2 (ZSO/ZSC) + DO × 2 (open/close) |
| `control` | Valve — CV | Equipment Register | AI × 1 (PV) + AO × 1 (SP) + DI × 1 |
| `safety` | Valve — PSV | Equipment Register | DI × 1 (status) |
| `on_off` | Valve — XV | Equipment Register | DI × 2 (ZSO/ZSC) + DO × 2 (open/close) |
| `pump_skid` | Equipment — Pump | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 (start) |
| `centrifugal` | Equipment — Pump | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 (start) |
| `gear` | Equipment — Pump | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 (start) |
| `screw` | Equipment — Pump | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 (start) |
| `multistage` | Equipment — Pump | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 (start) |
| `dosing_metering` | Equipment — Pump | Equipment Register | DI × 3 + DO × 1 + AO × 1 (speed) |
| `vacuum_boosters` | Equipment — Pump | Equipment Register | DI × 3 + DO × 1 |
| `vacuum_pump` | Equipment — Pump | Equipment Register | DI × 3 + DO × 1 |
| `hand_pump` | Equipment — Pump (manual) | Equipment Register | DI × 1 (status only) |
| `non_flameproof` | Equipment — Motor | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 |
| `flameproof` | Equipment — Motor | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 |
| `motors` | Equipment — Motor | Equipment Register | DI × 3 (run/fault/ready) + DO × 1 |
| `panels` | Equipment — Panel | Equipment Register | Panel IO — expanded from sub-items |
| `cabling` | No IO | — | None |
| `cooling_tower` | Equipment — CT | Equipment Register | DI × 3 + DO × 1 + AI × 1 (temp) |
| `junction_box` | No IO | — | None |
| Raw Materials group | No IO | — | None |

**VFD rule:** If `technical_attributes.has_vfd = true` on any pump/motor line → add AO × 1 (speed reference) + AI × 1 (speed feedback).  
**Analyzer rule:** If `buy_subgroup_code` is `analyzer` (future catalog entry) → AI × 2 + DI × 1 + DO × 1.

---

## 3. Database Schema

### 3.1 New Tables

#### `ae_registers`
Master register header — one per project.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int FK projects.id NOT NULL | |
| register_number | varchar(50) NOT NULL | e.g. `2627-018-AER-001` |
| status | varchar(20) NOT NULL | `draft` / `released` / `superseded` |
| revision | varchar(10) NOT NULL DEFAULT `A` | |
| generated_from_buy_list | boolean NOT NULL DEFAULT true | |
| created_by | int FK users.id | |
| approved_by | int FK users.id | |
| approved_at | timestamp | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_instrument_register`
One row per instrument on the project.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| register_id | int FK ae_registers.id | |
| tag_no | varchar(50) NOT NULL | Source: buy_list tag_no |
| buy_list_line_id | int FK project_buy_list_lines.id | |
| instrument_class | varchar(30) | PT / TT / FT / LT |
| service_description | text | |
| line_tag | varchar(50) | Process line tag |
| fluid | varchar(100) | |
| process_min | numeric | |
| process_normal | numeric | |
| process_max | numeric | |
| units | varchar(20) | |
| operating_temp | numeric | |
| operating_pressure | numeric | |
| range_min | numeric | |
| range_max | numeric | |
| signal_type | varchar(20) | `4-20mA` / `digital` / `thermocouple` / `pulse` |
| power_supply | varchar(20) | `24VDC` / `240VAC` |
| hazardous_area | boolean DEFAULT false | |
| area_classification | varchar(30) | Zone 1 / Zone 2 / Safe Area |
| make | varchar(100) | |
| model | varchar(100) | |
| status | varchar(20) DEFAULT `draft` | |
| revision | varchar(10) DEFAULT `A` | |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_equipment_register`
One row per tagged equipment item.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| register_id | int FK ae_registers.id | |
| tag_no | varchar(50) NOT NULL | |
| buy_list_line_id | int FK project_buy_list_lines.id | |
| equipment_class | varchar(30) | Pump / Motor / Valve / VFD / Panel / CT |
| equipment_type | varchar(50) | Centrifugal / Gear / XV / CV / etc. |
| service_description | text | |
| installed_on | varchar(30) | Skid-1 / Skid-2 etc. |
| kw_rating | numeric | |
| voltage | varchar(20) | |
| frequency | varchar(10) | |
| has_vfd | boolean DEFAULT false | |
| hazardous_area | boolean DEFAULT false | |
| area_classification | varchar(30) | |
| make | varchar(100) | |
| model | varchar(100) | |
| status | varchar(20) DEFAULT `draft` | |
| revision | varchar(10) DEFAULT `A` | |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_io_list`
One row per IO point.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| register_id | int FK ae_registers.id | |
| io_number | varchar(50) NOT NULL | e.g. `2627-018-DI-001` |
| io_type | varchar(5) NOT NULL | `DI` / `DO` / `AI` / `AO` |
| tag_no | varchar(50) | Source instrument/equipment tag |
| signal_description | varchar(200) NOT NULL | e.g. `P-101 Run Feedback` |
| signal_type | varchar(30) | `24VDC dry contact` / `4-20mA` / `0-10V` |
| instrument_register_id | int FK ae_instrument_register.id | null if equipment |
| equipment_register_id | int FK ae_equipment_register.id | null if instrument |
| plc_rack | varchar(20) | Populated after PLC sizing |
| plc_slot | varchar(20) | Populated after PLC sizing |
| plc_channel | int | Populated after PLC sizing |
| plc_tag_id | int FK ae_plc_tags.id | |
| cable_ref | varchar(50) | |
| panel_tag | varchar(50) | |
| loop_no | varchar(50) | |
| is_spare | boolean DEFAULT false | |
| hazardous_area | boolean DEFAULT false | |
| notes | text | |
| sort_order | int | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_plc_tags`
PLC tag database — one row per tag.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| register_id | int FK ae_registers.id | |
| tag_name | varchar(100) NOT NULL | e.g. `P101_RUN_FB` |
| tag_type | varchar(20) NOT NULL | `BOOL` / `INT` / `REAL` / `DINT` |
| tag_class | varchar(20) NOT NULL | `DI` / `DO` / `AI` / `AO` / `ALARM` / `INTERLOCK` / `COMMAND` / `STATUS` / `INTERNAL` |
| io_list_id | int FK ae_io_list.id | null for internal/calculated tags |
| description | varchar(200) | |
| address | varchar(50) | e.g. `%I0.0` (Siemens) / `Local:1:I.Data.0` (AB) |
| plc_vendor | varchar(30) | `Siemens` / `Allen Bradley` / `Schneider` / `Delta` |
| data_type_override | varchar(30) | |
| initial_value | varchar(50) | |
| alarm_limit_hi | numeric | For AI/AO tags |
| alarm_limit_lo | numeric | |
| alarm_limit_hihi | numeric | |
| alarm_limit_lolo | numeric | |
| engineering_unit | varchar(20) | |
| is_retained | boolean DEFAULT false | |
| is_safety | boolean DEFAULT false | |
| scada_tag_id | int FK ae_scada_tags.id | |
| revision | varchar(10) DEFAULT `A` | |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

UNIQUE: `(project_id, tag_name)`

#### `ae_scada_tags`
SCADA tag database — one row per SCADA point.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| register_id | int FK ae_registers.id | |
| scada_tag | varchar(100) NOT NULL | |
| plc_tag_id | int FK ae_plc_tags.id | |
| data_type | varchar(20) | |
| description | varchar(200) | |
| alarm_enabled | boolean DEFAULT false | |
| alarm_message | varchar(200) | |
| alarm_priority | int | 1 = high, 3 = low |
| trend_enabled | boolean DEFAULT false | |
| trend_interval_sec | int | |
| faceplate_type | varchar(50) | `motor` / `valve` / `pid` / `analog` / `digital` |
| operator_display | varchar(100) | Display group name |
| hmi_visible | boolean DEFAULT true | |
| read_only | boolean DEFAULT false | |
| engineering_unit | varchar(20) | |
| scale_min | numeric | |
| scale_max | numeric | |
| revision | varchar(10) DEFAULT `A` | |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

UNIQUE: `(project_id, scada_tag)`

#### `ae_interlocks`
Interlock matrix.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| register_id | int FK ae_registers.id | |
| interlock_number | varchar(50) NOT NULL | e.g. `2627-018-IL-001` |
| interlock_type | varchar(20) | `shutdown` / `permissive` / `alarm` / `sequence` |
| description | varchar(200) NOT NULL | |
| cause_tag | varchar(100) NOT NULL | Initiating tag |
| cause_condition | varchar(50) | `> setpoint` / `= 0` / `= 1` etc. |
| effect_tag | varchar(100) NOT NULL | Acted-upon tag |
| effect_action | varchar(50) | `trip` / `start` / `stop` / `open` / `close` |
| plc_tag_id | int FK ae_plc_tags.id | |
| time_delay_sec | int DEFAULT 0 | |
| bypass_allowed | boolean DEFAULT false | |
| safety_critical | boolean DEFAULT false | |
| fat_required | boolean DEFAULT true | |
| revision | varchar(10) DEFAULT `A` | |
| approved_by | int FK users.id | |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_plc_hardware`
PLC hardware selection — one header per project.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL UNIQUE | |
| register_id | int FK ae_registers.id | |
| plc_vendor | varchar(30) NOT NULL | `Siemens` / `Allen Bradley` / `Schneider` / `Delta` |
| plc_family | varchar(50) | e.g. `S7-1500` / `ControlLogix` / `Modicon M340` / `DVP` |
| cpu_model | varchar(100) | |
| io_topology | varchar(20) | `local` / `remote` / `distributed` |
| network_protocol | varchar(30) | `Ethernet/IP` / `Profinet` / `Modbus TCP` / `Modbus RTU` |
| spare_io_pct | int DEFAULT 15 | Target spare IO percentage |
| total_di | int DEFAULT 0 | |
| total_do | int DEFAULT 0 | |
| total_ai | int DEFAULT 0 | |
| total_ao | int DEFAULT 0 | |
| spare_di | int DEFAULT 0 | |
| spare_do | int DEFAULT 0 | |
| spare_ai | int DEFAULT 0 | |
| spare_ao | int DEFAULT 0 | |
| status | varchar(20) DEFAULT `draft` | |
| revision | varchar(10) DEFAULT `A` | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_plc_racks`
Rack/slot configuration.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| hardware_id | int FK ae_plc_hardware.id NOT NULL | |
| rack_number | int NOT NULL | |
| rack_type | varchar(30) | `local` / `remote` |
| rack_location | varchar(100) | Physical location description |
| max_slots | int NOT NULL | |
| notes | text | |

#### `ae_plc_modules`
Individual modules per rack.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| rack_id | int FK ae_plc_racks.id NOT NULL | |
| slot_number | int NOT NULL | |
| module_type | varchar(20) NOT NULL | `CPU` / `DI` / `DO` / `AI` / `AO` / `COM` / `PSU` / `SPARE` |
| module_model | varchar(100) | |
| channel_count | int | |
| vendor_part_no | varchar(100) | |
| unit_price | numeric | |
| quantity | int DEFAULT 1 | |
| notes | text | |

#### `ae_plc_bom`
Generated BOM from PLC hardware.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| hardware_id | int FK ae_plc_hardware.id | |
| bom_number | varchar(50) NOT NULL | |
| revision | varchar(10) DEFAULT `A` | |
| status | varchar(20) DEFAULT `draft` | |
| total_estimated_cost | numeric | |
| approved_by | int FK users.id | |
| approved_at | timestamp | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_plc_bom_lines`
Line items of the PLC BOM.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| bom_id | int FK ae_plc_bom.id NOT NULL | |
| line_number | int NOT NULL | |
| module_id | int FK ae_plc_modules.id | |
| item_description | varchar(200) NOT NULL | |
| vendor_part_no | varchar(100) | |
| quantity | int NOT NULL | |
| unit_price | numeric | |
| total_price | numeric | |
| notes | text | |

#### `ae_fat_sat_checklists`
FAT/SAT checklist header.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| register_id | int FK ae_registers.id | |
| checklist_number | varchar(50) NOT NULL | |
| checklist_type | varchar(10) NOT NULL | `FAT` / `SAT` |
| status | varchar(20) DEFAULT `draft` | `draft` / `in_progress` / `completed` / `failed` |
| revision | varchar(10) DEFAULT `A` | |
| tested_by | int FK users.id | |
| witnessed_by | int FK users.id | |
| test_date | date | |
| result | varchar(20) | `pass` / `fail` / `conditional` |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

#### `ae_fat_sat_checklist_items`
Individual test items.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| checklist_id | int FK ae_fat_sat_checklists.id NOT NULL | |
| item_number | int NOT NULL | |
| test_category | varchar(30) NOT NULL | `io_test` / `loop_check` / `interlock_test` / `alarm_verification` / `scada_verification` / `sequence_verification` |
| tag_no | varchar(50) | |
| io_list_id | int FK ae_io_list.id | |
| interlock_id | int FK ae_interlocks.id | |
| description | varchar(300) NOT NULL | |
| expected_result | varchar(200) | |
| actual_result | varchar(200) | |
| status | varchar(20) DEFAULT `not_tested` | `not_tested` / `pass` / `fail` / `na` |
| remarks | text | |
| tested_at | timestamp | |

#### `ae_revisions`
Revision log for all AE documents.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int NOT NULL | |
| document_type | varchar(30) NOT NULL | `instrument_register` / `io_list` / `plc_tags` / `scada_tags` / `interlocks` / `plc_bom` / `fat_sat` |
| document_id | int NOT NULL | FK to relevant table |
| revision | varchar(10) NOT NULL | |
| change_description | text NOT NULL | |
| changed_by | int FK users.id NOT NULL | |
| changed_at | timestamp DEFAULT NOW() NOT NULL | |
| approved_by | int FK users.id | |
| approved_at | timestamp | |

---

## 4. Document Numbering

All AE documents use `getNextDocSeq()` (existing `server/doc-sequence-service.ts`).

| Document | Prefix | Example |
|---|---|---|
| AE Register | `AER` | `2627-018-AER-001` |
| IO List | `IOL` | `2627-018-IOL-001` |
| IO Number (DI) | `DI` | `2627-018-DI-001` |
| IO Number (DO) | `DO` | `2627-018-DO-001` |
| IO Number (AI) | `AI` | `2627-018-AI-001` |
| IO Number (AO) | `AO` | `2627-018-AO-001` |
| Interlock | `IL` | `2627-018-IL-001` |
| PLC BOM | `PLCBOM` | `2627-018-PLCBOM-001` |
| FAT Checklist | `FAT` | `2627-018-FAT-001` |
| SAT Checklist | `SAT` | `2627-018-SAT-001` |

---

## 5. PLC Tag Naming Convention

Format: `{TAG_NO}_{SIGNAL_SUFFIX}`

| Signal type | Suffix | Example |
|---|---|---|
| DI — Run feedback | `_RUN_FB` | `P101_RUN_FB` |
| DI — Trip/fault | `_TRIP_FB` | `P101_TRIP_FB` |
| DI — Ready | `_RDY_FB` | `P101_RDY_FB` |
| DI — ZSO (valve open) | `_ZSO` | `XV101_ZSO` |
| DI — ZSC (valve closed) | `_ZSC` | `XV101_ZSC` |
| DO — Start command | `_START_CMD` | `P101_START_CMD` |
| DO — Stop command | `_STOP_CMD` | `P101_STOP_CMD` |
| DO — Open command | `_OPN_CMD` | `XV101_OPN_CMD` |
| DO — Close command | `_CLS_CMD` | `XV101_CLS_CMD` |
| AI — Process value | `_PV` | `PT101_PV` |
| AO — Set point | `_SP` | `CV101_SP` |
| AO — Speed reference (VFD) | `_SPD_REF` | `P101_SPD_REF` |
| AI — Speed feedback (VFD) | `_SPD_FB` | `P101_SPD_FB` |
| ALARM — High | `_ALM_HI` | `PT101_ALM_HI` |
| ALARM — High-High | `_ALM_HH` | `PT101_ALM_HH` |
| ALARM — Low | `_ALM_LO` | `PT101_ALM_LO` |
| ALARM — Low-Low | `_ALM_LL` | `PT101_ALM_LL` |
| INTERLOCK — Cause bit | `_IL_CAUSE` | `PT101_IL_CAUSE` |
| INTERLOCK — Trip bit | `_IL_TRIP` | `P101_IL_TRIP` |

Tag names: uppercase only. Characters allowed: `A–Z`, `0–9`, `_`. Max 32 chars.

---

## 6. SCADA Tag Naming Convention

Format: `{AREA}.{TAG_NO}.{SIGNAL}`  
Area derived from `installed_on` (Skid-1 → `SK1`, Skid-2 → `SK2`, null → `GEN`).

Example: `SK1.P101.RUN`, `SK1.PT102.PV`, `GEN.XV201.ZSO`

---

## 7. PLC Hardware Sizing Engine

### 7.1 IO Count Derivation
IO counts are summed from `ae_io_list` per `io_type` for the project.

### 7.2 Spare IO
```
required_di = count(DI) × (1 + spare_io_pct/100)
required_do = count(DO) × (1 + spare_io_pct/100)
required_ai = count(AI) × (1 + spare_io_pct/100)
required_ao = count(AO) × (1 + spare_io_pct/100)
```
Default spare = 15%. Configurable per project (10–20% range enforced).

### 7.3 Module Selection Tables (per vendor)

#### Siemens S7-1500
| Module | Part No | Channels | Type |
|---|---|---|---|
| CPU 1511-1 PN | 6ES7511-1AK02-0AB0 | — | CPU |
| SM 1221 DC16 | 6ES7221-1BH32-0XB0 | 16 | DI |
| SM 1222 DC16 | 6ES7222-1BH32-0XB0 | 16 | DO |
| SM 1231 AI4 | 6ES7231-4HD32-0XB0 | 4 | AI |
| SM 1232 AO2 | 6ES7232-4HB32-0XB0 | 2 | AO |
| CM 1241 RS485 | 6ES7241-1CH32-4XB0 | — | COM (Modbus RTU) |
| PM 70W | 6EP1332-4BA00 | — | PSU |

#### Allen Bradley ControlLogix
| Module | Part No | Channels | Type |
|---|---|---|---|
| CPU 1756-L73 | 1756-L73 | — | CPU |
| 1756-IB16D | 1756-IB16D | 16 | DI |
| 1756-OB16D | 1756-OB16D | 16 | DO |
| 1756-IF8 | 1756-IF8 | 8 | AI |
| 1756-OF8 | 1756-OF8 | 8 | AO |
| 1756-EN2T | 1756-EN2T | — | COM (Ethernet/IP) |
| 1756-PA75 | 1756-PA75 | — | PSU |

#### Schneider Modicon M340
| Module | Part No | Channels | Type |
|---|---|---|---|
| CPU BMX P34 2020 | BMXP342020 | — | CPU |
| BMX DDI 1602 | BMXDDI1602 | 16 | DI |
| BMX DDO 1602 | BMXDDO1602 | 16 | DO |
| BMX AMI 0410 | BMXAMI0410 | 4 | AI |
| BMX AMO 0210 | BMXAMO0210 | 2 | AO |
| BMX NOE 0100 | BMXNOE0100 | — | COM (Modbus TCP) |
| BMX CPS 3500 | BMXCPS3500 | — | PSU |

#### Delta DVP Series
| Module | Part No | Channels | Type |
|---|---|---|---|
| DVP28SV11T | DVP28SV11T | — | CPU |
| DVP16SM11N (DI) | DVP16SM11N | 16 | DI |
| DVP16SM11N (DO) | DVP16SN11R | 16 | DO |
| DVP04AD-S | DVP04AD-S | 4 | AI |
| DVP02DA-H | DVP02DA-H | 2 | AO |
| DVP-F232 | DVP-F232 | — | COM (Modbus RTU) |

### 7.4 Sizing Algorithm
1. Calculate total IO required (including spare).
2. For each IO type: `modules_needed = CEILING(required_count / channels_per_module)`.
3. Assign modules to racks left-to-right, slot 0 = PSU, slot 1 = CPU (rack 0 only).
4. Max 12 slots per rack (configurable). When rack full → create new rack.
5. CPU determined by total IO count thresholds (defined per vendor in service config).
6. Always include 1 COM module per network protocol in use.

---

## 8. IO Generation Rules (Auto-Generation Engine)

### 8.1 Trigger
Called via `POST /api/automation/projects/:projectId/generate-io`  
Source: all `project_buy_list_lines` for the project that have a non-empty `tag_no`.

### 8.2 Generation Logic (per line)
1. Resolve `buy_subgroup_code` from `buy_subgroups`.
2. Look up IO template from Classification Map (§2.2).
3. For each IO point in template: insert one row into `ae_io_list` + one row into `ae_plc_tags`.
4. If `has_vfd = true` in `technical_attributes`: add `AO × 1` (speed ref) + `AI × 1` (speed fb).
5. Insert SCADA tags for each PLC tag.
6. Assign sequential IO numbers within type (`DI-001`, `DI-002`, …).
7. All inserts within a single `pg_advisory_xact_lock(projectId)` transaction.

### 8.3 Idempotency
If `ae_io_list` row already exists for `(project_id, tag_no, io_type)` → skip (do not duplicate). Re-generation only adds new points for tags added to the BUY list since last run.

---

## 9. Interlock Engine

### 9.1 Standard Auto-Generated Interlocks
The following interlocks are auto-generated based on classification:

| Cause | Condition | Effect | Type |
|---|---|---|---|
| Any pump TRIP_FB | = 1 | Same pump STOP | shutdown |
| Any pump — LT (suction) | < LO setpoint | Pump STOP | shutdown |
| Any pump — PSV (outlet) | > HI setpoint | Pump STOP | shutdown |
| Any XV (isolation) — ZSC | = 0 (not closed) after 10s | Alarm | alarm |
| Any CV — PV | > HH setpoint | Alarm + output clamp | alarm |

### 9.2 Manual Interlocks
Users can add custom interlocks via the Interlock Matrix UI.

### 9.3 Interlock Matrix Document
Exported as Excel with cause–effect matrix grid (cause rows × effect columns).

---

## 10. FAT/SAT Generation Logic

### 10.1 Auto-Generated Test Items

| Category | Source | Items generated |
|---|---|---|
| `io_test` | `ae_io_list` | One item per IO point (inject signal, verify PLC reads) |
| `loop_check` | `ae_io_list` WHERE ai/ao | One item per analog loop (inject 4mA / 20mA, verify scaling) |
| `interlock_test` | `ae_interlocks` | One item per interlock (force cause, verify effect) |
| `alarm_verification` | `ae_scada_tags` WHERE alarm_enabled | One item per alarm tag (trigger, verify HMI display) |
| `scada_verification` | `ae_scada_tags` WHERE hmi_visible | One item per SCADA point (verify readback in HMI) |
| `sequence_verification` | Manual — user-defined | Entered by engineer |

### 10.2 FAT vs SAT
- **FAT** (Factory Acceptance Test): Generated at `draft` status, run at factory.
- **SAT** (Site Acceptance Test): Clone of FAT with additional site-specific items. Status tracking independent.

---

## 11. Revision Control

### 11.1 Rules
- Every document (register, IO list, PLC tags, SCADA tags, interlocks, PLC BOM, FAT/SAT) has a `revision` field.
- Revision sequence: `A → B → C … → Z → AA → AB …`
- Every change after `released` status creates a new revision record in `ae_revisions`.
- Released documents cannot be edited in-place — they must be revised (clone + increment revision).
- `superseded` status is set on the old revision when a new revision is released.

### 11.2 Revision Trigger
`POST /api/automation/projects/:projectId/registers/:registerId/revise`  
Body: `{ change_description: string }`  
Action: Clones all child records, increments revision, sets old to `superseded`.

---

## 12. Approval Workflow

### 12.1 Status State Machine
```
draft → submitted → approved → released
                 └→ rejected → draft
```

### 12.2 Who Can Approve
- `approved_by` must have role `Manager` / `Senior Manager` / `General Manager` / `Superuser`.
- Self-approval prohibited (approver ≠ creator).

### 12.3 Approval Routes
| Action | Route |
|---|---|
| Submit for approval | `POST /api/automation/registers/:id/submit` |
| Approve | `POST /api/automation/registers/:id/approve` |
| Reject | `POST /api/automation/registers/:id/reject` |
| Release | `POST /api/automation/registers/:id/release` |

---

## 13. Export Engine

### 13.1 Excel Export (all documents)
All exports use `exceljs` (already in project dependencies if present, else install).  
Route: `GET /api/automation/projects/:projectId/export/:docType`  
`docType`: `instrument-register` / `equipment-register` / `io-list` / `plc-tags` / `scada-tags` / `interlock-matrix` / `plc-bom` / `fat-checklist` / `sat-checklist`

### 13.2 GCS Upload (Document Governance)
On release, the exported Excel/PDF is uploaded to GCS at:  
`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/AE/{docType}-rev{revision}.xlsx`

Governed by `docs/gcs-governance-rev5-option-c-baseline.md`.  
GCS path must go through the existing GCS governance layer — no direct upload bypass.

---

## 14. Role Permissions

New module permission key: `"Automation Engineering"`

| Role | View | Create/Edit | Approve | Delete |
|---|---|---|---|---|
| Superuser | ✓ | ✓ | ✓ | ✓ |
| General Manager | ✓ | ✓ | ✓ | ✗ |
| Senior Manager | ✓ | ✓ | ✓ | ✗ |
| Manager | ✓ | ✓ | ✓ | ✗ |
| Senior Executive | ✓ | ✓ | ✗ | ✗ |
| Employee | ✓ | ✗ | ✗ | ✗ |

Page-level permission key: `"automation-engineering"` — checked via `hasPageAccess()`.

---

## 15. API Structure

### 15.1 Register & Generation
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/register` | Get AE register for project |
| POST | `/api/automation/projects/:projectId/register` | Create AE register |
| POST | `/api/automation/projects/:projectId/generate-all` | Run full auto-generation (classify → IO → PLC tags → SCADA tags → interlocks → FAT/SAT skeleton) |
| POST | `/api/automation/projects/:projectId/generate-io` | Regenerate IO list only (incremental) |
| POST | `/api/automation/projects/:projectId/generate-plc-tags` | Regenerate PLC tags only |
| POST | `/api/automation/projects/:projectId/generate-scada-tags` | Regenerate SCADA tags only |
| POST | `/api/automation/projects/:projectId/generate-fat-sat` | Regenerate FAT/SAT skeleton |

### 15.2 Instrument Register
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/instruments` | List all instruments |
| GET | `/api/automation/instruments/:id` | Get instrument detail |
| PATCH | `/api/automation/instruments/:id` | Update instrument |

### 15.3 Equipment Register
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/equipment` | List all equipment |
| GET | `/api/automation/equipment/:id` | Get equipment detail |
| PATCH | `/api/automation/equipment/:id` | Update equipment |

### 15.4 IO List
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/io-list` | List all IO (filterable by type) |
| PATCH | `/api/automation/io/:id` | Update IO point (cable ref, loop no, notes) |
| PATCH | `/api/automation/io/:id/assign-plc` | Assign rack/slot/channel |

### 15.5 PLC Tags
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/plc-tags` | List all PLC tags |
| PATCH | `/api/automation/plc-tags/:id` | Update tag (address, limits, notes) |

### 15.6 SCADA Tags
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/scada-tags` | List all SCADA tags |
| PATCH | `/api/automation/scada-tags/:id` | Update tag |

### 15.7 Interlocks
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/interlocks` | List all interlocks |
| POST | `/api/automation/projects/:projectId/interlocks` | Add manual interlock |
| PATCH | `/api/automation/interlocks/:id` | Update interlock |
| DELETE | `/api/automation/interlocks/:id` | Delete (draft only) |

### 15.8 PLC Hardware & BOM
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/plc-hardware` | Get hardware config |
| POST | `/api/automation/projects/:projectId/plc-hardware` | Create/update hardware selection |
| POST | `/api/automation/projects/:projectId/plc-hardware/size` | Run auto-sizing engine |
| GET | `/api/automation/projects/:projectId/plc-bom` | Get PLC BOM |

### 15.9 FAT/SAT
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/fat-sat` | List all checklists |
| GET | `/api/automation/fat-sat/:id` | Get checklist with items |
| PATCH | `/api/automation/fat-sat/items/:id` | Update test item result |
| POST | `/api/automation/fat-sat/:id/complete` | Mark checklist complete |

### 15.10 Export & Approval
| Method | Route | Action |
|---|---|---|
| GET | `/api/automation/projects/:projectId/export/:docType` | Download Excel export |
| POST | `/api/automation/registers/:id/submit` | Submit for approval |
| POST | `/api/automation/registers/:id/approve` | Approve |
| POST | `/api/automation/registers/:id/reject` | Reject |
| POST | `/api/automation/registers/:id/release` | Release + GCS upload |
| POST | `/api/automation/registers/:id/revise` | Create new revision |

---

## 16. UI Pages

### 16.1 AE Dashboard `/automation/dashboard`
- Summary cards: IO count by type, tag counts, FAT/SAT status, pending approvals.
- Generation status per project.
- Quick-action: "Run Full Generation" button (project-scoped).

### 16.2 Instrument Register `/automation/instrument-register`
- Table: tag_no, class, service description, signal type, range, area classification.
- Inline edit for engineering fields.
- Filter by: instrument class, signal type, area.
- Export button → Excel download.

### 16.3 Equipment Register `/automation/equipment-register`
- Table: tag_no, class, type, kW, voltage, VFD, area.
- Filter by: equipment class, installed_on (skid).
- Export button.

### 16.4 IO List `/automation/io-list`
- Table grouped by IO type (DI / DO / AI / AO).
- Columns: IO number, tag_no, description, signal type, PLC address, cable ref, loop no.
- Inline edit: cable ref, loop no, notes.
- "Assign PLC slot" action per row.
- Export button.

### 16.5 PLC Tag Database `/automation/plc-tags`
- Table: tag_name, type, class, description, address, alarm limits.
- Filter by: tag class, PLC vendor.
- Inline edit: address, limits, notes.
- Export button (generates tag import CSV per vendor format).

### 16.6 SCADA Tag Database `/automation/scada-tags`
- Table: scada_tag, plc_tag, alarm enabled, trend enabled, faceplate type.
- Inline edit: alarm settings, display group.
- Export button.

### 16.7 Interlock Matrix `/automation/interlocks`
- Matrix view (cause rows × effect columns) + list view toggle.
- Add/edit/delete manual interlocks.
- Safety-critical flag highlighting.
- Export button → Excel matrix format.

### 16.8 PLC Hardware Sizing `/automation/plc-sizing`
- Form: select vendor, family, IO topology, network protocol, spare %.
- Auto-size button → shows rack/slot layout diagram.
- Editable rack/slot table.
- IO summary: required vs. installed per type.

### 16.9 PLC BOM `/automation/plc-bom`
- Auto-generated line items from rack/slot config.
- Columns: item, part no, qty, unit price, total.
- Approval status + release action.
- Export button.

### 16.10 FAT/SAT `/automation/fat-sat`
- Tabs: FAT / SAT.
- Grouped by test category.
- Per-item: status (not tested / pass / fail / na), actual result, remarks.
- Overall progress bar per category.
- Complete action → sets checklist to `completed`.
- Export button → Excel with sign-off section.

---

## 17. New Server Files

| File | Purpose |
|---|---|
| `server/automation-routes.ts` | All AE API routes |
| `server/automation-generation-service.ts` | Auto-classification + IO/tag generation engine |
| `server/automation-plc-sizing-service.ts` | PLC hardware sizing + rack layout engine |
| `server/automation-export-service.ts` | Excel export for all AE documents |
| `server/automation-fat-sat-service.ts` | FAT/SAT auto-generation logic |

---

## 18. New Client Files

| File | Purpose |
|---|---|
| `client/src/pages/automation/ae-dashboard.tsx` | AE Dashboard |
| `client/src/pages/automation/instrument-register-page.tsx` | Instrument Register |
| `client/src/pages/automation/equipment-register-page.tsx` | Equipment Register |
| `client/src/pages/automation/io-list-page.tsx` | IO List |
| `client/src/pages/automation/plc-tags-page.tsx` | PLC Tag Database |
| `client/src/pages/automation/scada-tags-page.tsx` | SCADA Tag Database |
| `client/src/pages/automation/interlocks-page.tsx` | Interlock Matrix |
| `client/src/pages/automation/plc-sizing-page.tsx` | PLC Hardware Sizing |
| `client/src/pages/automation/plc-bom-page.tsx` | PLC BOM |
| `client/src/pages/automation/fat-sat-page.tsx` | FAT/SAT Checklists |

---

## 19. Schema Migration

All new tables created via `drizzle-kit push:pg` after adding to `shared/schema.ts`.  
Migration is additive — no existing tables modified.  
Document sequence types (`AER`, `IOL`, `DI`, `DO`, `AI`, `AO`, `IL`, `PLCBOM`, `FAT`, `SAT`) inserted into `doc_number_sequences` table on first use.

---

## 20. Audit Logging

Every create/update/delete on AE tables writes to existing `audit_log` table (if present) or a new `ae_audit_log`:

| Column | Value |
|---|---|
| `entity_type` | `ae_instrument_register` / `ae_io_list` / `ae_plc_tags` etc. |
| `entity_id` | PK of changed record |
| `action` | `create` / `update` / `delete` / `generate` / `approve` / `release` |
| `changed_by` | User ID |
| `changed_at` | NOW() |
| `old_value` | JSON of previous state |
| `new_value` | JSON of new state |

---

## 21. Zero-Trust Audit Checklist

| Check | Rule |
|---|---|
| All routes use `ensureAuthenticated` | No unauthenticated access |
| Module routes use `hasViewPermission("Automation Engineering")` | Page-level gate |
| Approve/release routes check role | Manager and above only |
| Self-approval blocked | `approver_id !== creator_id` enforced server-side |
| No raw `req.body` passed to DB | All fields explicitly destructured and validated |
| No silent fallback in generation | Every unrecognised subgroup_code → skip with logged warning |
| Advisory lock on all batch inserts | `pg_advisory_xact_lock(projectId)` in every transaction |
| GCS upload only on `released` status | No pre-release document leakage to GCS |
| Revision creates new record | No in-place edit of released documents |
| IO number sequences are project-scoped | Cross-project collision impossible |
| PLC tag names unique per project | DB UNIQUE constraint on `(project_id, tag_name)` |
| SCADA tag names unique per project | DB UNIQUE constraint on `(project_id, scada_tag)` |

---

## 22. Implementation Phases

### Phase 1 — Foundation
- DB schema (all 12 tables) + Drizzle schema
- AE register creation
- Auto-classification engine
- IO list generation (DI/DO/AI/AO)
- Instrument Register + Equipment Register UI
- IO List UI
- Navigation entry

### Phase 2 — PLC Engineering
- PLC tag generation
- SCADA tag generation
- PLC Tag DB UI
- SCADA Tag DB UI
- Excel exports (IO list, tag DB)

### Phase 3 — Hardware & BOM
- PLC hardware sizing engine (all 4 vendors)
- Rack/slot layout
- PLC BOM generation
- PLC Sizing UI + PLC BOM UI

### Phase 4 — Interlocks & FAT/SAT
- Interlock auto-generation
- Manual interlock editor
- Interlock Matrix UI + export
- FAT/SAT auto-generation
- FAT/SAT execution UI
- Excel export (FAT/SAT checklist)

### Phase 5 — Governance & Approval
- Approval workflow (submit / approve / reject / release)
- Revision control
- GCS upload on release
- Full audit logging
- Role permission integration

---

## 23. Risk Analysis

| Risk | Mitigation |
|---|---|
| BUY List subgroup codes evolve | Classification map in service config file — not hardcoded in DB |
| VFD detection relies on `technical_attributes.has_vfd` — may not be set | Add VFD field to BUY list line form explicitly in Phase 1 |
| PLC vendor module pricing stale | Unit prices stored as estimates — require manual update by engineer |
| IO count exceeds CPU capacity | CPU sizing threshold table maintained per vendor; alert shown if exceeded |
| Tag name collision (renaming tag_no) | Regeneration uses idempotency check + explicit collision warning |
| Large projects (500+ IO points) | Batch insert with pagination — max 100 rows per transaction commit |
| GCS path governance violation | Uses existing GCS governance layer — no direct GCS calls from AE service |

---

## 24. Rollback Strategy

1. All new tables are additive — dropping them restores original state.
2. No existing tables are modified.
3. Navigation entry removal: revert one block in `layout.tsx`.
4. Route file removal: remove `import` of `automation-routes.ts` from `server/routes.ts`.
5. DB rollback: `DROP TABLE ae_*` in order (FK children first).

---

## 25. Future Expansion Architecture

### 25.1 SCADA Integration
- Export SCADA tag DB in vendor-specific format (Wonderware, Ignition, WinCC, FactoryTalk).
- Route: `GET /api/automation/projects/:id/export/scada-vendor?vendor=ignition`
- Tag format adapters implemented as pluggable modules.

### 25.2 PLC Program Generation
- Generate structured text (ST) / ladder logic (LAD) stubs from interlock definitions.
- One `.scl` / `.st` file per interlock block.
- Exported as ZIP archive.

### 25.3 Digital Twin
- IO list and PLC tag DB serve as the authoritative signal registry.
- Future: expose `GET /api/automation/projects/:id/signal-registry` as a standardised OPC-UA nodeset.
- All tags carry `engineering_unit`, `range_min`, `range_max` — sufficient for digital twin binding.

---

## 26. Validation Checklist (Pre-Implementation Gate)

Before Phase 1 implementation begins, confirm:

- [ ] `project_buy_list_lines.buy_subgroup_code` confirmed from live DB (not assumed).
- [ ] `technical_attributes` JSON structure for pumps/motors confirmed (especially `has_vfd` key).
- [ ] `doc_number_sequences` table structure confirmed — new prefix insertion method confirmed.
- [ ] `hasViewPermission` and `hasPageAccess` functions confirmed — signature + call pattern confirmed.
- [ ] GCS governance root path (`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/`) confirmed from `docs/gcs-governance-rev5-option-c-baseline.md`.
- [ ] `exceljs` availability in project confirmed — if absent, `xlsx` alternative evaluated.
- [ ] Advisory lock pattern (`pg_advisory_xact_lock`) confirmed working for this module (same as PPPC).
- [ ] Approval to add new sidebar state variable `isAutomationMenuOpen` in `layout.tsx` confirmed.
- [ ] New module permission `"Automation Engineering"` insertion method into permissions table confirmed.

---

*Plan saved as per `docs/operating-protocol-v1.0.md` §5. No implementation has occurred. Implementation requires explicit approval per §2.*
