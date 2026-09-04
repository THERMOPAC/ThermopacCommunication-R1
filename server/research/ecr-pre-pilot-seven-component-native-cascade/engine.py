#!/usr/bin/env python3
"""7C-1.3.0 native-thermodynamics route over the frozen 7C-1.2.0 cascade."""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HISTORICAL_ENGINE_PATH = (
    ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
)
HISTORICAL_CONTRACT_PATH = (
    ROOT
    / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine-contract.json"
)
NATIVE_MODEL_PATH = (
    ROOT / "server/research/ecr-pre-pilot-seven-component-native/model.py"
)


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


historical = _load("frozen_seven_component_1_2", HISTORICAL_ENGINE_PATH)
native = _load("native_seven_component_model", NATIVE_MODEL_PATH)

FAMILIES = historical.FAMILIES
ENGINE_VERSION = "7C-1.3.0"
SevenComponentEngine = historical.SevenComponentEngine
protocol = historical.protocol
normalize = historical.normalize
lattice = historical.lattice


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_engine(temperature_k, water_wt_pct):
    """Reuse the exact 1.2 solver and thresholds with only the residual removed."""
    temporary, np, scipy, model, integrity, runtime = native.build_model()
    _, exhaustive_tpd, _ = native.engine(
        np, scipy, model, temperature_k, water_wt_pct
    )
    integrity = {
        **integrity,
        "frozenSevenComponent12EngineSha256": sha(HISTORICAL_ENGINE_PATH),
        "frozenSevenComponent12ContractSha256": sha(HISTORICAL_CONTRACT_PATH),
        "nativeSevenComponentModelWrapperSha256": sha(NATIVE_MODEL_PATH),
        "cascadeSolverChangedFromSevenComponent12": False,
        "tpdThresholdsChangedFromSevenComponent12": False,
    }
    return temporary, SevenComponentEngine(
        np, scipy, model, exhaustive_tpd=exhaustive_tpd
    ), integrity, runtime