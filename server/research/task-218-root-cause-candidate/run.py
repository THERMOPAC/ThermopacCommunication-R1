#!/usr/bin/env python3
"""Separately governed Task-218 candidate fit; no production or cascade execution."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/task-218-root-cause-candidate"
MODEL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
AMEND_PROTOCOL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json"
EVIDENCE = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
ROOT_CAUSE = ROOT / ".agents/outputs/task-218-task216-root-cause/results.json"
JOB = Path("/tmp/job170.json")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_sha(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def load_model():
    spec = importlib.util.spec_from_file_location("task218_candidate_model", MODEL)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def pinned_paths():
    return {
        "rootCauseProtocolSha256": ROOT / "server/research/task-218-task216-root-cause/protocol.json",
        "rootCauseResultsSha256": ROOT_CAUSE,
        "rootCauseProvenanceSha256": ROOT / ".agents/outputs/task-218-task216-root-cause/provenance-manifest.json",
        "task216ProtocolSha256": ROOT / "server/research/task-216-mono-rich-global-stability/protocol.json",
        "task216ResultsSha256": ROOT / ".agents/outputs/task-216-mono-rich-global-stability/results.json",
        "amendmentModelSha256": MODEL,
        "amendmentProtocolSha256": AMEND_PROTOCOL,
        "task206ProtocolSha256": ROOT / "server/research/task-206-stability-constrained-amendment/protocol.json",
        "task206ResultsSha256": ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json",
        "task213ProtocolSha256": ROOT / "server/research/task-213-mono-rich-qualification/protocol.json",
        "task213ResultsSha256": ROOT / ".agents/outputs/task-213-mono-rich-qualification/results.json",
        "evidenceSha256": EVIDENCE,
        "referenceJobExportSha256": JOB,
    }


def js_number(value):
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("NONFINITE_REFERENCE_VALUE")
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) < 1e21:
        return str(int(value))
    text = repr(value)
    if "e" not in text.lower():
        return text
    mantissa, exponent = text.lower().split("e")
    power = int(exponent)
    if 1e-6 <= abs(value) < 1e21:
        return format(value, ".15f").rstrip("0").rstrip(".")
    return mantissa.rstrip("0").rstrip(".") + "e" + ("+" if power >= 0 else "") + str(power)


def stage1_canonical(value):
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(str(key), ensure_ascii=False) + ":" + stage1_canonical(value[key])
            for key in sorted(value)
        ) + "}"
    if isinstance(value, list):
        return "[" + ",".join(stage1_canonical(item) for item in value) + "]"
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return js_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    raise ValueError("INVALID_REFERENCE_JSON")


def snapshot_sha(value):
    return hashlib.sha256(stage1_canonical(value).encode()).hexdigest()


def tpd_form(model, temperature, z, w):
    z, w = model.normalize(z), model.normalize(w)
    zero = model.np.zeros(9)
    c = float(model.np.sum(w * (
        model.np.log(w) + model.total_lngamma(model.FAMILIES, temperature, w, zero)
        - model.np.log(z) - model.total_lngamma(model.FAMILIES, temperature, z, zero)
    )))
    a = w @ (
        model.residual_feature_matrix(w, temperature)
        - model.residual_feature_matrix(z, temperature)
    )
    return c, model.np.asarray(a, float)


def fit_candidate(model, rows, evidence_rows, base_protocol, safety_margin):
    _, partitions = model.fit_parameters(evidence_rows, base_protocol)
    train = partitions["training"]
    n = len(model.PARAMETER_NAMES)
    zero = model.np.zeros(n)
    intercept = model.np.concatenate([model._row_equilibrium(zero, row) for row in train])
    design = model.np.column_stack([
        model.np.concatenate([model._row_equilibrium(model.np.eye(n)[i], row) for row in train])
        - intercept for i in range(n)
    ])
    ridge = float(base_protocol["fit"]["ridgePenalty"])
    bound = float(base_protocol["fit"]["absoluteParameterBound"])
    forms = [tpd_form(model, row["temperatureK"], row["z"], row["wStar"]) for row in rows]

    def residual(p):
        return intercept + design @ p

    def objective(p):
        r = residual(p)
        return 0.5 * float(r @ r + ridge * (p @ p))

    constraints = [{
        "type": "ineq",
        "fun": lambda p, c=c, a=a: c + a @ p - safety_margin,
        "jac": lambda p, c=c, a=a: a,
    } for c, a in forms]
    fit = model.minimize(
        objective, model.np.zeros(n), method="SLSQP",
        jac=lambda p: design.T @ residual(p) + ridge * p,
        bounds=[(-bound, bound)] * n, constraints=constraints,
        options={"ftol": 1e-12, "maxiter": 10000, "disp": False},
    )
    audits = []
    for row, (c, a) in zip(rows, forms):
        value = float(c + a @ fit.x)
        audits.append({
            "id": row["id"], "NT": row["NT"], "stage": row["stage"], "phase": row["phase"],
            "z": row["z"], "wStar": row["wStar"], "completeTpd": value,
            "baseAndIdealTpd": c, "amendmentTpd": float(a @ fit.x),
            "status": "PASS" if value >= 0 else "FAIL",
        })
    diagnostics = {
        "success": bool(fit.success), "message": str(fit.message),
        "iterations": int(fit.nit), "objective": objective(fit.x),
        "trainingEquilibriumObjective": 0.5 * float(residual(fit.x) @ residual(fit.x)),
        "ridgeObjective": 0.5 * ridge * float(fit.x @ fit.x),
        "minimumConstraintTpd": min(row["completeTpd"] for row in audits),
        "allNineParametersRefit": len(fit.x) == 9 and bool(model.np.all(model.np.isfinite(fit.x))),
        "bounded": bool(model.np.all(model.np.abs(fit.x) <= bound + 1e-10)),
        "feasible": bool(fit.success and all(row["status"] == "PASS" for row in audits)),
    }
    return fit.x, partitions, audits, diagnostics


def validation_and_topology(model, parameters, partitions, gates):
    validation = {}
    for key in ("training", "heldOutTemperature", "heldOutMolecularSystem"):
        metric = model.validation_metrics(parameters, partitions[key])
        metric.update({
            "ceiling": gates["quantitativeCompositionRmsdCeiling"],
            "status": "PASS" if metric["compositionRmsd"] <= gates["quantitativeCompositionRmsdCeiling"] else "FAIL",
        })
        validation[key] = metric
    rows = sum((partitions[key] for key in ("training", "heldOutTemperature", "heldOutMolecularSystem")), [])
    represented = 0
    squared, count = [], 0
    for row in rows:
        names = ("SAT", "MONO", "NMP")
        xr = model.normalize([row["raffinate"][n] for n in names])
        xe = model.normalize([row["extract"][n] for n in names])
        x6 = model.np.array([xr[0], xr[1], 0, 0, 0, xr[2]])
        br = model.base.lngamma(names, row["T_K"], xr)
        cr = model.residual_lngamma(x6, row["T_K"], parameters)[[0, 1, 5]]
        y = xe.copy()
        for _ in range(100):
            y6 = model.np.array([y[0], y[1], 0, 0, 0, y[2]])
            nxt = model.normalize(xr * model.np.exp(
                br + cr - model.base.lngamma(names, row["T_K"], y)
                - model.residual_lngamma(y6, row["T_K"], parameters)[[0, 1, 5]]
            ))
            if model.np.max(model.np.abs(nxt - y)) < 1e-12:
                y = nxt
                break
            y = 0.5 * (y + nxt)
        represented += int(model.np.max(model.np.abs(y - xr)) >= gates["minimumPhaseCompositionSeparation"])
        squared.extend(((y - xe) ** 2).tolist())
        count += 1
    recall = represented / count
    rmsd = float(model.np.sqrt(model.np.mean(squared)))
    return validation, {
        "definition": "unchanged evidence-row implicit equilibrium reconstruction; distinct predicted partner counts as two-liquid topology",
        "rows": count, "representedTwoLiquidRows": represented, "topologyRecall": recall,
        "minimumTopologyRecall": gates["minimumTopologyRecall"],
        "topologyStatus": "PASS" if recall >= gates["minimumTopologyRecall"] else "FAIL",
        "tieLineCompositionRmsd": rmsd,
        "maximumTieLineCompositionRmsd": gates["maximumTieLineCompositionRmsd"],
        "tieLineStatus": "PASS" if rmsd <= gates["maximumTieLineCompositionRmsd"] else "FAIL",
        "carriedUnchanged": True,
    }


def stage1_charge(model, request):
    authority = request["stage1Authority"]
    snapshot = authority.get("source", authority)
    stage1 = snapshot["stage1"]
    keys = ("saturatesWt", "monoAromaticsWt", "diAromaticsWt", "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt")
    masses = model.np.asarray([stage1[key] for key in keys], float)
    if abs(float(masses.sum()) - 100) > 0.005:
        raise ValueError("REFERENCE_STAGE1_MASS_BASIS_INVALID")
    masses[5] += 100 * float(stage1["solventOilRatio"])
    mw = model.np.asarray([model.base.COMP[name][4] for name in model.FAMILIES], float)
    moles = masses / mw
    return float(stage1["operatingTemperatureC"]) + 273.15, (moles / moles.sum()).tolist(), snapshot


def main():
    protocol = json.loads((HERE / "protocol.json").read_text())
    pins = protocol["pinnedInputs"]
    for key, path in pinned_paths().items():
        if not path.is_file() or sha(path) != pins[key]:
            raise RuntimeError(f"PIN_MISMATCH:{key}")
    source = json.loads(JOB.read_text())
    task216_protocol = json.loads(pinned_paths()["task216ProtocolSha256"].read_text())
    if task216_protocol["referenceJob"]["priorResultSnapshotSha256"] != pins["task216PriorResultSnapshotSha256"]:
        raise RuntimeError("TASK216_REFERENCE_RESULT_HASH_BINDING_MISMATCH")
    if snapshot_sha(source["input_snapshot"]) != pins["referenceInputSnapshotSha256"]:
        raise RuntimeError("REFERENCE_INPUT_SNAPSHOT_HASH_MISMATCH")
    if snapshot_sha(source["result_snapshot"]) != pins["referenceResultSnapshotSha256"]:
        raise RuntimeError("REFERENCE_RESULT_SNAPSHOT_HASH_MISMATCH")
    model = load_model()
    base_protocol = json.loads(AMEND_PROTOCOL.read_text())
    expected_form = "gE_residual/RT=sum_(i,j in {SAT-MONO,SAT-NMP,MONO-NMP}) x_i*x_j*[A_ref+A_temperature*(T-313.15)/20+A_asymmetry*(x_i-x_j)]"
    if (
        tuple(protocol["parameterOrder"]) != tuple(model.PARAMETER_NAMES)
        or tuple(protocol["componentOrder"]) != tuple(model.FAMILIES)
        or protocol["mathematicalForm"] != expected_form
        or base_protocol["residualEquation"] != "gE_residual/RT = sum over admitted pairs x_i*x_j*[A_ref+A_temperature*(T-313.15)/20+A_asymmetry*(x_i-x_j)]"
        or base_protocol["fit"]["ridgePenalty"] != protocol["fit"]["ridgePenalty"]
        or base_protocol["fit"]["absoluteParameterBound"] != protocol["fit"]["absoluteParameterBound"]
    ):
        raise RuntimeError("CANDIDATE_MODEL_FORM_OR_FIT_CHANGED")
    rootcause = json.loads(ROOT_CAUSE.read_text())
    rows = [{**row, "temperatureK": rootcause["temperatureK"]} for row in rootcause["cases"]]
    if len(rows) != protocol["fit"]["constraintCount"] or not all(row["nativeIndependent"]["genuine"] is False for row in rows):
        raise RuntimeError("ROOT_CAUSE_PAIR_SET_INVALID")
    evidence = json.loads(EVIDENCE.read_text())
    parameters, partitions, audits, diagnostics = fit_candidate(
        model, rows, evidence["tieLines"], base_protocol,
        protocol["fit"]["constraintNumericalSafetyMargin"],
    )
    validation, carried = validation_and_topology(model, parameters, partitions, protocol["frozenGates"])
    task213 = json.loads(pinned_paths()["task213ResultsSha256"].read_text())
    direct = bool(task213["molecularAndPhaseEquilibriumEvidence"]["directMatchingSixComponentEvidenceAvailable"])
    temperature, z, stage1_snapshot = stage1_charge(model, source["input_snapshot"])
    flash = model.flash(model.FAMILIES, temperature, z, parameters, base_protocol)
    flash_summary = {
        key: flash[key] for key in (
            "accepted", "optimizerSuccess", "equilibriumPolishSuccess",
            "equilibriumPolishResidual", "raffinate", "extract", "betaExtract",
            "minimumTpd", "gibbsReduction", "isoactivityLogResidual",
            "materialBalanceMaxResidual", "maximumCompositionSeparation", "postSplitTpd",
        )
    }
    flash_summary.update({
        "temperatureK": temperature, "overallMolarComposition": z,
        "validAcceptedTwoLiquidSeedExists": bool(flash["accepted"]),
        "source": "candidate-owned Stage1 flash from pinned reference input",
    })
    candidate_payload = {
        "modelSourceSha256": pins["amendmentModelSha256"],
        "protocolSha256": sha(HERE / "protocol.json"),
        "orderedParameterVector": [float(x) for x in parameters],
        "evidenceSha256": pins["evidenceSha256"],
        "rootCauseSha256": pins["rootCauseResultsSha256"],
        "componentOrder": protocol["componentOrder"],
        "mathematicalForm": protocol["mathematicalForm"],
    }
    blockers = []
    if not diagnostics["feasible"]:
        blockers.append("DEVELOPMENT_TPD_CONSTRAINTS_FAILED")
    if any(value["status"] != "PASS" for value in validation.values()):
        blockers.append("FROZEN_COMPOSITION_VALIDATION_FAILED")
    if carried["topologyStatus"] != "PASS":
        blockers.append("CARRIED_TOPOLOGY_GATE_FAILED")
    if carried["tieLineStatus"] != "PASS":
        blockers.append("CARRIED_TIE_LINE_GATE_FAILED")
    if not direct:
        blockers.append("DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING")
    if not flash["accepted"]:
        blockers.append("CANDIDATE_STAGE1_TWO_LIQUID_SEED_NOT_ACCEPTED")
    result = {
        "schemaVersion": "1.0.0", "analysis": protocol["analysis"],
        "modelIdentity": protocol["modelIdentity"],
        "governance": protocol["governance"], "qualified": False,
        "status": "BLOCKED_FAIL_CLOSED" if blockers else "DEVELOPMENT_GATES_PASS_NOT_QUALIFIED",
        "componentOrder": protocol["componentOrder"],
        "parameterOrder": protocol["parameterOrder"],
        "parameters": dict(zip(protocol["parameterOrder"], map(float, parameters))),
        "orderedParameterVector": [float(x) for x in parameters],
        "mathematicalForm": protocol["mathematicalForm"],
        "candidateModelIdentityPayload": candidate_payload,
        "candidateModelSha256": canonical_sha(candidate_payload),
        "fitDiagnostics": diagnostics,
        "developmentConstraintAudits": audits,
        "developmentConstraintDisposition": "DIAGNOSTIC_DEVELOPMENT_CONSTRAINTS",
        "candidateGeneratedEndpoints": False,
        "frozenValidation": validation,
        "carriedTopologyAndTieLineGates": carried,
        "directMatchingSixComponentEvidenceAvailable": direct,
        "stage1Flash": flash_summary,
        "referenceSnapshots": {
            "inputSha256": snapshot_sha(source["input_snapshot"]),
            "resultSha256": snapshot_sha(source["result_snapshot"]),
            "stage1ImmutableSha256": snapshot_sha({k: v for k, v in stage1_snapshot.items() if k != "immutableHash"}),
        },
        "pinnedInputs": pins, "prohibitedFitInputs": protocol["prohibitedFitInputs"],
        "objectiveInputs": ["frozen training equilibrium residuals", "unchanged ridge penalty"],
        "constraintInputs": ["57 exact Task216 z,w* pairs"],
        "blockers": blockers,
        "decision": "Candidate is never qualified here; no candidate cascade was run.",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report = [
        "# Task 218 root-cause-informed candidate recalibration", "",
        f"Status: `{result['status']}`. This is a research development candidate, never a qualification.",
        "", "## Ordered parameter vector", canonical(result["orderedParameterVector"]),
        "", "## Frozen validation",
    ]
    for key, value in validation.items():
        report.append(f"- {key}: RMSD={value['compositionRmsd']:.12g}, ceiling=0.03, {value['status']}")
    report += [
        "", "## Development constraints",
        f"All 57 old exact Task216 pairs are diagnostic development constraints: {diagnostics['feasible']}; minimum TPD={diagnostics['minimumConstraintTpd']:.12g}. They are not candidate-generated endpoints or qualification.",
        "", "## Carried gates and Stage1 flash",
        f"- Topology recall={carried['topologyRecall']:.12g}: {carried['topologyStatus']}",
        f"- Tie-line RMSD={carried['tieLineCompositionRmsd']:.12g}: {carried['tieLineStatus']}",
        f"- Direct matching six-component evidence={direct}",
        f"- Valid accepted two-liquid seed exists={flash_summary['validAcceptedTwoLiquidSeedExists']}",
        "", "## Governance",
        "No cascade stage count, products, sulfur, or desired outcome entered the objective or constraints. No candidate cascade was run.",
        "Blockers: " + (", ".join(blockers) if blockers else "none"),
        f"Candidate model SHA-256: `{result['candidateModelSha256']}`",
    ]
    (OUT / "report.md").write_text("\n".join(report) + "\n")
    manifest = {
        "protocolSha256": sha(HERE / "protocol.json"),
        "runnerSha256": sha(HERE / "run.py"),
        "verifierSha256": sha(HERE / "verify.py"),
        "resultsSha256": sha(OUT / "results.json"),
        "reportSha256": sha(OUT / "report.md"),
        "candidateModelSha256": result["candidateModelSha256"],
        "pinnedInputs": pins,
        "referenceSnapshots": result["referenceSnapshots"],
    }
    (OUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": result["status"], "blockers": blockers, "candidateModelSha256": result["candidateModelSha256"]}))


if __name__ == "__main__":
    main()