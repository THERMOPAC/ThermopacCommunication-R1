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

export default router;
