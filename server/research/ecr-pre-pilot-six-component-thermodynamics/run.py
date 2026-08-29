#!/usr/bin/env python3
"""Verify the project-generated six-molecule COSMO profile basis in NIST cCOSMO."""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-six-component-thermodynamics"
GENERATED = HERE / "generated"
PROFILES = GENERATED / "profiles"
SIGMA3 = PROFILES / "sigma3"
GENERATION_MANIFEST = GENERATED / "generation-manifest.json"
PROFILE_VERIFICATION = GENERATED / "profile-verification.json"
LICENSE_EVIDENCE = HERE / "license-evidence.json"
GENERATION_PROTOCOL = HERE / "generation-protocol.json"
RELEASE_PROVENANCE = HERE / "vendor/release-provenance.json"
CCOSMO_VENDOR = ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
NIST_COSMOSAC_COMMIT = "1b82456be38026719b16cad4076109bef3fcb309"
EXPECTED_XTB_BINARY_SHA256 = "debf27a9e0fa4bfb5ca75aafe4b90d8211f08ec2f4a482f375a4987212eaa12a"
EXPECTED_CPX_BINARY_SHA256 = "0da39b6f371786f41a46ec2c5f0de023c234687c36d747a7dcae351dec45f8ad"
FAMILIES = ["SAT", "MONO", "DI", "POLY", "PA", "NMP"]
TEMPERATURES_K = [298.15, 313.15, 323.15, 333.15, 348.15]
COMPOSITIONS = [
    [0.45, 0.12, 0.10, 0.06, 0.07, 0.20],
    [0.20, 0.20, 0.20, 0.10, 0.10, 0.20],
    [0.70, 0.05, 0.05, 0.05, 0.05, 0.10],
    [0.10, 0.05, 0.05, 0.05, 0.05, 0.70],
]
EXPECTED_PROFILE_HASHES = {
    "SAT": "6f51a75fbfa70df9b410fae88614e5c27d003eea228bc91318edb2854b5c26c2",
    "MONO": "0afc9a2a69c0f3c7827ecdd7553f7ebf1a6e35f8b64597ffc8a6b780c324c275",
    "DI": "7e8664f594afa70a232f845dfafbfbb1efd2e10e13c586187b556102a97503ed",
    "POLY": "682828484416f124e3207f246d23954197502cba83d9b4744ace239d91fe8854",
    "PA": "474736e63fd99749f7dad0cd5569959e9dd47a8a2dfe55b6ef80642ed3d1c03e",
    "NMP": "58dcecc755994f7955aec100dfb26de62c3ad933dcfd25c11f68ddec3b1efa69",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be a JSON object")
    return value


def validate_profile(path: Path, identity_key: str, expected_area: float) -> dict[str, Any]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) != 156 or not lines[0].startswith("# meta: "):
        raise RuntimeError(f"invalid NIST sigma3 profile structure: {path}")
    meta = require_mapping(json.loads(lines[0][8:]), f"{path.name} metadata")
    if meta.get("standard_INCHIKEY") != identity_key:
        raise RuntimeError(f"profile identity mismatch: {path}")
    rows = [tuple(map(float, line.split())) for line in lines[3:]]
    if len(rows) != 153:
        raise RuntimeError(f"profile must contain three 51-point partitions: {path}")
    expected_grid = [round(-0.025 + index * 0.001, 3) for index in range(51)] * 3
    if any(abs(row[0] - expected) > 1e-12 for row, expected in zip(rows, expected_grid)):
        raise RuntimeError(f"profile sigma grid mismatch: {path}")
    if any(not math.isfinite(area) or area < 0 for _, area in rows):
        raise RuntimeError(f"profile contains invalid area: {path}")
    area_sum = sum(area for _, area in rows)
    if abs(area_sum - expected_area) / expected_area > 2e-7:
        raise RuntimeError(f"profile area does not close to source surface: {path}")
    return {
        "sha256": sha256(path),
        "areaSumSquareAngstrom": area_sum,
        "partitionAreaSquareAngstrom": {
            "NHB": sum(area for _, area in rows[0:51]),
            "OH": sum(area for _, area in rows[51:102]),
            "OT": sum(area for _, area in rows[102:153]),
        },
        "volumeCubicAngstrom": meta["volume [A^3]"],
    }


