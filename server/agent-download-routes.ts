/**
 * agent-download-routes.ts
 * Serves the Thermopac Drawing Structuring Agent full-package ZIP on-the-fly.
 * Bundles all Python source + helper scripts from local-agent/ into a single
 * downloadable archive containing everything needed to bootstrap the agent.
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
 * Streams a ZIP of the full structuring-agent package.
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
    const srcDirs: Array<[string, string]> = [
      [path.join(LOCAL_AGENT, "agent"),     "agent"],
      [path.join(LOCAL_AGENT, "structurer"), "structurer"],
      [path.join(LOCAL_AGENT, "extractor"), "extractor"],
    ];

    for (const [srcPath, destName] of srcDirs) {
      if (dirExists(srcPath)) {
        archive.glob("**/*.py", {
          cwd: srcPath,
          ignore: ["__pycache__/**", "*.pyc"],
        }, { prefix: `${root}/${destName}` });
      }
    }

    // ── Package helper files (bat, ps1, ini, md, txt) ─────────────────────
    const pkgFiles = [
      "run.bat",
      "bootstrap.bat",
      "install_update.bat",
      "config.ini",
      "INSTALL.md",
      "BUILD.md",
      "requirements.txt",
      "fix_appdata_url.ps1",
      "set_dev_url.bat",
      "set_prod_url.bat",
      "set_testing_mode.bat",
      "set_node_token.bat",
    ];

    for (const f of pkgFiles) {
      const full = path.join(PKG_DIR, f);
      if (fileExists(full)) {
        archive.file(full, { name: `${root}/${f}` });
      }
    }

    archive.finalize();
  }
);

export default router;
