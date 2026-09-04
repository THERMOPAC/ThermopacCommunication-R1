#!/usr/bin/env python3
"""Production wrapper for native-thermodynamics 7C-1.3.0."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HISTORICAL_WORKER_PATH = (
    ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-2/worker.py"
)
ENGINE_PATH = (
    ROOT / "server/research/ecr-pre-pilot-seven-component-native-cascade/engine.py"
)
CONTRACT_PATH = (
    ROOT
    / "server/research/ecr-pre-pilot-seven-component-native-cascade/engine-contract.json"
)
NATIVE_MODEL_PATH = (
    ROOT / "server/research/ecr-pre-pilot-seven-component-native/model.py"
)
ENGINE_ID = "ECR2_PREDICTIVE_NT_SEVEN_COMPONENT_NATIVE_CCOSMO_CASCADE"
ENGINE_VERSION = "7C-1.3.0"
MODEL_IDENTITY = "NATIVE_SEVEN_COMPONENT_CCOSMO_2010"


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


historical = load(HISTORICAL_WORKER_PATH, "frozen_production_7c_1_2")
scientific = load(ENGINE_PATH, "native_seven_component_cascade_1_3")
historical_evidence = historical.engine_evidence()
historical_11_evidence = historical.legacy.engine_evidence()


def sha_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def engine_evidence():
    additions = [Path(__file__), ENGINE_PATH, CONTRACT_PATH, NATIVE_MODEL_PATH]
    records = [
        {
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha_file(path),
        }
        for path in additions
    ]
    manifest = ROOT / "predictive-nt-runtime-manifest.json"
    additions_manifest_status = "SOURCE_TREE_NO_PACKAGE_MANIFEST"
    if manifest.is_file():
        packaged = json.loads(manifest.read_text())
        packaged_by_path = {
            row["path"]: row for row in packaged.get("files", [])
        }
        if (
            packaged.get("schemaVersion")
            != "PREDICTIVE_NT_RUNTIME_MANIFEST_V1"
            or any(packaged_by_path.get(row["path"]) != row for row in records)
        ):
            raise RuntimeError("SEVEN_COMPONENT_1_3_RUNTIME_MANIFEST_MISMATCH")
        additions_manifest_status = "PACKAGED_MANIFEST_VERIFIED"
    if historical_evidence["runtimeManifestStatus"] != additions_manifest_status:
        raise RuntimeError("SEVEN_COMPONENT_1_3_RUNTIME_MANIFEST_SCOPE_MISMATCH")
    identity = {
        "historicalSevenComponent12EngineHash": historical_evidence["engineHash"],
        "historicalSevenComponent12WorkerSha256": sha_file(HISTORICAL_WORKER_PATH),
        "newScientificFiles": records,
    }
    engine_hash = hashlib.sha256(historical.canonical(identity).encode()).hexdigest()
    return {
        **historical_evidence,
        "engineId": ENGINE_ID,
        "engineVersion": ENGINE_VERSION,
        "engineContractVersion": ENGINE_VERSION,
        "engineHash": engine_hash,
        "modelIdentity": MODEL_IDENTITY,
        "componentOrder": list(scientific.FAMILIES),
        "residualAmendmentApplied": False,
        "residualScopeDecision": (
            "SCOPED_OUT_AFTER_FAILED_DECLARED_LLE_VALIDATION_AND_REPRODUCED_"
            "MONO_RICH_FALSE_INSTABILITY"
        ),
        "cascadeParentContract": "7C-1.2.0",
        "cascadeEquationCountPerStage": 14,
        "routineTpdLatticeDenominator": 4,
        "routineTpdLatticePointCount": 210,
        "exhaustiveEscalationContract": "NATIVE_7C_QUALIFICATION_SEARCH",
        "historicalEngineHashes": {
            "7C-1.1.0": historical_11_evidence["engineHash"],
            "7C-1.2.0": historical_evidence["engineHash"],
        },
        "runtimeManifestStatus": additions_manifest_status,
        "nativeAdditionManifestStatus": additions_manifest_status,
        "nativeAdditionManifestRecordCount": len(records),
        "verifiedScientificInputCount": (
            historical_evidence["verifiedScientificInputCount"] + len(records)
        ),
        "verifiedScientificInputAggregateSha256": engine_hash,
    }


historical.scientific = scientific
historical.ENGINE_ID = ENGINE_ID
historical.ENGINE_VERSION = ENGINE_VERSION
historical.STATUS = "IMPLEMENTED — PREDICTIVE QUALIFICATION PENDING"
historical.engine_evidence = engine_evidence


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        try:
            print(historical.canonical({
                "status": "PASS",
                "python": f"{sys.version_info.major}.{sys.version_info.minor}",
                **engine_evidence(),
                "checkpointProtocol": historical.CHECKPOINT_PROTOCOL,
                "governanceStatus": historical.STATUS,
            }))
        except Exception as exc:
            print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
            raise
    else:
        try:
            historical.main()
        except Exception as exc:
            print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
            raise