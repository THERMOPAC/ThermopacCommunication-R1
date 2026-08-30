#!/usr/bin/env python3
"""Independent fail-closed verification of Task 206 artifacts."""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/task-206-stability-constrained-amendment"
MODEL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
BASE_PROTOCOL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json"
EVIDENCE = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
DIAGNOSTIC = ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic/results.json"
sys.path.insert(0, str(ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"))
spec = importlib.util.spec_from_file_location("task206_verify_model", MODEL)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
import numpy as np


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha(value):
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def tpd_linear_form(temperature_k, reference, trial):
    reference = m.normalize(reference)
    trial = m.normalize(trial)
    zero = np.zeros(len(m.PARAMETER_NAMES))
    c = float(np.sum(trial * (
        np.log(trial) + m.total_lngamma(m.FAMILIES, temperature_k, trial, zero)
        - np.log(reference) - m.total_lngamma(m.FAMILIES, temperature_k, reference, zero)
    )))
    a = trial @ (
        m.residual_feature_matrix(trial, temperature_k)
        - m.residual_feature_matrix(reference, temperature_k)
    )
    return c, np.asarray(a, dtype=float)


def main():
    delivered_results = (OUT / "results.json").read_bytes()
    delivered_report = (OUT / "report.md").read_bytes()
    result = json.loads(delivered_results)
    protocol = json.loads((HERE / "protocol.json").read_text())
    base_protocol = json.loads(BASE_PROTOCOL.read_text())
    evidence = json.loads(EVIDENCE.read_text())
    diagnostic = json.loads(DIAGNOSTIC.read_text())
    pins = protocol["pinnedInputs"]
    assert sha(BASE_PROTOCOL) == pins["baseProtocolSha256"]
    assert sha(MODEL) == pins["modelSha256"]
    assert sha(EVIDENCE) == pins["evidenceSha256"]
    assert sha(DIAGNOSTIC) == pins["task205DiagnosticSha256"]
    ceiling = float(base_protocol["fit"]["quantitativeCompositionRmsdCeiling"])
    assert ceiling == protocol["frozenAcceptance"]["quantitativeCompositionRmsdCeiling"] == 0.03
    assert not protocol["frozenAcceptance"]["limitsMayBeWidened"]
    params = np.array([result["parameters"][name] for name in m.PARAMETER_NAMES])
    assert result["modelIdentity"] == protocol["modelIdentity"]
    assert result["researchOnly"] and result["calibrationRequired"]
    assert not result["pilotValidated"] and not result["releaseEligible"]
    source_rows = []
    for scenario in diagnostic["scenarios"]:
        for candidate_id, composition in (
            ("persisted-helper", scenario["persistedHelper"]["composition"]),
            ("independent-slsqp", scenario["independentSLSQP"]["best"]["composition"]),
        ):
            source_rows.append({
                "scenario": scenario["scenario"], "candidateId": candidate_id,
                "temperatureK": 298.15,
                "referenceComposition": scenario["referenceComposition"],
                "trialComposition": composition,
            })
    assert len(source_rows) == pins["candidateCount"] == 6
    assert canonical_sha(source_rows) == pins["candidateSetSha256"]
    for row, source in zip(result["stabilityAudits"], source_rows):
        assert all(row[key] == source[key] for key in source)
        c, a = tpd_linear_form(row["temperatureK"], row["referenceComposition"],
                               row["trialComposition"])
        assert abs(c - row["baseAndIdealTpd"]) <= 1e-10
        assert abs(float(a @ params) - row["amendmentTpd"]) <= 1e-10
        assert abs(c + a @ params - row["completeTpd"]) <= 1e-10
        expected_status = "PASS" if row["completeTpd"] >= 0.0 else "FAIL"
        assert row["status"] == expected_status
    held_temperature = float(base_protocol["evidencePartition"]["heldOutTemperatureK"])
    held_system = tuple(base_protocol["evidencePartition"]["heldOutMolecularSystem"])
    partitions = {"training": [], "heldOutTemperature": [], "heldOutMolecularSystem": []}
    for row in evidence["tieLines"]:
        system = (row["components"]["SAT"], row["components"]["MONO"])
        key = ("heldOutMolecularSystem" if system == held_system
               else "heldOutTemperature" if abs(float(row["T_K"]) - held_temperature) < 1e-9
               else "training")
        partitions[key].append(row)
    composition_ok = True
    for key, rows in partitions.items():
        recomputed = m.validation_metrics(params, rows)
        stored = result["frozenValidation"][key]
        assert abs(recomputed["compositionRmsd"] - stored["compositionRmsd"]) <= 1e-12
        expected_status = "PASS" if recomputed["compositionRmsd"] <= ceiling else "FAIL"
        assert stored["status"] == expected_status and stored["ceiling"] == ceiling
        composition_ok = composition_ok and expected_status == "PASS"
    stability_ok = all(row["completeTpd"] >= 0.0 for row in result["stabilityAudits"])
    fit_ok = bool(result["fitDiagnostics"]["feasible"])
    expected_blockers = []
    if not fit_ok: expected_blockers.append("STABILITY_CONSTRAINED_FIT_INFEASIBLE")
    if not stability_ok: expected_blockers.append("DEMONSTRATED_MONO_RICH_TPD_CONSTRAINT_FAILED")
    if not composition_ok: expected_blockers.append("FROZEN_COMPOSITION_VALIDATION_FAILED")
    qualified = not expected_blockers
    assert result["blockers"] == expected_blockers
    assert result["qualified"] == qualified
    assert result["status"] == ("QUALIFIED" if qualified else "INCOMPATIBLE_FAIL_CLOSED")
    assert result["admittedReturnedPhases"] == (None if qualified else [])
    if not qualified:
        assert result["decision"].startswith("No phase or cascade result is admitted")
    manifest = json.loads((OUT / "provenance-manifest.json").read_text())
    assert manifest["outputs"]["results"] == sha(OUT / "results.json")
    assert manifest["outputs"]["report"] == sha(OUT / "report.md")
    with tempfile.TemporaryDirectory() as temp:
        env = dict(os.environ)
        env["TASK206_OUTPUT_DIR"] = temp
        subprocess.run([sys.executable, str(HERE / "run.py")], cwd=ROOT,
                       env=env, check=True)
        assert Path(temp, "results.json").read_bytes() == delivered_results
        assert Path(temp, "report.md").read_bytes() == delivered_report
    print("TASK_206_STABILITY_CONSTRAINED_AMENDMENT_VERIFIED")


if __name__ == "__main__":
    main()