#!/usr/bin/env python3
"""Dependency-light immutability checks for native 7C-1.3.0."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
HISTORICAL = ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    contract = json.loads((HERE / "engine-contract.json").read_text())
    parent = json.loads((HISTORICAL / "engine-contract.json").read_text())
    assert contract["engineContractVersion"] == "7C-1.3.0"
    assert contract["cascadeParentContract"] == "7C-1.2.0"
    assert contract["residualAmendmentApplied"] is False
    assert contract["routineTpd"]["latticeDenominator"] == parent["routineTpd"]["latticeDenominator"]
    assert contract["routineTpd"]["latticePointCount"] == parent["routineTpd"]["latticePointCount"]
    assert contract["routineTpd"]["postSplitSearchesPerStage"] == parent["routineTpd"]["postSplitSearchesPerStage"]
    assert contract["routineTpd"]["thresholdsChanged"] is False
    assert contract["releaseEligible"] is False
    assert sha(HISTORICAL / "engine.py") == "cc11a0131096f43cecc871de7273f85a92adfbd5c03167ede1b77387fd442d74"
    assert sha(HISTORICAL / "engine-contract.json") == "cd2b517e6f170dfcde8929002c71aa9cf3d5cce9768101730b5a3545a9a7be99"
    print("SEVEN_COMPONENT_NATIVE_1_3_CONTRACT_VERIFIED")


if __name__ == "__main__":
    main()