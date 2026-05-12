# BUY Item Code — 7-Segment Architecture Design Discussion

**Status: DESIGN DISCUSSION — Awaiting Approval Before Baseline Update**
**Date: 2026-05-12**
**Purpose:** Define SEG4 and SEG5 per Group/Subgroup for the proposed 7-segment item code structure.

---

## 1. Proposed Format

```
GROUP(5) - SUBGROUP(≤3) - TYPE(≤3) - SEG4(≤4) - SEG5(≤4) - SIZE(3–5) - UNIT(≤4)
```

### Segment Roles

| Position | Segment | Role |
|----------|---------|------|
| 1 | GROUP | Engineering category (exactly 5 chars) |
| 2 | SUBGROUP | Engineering function within group (≤3 chars) |
| 3 | TYPE | Equipment type within subgroup (≤3 chars); `NA` if no type distinction |
| 4 | **SEG4** | **Engineering Identity Attribute 1** — defined per Group/Subgroup |
| 5 | **SEG5** | **Engineering Identity Attribute 2** — defined per Group/Subgroup; `NA` if not applicable |
| 6 | SIZE | Numeric size/capacity (3–5 digits, zero-padded to minimum 3) |
| 7 | UNIT | Unit of measurement (≤4 chars); `NA` if no standard unit applies |

### Code Length Profile

| Pattern (worst case) | Example | Length |
|----------------------|---------|--------|
| All segments short | `VALVE-ISO-BAL-CS-SW-050-NB` | 27 |
| SEG4 and SEG5 at max (4 chars each) | `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH` | 32 |
| With approved `-01` suffix | `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH-01` | 35 |

**Maximum code length: ~35 characters. SAP B1 `ItemCode` limit: 50 characters. Confirmed headroom: 15 characters minimum.**

---

## 2. Core Design Principle — Identity vs Variant Boundary

### Attribute belongs in ItemCode (SEG4/SEG5) if:
- Two items with different values of this attribute must be stocked, purchased, or valued separately in SAP
- The different value produces a different engineering description (`OITM.ItemName`) in SAP
- Substituting one for the other is an engineering decision, not a commercial one

### Attribute belongs in Variant only if:
- Different values represent different commercial sources or specifications for the same engineering item
- Substitution may be commercially acceptable without an engineering change
- Examples: vendor, model number, datasheet revision, specific pressure rating (within the same class), efficiency grade

---

## 3. SEG4 / SEG5 Definitions — Group by Group

---

### GROUP: VALVE

#### VALVE-ISO — Isolation Valves (Ball, Gate, Globe ISO, Butterfly, Plug)

The same type, same size valve in CS body flanged vs SS316 body flanged = different inventory item.
The same type, same size valve in flanged vs threaded end connection = different engineering item (different installation, different lead time, different stock).

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Body Material (MOC) | `CS` | Carbon Steel (A216 WCB / A105) |
| | | `SS3` | SS316 / SS316L |
| | | `SS4` | SS304 / SS304L |
| | | `DSS` | Duplex SS 2205 |
| | | `A20` | Alloy 20 |
| | | `GCI` | Grey Cast Iron |
| | | `DCI` | Ductile Cast Iron |
| | | `HAC` | Hastelloy C-276 |
| SEG5 | End Connection | `FLG` | Flanged (RF / FF) |
| | | `THD` | Threaded (NPT / BSP) |
| | | `SW` | Socket Weld |
| | | `BW` | Butt Weld |
| | | `WAF` | Wafer (for butterfly / dual-plate check) |

**Variant-only attributes:** pressure class (ANSI 150/300/600/900), trim material, seat material, disc material, bore type (full/reduced), vendor, model number.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `VALVE-ISO-BAL-CS-FLG-050-NB` | Ball Valve, 50 NB, CS Body, Flanged |
| `VALVE-ISO-BAL-SS3-FLG-050-NB` | Ball Valve, 50 NB, SS316 Body, Flanged |
| `VALVE-ISO-BAL-CS-THD-050-NB` | Ball Valve, 50 NB, CS Body, Threaded |
| `VALVE-ISO-GTD-CS-FLG-100-NB` | Gate Valve, 100 NB, CS Body, Flanged |
| `VALVE-ISO-BTF-CS-WAF-200-NB` | Butterfly Valve, 200 NB, CS Body, Wafer |
| `VALVE-ISO-GLB-SS3-FLG-050-NB` | Globe Valve, 50 NB, SS316 Body, Flanged |

---

#### VALVE-CTL — Control Valves (Globe, Rotary, Butterfly CTL, Ball CTL)

User confirmed: trim material differences create genuinely different SAP items. End connection for control valves is almost always flanged RF (standard in process plants) — threaded control valves are rare and captured as Variant exception. Therefore:

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Body Material | `CS` | Carbon Steel |
| | | `SS3` | SS316 / SS316L |
| | | `SS4` | SS304 |
| | | `DSS` | Duplex SS |
| | | `A20` | Alloy 20 |
| | | `GCI` | Grey Cast Iron |
| | | `HAC` | Hastelloy C-276 |
| SEG5 | Trim Material | `SS3` | SS316 Trim |
| | | `A20` | Alloy 20 Trim |
| | | `ALS` | Alloy Steel (hardened) Trim |
| | | `STL` | Stellite / Cobalt Alloy Trim |
| | | `HAC` | Hastelloy C-276 Trim |
| | | `NA` | Trim same as body (not separately specified at family level) |

