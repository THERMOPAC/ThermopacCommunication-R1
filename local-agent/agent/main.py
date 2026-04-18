"""
main.py — ThermopacAgent entry point.

Poll loop:
  1. Authenticate (connection test on start)
  2. Poll /pending every poll_interval_sec
  3. If jobs available → pick first → run_job()
  4. Repeat
  5. Graceful shutdown on SIGINT / SIGTERM (Ctrl+C)
"""

from __future__ import annotations
import os
import signal
import sys
import time

# Support running as compiled EXE (PyInstaller) or as script
if getattr(sys, "frozen", False):
    _base = os.path.dirname(sys.executable)
else:
    _base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, _base)

from agent.config     import AgentConfig
from agent.logger     import build_logger
from agent.job_client import JobClient, AGENT_VERSION
from agent.job_runner import run_job

BANNER = r"""
  _____ _                                          _
 |_   _| |__   ___ _ __ _ __ ___   ___  _ __   __ _  ___
   | | | '_ \ / _ \ '__| '_ ` _ \ / _ \| '_ \ / _` |/ __|
   | | | | | |  __/ |  | | | | | | (_) | |_) | (_| | (__
   |_| |_| |_|\___|_|  |_| |_| |_|\___/| .__/ \__,_|\___|
                                        |_|
  SolidWorks Extraction Agent  v{version}
  THERMOPAC ERP Integration
"""

_shutdown = False


def _handle_signal(signum, frame):
    global _shutdown
    print("\n[Agent] Shutdown signal received — finishing current job then stopping…")
    _shutdown = True


def main():
    global _shutdown

    print(BANNER.format(version=AGENT_VERSION))

    # ── Config ────────────────────────────────────────────────────────────────
    cfg_path = None
    if len(sys.argv) > 1:
        cfg_path = sys.argv[1]
    config = AgentConfig(cfg_path)

    # ── Logger ────────────────────────────────────────────────────────────────
    logger = build_logger(config.log_dir)
    logger.info(f"[Agent] Starting — {config.summary()}")
    logger.info(f"[Agent] Agent version: {AGENT_VERSION}")

    # ── Signal handlers ───────────────────────────────────────────────────────
    signal.signal(signal.SIGINT,  _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # ── HTTP client ───────────────────────────────────────────────────────────
    client = JobClient(config.api_url, config.node_id, config.node_token, logger)

    # ── Connection test ───────────────────────────────────────────────────────
    logger.info(f"[Agent] Testing connection to {config.api_url}…")
    if not client.test_connection():
        logger.error("[Agent] Connection test failed — check config.ini and network")
        sys.exit(1)
    logger.info("[Agent] Connection OK — entering poll loop")
    logger.info(f"[Agent] Poll interval: {config.poll_interval_sec}s | "
                f"Job timeout: {config.job_timeout_sec}s")

    # ── Poll loop ─────────────────────────────────────────────────────────────
    while not _shutdown:
        try:
            jobs = client.get_pending_jobs()

            if not jobs:
                logger.debug("[Agent] No pending jobs")
            else:
                logger.info(f"[Agent] {len(jobs)} pending job(s) — processing first")
                job = jobs[0]
                run_job(job, client, config, logger)

        except Exception as e:
            logger.error(f"[Agent] Poll loop error: {e}", exc_info=True)

        if _shutdown:
            break

        # Sleep in small increments so shutdown signal is responsive
        for _ in range(config.poll_interval_sec * 2):
            if _shutdown:
                break
            time.sleep(0.5)

    logger.info("[Agent] Shutdown complete")


if __name__ == "__main__":
    main()
