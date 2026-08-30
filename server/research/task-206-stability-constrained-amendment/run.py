#!/usr/bin/env python3
"""Constrained refit of the NMP residual amendment; fail closed on any old gate."""
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
VENDOR = ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
sys.path.insert(0, str(VENDOR))
MODEL_PATH = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
BASE_PROTOCOL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json"
EVIDENCE = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
DIAGNOSTIC = ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic/results.json"
OUT = Path(os.environ.get(
    "TASK206_OUTPUT_DIR",
    ROOT / ".agents/outputs/task-206-stability-constrained-amendment",
))

spec = importlib.util.spec_from_file_location("task206_model", MODEL_PATH)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
import numpy as np
from scipy.optimize import minimize


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha(value):
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def tpd_linear_form(temperature_k, reference, trial):
    reference = model.normalize(reference)
    trial = model.normalize(trial)
    zero = np.zeros(len(model.PARAMETER_NAMES))
    c = float(np.sum(trial * (
        np.log(trial) + model.total_lngamma(model.FAMILIES, temperature_k, trial, zero)
        - np.log(reference) - model.total_lngamma(model.FAMILIES, temperature_k, reference, zero)
    )))
    a = trial @ (
        model.residual_feature_matrix(trial, temperature_k)
        - model.residual_feature_matrix(reference, temperature_k)
    )
    return c, np.asarray(a, dtype=float)


def constrained_fit(evidence_rows, base_protocol, stability_rows):
    _, partitions = model.fit_parameters(evidence_rows, base_protocol)
    train = partitions["training"]
    count = len(model.PARAMETER_NAMES)
    zero = np.zeros(count)
    intercept = np.concatenate([model._row_equilibrium(zero, row) for row in train])
    design = np.column_stack([
        np.concatenate([model._row_equilibrium(np.eye(count)[i], row) for row in train])
        - intercept for i in range(count)
    ])
    ridge = float(base_protocol["fit"]["ridgePenalty"])
    bound = float(base_protocol["fit"]["absoluteParameterBound"])
    minimum = float(base_protocol["globalStabilityConstraints"]["minimumTpd"])
    forms = [tpd_linear_form(row["temperatureK"], row["referenceComposition"],
                             row["trialComposition"]) for row in stability_rows]

    def residual(p):
        return intercept + design @ p

    def objective(p):
        r = residual(p)
        return 0.5 * float(r @ r + ridge * (p @ p))

    fit = minimize(
        objective, zero, jac=lambda p: design.T @ residual(p) + ridge * p,
        method="SLSQP", bounds=[(-bound, bound)] * count,
        constraints=[{
            "type": "ineq", "fun": lambda p, c=c, a=a: c + a @ p - minimum,
            "jac": lambda p, c=c, a=a: a,
        } for c, a in forms],
        options={"ftol": 1e-12, "maxiter": 5000, "disp": False},
    )
    margins = [float(c + a @ fit.x - minimum) for c, a in forms]
    partitions["fitDiagnostics"] = {
        "success": bool(fit.success),
        "feasible": bool(fit.success and np.all(np.isfinite(fit.x))
                         and min(margins, default=0.0) >= minimum),
        "message": str(fit.message), "iterations": int(fit.nit),
        "objective": objective(fit.x),
        "minimumConstraintMargin": min(margins, default=None),
        "constraintMargins": margins,
    }
    return fit.x, partitions


