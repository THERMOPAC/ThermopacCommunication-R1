# ThermopacAgent — Installation & Configuration Guide

## Prerequisites

- Windows 10 or Windows 11 (64-bit)
- SolidWorks 2019, 2020, 2021, 2022, 2023, or 2024 installed and licensed
- Network access to `thermopac-communication-thermopacllp.replit.app`

---

## Step 1 — Admin Registers This Node

Before installing, a Thermopac admin must register this PC in the cloud app:

1. Log into the Thermopac ERP as Superuser
2. Navigate to **EPC Drawing Controls → Agent Nodes**
3. Click **Register New Node**
4. Enter:
   - **Node ID** — a short unique name for this PC (e.g. `PC-DESIGN-01`)
   - **Label** — friendly name (e.g. `Design Office PC – Prasad`)
5. The system generates a **Node Token** — copy it immediately (shown only once)

---

## Step 2 — Install the Agent

1. Double-click `ThermopacAgent-Setup-v1.0.exe`
2. Accept the license agreement
3. Choose install location (default: `C:\Program Files\ThermopacAgent\`)
4. Choose whether to create a Desktop shortcut
5. Choose whether to auto-start on Windows login (recommended for shared design PCs)
6. Click **Install**

The installer creates:
- Application files in the install folder
- Working temp folder: `C:\ThermopacAgent\temp\`
- Log folder: `C:\ThermopacAgent\logs\`

---

## Step 3 — Configure the Agent

Edit `config.ini` in the install folder (e.g. `C:\Program Files\ThermopacAgent\config.ini`):

```ini
[cloud]
api_url    = https://thermopac-communication-thermopacllp.replit.app
node_id    = PC-DESIGN-01          ; must match what admin registered
node_token = PASTE_TOKEN_HERE      ; token from Step 1 (keep secret)

[agent]
poll_interval_sec = 10
job_timeout_sec   = 600
max_retries       = 3

[paths]
temp_dir = C:\ThermopacAgent\temp
log_dir  = C:\ThermopacAgent\logs

[solidworks]
solidworks_version = 2024          ; change to match your installed version
; solidworks_progid =              ; leave blank (auto-resolved from version)
visible            = false
```

**Supported SolidWorks versions:**

| Version | ProgID (auto-resolved) |
|---------|----------------------|
| 2019    | SldWorks.Application.27 |
| 2020    | SldWorks.Application.28 |
| 2021    | SldWorks.Application.29 |
| 2022    | SldWorks.Application.30 |
| 2023    | SldWorks.Application.31 |
| 2024    | SldWorks.Application.32 |

---

## Step 4 — Start the Agent

Double-click the **ThermopacAgent** shortcut (Start Menu or Desktop).

A console window opens showing:
```
[Agent] Starting — api_url=https://... node_id=PC-DESIGN-01 ...
[Agent] Testing connection…
[Agent] Connection OK — entering poll loop
[Agent] No pending jobs
...
```

Leave this window open (minimise to taskbar). It will pick up jobs automatically.

**If auto-start was selected during install**, the agent starts automatically 30 seconds after Windows login — no manual action required.

---

## Step 5 — Verify

1. From the Thermopac ERP, open any EPC drawing record at `/epc/drawing-controls`
2. Upload a `.slddrw` file in the **DWG Attachments** card
3. Watch the agent console — within one poll interval (10s) you should see:
   ```
   [Agent] 1 pending job(s)
   [Runner] Job 42 start — file=C10308-CPS-ACS-S6T-20-P28.slddrw
   [Runner] Downloading…
   [Extractor] Launching SolidWorks (SldWorks.Application.32)…
   [Extractor] Document open
   [Properties] drawing_number='C10308-…' revision='B'
   [DesignData] Found 10 row(s)
   [Runner] Uploading extraction result…
   [Runner] Job 42 complete (145.2s)
   ```
4. In the Thermopac ERP, the **Drawing Verification** card updates with the extraction result and DDS comparison

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `Authentication failed` | Verify `node_id` and `node_token` in config.ini match what admin registered |
| `SolidWorks not found` | Verify `solidworks_version` matches your installed version |
| `OpenDoc6 returned None` | Ensure SolidWorks is properly licensed; try `visible = true` to see errors |
| `DesignDataNotFoundError` | Drawing must contain a table with "Design Data" in the title |
| Job stuck at `processing` | Cloud auto-resets stale jobs after 30 min; check agent logs |
| Agent crashes on startup | Check `C:\ThermopacAgent\logs\agent.log` for the full error |

---

## Log Files

Logs are written to `C:\ThermopacAgent\logs\agent.log`
Daily rotation — previous days saved as `agent.log.YYYY-MM-DD`
30 days retained automatically.

---

## Uninstall

Use **Windows Settings → Apps** or **Control Panel → Programs** and uninstall **ThermopacAgent**.
The installer removes the scheduled task automatically.
Temp and log folders are **not** deleted (they may contain useful logs).

---

## Building from Source

If you need to rebuild the EXE:

```bat
pip install -r requirements.txt
build.bat
```

Then compile the installer:
```
iscc installer\setup.iss
```

Output: `installer_output\ThermopacAgent-Setup-v1.0.exe`

---

*Baseline design: `docs/slddrw-extraction-agent-baseline-v3.md`*
