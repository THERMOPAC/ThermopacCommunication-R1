# THERMOPAC — SolidWorks Extraction Agent
## Complete Delivery Plan
**Status: ACTIVE**
**Date: 2026-04-19**
**Baseline Reference: docs/slddrw-extraction-agent-baseline-v3.md**

---

## Phase 1 — Windows SolidWorks Extraction Agent Package

### Code-Complete on Replit ✅

| Component | Files | Lines | Status |
|---|---|---|---|
| `agent/main.py` — Poll loop + signal handling + auto-register | 1 | 402 | ✅ Done |
| `agent/config.py` — Load + validate config.ini, resolve SW ProgID | 1 | 273 | ✅ Done |
| `agent/logger.py` — Rotating file logger + console output | 1 | 61 | ✅ Done |
| `agent/job_client.py` — HTTP client (4 agent API calls) | 1 | 132 | ✅ Done |
| `agent/job_runner.py` — Job orchestration + job-level timeout | 1 | 151 | ✅ Done |
| `extractor/solidworks_extractor.py` — Dedicated SW instance, dispatches modules | 1 | 191 | ✅ Done |
| `extractor/extract_properties.py` | 1 | 109 | ✅ Done |
| `extractor/extract_sheets.py` | 1 | 65 | ✅ Done |
| `extractor/extract_views.py` | 1 | 81 | ✅ Done |
| `extractor/extract_dimensions.py` | 1 | 81 | ✅ Done |
| `extractor/extract_annotations.py` | 1 | 80 | ✅ Done |
| `extractor/extract_tables.py` | 1 | 87 | ✅ Done |
| `extractor/extract_references.py` | 1 | 81 | ✅ Done |
| `extractor/extract_health.py` | 1 | 67 | ✅ Done |
| `extractor/extract_nozzles.py` | 1 | 94 | ✅ Done |
| `extractor/extract_design_data.py` — MANDATORY hard failure if absent | 1 | 170 | ✅ Done |
| `installer/setup.iss` — Inno Setup installer script | 1 | 104 | ✅ Done |
| `build.bat` — PyInstaller build script | 1 | — | ✅ Done |
| `bootstrap.bat` — Bootstrap script | 1 | — | ✅ Done |
| `config.ini` — Default config template | 1 | — | ✅ Done |
| `requirements.txt` | 1 | 11 | ✅ Done |
| `INSTALL.md`, `BUILD.md` | 2 | — | ✅ Done |
| GitHub Actions workflow (`build-windows-agent-standalone.yml`) | 1 | — | ✅ Done |
| Full zip package (`thermopac-agent-full.zip`) — 42 KB, 26 files | — | — | ✅ Delivered |

### Cloud API — Code-Complete on Replit ✅

| Endpoint | Status |
|---|---|
| `GET /api/epc-slddrw-jobs/pending` | ✅ Done |
| `POST /api/epc-slddrw-jobs/:id/claim` — atomic, 409 on race | ✅ Done |
| `POST /api/epc-slddrw-jobs/:id/complete` — Zod validation | ✅ Done |
| `POST /api/epc-slddrw-jobs/:id/fail` | ✅ Done |
| Per-node auth (`x-node-id` + `x-node-token` bcrypt) | ✅ Done |
| `epc_agent_nodes` table | ✅ Done |
| `epc_slddrw_extraction_jobs` table | ✅ Done |
| Agent `--test-full` auth test → **PASS** | ✅ Verified |

### Remaining Steps — Manual (Your Side)

| Step | Action | Owner |
|---|---|---|
| **1** | Push `thermopac-agent-full.zip` contents to GitHub repo `thermopac-agent` | You |
| **2** | GitHub Actions builds → `ThermopacAgent-Setup-v1.0.exe` available in Releases | GitHub CI |
| **3** | Install on SolidWorks Windows PC → edit `config.ini` with `node_id` + `node_token` | You |
| **4** | Upload a real `.slddrw` file via EPC Drawing Controls → DWG Attachments | You |
| **5** | Confirm agent picks up job, extracts, result appears in Drawing Verification card | You |

**Phase 1 is CLOSED when Step 5 is confirmed.**

---

## Phase 2 — DDS Comparison Engine (Cloud-side) ✅ COMPLETE

**Trigger: Phase 1 Step 5 confirmed (live extraction working)**

| Item | Description | Status |
|---|---|---|
| `dds_comparison_status` column | Already in `epc_slddrw_extraction_jobs` | ✅ Done |
| `drawing-unit-normalizer.ts` | `compareNumeric` / `compareString` — barg/°C/mm/MPa/kPa/psi + more | ✅ Done |
| Comparison trigger | Auto-run (async, non-blocking) when job → `completed` | ✅ Done |
| DDS field mapping | 10 fields: 5 CRITICAL + 5 WARNING (§6b) in `dds-comparison-engine.ts` | ✅ Done |
| Outcome logic | `pass` / `fail` / `warn` / `blocked` written to `dds_comparison_status` + `dds_comparison_result` | ✅ Done |
| Approval gate — backend | `POST /api/epc-drawing-controls/:id/approve` — rejects `fail`/`blocked`, requires `acknowledge_warnings: true` for `warn` | ✅ Done |
| Approval gate — frontend | DDS banner in card; Approve button gated by status; warn requires checkbox acknowledgement; polls 5s when comparison pending | ✅ Done |

**Phase 2 is CLOSED.**

---

## Phase 3 — Drawing Verification UI (Cloud-side)

**Trigger: Phase 2 complete (✅ done)**

| Item | Description | Status |
|---|---|---|
| Extraction result display card | Show all 10 extraction modules output | ❌ Not built |
| DDS comparison result card | Show PASS / FAIL / WARN / BLOCKED per field | ✅ Built in Phase 2 (`_DdsComparisonBanner`) |
| Warning acknowledgement | Approver must acknowledge WARNING mismatches | ✅ Built in Phase 2 |
| Approve button + approval flow | Gated by DDS comparison status | ✅ Built in Phase 2 |
| Release flow | Mark drawing as released after approval (procurement / manufacturing) | ❌ Not built |

---

## Key Reference Files

| File | Purpose |
|---|---|
| `docs/slddrw-extraction-agent-baseline-v3.md` | Frozen baseline design — APPROVED 2026-04-18 |
| `docs/slddrw-extraction-agent-delivery-plan.md` | This file — delivery tracking |
| `local-agent/agent/main.py` | Agent entry point |
| `local-agent/extractor/solidworks_extractor.py` | SolidWorks COM orchestrator |
| `local-agent/installer/setup.iss` | Inno Setup installer script |
| `client/public/thermopac-agent-full.zip` | Full GitHub upload package |
| `client/public/build-windows-agent-standalone.yml` | GitHub Actions workflow (standalone) |
| `server/epc-slddrw-job-routes.ts` | Cloud API routes |

---

*End of delivery plan.*