def main():
    protocol = json.loads((HERE / "protocol.json").read_text())
    base_protocol = json.loads(BASE_PROTOCOL.read_text())
    pins = protocol["pinnedInputs"]
    actual_hashes = {
        "baseProtocolSha256": sha(BASE_PROTOCOL),
        "modelSha256": sha(MODEL_PATH),
        "evidenceSha256": sha(EVIDENCE),
        "task205DiagnosticSha256": sha(DIAGNOSTIC),
    }
    if any(actual_hashes[key] != pins[key] for key in actual_hashes):
        raise ValueError("PINNED_TASK206_INPUT_HASH_MISMATCH")
    frozen_ceiling = float(base_protocol["fit"]["quantitativeCompositionRmsdCeiling"])
    if (frozen_ceiling != 0.03
            or protocol["frozenAcceptance"]["quantitativeCompositionRmsdCeiling"] != frozen_ceiling
            or protocol["frozenAcceptance"]["limitsMayBeWidened"]):
        raise ValueError("FROZEN_COMPOSITION_GATE_MISMATCH")
    base_protocol["globalStabilityConstraints"] = protocol["globalStabilityConstraints"]
    evidence = json.loads(EVIDENCE.read_text())
    diagnostic = json.loads(DIAGNOSTIC.read_text())
    rows = []
    for scenario in diagnostic["scenarios"]:
        candidates = (
            ("persisted-helper", scenario["persistedHelper"]["composition"]),
            ("independent-slsqp", scenario["independentSLSQP"]["best"]["composition"]),
        )
        for candidate_id, composition in candidates:
            rows.append({
                "scenario": scenario["scenario"],
                "candidateId": candidate_id,
                "temperatureK": 298.15,
                "referenceComposition": scenario["referenceComposition"],
                "trialComposition": composition,
            })
    if len(rows) != pins["candidateCount"] or canonical_sha(rows) != pins["candidateSetSha256"]:
        raise ValueError("PINNED_TASK205_CANDIDATE_SET_MISMATCH")
    parameters, partitions = constrained_fit(
        evidence["tieLines"], base_protocol, rows
    )
    validation = {}
    ceiling = frozen_ceiling
    for key in ("training", "heldOutTemperature", "heldOutMolecularSystem"):
        metrics = model.validation_metrics(parameters, partitions[key])
        metrics.update({"ceiling": ceiling, "status": "PASS" if metrics["compositionRmsd"] <= ceiling else "FAIL"})
        validation[key] = metrics
    audits = []
    for row in rows:
        c, a = tpd_linear_form(
            row["temperatureK"], row["referenceComposition"],
            row["trialComposition"],
        )
        tpd = float(c + a @ parameters)
        audits.append({**row, "baseAndIdealTpd": c, "amendmentTpd": float(a @ parameters),
                       "completeTpd": tpd, "margin": tpd,
                       "status": "PASS" if tpd >= 0.0 else "FAIL"})
    fit_ok = partitions["fitDiagnostics"]["feasible"]
    stability_ok = all(row["status"] == "PASS" for row in audits)
    composition_ok = all(row["status"] == "PASS" for row in validation.values())
    blockers = []
    if not fit_ok: blockers.append("STABILITY_CONSTRAINED_FIT_INFEASIBLE")
    if not stability_ok: blockers.append("DEMONSTRATED_MONO_RICH_TPD_CONSTRAINT_FAILED")
    if not composition_ok: blockers.append("FROZEN_COMPOSITION_VALIDATION_FAILED")
    qualified = not blockers
    result = {
        "schemaVersion": "1.0.0", "modelIdentity": protocol["modelIdentity"],
        **protocol["governance"], "qualified": qualified,
        "status": "QUALIFIED" if qualified else "INCOMPATIBLE_FAIL_CLOSED",
        "parameters": dict(zip(model.PARAMETER_NAMES, map(float, parameters))),
        "fitDiagnostics": partitions["fitDiagnostics"],
        "stabilityConstraintDefinition": protocol["globalStabilityConstraints"],
        "stabilityAudits": audits, "frozenValidation": validation,
        "admittedReturnedPhases": [] if not qualified else None,
        "blockers": blockers,
        "decision": "No phase or cascade result is admitted while any blocker remains.",
        "sourceHashes": {
            "model": sha(MODEL_PATH), "baseProtocol": sha(BASE_PROTOCOL),
            "task206Protocol": sha(HERE / "protocol.json"), "evidence": sha(EVIDENCE),
            "task205Diagnostic": sha(DIAGNOSTIC),
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    lines = ["# Task 206 — stability-constrained NMP amendment", "",
             f"Status: `{result['status']}`", "",
             "The six demonstrated Task-205 MONO-rich candidates are explicit TPD>=0 fit constraints.",
             "This finite audit does not claim continuous-simplex global certification.", "",
             "## Frozen composition validation"]
    for key, value in validation.items():
        lines.append(f"- {key}: RMSD={value['compositionRmsd']:.12g}; ceiling={ceiling}; {value['status']}")
    lines += ["", "## Decision", result["decision"], "Blockers: " + ", ".join(blockers)]
    (OUT / "report.md").write_text("\n".join(lines) + "\n")
    (OUT / "provenance-manifest.json").write_text(json.dumps({
        "inputs": result["sourceHashes"],
        "outputs": {"results": sha(OUT / "results.json"), "report": sha(OUT / "report.md")},
        "runner": sha(HERE / "run.py"),
    }, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": result["status"], "blockers": blockers}, indent=2))


if __name__ == "__main__":
    main()