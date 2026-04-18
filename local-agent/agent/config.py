"""
config.py — Load, auto-create, and validate config.ini.

Auto-fill behaviour (Phase 1):
  api_url             → http://localhost:3000  (edit for production)
  node_id             → socket.gethostname()   (Windows machine name)
  solidworks_version  → highest version found in Windows registry
  node_token          → NEVER auto-generated; must be cloud-issued (agent exits
                        with a clear error message if still unset)
"""

from __future__ import annotations
import configparser
import os
import socket
import sys

SW_VERSION_PROGID = {
    2019: "SldWorks.Application.27",
    2020: "SldWorks.Application.28",
    2021: "SldWorks.Application.29",
    2022: "SldWorks.Application.30",
    2023: "SldWorks.Application.31",
    2024: "SldWorks.Application.32",
}

_TOKEN_PLACEHOLDER = "REPLACE_WITH_YOUR_TOKEN"
_DEFAULT_API_URL   = "http://localhost:3000"


class AgentConfig:
    def __init__(self, path: str = None):
        if path is None:
            path = self._default_path()

        # ── Auto-create config.ini if missing ─────────────────────────────────
        if not os.path.exists(path):
            _create_default_config(path)

        cfg = configparser.ConfigParser()
        cfg.read(path, encoding="utf-8")

        # ── Cloud ─────────────────────────────────────────────────────────────
        self.api_url = (
            cfg.get("cloud", "api_url", fallback="").strip().rstrip("/")
            or _DEFAULT_API_URL
        )

        self.node_id = (
            cfg.get("cloud", "node_id", fallback="").strip()
            or socket.gethostname()
        )

        raw_token = cfg.get("cloud", "node_token", fallback="").strip()
        if not raw_token or raw_token == _TOKEN_PLACEHOLDER:
            _abort_missing_token(path, self.node_id)
        self.node_token = raw_token

        # ── Agent ─────────────────────────────────────────────────────────────
        self.poll_interval_sec = cfg.getint("agent", "poll_interval_sec", fallback=10)
        self.job_timeout_sec   = cfg.getint("agent", "job_timeout_sec",   fallback=600)
        self.max_retries       = cfg.getint("agent", "max_retries",       fallback=3)

        # ── Paths ─────────────────────────────────────────────────────────────
        self.temp_dir = cfg.get("paths", "temp_dir", fallback=r"C:\ThermopacAgent\temp")
        self.log_dir  = cfg.get("paths", "log_dir",  fallback=r"C:\ThermopacAgent\logs")
        os.makedirs(self.temp_dir, exist_ok=True)
        os.makedirs(self.log_dir,  exist_ok=True)

        # ── SolidWorks ────────────────────────────────────────────────────────
        self.sw_visible = cfg.getboolean("solidworks", "visible", fallback=False)

        explicit_progid = cfg.get("solidworks", "solidworks_progid", fallback="").strip()
        if explicit_progid:
            self.sw_progid      = explicit_progid
            self.sw_version     = 0
            self.sw_autodetected = False
        else:
            ver_str = cfg.get("solidworks", "solidworks_version", fallback="").strip()
            if ver_str and ver_str != "0":
                # Manual override in config.ini
                ver = int(ver_str)
                if ver not in SW_VERSION_PROGID:
                    print(f"[CONFIG] ERROR: solidworks_version={ver} is not supported.")
                    print(f"[CONFIG]   Supported: {sorted(SW_VERSION_PROGID.keys())}")
                    print(f"[CONFIG]   Edit [solidworks] solidworks_version in: {path}")
                    sys.exit(1)
                self.sw_version      = ver
                self.sw_progid       = SW_VERSION_PROGID[ver]
                self.sw_autodetected = False
            else:
                # Auto-detect from Windows registry
                detected = _detect_solidworks_version()
                if detected:
                    self.sw_version      = detected
                    self.sw_progid       = SW_VERSION_PROGID[detected]
                    self.sw_autodetected = True
                else:
                    # Not found — agent can still start and connect;
                    # actual extraction jobs will fail with a clear error
                    self.sw_version      = 0
                    self.sw_progid       = ""
                    self.sw_autodetected = True

        self._config_path = path

    # ── Public helpers ────────────────────────────────────────────────────────

    def summary(self) -> str:
        sw = (f"{self.sw_progid}"
              + (" [auto-detected]" if self.sw_autodetected else ""))
        return (
            f"api_url={self.api_url} | node_id={self.node_id} | "
            f"sw={sw} | poll={self.poll_interval_sec}s | "
            f"timeout={self.job_timeout_sec}s"
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _default_path() -> str:
        """
        Search for config.ini in order:
          1. Directory of the running EXE (frozen) or this file (source)
          2. One level up (for running from agent/ subfolder)
          3. C:\\ThermopacAgent\\config.ini
        Returns the first match, or candidates[0] if none found
        (caller will auto-create it at that path).
        """
        if getattr(sys, "frozen", False):
            base = os.path.dirname(sys.executable)
        else:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        candidates = [
            os.path.join(base, "config.ini"),
            os.path.join(base, "..", "config.ini"),
            r"C:\ThermopacAgent\config.ini",
        ]
        for p in candidates:
            if os.path.exists(os.path.normpath(p)):
                return os.path.normpath(p)
        return os.path.normpath(candidates[0])


# ── Module-level helpers ──────────────────────────────────────────────────────

def _detect_solidworks_version() -> int:
    """
    Scan HKEY_CLASSES_ROOT for the highest installed SolidWorks COM ProgID.
    Returns the version number (e.g. 2019) or 0 if not found / not on Windows.
    """
    try:
        import winreg
        for ver in sorted(SW_VERSION_PROGID.keys(), reverse=True):
            progid = SW_VERSION_PROGID[ver]
            try:
                winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, progid)
                return ver
            except OSError:
                continue
    except ImportError:
        pass  # Not on Windows (Linux CI, etc.)
    return 0


