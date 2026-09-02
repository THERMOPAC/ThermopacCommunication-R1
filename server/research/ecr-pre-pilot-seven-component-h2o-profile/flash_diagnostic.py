#!/usr/bin/env python3
"""Standalone research-only wet-solvent seven-component flash diagnostic."""
import subprocess
import sys
from pathlib import Path

RUNNER = Path(__file__).with_name("run_qualification.py")

if __name__ == "__main__":
    raise SystemExit(subprocess.call([sys.executable, str(RUNNER), *sys.argv[1:]]))