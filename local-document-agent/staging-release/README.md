# THERMOPAC Local Windows Document Agent

Saves ERP-generated files to the local THERMOPAC file server.

## Architecture

```
Cloud ERP → document_agent_jobs table → Local Agent polls → \\Server\d\THERMOPAC
```

## Prerequisites

- Windows 10/11 or Windows Server 2019+
- Node.js 20 LTS (x64)
- Network access to ERP cloud URL (HTTPS outbound only)
- Write access to `\\Server\d\THERMOPAC`

## Setup

### 1. Install Node.js
Download and install Node.js 20 LTS from https://nodejs.org

### 2. Copy agent files
Copy the `local-document-agent/` folder to `C:\ThermopacDocAgent\`

### 3. Configure
```bash
cd C:\ThermopacDocAgent
copy config.json.example config.json
notepad config.json
```

Fill in:
- `erpBaseUrl` — your ERP URL e.g. `https://your-erp.replit.app`
- `apiKey` — the key generated during agent registration in the ERP (min 16 chars)
- `allowedRootPath` — e.g. `\\\\Server\\d\\THERMOPAC`

### 4. Build
```bash
npm install
npm run build
```

### 5. Test run
```bash
npm start
```

### 6. Install as Windows Service (auto-start on reboot)
```bash
node dist/index.js --install-service
```

Service name: `ThermopacLocalDocumentAgent`
Startup type: Automatic

To uninstall:
```bash
node dist/index.js --uninstall-service
```

## Job Types

| Type | Description |
|------|-------------|
| `CREATE_FOLDER` | Creates a folder (recursive) at the relative path |
| `SAVE_FILE` | Downloads file from URL and saves to local path |
| `SAVE_PDF` | Same as SAVE_FILE, PDF-specific label |
| `VERIFY_FILE_EXISTS` | Checks if file exists; optionally verifies SHA256 |
| `VERIFY_FOLDER_EXISTS` | Checks if folder exists |
| `HASH_VALIDATE` | Verifies SHA256 of an existing local file |

## Path Rules

The agent enforces strict path security:
- All paths are **relative** — the agent prepends `allowedRootPath`
- Traversal sequences (`../`, `..\`) are **rejected**
- Absolute paths (`C:\`, `\\Server\`) in relative field are **rejected**
- Unresolved tokens (`{FOO}`) are **rejected**
- Dangerous extensions (`.exe`, `.bat`, `.ps1`, `.dll`, etc.) are **rejected**

## Allowed File Extensions

`.pdf` `.docx` `.xlsx` `.csv` `.txt` `.png` `.jpg` `.jpeg` `.zip` `.dwg` `.dxf`

## Logs

Logs are written to `C:\ThermopacDocAgent\logs\agent.log` with automatic rotation (5 MB, 5 files).

## Security

- Outbound HTTPS only — no inbound ports opened
- Authenticated via `x-agent-code` + `x-api-key` headers
- All writes confined to `allowedRootPath`
- `.tmp` file written first; renamed to final only after successful save + hash
