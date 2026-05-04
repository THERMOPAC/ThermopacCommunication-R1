/**
 * agent-download-routes.ts
 * Serves the Thermopac Drawing Structuring Agent full-package ZIP on-the-fly.
 *
 *  ThermopacStructuringAgent-v{X}/
 *    agent/          ← structuring-agent Python source only (no extractor files)
 *    structurer/     ← Python source
 *    installer/      ← Inno Setup build scripts
 *    tools/          ← utility Python scripts
 *    structure_pkg/  ← structurer_pkg contents (install_update.bat excluded — lives at root)
 *    build.bat
 *    bootstrap.bat
 *    BUILD.md
 *    config.ini
 *    fix_appdata_url.ps1
 *    INSTALL.md
 *    install_update.bat  ← run from ZIP root as Admin to update installed files
 *    requirements.txt
 *    run.bat
 *    set_dev_url.bat
 *    set_node_token.bat
 *    set_prod_url.bat
 *    set_testing_mode.bat
 *    ThermopacDrawings.drwprp
 */
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { ensureAuthenticated } from "./auth-middleware";

const router = Router();

const AGENT_VERSION = "1.0.35";
const LOCAL_AGENT   = path.resolve("local-agent");
const PKG_DIR       = path.join(LOCAL_AGENT, "structurer_pkg");