**Variant-only attributes:** pressure class, actuator type (pneumatic diaphragm / piston / electric), fail action (FC/FO/FL), flow characteristic (equal%, linear), valve Cv, vendor, model, positioner type.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `VALVE-CTL-GLB-CS-SS3-050-NB` | Globe Control Valve, 50 NB, CS Body, SS316 Trim |
| `VALVE-CTL-GLB-CS-ALS-050-NB` | Globe Control Valve, 50 NB, CS Body, Alloy Steel Trim |
| `VALVE-CTL-GLB-CS-STL-100-NB` | Globe Control Valve, 100 NB, CS Body, Stellite Trim |
| `VALVE-CTL-GLB-A20-A20-100-NB` | Globe Control Valve, 100 NB, Alloy 20 Body, Alloy 20 Trim |
| `VALVE-CTL-ROT-CS-SS3-150-NB` | Rotary Control Valve, 150 NB, CS Body, SS316 Trim |
| `VALVE-CTL-BTF-CS-SS3-200-NB` | Butterfly Control Valve, 200 NB, CS Body, SS316 Trim |

---

#### VALVE-SAF — Safety / Pressure Relief Valves

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Body Material | `CS`, `SS3`, `SS4`, `DSS`, `A20` | Same registry as ISO |
| SEG5 | Inlet Connection | `FLG` | Flanged inlet |
| | | `THD` | Screwed / threaded inlet |

**Variant-only attributes:** set pressure, orifice designation (API D/E/F/G/H/J/K/L/M), discharge coefficient, certification (IBR / ASME / CE), outlet size, lift type, trim material.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `VALVE-SAF-SPL-CS-FLG-002-IN` | Safety Valve, 2" Inlet, CS Body, Flanged |
| `VALVE-SAF-SPL-SS3-THD-001-IN` | Safety Valve, 1" Inlet, SS316 Body, Threaded |

SIZE = inlet bore in inches (standard API practice). UNIT = `IN`.

---

#### VALVE-CHK — Check / Non-Return Valves

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Body Material | `CS`, `SS3`, `DSS`, `A20`, `GCI` | Same registry |
| SEG5 | End Connection | `FLG`, `WAF`, `THD`, `SW` | Same registry as ISO |

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `VALVE-CHK-SWG-CS-FLG-100-NB` | Swing Check Valve, 100 NB, CS Body, Flanged |
| `VALVE-CHK-DUL-CS-WAF-150-NB` | Dual Plate Check Valve, 150 NB, CS Body, Wafer |
| `VALVE-CHK-SWG-SS3-FLG-080-NB` | Swing Check Valve, 80 NB, SS316 Body, Flanged |

---

#### VALVE-NDL — Needle Valves

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Body Material | `SS3`, `CS`, `HAC` | Same registry |
| SEG5 | End Connection | `NPT` | NPT (most common for needle valves) |
| | | `SW` | Socket Weld |
| | | `FLG` | Flanged |

**Example:** `VALVE-NDL-NA-SS3-NPT-006-NB`

---

### GROUP: PUMPS

#### PUMPS-CEN — Centrifugal Pumps (Horizontal, Vertical, Multistage)

A CS pump and SS316 pump at the same flow rate are different inventory items (different corrosion suitability).
A mechanical seal pump and gland packing pump at the same size are different items (different maintenance regime, different application suitability).

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Wetted Parts MOC | `CS` | Carbon Steel casing / impeller |
| | | `SS3` | SS316 / SS316L |
| | | `SS4` | SS304 |
| | | `DSS` | Duplex SS |
| | | `A20` | Alloy 20 |
| | | `CI` | Cast Iron |
| | | `HAC` | Hastelloy C-276 |
| SEG5 | Seal Type | `MS` | Mechanical Seal |
| | | `GP` | Gland Packing |
| | | `MAG` | Magnetic Drive (sealless) |

**Variant-only attributes:** impeller diameter, TDH (total dynamic head), motor kW, NPSH, efficiency, vendor, model number, bearing type, coupling type.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `PUMPS-CEN-HOR-SS3-MS-1000-LPH` | Centrifugal Pump, Horizontal, SS316, Mechanical Seal, 1000 LPH |
| `PUMPS-CEN-HOR-CS-MS-5000-LPH` | Centrifugal Pump, Horizontal, CS, Mechanical Seal, 5000 LPH |
| `PUMPS-CEN-HOR-SS3-GP-1000-LPH` | Centrifugal Pump, Horizontal, SS316, Gland Packing, 1000 LPH |
| `PUMPS-CEN-VTL-SS3-MS-0500-M3H` | Centrifugal Pump, Vertical, SS316, Mechanical Seal, 500 m³/hr |
| `PUMPS-CEN-MST-SS3-MS-0100-M3H` | Centrifugal Pump, Multistage, SS316, Mechanical Seal, 100 m³/hr |

---

#### PUMPS-DOS — Dosing / Metering Pumps

