#!/usr/bin/env python3
"""Verify 7C inheritance of the frozen 6C model without executing H2O=0 as 7C."""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
QUALIFICATION = (
    ROOT / "server/research/ecr-pre-pilot-seven-component-h2o-profile/run_qualification.py"
)
AMENDMENT = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
AMENDMENT_RESULTS = (
    ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
)
OUTPUT = ROOT / ".agents/outputs/ecr-pre-pilot-seven-component-dry-limit/evidence.json"
FAMILIES6 = ("SAT", "MONO", "DI", "POLY", "PA", "NMP")
CHECKS = (
    ("PROJECT_236_LEDGER", 298.15, (0.49, 0.06, 0.03, 0.01, 0.01, 0.40)),
    ("STAGE1_50C_LEDGER", 323.15, (0.41, 0.08, 0.04, 0.02, 0.01, 0.44)),
    ("MONO_RICH_LEDGER", 313.15, (0.18, 0.31, 0.09, 0.06, 0.02, 0.34)),
    ("NMP_LEAN_LEDGER", 328.15, (0.68, 0.12, 0.06, 0.03, 0.01, 0.10)),
)
ACTIVITY_TOLERANCE = 2e-13


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_hash(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def main():
    qualification = load("seven_component_inheritance", QUALIFICATION)
    amendment = load("frozen_six_component_amendment", AMENDMENT / "model.py")
    np = amendment.np
    governed = json.loads(AMENDMENT_RESULTS.read_text())
    parameters = np.asarray([
        governed["model"]["parameters"][name] for name in amendment.PARAMETER_NAMES
    ], dtype=float)
    temporary, _, _, model, integrity, _ = qualification.build_model()
    try:
        rows = []
        for check_id, temperature_k, composition in CHECKS:
            x = amendment.normalize(composition)
            frozen = amendment.total_lngamma(
                FAMILIES6, temperature_k, x, parameters)
            inherited = model.inherited_six_lngamma(temperature_k, x)
            difference = float(np.max(np.abs(np.exp(frozen) - np.exp(inherited))))
            rows.append({
                "checkId": check_id,
                "temperatureK": temperature_k,
                "componentOrder": list(FAMILIES6),
                "scope": "SIX_COMPONENT_MODEL_INHERITANCE_UNIT_CHECK",
                "maximumActivityCoefficientAbsoluteDifference": difference,
                "status": "PASS" if difference <= ACTIVITY_TOLERANCE else "FAIL",
            })
    finally:
        temporary.cleanup()

    six_manifest = json.loads((
        ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/"
        "generated/generation-manifest.json"
    ).read_text())
    manifest_by_family = {
        row["family"]: row for row in six_manifest["components"]
    }
    profile_rows = []
    for family in FAMILIES6:
        governed_hash = manifest_by_family[family]["profileSha256"]
        inherited_hash = integrity["profileSha256ByFamily"][family]
        profile_rows.append({
            "family": family,
            "sixComponentSha256": governed_hash,
            "sevenComponentInheritedSha256": inherited_hash,
            "identical": governed_hash == inherited_hash,
        })

    result = {
        "schemaVersion": "ECR_7C_SIX_COMPONENT_MODEL_INHERITANCE_V1",
        "status": "PASS" if (
            all(row["status"] == "PASS" for row in rows)
            and all(row["identical"] for row in profile_rows)
        ) else "FAIL",
        "verificationType": "CODE_AND_MODEL_COMPONENT_INHERITANCE",
        "notASevenComponentCalculation": True,
        "h2oZeroProductionStatePermitted": False,
        "actualSevenComponentWaterWtPctRange": {"minimum": 0.5, "maximum": 3.0},
        "inheritedComponentOrder": list(FAMILIES6),
        "nativeSixComponentModelInstantiatedIndependently": True,
        "residualEquationImplementedIndependently": True,
        "residualModel": "PROJECT_NMP_LLE_RESIDUAL",
        "residualParameterNames": list(amendment.PARAMETER_NAMES),
        "residualParameterVector": parameters.tolist(),
        "activityCoefficientTolerance": ACTIVITY_TOLERANCE,
        "modelComponentChecks": rows,
        "profileIdentityChecks": profile_rows,
        "directWaterBearingLleValidated": False,
        "releaseEligible": False,
        "predictiveNt": None,
        "pinnedInputs": {
            "runnerSha256": sha(HERE / "run.py"),
            "qualificationRunnerSha256": sha(QUALIFICATION),
            "amendmentModelSha256": sha(AMENDMENT / "model.py"),
            "amendmentResultsSha256": sha(AMENDMENT_RESULTS),
            "parameterVectorSha256": canonical_hash(parameters.tolist()),
        },
    }
    result["canonicalPayloadSha256"] = canonical_hash(result)
    if result["status"] != "PASS":
        raise RuntimeError("SEVEN_COMPONENT_MODEL_INHERITANCE_FAILED")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "status": result["status"],
        "modelComponentChecks": len(rows),
        "profileIdentityChecks": len(profile_rows),
        "maximumActivityCoefficientAbsoluteDifference": max(
            row["maximumActivityCoefficientAbsoluteDifference"] for row in rows
        ),
    }, sort_keys=True))


if __name__ == "__main__":
    main()