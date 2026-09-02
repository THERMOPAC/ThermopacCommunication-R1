#!/usr/bin/env python3
"""Check isolated seven-component compatibility with pinned NIST cCOSMO."""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SIX = HERE.parent / "ecr-pre-pilot-six-component-thermodynamics"
SIX_GENERATED = SIX / "generated"
GENERATED = HERE / "generated"
KEY = "XLYOFNOQVPJJNP-UHFFFAOYSA-N"
CCOSMO = HERE.parent / "ecr-pre-pilot-cosmosac/vendor/python"
TEMPERATURES = [298.15, 313.15, 323.15, 333.15, 348.15]
COMPOSITIONS = [
    [0.45, 0.12, 0.10, 0.06, 0.07, 0.19999999, 0.00000001],
    [0.20, 0.20, 0.20, 0.10, 0.10, 0.199999, 0.000001],
    [0.70, 0.05, 0.05, 0.05, 0.05, 0.099, 0.001],
    [0.10, 0.05, 0.05, 0.05, 0.05, 0.69, 0.01],
    [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.94],
    [0.94, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
    [1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 0.9999999994],
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    fresh_probe = "--fresh-process-probe" in sys.argv[1:]
    if any(argument != "--fresh-process-probe" for argument in sys.argv[1:]):
        raise RuntimeError("only --fresh-process-probe is accepted")
    h2o_manifest_path = GENERATED / "generation-manifest.json"
    verification_path = GENERATED / "profile-verification.json"
    h2o_manifest = json.loads(h2o_manifest_path.read_text(encoding="utf-8"))
    verification = json.loads(verification_path.read_text(encoding="utf-8"))
    six_manifest_path = SIX_GENERATED / "generation-manifest.json"
    six_manifest = json.loads(six_manifest_path.read_text(encoding="utf-8"))
    if h2o_manifest.get("status") != "PROFILE_ESTABLISHED_RESEARCH_ONLY":
        raise RuntimeError("H2O profile is not established")
    if h2o_manifest.get("lleQualification") != "SEVEN_COMPONENT_LLE_NOT_QUALIFIED":
        raise RuntimeError("seven-component LLE boundary is missing")
    if verification.get("allChecksPassed") is not True:
        raise RuntimeError("independent H2O verification is not passed")
    if h2o_manifest.get("profileConversion", {}).get("profileVerificationSha256") != sha256(verification_path):
        raise RuntimeError("independent H2O verification manifest hash mismatch")

    six_components = six_manifest["components"]
    keys = [component["inchiKey"] for component in six_components] + [KEY]
    profile_hashes = {}
    with tempfile.TemporaryDirectory(prefix="ecr-seven-component-") as temporary:
        tree = Path(temporary)
        sigma3 = tree / "sigma3"
        sigma3.mkdir()
        source_complist = SIX_GENERATED / "profiles/complist.txt"
        lines = source_complist.read_text(encoding="utf-8").splitlines()
        if len(lines) != 7:
            raise RuntimeError("frozen six-component complist coverage changed")
        for component in six_components:
            key = component["inchiKey"]
            source = SIX_GENERATED / f"profiles/sigma3/{key}.sigma"
            if sha256(source) != component["profileSha256"]:
                raise RuntimeError(f"frozen profile integrity failure: {component['family']}")
            shutil.copy2(source, sigma3 / source.name)
            profile_hashes[component["family"]] = sha256(source)
        water_source = GENERATED / f"profiles/sigma3/{KEY}.sigma"
        if sha256(water_source) != h2o_manifest["component"]["profileSha256"]:
            raise RuntimeError("H2O profile integrity failure")
        shutil.copy2(water_source, sigma3 / water_source.name)
        profile_hashes["H2O"] = sha256(water_source)
        complist = tree / "complist.txt"
        complist.write_text(
            "\n".join(lines + [f"7 H2O 7732-18-5 WATER O InChI=1S/H2O/h1H2 {KEY}"]) + "\n",
            encoding="utf-8")

        sys.path.insert(0, str(CCOSMO))
        import cCOSMO  # type: ignore
        ccosmo_path = Path(cCOSMO.__file__).resolve()
        numpy_path = Path(np.__file__).resolve()
        runtime_identity = {
            "interpreterExecutable": str(Path(sys.executable).resolve()),
            "interpreterSha256": sha256(Path(sys.executable).resolve()),
            "interpreterVersion": sys.version,
            "implementation": sys.implementation.name,
            "numpyVersion": np.__version__,
            "numpyModulePath": str(numpy_path),
            "numpyModuleSha256": sha256(numpy_path),
            "cCOSMOExtensionPath": str(ccosmo_path),
            "cCOSMOExtensionSha256": sha256(ccosmo_path),
        }

        database = cCOSMO.DelawareProfileDatabase(str(complist), str(sigma3))
        for key in keys:
            database.add_profile(key)
        model = cCOSMO.COSMO3(keys, database)
        activity_grid = []
        signatures = []
        for temperature in TEMPERATURES:
            for composition in COMPOSITIONS:
                if not math.isclose(sum(composition), 1.0, abs_tol=1e-12):
                    raise RuntimeError("runtime composition does not sum to one")
                x = np.asarray(composition, dtype=float)
                first = (np.asarray(model.get_lngamma_comb(temperature, x))
                         + np.asarray(model.get_lngamma_resid(temperature, x)))
                second = (np.asarray(model.get_lngamma_comb(temperature, x))
                          + np.asarray(model.get_lngamma_resid(temperature, x)))
                if first.shape != (7,) or not np.isfinite(first).all():
                    raise RuntimeError("cCOSMO did not return seven finite ln-gamma values")
                if not np.array_equal(first, second):
                    raise RuntimeError("cCOSMO seven-component result is not bitwise deterministic")
                gamma = np.exp(first)
                if not np.isfinite(gamma).all():
                    raise RuntimeError("cCOSMO returned non-finite seven-component gamma values")
                signatures.append(first)
                activity_grid.append({"temperatureK": temperature, "composition": composition,
                                      "lnGamma": first.tolist(), "gamma": gamma.tolist()})
        if max(float(np.max(np.abs(a-b))) for a in signatures for b in signatures) <= 1e-8:
            raise RuntimeError("seven-component activities do not vary")
        isolated_complist_hash = sha256(complist)

    result = {
        "schemaVersion": "1.0.0", "status": "PROFILE_ESTABLISHED_RESEARCH_ONLY",
        "decision": "SEVEN_COMPONENT_CCOSMO_RUNTIME_COMPATIBLE",
        "lleQualification": "SEVEN_COMPONENT_LLE_NOT_QUALIFIED",
        "isolatedTemporaryTree": True, "frozenSixComponentArtifactModified": False,
        "nistRuntime": {
            "sourceCommit": "1b82456be38026719b16cad4076109bef3fcb309",
            "model": "COSMO-SAC-2010", "loadedProfileCount": 7,
            "temperaturesK": TEMPERATURES, "compositionGrid": COMPOSITIONS,
            "testPointCount": len(activity_grid), "sevenValuesPerPoint": True,
            "allFinite": True, "bitwiseRepeatableWithinProcess": True,
            "lowWaterCompositionsIncluded": True, "boundaryCompositionsIncluded": True,
            "activityGrid": activity_grid,
            "dependencyIdentity": runtime_identity,
        },
        "integrity": {
            "sixGenerationManifestSha256": sha256(six_manifest_path),
            "h2oGenerationManifestSha256": sha256(h2o_manifest_path),
            "h2oProfileVerificationSha256": sha256(verification_path),
            "isolatedSevenComponentComplistSha256": isolated_complist_hash,
            "profileSha256ByFamily": profile_hashes,
            "runnerSha256": sha256(HERE / "check_seven_component_runtime.py"),
        },
        "scopeBoundary": {
            "profileEstablished": True, "runtimeCompatibilityEstablished": True,
            "phaseTopologyValidated": False, "quantitativeLleValidated": False,
            "productionAdmitted": False,
        },
    }
    destination = GENERATED / "seven-component-runtime-compatibility.json"
    destination.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if fresh_probe:
        print("fresh process verified seven-component runtime points")
        return
    baseline_grid = result["nistRuntime"]["activityGrid"]
    subprocess.run([sys.executable, str(Path(__file__).resolve()), "--fresh-process-probe"],
                   cwd=ROOT, check=True)
    fresh_result = json.loads(destination.read_text(encoding="utf-8"))
    if fresh_result["nistRuntime"]["activityGrid"] != baseline_grid:
        raise RuntimeError("fresh-process seven-component results are not bitwise identical")
    if fresh_result["nistRuntime"]["dependencyIdentity"] != runtime_identity:
        raise RuntimeError("fresh-process runtime dependency identity changed")
    result["nistRuntime"]["freshProcessBitwiseReproducible"] = True
    result["nistRuntime"]["freshProcessCount"] = 1
    destination.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"verified {len(activity_grid)} finite deterministic seven-component runtime points")


if __name__ == "__main__":
    main()