Wetted material (pump head) and diaphragm material are both engineering identity attributes for dosing pumps — they determine chemical compatibility with the dosed fluid. A PVDF head pump with PTFE diaphragm and an SS316 head pump with PTFE diaphragm are genuinely different items for different chemical services.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Head / Wetted MOC | `SS3` | SS316 pump head |
| | | `PVDF` | PVDF head |
| | | `PP` | Polypropylene head |
| | | `HAC` | Hastelloy C-276 head |
| SEG5 | Diaphragm MOC | `PTFE` | PTFE diaphragm |
| | | `PVDF` | PVDF diaphragm |
| | | `EPD` | EPDM diaphragm |
| | | `HYP` | Hypalon diaphragm |
| | | `NA` | Not applicable (for peristaltic / plunger types) |

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `PUMPS-DOS-DPH-SS3-PTFE-100-LPH` | Dosing Pump, Diaphragm, SS316 Head, PTFE Diaphragm, 100 LPH |
| `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH` | Dosing Pump, Diaphragm, PVDF Head, PTFE Diaphragm, 50 LPH |
| `PUMPS-DOS-PLN-SS3-NA-050-LPH` | Dosing Pump, Plunger, SS316, 50 LPH |

---

#### PUMPS-GEA / PUMPS-SCR / PUMPS-HND — Gear, Screw, Hand Pumps

For these simpler pump types, wetted material distinguishes the item. No second attribute at identity level.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Wetted MOC | `CS`, `SS3`, `CI`, `A20`, `NA` | Same registry |
| SEG5 | — | `NA` | Not applicable |

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `PUMPS-GEA-NA-CS-NA-005-M3H` | Gear Pump, CS Wetted, 5 m³/hr |
| `PUMPS-SCR-NA-SS3-NA-010-M3H` | Screw Pump, SS316 Wetted, 10 m³/hr |
| `PUMPS-HND-NA-CS-NA-010-LPM` | Hand Pump, CS, 10 LPM |

---

### GROUP: MOTOR

#### MOTOR-FLP / MOTOR-NFP — Flameproof / Non-Flameproof Motors

A 415V motor and a 6.6 kV motor at the same kW are completely different equipment (different insulation, different cable, different VFD/DOL starter).
A 4-pole motor and a 6-pole motor at the same kW run at different base speeds (1450 vs 960 RPM) — different items for different driven equipment shaft speed requirements.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Voltage Class | `LV` | Low Voltage (415 V, 3Ph) |
| | | `MV6` | Medium Voltage 6.6 kV |
| | | `MV11` | Medium Voltage 11 kV |
| SEG5 | Pole Count | `2P` | 2-pole (~2900 RPM) |
| | | `4P` | 4-pole (~1450 RPM) |
| | | `6P` | 6-pole (~960 RPM) |
| | | `8P` | 8-pole (~720 RPM) |

**Variant-only attributes:** frame size (IEC/NEMA), enclosure (TEFC / TEAAC), efficiency class (IE2/IE3/IE4), insulation class (F/H), IP rating, mounting (B3/B5/B3B5), ambient temperature, vendor, model number.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `MOTOR-FLP-ACI-LV-4P-110-KW` | Flameproof Motor, AC Induction, 415V, 4-Pole, 110 kW |
| `MOTOR-FLP-ACI-LV-6P-110-KW` | Flameproof Motor, AC Induction, 415V, 6-Pole, 110 kW |
| `MOTOR-FLP-ACI-MV6-6P-250-KW` | Flameproof Motor, AC Induction, 6.6 kV, 6-Pole, 250 kW |
| `MOTOR-NFP-ACI-LV-4P-015-KW` | Non-Flameproof Motor, AC Induction, 415V, 4-Pole, 15 kW |
| `MOTOR-NFP-ACI-LV-2P-007-KW` | Non-Flameproof Motor, AC Induction, 415V, 2-Pole, 7.5 kW |

---

### GROUP: INSTR

#### INSTR-PRS — Pressure Instruments (Transmitter, Gauge, Switch)

Wetted material (diaphragm / process connection) and process connection type are both engineering identity attributes — a SS316L wetted transmitter and a Hastelloy C wetted transmitter at the same range are different SAP items for different service fluids.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Wetted MOC | `SS3` | SS316L wetted parts |
| | | `HAC` | Hastelloy C-276 |
| | | `TIT` | Titanium |
| | | `DSS` | Duplex SS |
| | | `NA` | Non-wetted (e.g. gauge with chemical seal on a separate item) |
| SEG5 | Process Connection | `NPT` | 1/2" NPT (standard instrument connection) |
| | | `FLG` | Flanged (for direct-mount, high viscosity, slurry) |
| | | `SW` | Socket Weld |
| | | `NA` | Not applicable |

**Variant-only attributes:** output signal (4–20mA / HART / Profibus / Foundation Fieldbus), power supply, zone/approval (Zone 1 / Zone 2 / Safe Area), IP rating, display, vendor, model number.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `INSTR-PRS-TXR-SS3-NPT-010-BAR` | Pressure Transmitter, SS316L Wetted, 1/2" NPT, 0–10 Bar |
| `INSTR-PRS-TXR-HAC-FLG-010-BAR` | Pressure Transmitter, Hastelloy C Wetted, Flanged, 0–10 Bar |
| `INSTR-PRS-TXR-SS3-FLG-016-BAR` | Pressure Transmitter, SS316L Wetted, Flanged, 0–16 Bar |
| `INSTR-PRS-GAU-SS3-NPT-016-BAR` | Pressure Gauge, SS316L, 1/2" NPT, 0–16 Bar |
| `INSTR-PRS-SWT-SS3-NPT-016-BAR` | Pressure Switch, SS316L, 1/2" NPT, 0–16 Bar |

