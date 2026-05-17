# THERMOPAC Local Document Agent — Setup Guide

## What This Is

A background Windows service that polls the cloud ERP every 20 seconds for file-save jobs and writes documents to `\\Server\d\THERMOPAC` (or your configured path).

**Architecture:**  
Cloud ERP → `document_agent_jobs` table → Agent polls → Local file server  
Outbound HTTPS only — no inbound ports required.

---

## Prerequisites

- Windows Server 2016 / Windows 10 or later  
- **Node.js 18 LTS** (x64) installed → [https://nodejs.org](https://nodejs.org)  
- Network access to the cloud ERP URL  
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
| `erpBaseUrl` | Your ERP URL, e.g. `https://your-erp.replit.app` |
| `apiKey` | The API key set during ERP registration |
| `allowedRootPath` | UNC path on this server, e.g. `\\\\Server\\d\\THERMOPAC` |
| `pollIntervalSeconds` | How often to check for jobs (default: 20) |

### Step 3 — Install Service

Double-click **`install-service.bat`** (Run as Administrator).

This will:
1. Check Node.js is installed
2. Run `npm install` to install the `node-windows` service wrapper
3. Register `ThermopacLocalDocumentAgent` as a Windows Service (auto-start)

### Step 4 — Start Service

Double-click **`start-service.bat`** or open Services (services.msc) and start `ThermopacLocalDocumentAgent`.

### Step 5 — Verify

Go to the ERP → Worker Agents → Doc Agent tab.  
Within 20 seconds the agent should appear **Online**.

---

## Service Management

| Action | Method |
|---|---|
| Start | `start-service.bat` or `net start ThermopacLocalDocumentAgent` |
| Stop | `stop-service.bat` or `net stop ThermopacLocalDocumentAgent` |
| Uninstall | `uninstall-service.bat` |
| Logs | `C:\ThermopacDocAgent\logs\` |

---

## Heartbeat Test

Test that the agent can reach the ERP before installing the service:

```
node dist\index.js
```

You should see: `Connected to ERP` within a few seconds.  
Press **Ctrl+C** to stop the test run.

---

## Allowed File Types

The agent accepts: `.pdf .docx .xlsx .csv .txt .png .jpg .jpeg .zip .dwg .dxf`

Rejected (security): `.exe .bat .cmd .ps1 .vbs .msi .dll`

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Node.js not found" | Install Node.js 18 LTS and ensure it's in PATH |
| "config.json not found" | Copy config.json.example → config.json |
| Agent shows OFFLINE in ERP | Check erpBaseUrl and apiKey in config.json |
| "Access denied" writing files | Run service as account with write access to the target path |
| Service won't install | Run install-service.bat as Administrator |
