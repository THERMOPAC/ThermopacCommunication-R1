#!/usr/bin/env python3
"""Native seven-component cCOSMO model with the failed 6C residual scoped out."""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HISTORICAL_QUALIFICATION = (
    ROOT
    / "server/research/ecr-pre-pilot-seven-component-h2o-profile/run_qualification.py"
)
HISTORICAL_RESIDUAL_MODEL = (
    ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
)
HISTORICAL_RESIDUAL_RESULTS = (
    ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
)


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


historical = _load("historical_residual_bearing_7c_qualification", HISTORICAL_QUALIFICATION)
FAMILIES = historical.FAMILIES
WATER_WT_PCT = historical.WATER_WT_PCT
TEMPERATURE_K = historical.TEMPERATURE_K


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class NativeSevenComponentModel:
    """Expose native 7C cCOSMO without the unqualified 6C residual amendment."""

    def __init__(self, native_seven):
        self.native_seven = native_seven

    def wet_lngamma(self, np, temperature_k, x7):
        x = historical.normalize(np, x7)
        return (
            np.asarray(self.native_seven.get_lngamma_comb(temperature_k, x))
            + np.asarray(self.native_seven.get_lngamma_resid(temperature_k, x))
        )


def build_model():
    """Build the pinned profile tree and replace only the thermodynamic wrapper."""
    temporary, np, scipy, assembled, inherited_integrity, runtime = (
        historical.build_model()
    )
    model = NativeSevenComponentModel(assembled.native_seven)
    integrity = {
        **inherited_integrity,
        "historicalResidualBearingQualificationRunnerSha256": sha(
            HISTORICAL_QUALIFICATION
        ),
        "historicalResidualModelSha256": sha(HISTORICAL_RESIDUAL_MODEL),
        "historicalResidualResultsSha256": sha(HISTORICAL_RESIDUAL_RESULTS),
        "activeThermodynamicModel": "NATIVE_SEVEN_COMPONENT_CCOSMO_2010",
        "inheritedSixComponentResidualApplied": False,
        "residualScopeDecision": (
            "SCOPED_OUT_AFTER_FAILED_DECLARED_LLE_VALIDATION_AND_REPRODUCED_"
            "MONO_RICH_FALSE_INSTABILITY"
        ),
    }
    return temporary, np, scipy, model, integrity, runtime


engine = historical.engine
run_case = historical.run_case
wet_charge = historical.wet_charge