---

#### INSTR-TMP — Temperature Instruments (Thermocouple, RTD, Transmitter)

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Thermowell / Wetted MOC | `SS3` | SS316 thermowell |
| | | `DSS` | Duplex SS thermowell |
| | | `HAC` | Hastelloy C-276 thermowell |
| | | `NA` | No thermowell (direct immersion or surface) |
| SEG5 | Process Connection | `NPT` | NPT threaded thermowell |
| | | `FLG` | Flanged thermowell |
| | | `NA` | Not applicable |

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `INSTR-TMP-TCC-SS3-NPT-400-DGC` | Thermocouple, SS316 Thermowell, NPT, 0–400°C |
| `INSTR-TMP-RTD-SS3-FLG-200-DGC` | RTD, SS316 Thermowell, Flanged, 0–200°C |
| `INSTR-TMP-TCC-HAC-FLG-400-DGC` | Thermocouple, Hastelloy C Thermowell, Flanged, 0–400°C |

---

#### INSTR-FLW — Flow Instruments (Magnetic, Vortex, Coriolis, Orifice)

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Wetted / Liner MOC | `SS3` | SS316L |
| | | `PTFE` | PTFE lined (common for magnetic flowmeters) |
| | | `HAC` | Hastelloy C-276 |
| | | `TIT` | Titanium |
| | | `NA` | Non-wetted (ultrasonic clamp-on) |
| SEG5 | Process Connection | `FLG` | Flanged |
| | | `WAF` | Wafer (for vortex/mag, smaller sizes) |
| | | `NA` | Clamp-on (no process connection) |

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `INSTR-FLW-MAG-PTFE-FLG-100-NB` | Magnetic Flowmeter, PTFE Liner, Flanged, 100 NB |
| `INSTR-FLW-MAG-SS3-FLG-100-NB` | Magnetic Flowmeter, SS316L Wetted, Flanged, 100 NB |
| `INSTR-FLW-COR-SS3-FLG-050-NB` | Coriolis Flowmeter, SS316L, Flanged, 50 NB |
| `INSTR-FLW-VTX-SS3-WAF-080-NB` | Vortex Flowmeter, SS316L, Wafer, 80 NB |
| `INSTR-FLW-USC-NA-NA-100-NB` | Ultrasonic Flowmeter, Clamp-on, 100 NB |

---

#### INSTR-LVL — Level Instruments (GWR, Non-contact Radar, DP, Float)

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Probe / Wetted MOC | `SS3` | SS316L probe |
| | | `HAC` | Hastelloy C-276 probe |
| | | `DSS` | Duplex SS probe |
| | | `NA` | Non-contact (no wetted parts) |
| SEG5 | Process Connection | `FLG` | Flanged (standard for vessels) |
| | | `NPT` | NPT threaded |
| | | `NA` | Not applicable |

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `INSTR-LVL-GWR-SS3-FLG-4000-MM` | Guided Wave Radar, SS316L Probe, Flanged, 0–4000 mm |
| `INSTR-LVL-RDR-NA-FLG-4000-MM` | Non-contact Radar, Flanged, 0–4000 mm |
| `INSTR-LVL-GWR-HAC-FLG-3000-MM` | Guided Wave Radar, Hastelloy C Probe, Flanged, 0–3000 mm |

---

### GROUP: ELECT

#### ELECT-PNL — Panels (MCC, PCC, LCS, DCS Cabinet, Distribution Board)

A 415V MCC in mild steel enclosure and a 415V MCC in GRP enclosure are different SAP items (different material, different IP rating capability, different procurement source, different installation environment suitability).
A 415V panel and a 6.6 kV switchboard are completely different items.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Voltage Class | `LV` | Low Voltage (≤ 1000V, typically 415V) |
| | | `MV6` | Medium Voltage 6.6 kV |
| | | `MV11` | Medium Voltage 11 kV |
| | | `24V` | 24 VDC (control / instrument power panels) |
| SEG5 | Enclosure MOC | `MS` | Mild Steel (painted/powder-coated) |
| | | `SS3` | SS316 Stainless Steel |
| | | `GRP` | GRP / FRP Fibreglass |
| | | `NA` | Not applicable |

SIZE = supply voltage (numeric). UNIT = `V`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `ELECT-PNL-MCC-LV-MS-415-V` | MCC Panel, LV 415V, Mild Steel Enclosure |
| `ELECT-PNL-MCC-LV-GRP-415-V` | MCC Panel, LV 415V, GRP Enclosure |
| `ELECT-PNL-LCS-LV-MS-415-V` | Local Control Station, LV 415V, Mild Steel |
| `ELECT-PNL-DBD-24V-MS-024-V` | Distribution Board, 24VDC, Mild Steel |
| `ELECT-PNL-SWB-MV6-MS-6600-V` | Switchboard, 6.6 kV, Mild Steel |

---

#### ELECT-JBX — Junction Boxes (Flameproof, Weatherproof, General Purpose)

