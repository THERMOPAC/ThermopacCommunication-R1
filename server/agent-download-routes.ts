/**
 * agent-download-routes.ts
 * Serves the Thermopac Drawing Structuring Agent full-package ZIP on-the-fly.
 * Mirrors the GitHub repo structure exactly:
 *
 *  ThermopacStructuringAgent-v{X}/
 *    agent/          ← Python source
 *    extractor/      ← Python source
 *    structurer/     ← Python source
 *    installer/      ← Inno Setup build scripts
 *    tools/          ← utility Python scripts
 *    structure_pkg/  ← full structurer_pkg contents (Inno-style package)
 *    build.bat
 *    bootstrap.bat   ← updated version from structurer_pkg/
 *    BUILD.md
 *    config.ini
 *    fix_appdata_url.ps1
 *    INSTALL.md
 *    install_update.bat
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

const AGENT_VERSION = "1.0.34";
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

    // ── Python source directories ──────────────────────────────────────────
    const pyDirs: Array<[string, string]> = [
      [path.join(LOCAL_AGENT, "agent"),      "agent"],
      [path.join(LOCAL_AGENT, "structurer"), "structurer"],
    ];
    for (const [srcPath, destName] of pyDirs) {
      if (dirExists(srcPath)) {
        archive.glob("**/*.py", {
          cwd: srcPath,
          ignore: ["__pycache__/**", "*.pyc"],
        }, { prefix: `${root}/${destName}` });
      }
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