def main() -> None:
    generation = require_mapping(
        json.loads(GENERATION_MANIFEST.read_text(encoding="utf-8")),
        "generation manifest",
    )
    profile_verification = require_mapping(
        json.loads(PROFILE_VERIFICATION.read_text(encoding="utf-8")),
        "profile verification",
    )
    protocol = require_mapping(
        json.loads(GENERATION_PROTOCOL.read_text(encoding="utf-8")),
        "generation protocol",
    )
    licenses = require_mapping(
        json.loads(LICENSE_EVIDENCE.read_text(encoding="utf-8")),
        "license evidence",
    )
    release_provenance = require_mapping(
        json.loads(RELEASE_PROVENANCE.read_text(encoding="utf-8")),
        "release provenance",
    )
    if protocol.get("status") != "PROFILE_SEMANTICS_GATE_PASSED_RESEARCH_ONLY":
        raise RuntimeError("profile semantics gate is not passed")
    if licenses["nistBundledProfiles"]["assessment"] != "NOT_ADMITTED_FOR_PROJECT_CALCULATIONS":
        raise RuntimeError("restricted NIST profile boundary changed without review")
    if generation.get("restrictedProfileInputs") != []:
        raise RuntimeError("restricted profile inputs are prohibited")
    if generation.get("profileConversion", {}).get("decision") != "PROFILE_SEMANTICS_GATE_PASSED":
        raise RuntimeError("generated profile semantics gate is not passed")
    if profile_verification.get("decision") != "PROFILE_SEMANTICS_GATE_PASSED":
        raise RuntimeError("profile verification gate is not passed")
    if profile_verification.get("allComponentsPassed") is not True:
        raise RuntimeError("one or more component profile checks failed")
    if generation["profileConversion"].get("profileVerificationSha256") != sha256(PROFILE_VERIFICATION):
        raise RuntimeError("profile verification integrity failure")
    software = require_mapping(generation.get("software"), "generation software")
    if software.get("generatorSha256") != sha256(HERE / "generate_profiles.py"):
        raise RuntimeError("profile generator integrity failure")
    if software.get("xtbBinarySha256") != EXPECTED_XTB_BINARY_SHA256:
        raise RuntimeError("xTB binary integrity failure")
    if software.get("cpcmXBinarySha256") != EXPECTED_CPX_BINARY_SHA256:
        raise RuntimeError("CPCM-X binary integrity failure")
    if software.get("releaseProvenanceSha256") != sha256(RELEASE_PROVENANCE):
        raise RuntimeError("release provenance integrity failure")
    if release_provenance["xTB"]["retainedExecutableSha256"] != EXPECTED_XTB_BINARY_SHA256:
        raise RuntimeError("xTB publisher provenance mismatch")
    if release_provenance["cpcmX"]["retainedExecutableSha256"] != EXPECTED_CPX_BINARY_SHA256:
        raise RuntimeError("CPCM-X publisher provenance mismatch")
    if sha256(HERE / "vendor/xtb-6.7.1/bin/xtb") != EXPECTED_XTB_BINARY_SHA256:
        raise RuntimeError("vendored xTB binary changed")
    if sha256(HERE / "vendor/cpx-1.1.0/bin/cpx") != EXPECTED_CPX_BINARY_SHA256:
        raise RuntimeError("vendored CPCM-X binary changed")

    components = generation.get("components")
    if not isinstance(components, list) or [row["family"] for row in components] != FAMILIES:
        raise RuntimeError("six-component order or coverage mismatch")
    if components[4]["cas"] != "10081-67-1":
        raise RuntimeError("exact PA identity is not present")

    profile_integrity: dict[str, Any] = {}
    keys = []
    for component in components:
        family = component["family"]
        key = component["inchiKey"]
        keys.append(key)
        profile_path = SIGMA3 / f"{key}.sigma"
        surface_path = GENERATED / "surfaces" / f"{key}.cosmo"
        selected_geometry_path = GENERATED / "surfaces" / f"{key}.rdkit-selected.xyz"
        geometry_path = GENERATED / "surfaces" / f"{key}.xyz"
        if sha256(profile_path) != EXPECTED_PROFILE_HASHES[family]:
            raise RuntimeError(f"unexpected generated profile hash for {family}")
        if sha256(surface_path) != component["surfaceSha256"]:
            raise RuntimeError(f"surface integrity failure for {family}")
        if sha256(selected_geometry_path) != component["selectedConformerGeometrySha256"]:
            raise RuntimeError(f"selected-conformer integrity failure for {family}")
        if sha256(geometry_path) != component["optimizedGeometrySha256"]:
            raise RuntimeError(f"geometry integrity failure for {family}")
        profile_integrity[family] = validate_profile(
            profile_path, key, component["areaSquareAngstrom"]
        )

    if sha256(PROFILES / "complist.txt") != generation["complistSha256"]:
        raise RuntimeError("generated complist integrity failure")

    sys.path.insert(0, str(CCOSMO_VENDOR))
    import cCOSMO  # type: ignore

    database = cCOSMO.DelawareProfileDatabase(str(PROFILES / "complist.txt"), str(SIGMA3))
    for key in keys:
        database.add_profile(key)
    model = cCOSMO.COSMO3(keys, database)

    activity_grid = []
    signatures = []
    for temperature in TEMPERATURES_K:
        for composition in COMPOSITIONS:
            x = np.asarray(composition, dtype=float)
            first = np.asarray(model.get_lngamma_comb(temperature, x)) + np.asarray(
                model.get_lngamma_resid(temperature, x)
            )
            second = np.asarray(model.get_lngamma_comb(temperature, x)) + np.asarray(
                model.get_lngamma_resid(temperature, x)
            )
            if first.shape != (6,) or not np.isfinite(first).all():
                raise RuntimeError("NIST cCOSMO returned non-finite six-component activities")
            if not np.array_equal(first, second):
                raise RuntimeError("NIST cCOSMO activity execution is not repeatable")
            signatures.append(first)
            activity_grid.append({
                "temperatureK": temperature,
                "composition": composition,
                "lnGamma": first.tolist(),
                "gamma": np.exp(first).tolist(),
            })
    if max(float(np.max(np.abs(a - b))) for a in signatures for b in signatures) <= 1e-8:
        raise RuntimeError("activities are not composition/temperature dependent")

    result = {
        "schemaVersion": "2.0.0",
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
        "decision": "PROFILE_BASIS_QUALIFIED_FOR_NIST_TOPOLOGY_GATE",
        "mission": {
            "system": "SAT+MONO+DI+POLY+PA+NMP",
            "components": components,
            "temperaturesK": TEMPERATURES_K,
            "compositionGrid": COMPOSITIONS,
        },
        "rightsQualification": {
            "nistCosmoSacSoftware": licenses["nistCosmoSacSoftware"],
            "quantumGenerationSoftware": licenses["quantumGenerationSoftware"],
            "quantumMethod": licenses["quantumMethod"],
            "molecularSurfaceFiles": licenses["molecularSurfaceFiles"],
            "profileConversion": licenses["profileConversion"],
            "resultingProfileData": licenses["resultingProfileData"],
        },
        "profileQualification": {
            "selectedRoute": "RDKit-2023.09.5_ETKDGv3_MMFF94s__xTB-6.7.1_GFN2-xTB__CPCM-X-1.1.0",
            "selectedRouteStatus": "QUALIFIED_FOR_NIST_TOPOLOGY_GATE",
            "profileContract": "NIST DelawareProfileDatabase sigma3",
            "generatedProfileCount": 6,
            "exactPaProfilePresent": True,
            "restrictedProfileUsedAsCalculationInput": False,
            "profileIntegrity": profile_integrity,
        },
        "nistRuntimeQualification": {
            "sourceCommit": NIST_COSMOSAC_COMMIT,
            "model": "COSMO-SAC-2010",
            "lnGamma": "get_lngamma_comb(T,x)+get_lngamma_resid(T,x)",
            "loadedProfileCount": 6,
            "testPointCount": len(activity_grid),
            "allFinite": True,
            "compositionDependent": True,
            "bitwiseRepeatableWithinProcess": True,
            "activityGrid": activity_grid,
        },
        "scopeBoundary": {
            "phaseTopologyGateRerun": "ENABLED",
            "phaseTopologyValidated": False,
            "thermodynamicsAdmitted": False,
            "reason": "Profile/runtime compatibility is qualified here; LLE topology and quantitative validation are separate downstream gates.",
        },
        "integrity": {
            "generationManifestSha256": sha256(GENERATION_MANIFEST),
            "generationProtocolSha256": sha256(GENERATION_PROTOCOL),
            "licenseEvidenceSha256": sha256(LICENSE_EVIDENCE),
            "releaseProvenanceSha256": sha256(RELEASE_PROVENANCE),
            "complistSha256": sha256(PROFILES / "complist.txt"),
            "profileVerificationSha256": sha256(PROFILE_VERIFICATION),
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    report = f"""# Six-component COSMO profile-basis qualification

## Decision

`{result["decision"]}`

Six exact neutral-singlet molecular profiles were generated with one route:
RDKit ETKDGv3/MMFF94s conformer selection, GFN2-xTB geometry optimization,
and CPCM-X 1.1.0 conductor surfaces/profiles. The exact PA is CAS 10081-67-1.

## Rights boundary

Rights are documented separately for NIST cCOSMO software, generation software,
the quantum method, generated surfaces, profile conversion, and resulting data.
NIST UD/VT and ThermoSAC profiles were not used as generation or calculation inputs.

## Frozen profile contract

- charge/spin: 0 / singlet for all six identities
- conformers: deterministic ETKDGv3 seed 20260829, MMFF94s minimum, retained geometry hashes
- geometry/surface method: GFN2-xTB 6.7.1 and CPCM-X 1.1.0, epsilon=infinity
- sigma grid: -0.025 to +0.025 e/A2, 0.001 step, 51 points per NHB/OH/OT partition
- area/volume: frozen per molecule with source/profile integrity hashes
- reference state: neutral singlet conductor surface at 298.15 K

## NIST runtime test

All six project-generated profiles loaded in pinned NIST cCOSMO commit
`{NIST_COSMOSAC_COMMIT}`. All {len(activity_grid)} temperature/composition test
points produced finite, composition-dependent activities and repeated bitwise
within the process.

This qualifies the profile basis for the separate phase-topology gate. It does
not itself validate phase topology, quantitative LLE, sulfur prediction, or
release eligibility.
"""
    (OUT / "report.md").write_text(report, encoding="utf-8")
    provenance = {
        "schemaVersion": "2.0.0",
        "decision": result["decision"],
        "runnerSha256": sha256(HERE / "run.py"),
        **result["integrity"],
        "componentIdentityKeys": {
            component["family"]: component["inchiKey"] for component in components
        },
        "profileSha256ByFamily": EXPECTED_PROFILE_HASHES,
        "profileSemanticsGate": "PASSED",
        "profileVerificationSha256": sha256(PROFILE_VERIFICATION),
        "nistCosmoSacSourceCommit": NIST_COSMOSAC_COMMIT,
    }
    (HERE / "provenance-manifest.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()