A die-cast aluminium FLP JB and a GRP FLP JB at the same size are different inventory items (different material, different approval process, different cable entry hardware).
A wall-mounted JB and a stand-mounted JB at the same size require different civil/structural provisions — different items.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Enclosure MOC | `ALC` | Die-cast aluminium |
| | | `GRP` | GRP / FRP Fibreglass |
| | | `SS3` | SS316 Stainless Steel |
| | | `MS` | Mild Steel |
| SEG5 | Mounting | `WM` | Wall Mounted |
| | | `SM` | Stand / Pole Mounted |
| | | `NA` | Not specified at family level |

SIZE = largest enclosure dimension (mm). UNIT = `MM`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `ELECT-JBX-FPR-ALC-SM-300-MM` | Flameproof JB, Die-cast Aluminium, Stand Mounted, 300mm |
| `ELECT-JBX-FPR-ALC-WM-300-MM` | Flameproof JB, Die-cast Aluminium, Wall Mounted, 300mm |
| `ELECT-JBX-FPR-GRP-WM-400-MM` | Flameproof JB, GRP, Wall Mounted, 400mm |
| `ELECT-JBX-GPR-GRP-WM-400-MM` | General Purpose JB, GRP, Wall Mounted, 400mm |

---

#### ELECT-CBL — Cables (Power, Control, Instrumentation, Tracing)

Insulation material and armour type are both engineering identity attributes for cables — XLPE/SWA and PVC/Unarmoured are genuinely different items for different installation environments.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Insulation | `XLPE` | Cross-linked polyethylene |
| | | `PVC` | PVC |
| | | `EPR` | Ethylene propylene rubber |
| | | `MICC` | Mineral insulated copper clad |
| SEG5 | Armour | `SWA` | Steel Wire Armoured |
| | | `UNA` | Unarmoured |
| | | `NA` | Not applicable (for MICC or similar) |

**SIZE convention for cables:** conductor cross-section × 10 (to eliminate decimals). 1.5 mm² → `015`. 2.5 mm² → `025`. 16 mm² → `160`. UNIT = `MM2`.

**Examples:**

| Item Code | SAP ItemName | Conductor size |
|-----------|-------------|----------------|
| `ELECT-CBL-PWR-XLPE-SWA-160-MM2` | Power Cable, XLPE, Steel Wire Armoured, 16 mm² | 16 mm² |
| `ELECT-CBL-CTL-XLPE-SWA-015-MM2` | Control Cable, XLPE, Steel Wire Armoured, 1.5 mm² | 1.5 mm² |
| `ELECT-CBL-INS-XLPE-SWA-015-MM2` | Instrumentation Cable, XLPE, Steel Wire Armoured, 1.5 mm² | 1.5 mm² |
| `ELECT-CBL-PWR-PVC-UNA-025-MM2` | Power Cable, PVC, Unarmoured, 2.5 mm² | 2.5 mm² |

**Variant-only attributes:** number of cores, voltage rating (450/750V vs 600/1000V), conductor material (copper assumed), screening configuration (individual / overall / both), specific standard (IEC 60502 / BS 5467), vendor.

---

#### ELECT-CMP — Electrical Components (VFD, MCB, MCCB, Contactor, Transformer, PLC)

For components, voltage class is the primary engineering identity distinguisher. No second attribute changes the fundamental family identity.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Voltage Class | `LV` | Low Voltage |
| | | `MV6` | 6.6 kV |
| | | `MV11` | 11 kV |
| | | `24V` | 24 VDC |
| | | `NA` | Not applicable (PLC, relay, etc.) |
| SEG5 | — | `NA` | Not applicable |

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `ELECT-CMP-VFD-LV-NA-011-KW` | VFD Drive, LV 415V, 11 kW |
| `ELECT-CMP-MCB-LV-NA-016-AMP` | MCB, LV, 16 A |
| `ELECT-CMP-MBK-LV-NA-100-AMP` | MCCB, LV, 100 A |
| `ELECT-CMP-PLC-NA-NA-NA-NA` | PLC / DCS Module (no standard family size) |

---

### GROUP: BOPKG

#### BOPKG-CLT — Cooling Towers

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Shell MOC | `FRP` | FRP / GRP shell |
| | | `RCC` | RCC / Concrete |
| | | `NA` | Not specified |
| SEG5 | — | `NA` | Not applicable |

**Example:** `BOPKG-CLT-MDT-FRP-NA-100-TR` — Cooling Tower, FRP, 100 TR

---

#### BOPKG-GEN — General Bought-out Packages

Too diverse for SEG4/SEG5 at item code level. All technical details live in the description and Variant attributes.

| Segment | Attribute | Code |
|---------|-----------|------|
| SEG4 | `NA` | Not applicable |
| SEG5 | `NA` | Not applicable |

**Example:** `BOPKG-GEN-NA-NA-NA-NA-NA`

---

### GROUP: RAW MATERIALS (PLATE, PIPES, FLANG, FITNG, FASTN, GASKT, STEEL)

For raw materials, the material is already encoded in SUBGROUP. SEG4 and SEG5 capture the remaining engineering identity attributes — the ones that, when different, create genuinely different SAP inventory records.

---

#### PLATE — Steel Plates