function dirExists(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function fileExists(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/**
 * GET /api/agent-downloads/structuring-agent
 * Streams a ZIP of the full structuring-agent package matching the GitHub repo structure.
 * Auth required (any logged-in user).
 */
router.get(
  "/agent-downloads/structuring-agent",
  ensureAuthenticated,
  (_req: Request, res: Response) => {
    const filename = `ThermopacStructuringAgent-v${AGENT_VERSION}-full.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");

    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("error", (err) => {
      console.error("[AgentDownload] archiver error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to build package" });
      }
    });

    archive.pipe(res);

    const root = `ThermopacStructuringAgent-v${AGENT_VERSION}`;

    // ── Structuring-agent Python source only ──────────────────────────────
    // agent/: include only files belonging to the structuring agent.
    // Extraction-agent files (job_runner.py, main.py) are intentionally excluded.
    const agentDir = path.join(LOCAL_AGENT, "agent");
    if (dirExists(agentDir)) {
      const agentFiles = [
        "main_structurer.py",
        "structure_job_client.py",
        "structure_job_runner.py",
        "config.py",
        "logger.py",
        "job_client.py",   // required: structure_job_client imports error classes from here
        "__init__.py",
      ];
      for (const f of agentFiles) {
        const full = path.join(agentDir, f);
        if (fileExists(full)) {
          archive.file(full, { name: `${root}/agent/${f}` });
        }
      }
    }

    // ── structurer/ — all Python source ───────────────────────────────────
    const structurerDir = path.join(LOCAL_AGENT, "structurer");
    if (dirExists(structurerDir)) {
      archive.glob("**/*.py", {
        cwd: structurerDir,
        ignore: ["__pycache__/**", "*.pyc"],
      }, { prefix: `${root}/structurer` });
    }

    // ── installer/ — Inno Setup build scripts ─────────────────────────────
    const installerDir = path.join(LOCAL_AGENT, "installer");
    if (dirExists(installerDir)) {
      archive.directory(installerDir, `${root}/installer`);
    }

    // ── tools/ — utility Python scripts ───────────────────────────────────
    const toolsDir = path.join(LOCAL_AGENT, "tools");
    if (dirExists(toolsDir)) {
      archive.directory(toolsDir, `${root}/tools`);
    }

    // ── structure_pkg/ — full structurer_pkg directory (exclude install_update.bat
    //    which lives at the ZIP root and must be run from there, not from structure_pkg/)
    if (dirExists(PKG_DIR)) {
      archive.glob("**/*", {
        cwd: PKG_DIR,
        ignore: ["install_update.bat"],
      }, { prefix: `${root}/structure_pkg` });
    }

    // ── Root helper files (updated versions from structurer_pkg/) ─────────
    const pkgRootFiles = [
      "bootstrap.bat",
      "BUILD.md",
      "config.ini",
      "fix_appdata_url.ps1",
      "INSTALL.md",
      "install_update.bat",
      "requirements.txt",
      "run.bat",
      "set_dev_url.bat",
      "set_node_token.bat",
      "set_prod_url.bat",
      "set_testing_mode.bat",
      "ThermopacDrawings.drwprp",
    ];
    for (const f of pkgRootFiles) {
      const full = path.join(PKG_DIR, f);
      if (fileExists(full)) {
        archive.file(full, { name: `${root}/${f}` });
      }
    }

    // ── build.bat — from local-agent root ─────────────────────────────────
    const buildBat = path.join(LOCAL_AGENT, "build.bat");
    if (fileExists(buildBat)) {
      archive.file(buildBat, { name: `${root}/build.bat` });
    }

    archive.finalize();
  }
);

// ── Serve solidworks_structurer.py directly ─────────────────────────────────
router.get(
  "/solidworks-structurer-py",
  ensureAuthenticated,
  (_req: Request, res: Response) => {
    const filePath = path.join(LOCAL_AGENT, "structurer", "solidworks_structurer.py");
    if (!fileExists(filePath)) {
      res.status(404).json({ error: "solidworks_structurer.py not found" });
      return;
    }
    res.setHeader("Content-Type", "text/x-python");
    res.setHeader("Content-Disposition", 'attachment; filename="solidworks_structurer.py"');
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(filePath);
  }
);

// ── Serve fix_filename.bat — self-contained one-click filename fixer ─────────
// Downloads solidworks_structurer.py from this server and places it in the
// install directory. Run as Administrator from any location.
router.get(
  "/fix-filename-bat",
  ensureAuthenticated,
  (req: Request, res: Response) => {
    const host = `${req.protocol}://${req.get("host")}`;
    const downloadUrl = `${host}/api/agent-downloads/solidworks-structurer-py`;

    const bat = `@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent — Filename Fix
REM  Downloads the corrected solidworks_structurer.py from the
REM  ERP server and replaces the installed copy.
REM  Run as Administrator.
REM ============================================================

title Thermopac Filename Fix

net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Run as Administrator. Right-click this file and choose Run as administrator.
    pause & exit /b 1
)

set "INSTALL_DIR=C:\\Program Files\\ThermopacStructuringAgent"
set "TARGET=%INSTALL_DIR%\\structurer\\solidworks_structurer.py"
set "DOWNLOAD_URL=${downloadUrl}"

if not exist "%INSTALL_DIR%\\structurer\\" (
    echo [ERROR] Install directory not found: %INSTALL_DIR%\\structurer\\
    echo Run the full installer first.
    pause & exit /b 1
)

echo.
echo Downloading corrected solidworks_structurer.py...
echo URL: %DOWNLOAD_URL%
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -UseBasicParsing -OutFile '%TARGET%' -ErrorAction Stop; Write-Host 'Download OK' } catch { Write-Error $_.Exception.Message; exit 1 }"
if %errorLevel% NEQ 0 (
    echo [ERROR] Download failed. Check that you are connected to the ERP and logged in.
    pause & exit /b 1
)

echo.
echo Verifying fix...
findstr /C:".slddrw" "%TARGET%" >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Verification failed — .slddrw not found in downloaded file.
    pause & exit /b 1
)
findstr /C:"_rev-" "%TARGET%" >nul 2>&1
if %errorLevel% EQU 0 (
    echo [ERROR] _rev- still present in downloaded file — server may be stale.
    pause & exit /b 1
)

echo [OK] solidworks_structurer.py updated successfully.
echo [OK] No _rev- found — filenames will now be saved as {DrawingNo}.slddrw
echo.
echo Close the agent console and reopen run.bat to apply the fix.
echo.
pause
`;

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="fix_filename.bat"');
    res.setHeader("Cache-Control", "no-store");
    res.send(bat);
  }
);

export default router;
