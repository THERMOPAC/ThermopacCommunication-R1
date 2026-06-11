# THERMOPAC Local Document Agent — Setup Guide

## What This Is

A background Windows service that polls the cloud ERP every 20 seconds for file-save jobs and writes documents to `\\Server\d\THERMOPAC` (or your configured path).

**Architecture:**  
Cloud ERP → `document_agent_jobs` table → Agent polls → Local file server  
Outbound HTTPS only — no inbound ports required.

**Service wrapper:** NSSM (Non-Sucking Service Manager) — wraps `ThermopacDocAgent.exe` as a proper auto-start Windows Service. Direct `sc.exe` registration is not used because the EXE is a console polling app, not a native Windows Service.

---

## Prerequisites

- Windows Server 2016 / Windows 10 or later  
- **No Node.js required** — `ThermopacDocAgent.exe` has the Node.js runtime bundled  
- Network access to the cloud ERP URL (outbound HTTPS port 443)  
- Write access to `\\Server\d\THERMOPAC` (or your configured path)  
- Administrator rights (for Windows Service installation)

---

## Step-by-Step Setup

### Step 1 — Copy the package

Copy this entire folder to the Windows server, e.g.:  
```
C:\ThermopacDocAgent\
```

### Step 2 — Configure

Copy `config.json.example` to `config.json`:
```
copy config.json.example config.json
```

Edit `config.json` and fill in:

| Field | Description |
|---|---|
| `agentCode` | Must exactly match the code registered in the ERP |
| `erpBaseUrl` | Your ERP URL, e.g. `https://thermopac-communication-thermopacllp.replit.app` |
| `apiKey` | The API key set during ERP registration |
| `allowedRootPath` | UNC path on this server, e.g. `\\\\Server\\d\\THERMOPAC` |
| `pollIntervalSeconds` | How often to check for jobs (default: 20) |

### Step 3 — Install Service

Right-click **`install-service.bat`** → **Run as administrator**.

This will:
1. Check `ThermopacDocAgent.exe` and `config.json` exist
2. Locate `nssm.exe` in the agent folder — or download it automatically from nssm.cc
3. Register `ThermopacLocalDocumentAgent` as a Windows Service (auto-start)
4. Start the service immediately

> **Note:** If the machine has no internet access, download `nssm-2.24.zip` from  
> https://nssm.cc/release/nssm-2.24.zip, extract `win64\nssm.exe` and place it  
> alongside `ThermopacDocAgent.exe` before running the script.

### Step 4 — Verify

Go to **ERP → Worker Agents → Doc Agent tab**.  
Within 20 seconds the agent should appear **Online**.

You can also check `services.msc` — `ThermopacLocalDocumentAgent` should show **Running**.

---

## Service Management

| Action | Method |
|---|---|
| Start | `start-service.bat` or `net start ThermopacLocalDocumentAgent` |
| Stop | `stop-service.bat` or `net stop ThermopacLocalDocumentAgent` |
| Uninstall | `uninstall-service.bat` (run as Administrator) |
| Status | `services.msc` → ThermopacLocalDocumentAgent |
| NSSM console | `nssm edit ThermopacLocalDocumentAgent` |

---

## Log Files

| File | Contents |
|---|---|
| `logs\service-stdout.log` | Agent stdout (NSSM-captured, rotates at 10 MB) |
| `logs\service-stderr.log` | Agent stderr / errors (NSSM-captured, rotates at 10 MB) |

---

## Manual Test Run

Before installing the service, verify the agent connects to the ERP:

```
ThermopacDocAgent.exe
```

You should see: `Connected to ERP` within a few seconds.  
Press **Ctrl+C** to stop.

---

## Allowed File Types

The agent accepts: `.pdf .docx .xlsx .csv .txt .png .jpg .jpeg .zip .dwg .dxf`

Rejected (security): `.exe .bat .cmd .ps1 .vbs .msi .dll`

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Error 1053 on service start | Old service registered via `sc.exe` directly — run `uninstall-service.bat`, then `install-service.bat` to re-register via NSSM |
| "NSSM download failed" | No internet access — download `nssm.exe` manually (see Step 3 note) |
| Agent shows OFFLINE in ERP | Check `erpBaseUrl` and `apiKey` in `config.json`; run manual test first |
| "Access denied" writing files | Run service as account with write access to the target path (`nssm edit ThermopacLocalDocumentAgent` → Log on tab) |
| Service installed but not starting | Check `logs\service-stderr.log` for the error |
| Service won't install | Run `install-service.bat` as Administrator |

---

## Building from Source

```
npm install
npm run build
npm run build:exe     # produces ThermopacDocAgent.exe
```

For the Inno Setup installer, place `nssm.exe` (win64) alongside `thermopac-doc-agent.iss` before running:
```
iscc thermopac-doc-agent.iss
```

If `nssm.exe` is absent at build time, the installer downloads it at install time automatically.