Pressure class does not apply. Hot rolled vs cold rolled is a genuine engineering identity (different mechanical properties, different surface condition, different applications).

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Production Condition | `HR` | Hot Rolled |
| | | `CR` | Cold Rolled |
| | | `NA` | Not specified |
| SEG5 | — | `NA` | Not applicable |

SIZE = thickness in mm. UNIT = `MM`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `PLATE-CS-NA-HR-NA-010-MM` | CS Plate, Hot Rolled, 10 mm |
| `PLATE-SS3-NA-HR-NA-006-MM` | SS316 Plate, Hot Rolled, 6 mm |
| `PLATE-HAC-NA-HR-NA-012-MM` | Hastelloy C-276 Plate, Hot Rolled, 12 mm |

**Variant-only attributes:** plate dimensions (length × width), heat number, mill certificate, specific ASME / IS standard grade.

---

#### PIPES — Pipes and Tubes

Pipe schedule is a genuine engineering identity attribute — a Schedule 40 pipe and a Schedule 80 pipe at the same nominal bore have different wall thicknesses, different pressure ratings, and different procurement (different line items from the mill).

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Schedule / Wall | `STD` | Standard Weight |
| | | `S40` | Schedule 40 |
| | | `S80` | Schedule 80 |
| | | `S160` | Schedule 160 |
| | | `XH` | Extra Heavy |
| | | `NA` | Not applicable (tube / special wall) |
| SEG5 | — | `NA` | Not applicable |

SIZE = nominal bore. UNIT = `NB`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `PIPES-CS-NA-S40-NA-050-NB` | CS Pipe, Schedule 40, 50 NB |
| `PIPES-CS-NA-STD-NA-100-NB` | CS Pipe, Standard Weight, 100 NB |
| `PIPES-S31-NA-S40-NA-050-NB` | SS316L Pipe, Schedule 40, 50 NB |
| `PIPES-DSS-NA-S40-NA-080-NB` | Duplex SS Pipe, Schedule 40, 80 NB |

---

#### FLANG — Flanges

Pressure class and face/type are both genuine engineering identity attributes — a 100 NB ANSI 150 WN flange and a 100 NB ANSI 300 WN flange are different inventory items (different bolting, different gasket, different procurement). A weld neck and a slip-on at the same class are different items (different installation, different welding requirement).

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Pressure Class | `C150` | ANSI Class 150 |
| | | `C300` | ANSI Class 300 |
| | | `C600` | ANSI Class 600 |
| | | `C900` | ANSI Class 900 |
| | | `PN16` | PN 16 (DIN) |
| | | `PN40` | PN 40 (DIN) |
| SEG5 | Flange Type | `WN` | Weld Neck |
| | | `SOP` | Slip-on |
| | | `BLN` | Blind |
| | | `SKT` | Socket Weld |
| | | `THD` | Threaded |
| | | `LJ` | Lap Joint |

SIZE = nominal bore. UNIT = `NB`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `FLANG-CS-NA-C150-WN-100-NB` | CS Flange, ANSI Class 150, Weld Neck, 100 NB |
| `FLANG-CS-NA-C300-WN-100-NB` | CS Flange, ANSI Class 300, Weld Neck, 100 NB |
| `FLANG-SS3-NA-C150-SOP-050-NB` | SS316 Flange, ANSI Class 150, Slip-on, 50 NB |
| `FLANG-CS-NA-C150-BLN-100-NB` | CS Flange, ANSI Class 150, Blind, 100 NB |
| `FLANG-DSS-NA-C150-WN-100-NB` | Duplex SS Flange, ANSI Class 150, Weld Neck, 100 NB |

---

#### FITNG — Pipe Fittings (Elbow, Tee, Reducer, Cap)

Schedule / pressure class distinguishes fittings. No second attribute needed.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Schedule / Class | `S40`, `S80`, `S160`, `C150`, `C300`, `STD` | Same registries as PIPES and FLANG |
| SEG5 | — | `NA` | Not applicable |

SIZE = nominal bore. UNIT = `NB`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `FITNG-CS-ELB-S40-NA-050-NB` | CS Elbow, Schedule 40, 50 NB |
| `FITNG-SS3-TEE-S40-NA-100-NB` | SS316 Equal Tee, Schedule 40, 100 NB |
| `FITNG-CS-RED-STD-NA-100-NB` | CS Reducer, Standard, 100 NB |

---

#### FASTN — Fasteners (Stud Bolts, Hex Bolts, Hex Nuts, Washers)

Material grade is already in SUBGROUP. Thread standard distinguishes metric from imperial — different physical items, not interchangeable.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Thread Standard | `UNC` | Unified National Coarse (imperial) |
| | | `MET` | Metric |
| | | `NA` | Not applicable |
| SEG5 | — | `NA` | Not applicable |

SIZE = diameter in mm. UNIT = `MM`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `FASTN-B7-STD-UNC-NA-016-MM` | B7 Stud Bolt, UNC Thread, 16 mm diameter |
| `FASTN-A2-HXB-MET-NA-012-MM` | A2-70 SS Hex Bolt, Metric, M12 |
| `FASTN-L7-STD-UNC-NA-025-MM` | L7M Stud Bolt, UNC Thread, 25 mm diameter |

---