def _create_default_config(path: str) -> None:
    """
    Write a default config.ini at `path` with auto-filled values.
    node_token is left as the placeholder — must be set by the user.
    """
    machine_name = socket.gethostname()
    detected_ver = _detect_solidworks_version()
    sw_ver_str   = str(detected_ver) if detected_ver else "0"
    sw_comment   = (
        f"; Auto-detected SolidWorks {detected_ver}"
        if detected_ver
        else "; SolidWorks not detected — set manually (2019–2024)"
    )

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    content = f"""\
; ThermopacAgent configuration
; Auto-created on first run — edit as needed

[cloud]
; Cloud API URL — change to production URL when ready
api_url    = {_DEFAULT_API_URL}

; Node ID — auto-filled from machine name; change if needed
node_id    = {machine_name}

; Node token — REQUIRED — obtain from Thermopac admin (see instructions below)
node_token = {_TOKEN_PLACEHOLDER}

[agent]
poll_interval_sec = 10
job_timeout_sec   = 600
max_retries       = 3

[paths]
temp_dir = C:\\ThermopacAgent\\temp
log_dir  = C:\\ThermopacAgent\\logs

[solidworks]
{sw_comment}
solidworks_version = {sw_ver_str}
; Uncomment to override COM ProgID directly:
; solidworks_progid =
visible = false
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[CONFIG] Created default config.ini at: {path}")
    print(f"[CONFIG]   node_id    = {machine_name}  (auto-filled from machine name)")
    print(f"[CONFIG]   api_url    = {_DEFAULT_API_URL}  (change for production)")
    if detected_ver:
        print(f"[CONFIG]   solidworks_version = {detected_ver}  (auto-detected)")
    else:
        print(f"[CONFIG]   solidworks_version = 0  (not detected — set manually)")
    print()


def _abort_missing_token(config_path: str, node_id: str) -> None:
    """Print a clear, actionable error and exit when node_token is not set."""
    print()
    print("=" * 62)
    print("  ERROR: node_token is not set in config.ini")
    print("=" * 62)
    print()
    print("  The node token cannot be auto-generated.")
    print("  It must be issued by a Thermopac admin.")
    print()
    print("  Steps to get your token:")
    print("    1. Log in to the Thermopac ERP as Superuser")
    print("    2. Go to EPC -> Drawing Controls -> Agent Nodes")
    print(f"    3. Register this node  (suggested ID: {node_id})")
    print("    4. Copy the token shown — it is displayed ONCE only")
    print("    5. Open config.ini and paste it under [cloud] node_token")
    print()
    print(f"  Config file: {config_path}")
    print()
    print("=" * 62)
    sys.exit(1)
