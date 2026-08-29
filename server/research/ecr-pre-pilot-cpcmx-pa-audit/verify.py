#!/usr/bin/env python3
"""Verify the fail-closed CPCM-X PA capability-audit artifact."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cpcmx-pa-audit"

subprocess.run([sys.executable, str(HERE / "run.py")], check=True)
result = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
manifest = json.loads((HERE / "provenance-manifest.json").read_text(encoding="utf-8"))

assert result["model"]["label"] == "GFN2-xTB + ddCOSMO/CPCM-X published parameterization"
assert result["model"]["cpcmxRelease"] == "v1.1.0"
assert result["model"]["cpcmxCommit"] == "e7f894c76d41ee1f703cf6f03e931cbcf046bc7f"
assert result["model"]["globalCpcmxParametersRefitted"] is False
assert result["model"]["openCosmoRs24a"] is False
assert result["sourceIntegrity"]["status"] == "PASS"
assert result["capabilityAudit"]["status"] == "FAIL"
assert result["capabilityAudit"]["evidence"]["cosmoSacDisconnected"]["liveCallCount"] == 0
assert result["benchmark"]["status"] == "NOT_EXECUTED_CAPABILITY_BLOCKED"
assert result["benchmark"]["evaluatedRecords"] == 0
assert result["benchmark"]["acceptanceGatePassed"] is False
assert result["molecularGeneration"]["generatedProfiles"] == []
assert result["paReferenceData"]["records"] == []
assert result["uniquacRegression"]["expectedDirectedTerms"] == 10
assert result["uniquacRegression"]["fittedParameters"] == []
assert all(value is False for value in result["productionImpact"].values())
assert result["decision"] == "STOPPED_PUBLISHED_MODEL_LACKS_MIXTURE_ACTIVITY_CAPABILITY"
assert manifest["modelLabel"] == result["model"]["label"]
assert manifest["release"] == result["model"]["cpcmxRelease"]
assert manifest["commit"] == result["model"]["cpcmxCommit"]
assert len(manifest["sourceFiles"]) == 5
assert (OUT / "report.md").read_text(encoding="utf-8").rstrip().endswith(
    "Positive-PA results and sulfur removal remain not calculable."
)

print("verified fail-closed GFN2-xTB/CPCM-X capability audit")