#### GASKT — Gaskets (Spiral Wound, Sheet, Ring Joint, Kammprofile)

Pressure class is an engineering identity attribute for gaskets — ANSI 150 and ANSI 300 gaskets are different physical items (different OD, different bore, different seating stress).

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Pressure Class | `C150`, `C300`, `C600`, `C900`, `PN16`, `PN40`, `NA` | Same registry as FLANG |
| SEG5 | — | `NA` | Not applicable |

SIZE = nominal bore. UNIT = `NB`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `GASKT-SPWG-NA-C150-NA-100-NB` | Spiral Wound Graphite Gasket, ANSI Class 150, 100 NB |
| `GASKT-SPWG-NA-C300-NA-100-NB` | Spiral Wound Graphite Gasket, ANSI Class 300, 100 NB |
| `GASKT-PTFE-NA-C150-NA-050-NB` | PTFE Sheet Gasket, ANSI Class 150, 50 NB |
| `GASKT-RJNT-NA-C600-NA-050-NB` | RTJ Ring Joint Gasket, ANSI Class 600, 50 NB |

---

#### STEEL — Structural Steel (Angle, Channel, I-Beam, Hollow Section)

Grade distinguishes structural steel for design purposes. No second attribute needed.

| Segment | Attribute | Code | Meaning |
|---------|-----------|------|---------|
| SEG4 | Material Grade | `S275` | IS 2062 E250 / Fe 410 (≈ S275) |
| | | `S350` | IS 2062 E350 (≈ S355) |
| | | `NA` | Not specified at family level |
| SEG5 | — | `NA` | Not applicable |

SIZE = primary dimension (mm). UNIT = `MM`.

**Examples:**

| Item Code | SAP ItemName |
|-----------|-------------|
| `STEEL-ANG-NA-S275-NA-100-MM` | Angle Section, IS 2062 E250, 100 mm |
| `STEEL-IPE-NA-S350-NA-200-MM` | I-beam, IS 2062 E350, 200 mm |
| `STEEL-RHS-NA-S275-NA-100-MM` | Rectangular Hollow Section, IS 2062 E250, 100 mm |

---

## 4. Consolidated SEG4 / SEG5 Summary Table

| GROUP | SUBGROUP | SEG4 Attribute | SEG4 codes | SEG5 Attribute | SEG5 codes |
|-------|---------|---------------|-----------|---------------|-----------|
| VALVE | ISO | Body MOC | CS, SS3, SS4, DSS, A20, GCI, DCI, HAC | End Connection | FLG, THD, SW, BW, WAF |
| VALVE | CTL | Body MOC | CS, SS3, SS4, DSS, A20, GCI, HAC | Trim MOC | SS3, A20, ALS, STL, HAC, NA |
| VALVE | SAF | Body MOC | CS, SS3, SS4, DSS, A20 | Inlet Connection | FLG, THD |
| VALVE | CHK | Body MOC | CS, SS3, DSS, A20, GCI | End Connection | FLG, WAF, THD, SW |
| VALVE | NDL | Body MOC | SS3, CS, HAC | End Connection | NPT, SW, FLG |
| PUMPS | CEN | Wetted MOC | CS, SS3, SS4, DSS, A20, CI, HAC | Seal Type | MS, GP, MAG |
| PUMPS | DOS | Head MOC | SS3, PVDF, PP, HAC | Diaphragm MOC | PTFE, PVDF, EPD, HYP, NA |
| PUMPS | GEA | Wetted MOC | CS, SS3, CI, A20 | NA | — |
| PUMPS | SCR | Wetted MOC | CS, SS3 | NA | — |
| PUMPS | HND | Wetted MOC | CS, SS3 | NA | — |
| MOTOR | FLP | Voltage Class | LV, MV6, MV11 | Pole Count | 2P, 4P, 6P, 8P |
| MOTOR | NFP | Voltage Class | LV, MV6, MV11 | Pole Count | 2P, 4P, 6P, 8P |
| INSTR | PRS | Wetted MOC | SS3, HAC, TIT, DSS, NA | Process Connection | NPT, FLG, SW, NA |
| INSTR | TMP | Thermowell MOC | SS3, DSS, HAC, NA | Process Connection | NPT, FLG, NA |
| INSTR | FLW | Wetted/Liner MOC | SS3, PTFE, HAC, TIT, NA | Process Connection | FLG, WAF, NA |
| INSTR | LVL | Probe MOC | SS3, HAC, DSS, NA | Process Connection | FLG, NPT, NA |
| ELECT | PNL | Voltage Class | LV, MV6, MV11, 24V | Enclosure MOC | MS, SS3, GRP, NA |
| ELECT | JBX | Enclosure MOC | ALC, GRP, SS3, MS | Mounting | WM, SM, NA |
| ELECT | CBL | Insulation | XLPE, PVC, EPR, MICC | Armour | SWA, UNA, NA |
| ELECT | CMP | Voltage Class | LV, MV6, MV11, 24V, NA | NA | — |
| BOPKG | CLT | Shell MOC | FRP, RCC, NA | NA | — |
| BOPKG | GEN | NA | — | NA | — |
| PLATE | All | Condition | HR, CR, NA | NA | — |
| PIPES | All | Schedule | STD, S40, S80, S160, XH, NA | NA | — |
| FLANG | All | Pressure Class | C150, C300, C600, C900, PN16, PN40 | Flange Type | WN, SOP, BLN, SKT, THD, LJ |
| FITNG | All | Schedule/Class | S40, S80, S160, C150, C300, STD | NA | — |
| FASTN | All | Thread Standard | UNC, MET, NA | NA | — |
| GASKT | All | Pressure Class | C150, C300, C600, C900, PN16, PN40, NA | NA | — |
| STEEL | All | Material Grade | S275, S350, NA | NA | — |

---

## 5. Code Length Verification — Worst Cases

| Item Code | Chars | Margin to 50 |
|-----------|-------|-------------|
| `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH` | 32 | 18 chars |
| `ELECT-CBL-PWR-XLPE-SWA-160-MM2` | 31 | 19 chars |
| `PUMPS-CEN-HOR-SS3-MS-1000-LPH` | 30 | 20 chars |
| `VALVE-CTL-GLB-CS-ALS-100-NB` | 27 | 23 chars |
| `MOTOR-FLP-ACI-MV6-6P-250-KW` | 27 | 23 chars |
| `FLANG-DSS-NA-C150-WN-100-NB` | 27 | 23 chars |
| `ELECT-JBX-FPR-ALC-SM-300-MM` | 27 | 23 chars |
| `INSTR-PRS-TXR-HAC-FLG-010-BAR` | 29 | 21 chars |
| `PUMPS-DOS-DPH-PVDF-PTFE-050-LPH-01` | 35 (with suffix) | 15 chars |

**All codes confirmed within 50-character SAP limit. Maximum with suffix: 35 characters.**

---

## 6. SAP ItemCode vs Variant Boundary — Summary

| Attribute | ItemCode identity? | Variant only? | Notes |
|-----------|-------------------|--------------|-------|
| Engineering function (pump/valve type) | ✓ GROUP + SUBGROUP + TYPE | | Fixed |
| Nominal size / capacity | ✓ SIZE + UNIT | | Fixed |
| Body / wetted material | ✓ SEG4 | | New in 7-segment |
| Trim material (control valves) | ✓ SEG5 | | New in 7-segment |
| End / process connection type | ✓ SEG5 (where applicable) | | New in 7-segment |
| Voltage class (motors, panels) | ✓ SEG4 | | New in 7-segment |
| Pole count / speed (motors) | ✓ SEG5 | | New in 7-segment |
| Pipe / fitting schedule | ✓ SEG4 | | New in 7-segment |
| Flange pressure class | ✓ SEG4 | | New in 7-segment |
| Flange face type (WN/SOP/BLN) | ✓ SEG5 | | New in 7-segment |
| Insulation + armour (cable) | ✓ SEG4 + SEG5 | | New in 7-segment |
| Pressure class (valves) | | ✓ Variant | Same body+end connection valve, different pressure rating |
| Seat / disc material (ISO valves) | | ✓ Variant | Same body material, different internal trim |
| Actuator type / fail action | | ✓ Variant (control valves) | |
| Efficiency class / IP rating / insulation class | | ✓ Variant (motors) | |
| Bus rating / SC rating (panels) | | ✓ Variant | |
| Number of cores / voltage rating (cables) | | ✓ Variant | |
| Vendor / model number | | ✓ Variant | Always Variant |
| Certification (ATEX/IECEx/IBR) | | ✓ Variant | Zone / approval are project-specific |
| Datasheet revision | | ✓ Variant | |

---

## 7. Open Design Questions for Approval

The following require explicit confirmation before the baseline is updated:

| # | Question | Options |
|---|----------|---------|
| Q1 | **VALVE-ISO SEG5 = End Connection confirmed?** A flanged ball valve and a threaded ball valve at the same NB and material → separate SAP ItemCodes? | Confirm YES / Change to different attribute |
| Q2 | **VALVE-CTL SEG5 = Trim MOC confirmed?** End connection (always flanged RF in process) stays Variant for control valves? | Confirm YES / Include end connection instead |
| Q3 | **MOTOR SEG5 = Pole Count confirmed?** A 110 kW 4-pole motor and a 110 kW 6-pole motor at the same voltage → separate SAP ItemCodes? | Confirm YES / Move pole count to Variant |
| Q4 | **ELECT-CBL SIZE convention confirmed?** Conductor cross-section × 10 to eliminate decimals (1.5 mm² → `015`, 16 mm² → `160`)? | Confirm YES / Alternative convention |
| Q5 | **FLANG SEG5 = Flange Type (WN/SOP/BLN) confirmed?** A 100 NB ANSI 150 WN and a 100 NB ANSI 150 SOP → separate SAP ItemCodes? | Confirm YES / Keep flange type as Variant |
| Q6 | **PUMPS-DOS SEG5 = Diaphragm MOC confirmed?** A SS316 head pump with PTFE diaphragm and SS316 head pump with EPDM diaphragm → separate SAP ItemCodes? | Confirm YES / Move diaphragm to Variant |
| Q7 | **BOPKG-GEN NA-NA confirmed?** General packages too diverse for SEG4/SEG5 — all details in Variant and description? | Confirm YES / Define attributes |

---

*This is a design discussion document. The baseline (v1.2) is not amended until management approves the 7-segment architecture and the above open questions are resolved.*
