"""Coupled six-component counter-current cascade at 25 and 50 degC."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
AMENDMENT = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
OUTPUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"

spec = importlib.util.spec_from_file_location("nmp_lle_amendment", AMENDMENT / "model.py")
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
np = model.np
least_squares = model.least_squares


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def json_safe(value):
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def phase_g(names, temperature_k, composition, parameters):
    composition = model.normalize(composition)
    return float(np.sum(composition * (
        np.log(composition)
        + model.total_lngamma(names, temperature_k, composition, parameters)
    )))


def local_stability(names, temperature_k, composition, parameters):
    """Deterministic directional curvature screen in five log-ratio directions."""
    composition = model.normalize(composition)
    logits = np.log(composition[:-1] / composition[-1])
    directions = list(np.eye(5))
    directions += [
        (np.eye(5)[i] + np.eye(5)[i + 1]) / math.sqrt(2)
        for i in range(4)
    ]
    directions.append(np.ones(5) / math.sqrt(5))
    step = 1e-4
    center = phase_g(names, temperature_k, composition, parameters)
    curvatures = []
    for direction in directions:
        plus = model.base.softmax(logits + step * direction)
        minus = model.base.softmax(logits - step * direction)
        curvature = (
            phase_g(names, temperature_k, plus, parameters)
            - 2 * center
            + phase_g(names, temperature_k, minus, parameters)
        ) / (step * step)
        curvatures.append(float(curvature))
    return {
        "minimumDirectionalCurvature": min(curvatures),
        "directionCount": len(directions),
        "coordinate": "five independent log mole-fraction ratios",
    }


def product_metrics(raffinate_component_moles, feed_mass, molecular_weights, targets):
    phase_mass = raffinate_component_moles * molecular_weights
    hydrocarbon_mass = phase_mass[:5].sum()
    nmp_free_total = max(hydrocarbon_mass, 1e-30)
    values = {
        "raffinateSaturatesWtNmpFree": 100 * phase_mass[0] / nmp_free_total,
        "raffinateTotalAromaticsWtNmpFree": 100 * phase_mass[1:4].sum() / nmp_free_total,
        "raffinatePolarAromaticsWtNmpFree": 100 * phase_mass[4] / nmp_free_total,
        "nmpFreeHydrocarbonRecoveryPct": 100 * hydrocarbon_mass / feed_mass[:5].sum(),
        "nmpInTotalRaffinateWt": 100 * phase_mass[5] / phase_mass.sum(),
        "satLossPct": 100 * (1 - phase_mass[0] / feed_mass[0]),
        "componentExtractionPct": {
            model.FAMILIES[i]: 100 * (1 - phase_mass[i] / feed_mass[i])
            for i in range(1, 5)
        },
        "raffinateComponentMass": dict(zip(model.FAMILIES, phase_mass.tolist())),
    }
    checks = {
        "minimumRaffinateSaturatesWt": {
            "target": targets["minimumRaffinateSaturatesWt"],
            "calculated": values["raffinateSaturatesWtNmpFree"],
            "status": "PASS" if values["raffinateSaturatesWtNmpFree"] >= targets["minimumRaffinateSaturatesWt"] else "FAIL",
        },
        "maximumRaffinateTotalAromaticsWt": {
            "target": targets["maximumRaffinateTotalAromaticsWt"],
            "calculated": values["raffinateTotalAromaticsWtNmpFree"],
            "status": "PASS" if values["raffinateTotalAromaticsWtNmpFree"] <= targets["maximumRaffinateTotalAromaticsWt"] else "FAIL",
        },
        "maximumRaffinatePolarAromaticsWt": {
            "target": targets["maximumRaffinatePolarAromaticsWt"],
            "calculated": values["raffinatePolarAromaticsWtNmpFree"],
            "status": "PASS" if values["raffinatePolarAromaticsWtNmpFree"] <= targets["maximumRaffinatePolarAromaticsWt"] else "FAIL",
        },
        "minimumNmpFreeRecoveryPct": {
            "target": targets["minimumNmpFreeRecoveryPct"],
            "calculated": values["nmpFreeHydrocarbonRecoveryPct"],
            "status": "PASS" if values["nmpFreeHydrocarbonRecoveryPct"] >= targets["minimumNmpFreeRecoveryPct"] else "FAIL",
        },
        "maximumNmpRaffinateWt": {
            "target": targets["maximumNmpRaffinateWt"],
            "calculated": values["nmpInTotalRaffinateWt"],
            "status": "PASS" if values["nmpInTotalRaffinateWt"] <= targets["maximumNmpRaffinateWt"] else "FAIL",
        },
        "targetRaffinateSulfurPpm": {
            "target": targets["targetRaffinateSulfurPpm"],
            "calculated": None,
            "status": "NOT_CALCULABLE",
        },
    }
    calculable_pass = all(
        entry["status"] == "PASS"
        for entry in checks.values()
        if entry["status"] != "NOT_CALCULABLE"
    )
    return values, checks, calculable_pass


def initial_vector(stage_count, total_moles, seed):
    r = total_moles * (1 - seed["beta"]) * seed["raffinate"]
    e = total_moles * seed["beta"] * seed["extract"]
    return np.log(np.tile(np.r_[r, e], stage_count))


def solve_cascade(stage_count, temperature_k, feed, solvent, parameters, protocol, seed, previous=None):
    total = float((feed + solvent).sum())
    gates = protocol["numericalAcceptance"]

    def unpack(vector):
        streams = np.exp(vector.reshape(stage_count, 12))
        return streams[:, :6], streams[:, 6:]

    def residual(vector):
        raffinate, extract = unpack(vector)
        equations = []
        for stage in range(stage_count):
            raffinate_in = feed if stage == 0 else raffinate[stage - 1]
            extract_in = solvent if stage == stage_count - 1 else extract[stage + 1]
            equations.extend((raffinate_in + extract_in - raffinate[stage] - extract[stage]) / total)
            x = raffinate[stage] / raffinate[stage].sum()
            y = extract[stage] / extract[stage].sum()
            equations.extend(
                np.log(x) + model.total_lngamma(model.FAMILIES, temperature_k, x, parameters)
                - np.log(y) - model.total_lngamma(model.FAMILIES, temperature_k, y, parameters)
            )
        return np.asarray(equations)

    if previous is None:
        base_start = initial_vector(stage_count, total, seed)
    else:
        previous_r, previous_e = previous
        previous_count = len(previous_r)
        mapped = []
        for stage in range(stage_count):
            position = stage / max(stage_count - 1, 1)
            source = min(round(position * max(previous_count - 1, 0)), previous_count - 1)
            mapped.extend(previous_r[source])
            mapped.extend(previous_e[source])
        base_start = np.log(np.maximum(np.asarray(mapped), 1e-12))
    starts = [
        base_start,
        base_start + np.tile(
            np.linspace(-0.015, 0.015, 12), stage_count
        ),
    ]
    solutions = [
        least_squares(
            residual,
            start,
            bounds=(math.log(1e-12), math.log(10 * total)),
            xtol=1e-11,
            ftol=1e-11,
            gtol=1e-11,
            max_nfev=4000,
        )
        for start in starts
    ]
    best = min(solutions, key=lambda solution: np.max(np.abs(solution.fun)))
    raffinate, extract = unpack(best.x)
    alternate_raffinate, alternate_extract = unpack(
        min(solutions[1:], key=lambda solution: np.max(np.abs(solution.fun))).x
    )
    product_difference = max(
        np.max(np.abs(raffinate[-1] - alternate_raffinate[-1])) / max(raffinate[-1].sum(), 1e-30),
        np.max(np.abs(extract[0] - alternate_extract[0])) / max(extract[0].sum(), 1e-30),
    )
    stages = []
    accepted = bool(best.success and np.max(np.abs(best.fun)) <= gates["maximumScaledEquationResidual"])
    for stage in range(stage_count):
        r_in = feed if stage == 0 else raffinate[stage - 1]
        e_in = solvent if stage == stage_count - 1 else extract[stage + 1]
        x = raffinate[stage] / raffinate[stage].sum()
        y = extract[stage] / extract[stage].sum()
        mu_residual = np.log(x) + model.total_lngamma(model.FAMILIES, temperature_k, x, parameters) - np.log(y) - model.total_lngamma(model.FAMILIES, temperature_k, y, parameters)
        component_balance = r_in + e_in - raffinate[stage] - extract[stage]
        stability_r = local_stability(model.FAMILIES, temperature_k, x, parameters)
        stability_e = local_stability(model.FAMILIES, temperature_k, y, parameters)
        mixed = (r_in + e_in) / (r_in + e_in).sum()
        homogeneous_g = phase_g(model.FAMILIES, temperature_k, mixed, parameters)
        split_g = (
            raffinate[stage].sum() * phase_g(model.FAMILIES, temperature_k, x, parameters)
            + extract[stage].sum() * phase_g(model.FAMILIES, temperature_k, y, parameters)
        ) / (raffinate[stage].sum() + extract[stage].sum())
        gibbs_reduction = homogeneous_g - split_g
        separation = float(np.max(np.abs(x - y)))
        stage_accepted = bool(
            np.max(np.abs(component_balance)) <= gates["maximumOverallComponentBalanceResidualMol"]
            and np.max(np.abs(mu_residual)) <= gates["maximumIsoactivityLogResidual"]
            and separation >= gates["minimumPhaseCompositionSeparation"]
            and stability_r["minimumDirectionalCurvature"] >= gates["minimumLocalStabilityCurvature"]
            and stability_e["minimumDirectionalCurvature"] >= gates["minimumLocalStabilityCurvature"]
            and gibbs_reduction >= gates["minimumStageGibbsReduction"]
            and y[5] > x[5]
        )
        accepted = accepted and stage_accepted
        stages.append({
            "stageFromFeedEnd": stage + 1,
            "raffinateIncoming": {"flowMol": float(r_in.sum()), "moleFractions": (r_in / r_in.sum()).tolist()},
            "extractIncoming": {"flowMol": float(e_in.sum()), "moleFractions": (e_in / e_in.sum()).tolist()},
            "raffinateLeaving": {"flowMol": float(raffinate[stage].sum()), "mass": float(np.sum(raffinate[stage] * seed["mw"])), "moleFractions": x.tolist(), "massFractions": (raffinate[stage] * seed["mw"] / np.sum(raffinate[stage] * seed["mw"])).tolist()},
            "extractLeaving": {"flowMol": float(extract[stage].sum()), "mass": float(np.sum(extract[stage] * seed["mw"])), "moleFractions": y.tolist(), "massFractions": (extract[stage] * seed["mw"] / np.sum(extract[stage] * seed["mw"])).tolist()},
            "KExtractOverRaffinate": (y / x).tolist(),
            "maximumComponentBalanceResidualMol": float(np.max(np.abs(component_balance))),
            "isoactivityLogResidual": float(np.max(np.abs(mu_residual))),
            "phaseCompositionSeparation": separation,
            "localPostSplitStability": {"raffinate": stability_r, "extract": stability_e},
            "stageGibbsReduction": gibbs_reduction,
            "accepted": stage_accepted,
        })
    accepted = accepted and product_difference <= gates["multistartProductRelativeTolerance"]
    overall_balance = feed + solvent - raffinate[-1] - extract[0]
    return {
        "stageCount": stage_count,
        "solverSuccess": bool(best.success),
        "solverMessage": str(best.message),
        "maximumScaledEquationResidual": float(np.max(np.abs(best.fun))),
        "multistartProductRelativeDifference": float(product_difference),
        "accepted": accepted,
        "boundaryStreams": {
            "oilFeed": {"entersStage": 1, "flowMol": float(feed.sum()), "componentMoles": feed.tolist()},
            "freshNmp": {"entersStage": stage_count, "flowMol": float(solvent.sum()), "componentMoles": solvent.tolist()},
            "finalRaffinate": {"leavesStage": stage_count, "flowMol": float(raffinate[-1].sum()), "componentMoles": raffinate[-1].tolist()},
            "finalExtract": {"leavesStage": 1, "flowMol": float(extract[0].sum()), "componentMoles": extract[0].tolist()},
        },
        "overallComponentBalanceResidualMol": overall_balance.tolist(),
        "maximumOverallComponentBalanceResidualMol": float(np.max(np.abs(overall_balance))),
        "stages": stages,
        "_raffinateProduct": raffinate[-1],
        "_streamSolution": (raffinate, extract),
    }


def main():
    protocol = load_json(HERE / "protocol.json")
    snapshot = load_json(AMENDMENT / "stage1-qualification-snapshot.json")
    prior = load_json(OUTPUT.parent / "ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json")
    p_map = prior["model"]["parameters"]
    parameters = np.asarray([p_map[name] for name in model.PARAMETER_NAMES])
    stage1 = snapshot["stage1"]
    molecular_weights = np.asarray([
        prior["stage1Authority"]["charge"]["molecularWeightsGmol"][name]
        for name in model.FAMILIES
    ], dtype=float)
    feed_mass = np.asarray([
        stage1["saturatesWt"], stage1["monoAromaticsWt"], stage1["diAromaticsWt"],
        stage1["polyAromaticsWt"], stage1["polarAromaticsWt"], stage1["nmpInFeedWt"],
    ])
    solvent_mass = np.asarray([0, 0, 0, 0, 0, 100 * stage1["solventOilRatio"]], dtype=float)
    feed = feed_mass / molecular_weights
    solvent = solvent_mass / molecular_weights
    targets = prior["stage1Authority"]["charge"]["targets"]
    results = {
        "schemaVersion": "1.0.0",
        "modelIdentity": protocol["modelIdentity"],
        "componentOrder": list(model.FAMILIES),
        "governance": protocol["governance"],
        "stage1Authority": {
            "snapshotPath": str((AMENDMENT / "stage1-qualification-snapshot.json").relative_to(ROOT)),
            "snapshotSha256": sha256(AMENDMENT / "stage1-qualification-snapshot.json"),
            "feedMassBasis": dict(zip(model.FAMILIES, feed_mass.tolist())),
            "freshSolventMassBasis": dict(zip(model.FAMILIES, solvent_mass.tolist())),
            "solventOilMassRatio": stage1["solventOilRatio"],
            "targets": targets,
        },
        "flowConvention": protocol["flowConvention"],
        "temperatureCases": [],
    }
    seeds = {
        298.15: {
            "raffinate": np.asarray([0.80839275, 0.04805118, 0.02223209, 0.00732792, 0.00245580, 0.11154027]),
            "extract": np.asarray([0.03166653, 0.03270623, 0.01640959, 0.00607406, 0.00377994, 0.90936365]),
            "beta": 0.614761, "mw": molecular_weights,
        },
        323.15: {
            "raffinate": np.asarray(prior["stage1Prediction"]["flash"]["raffinate"]),
            "extract": np.asarray(prior["stage1Prediction"]["flash"]["extract"]),
            "beta": prior["stage1Prediction"]["flash"]["betaExtract"], "mw": molecular_weights,
        },
    }
    for temperature_k in protocol["temperaturesK"]:
        trials = []
        first_passing = None
        previous = None
        for stage_count in protocol["stageTrials"]:
            trial = solve_cascade(
                stage_count, temperature_k, feed, solvent, parameters,
                protocol, seeds[temperature_k], previous,
            )
            previous = trial.pop("_streamSolution")
            values, checks, calculable_pass = product_metrics(
                trial.pop("_raffinateProduct"), feed_mass, molecular_weights, targets
            )
            trial["productMetrics"] = values
            trial["targetCompliance"] = checks
            trial["allCalculableTargetsPass"] = bool(trial["accepted"] and calculable_pass)
            if trial["allCalculableTargetsPass"] and first_passing is None:
                first_passing = stage_count
            trials.append(trial)
        results["temperatureCases"].append({
            "temperatureC": temperature_k - 273.15,
            "temperatureK": temperature_k,
            "trials": trials,
            "firstStageCountMeetingAllCalculableTargets": first_passing,
            "theoreticalStageVerdict": (
                f"TARGETS_ACHIEVED_AT_NT_{first_passing}"
                if first_passing is not None
                else "TARGETS_NOT_ACHIEVED_WITHIN_NT_LIMIT"
            ),
        })
    results["decision"] = {
        "numericalCascadeResult": "RESEARCH_DIAGNOSTIC_ONLY",
        "fullSixComponentModelQualification": "NOT_QUALIFIED",
        "releaseEligible": False,
        "reason": "The Task #199 equilibrium model fails the frozen blind composition-RMSD qualification gate.",
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result_path = OUTPUT / "results.json"
    result_path.write_text(json.dumps(json_safe(results), indent=2, sort_keys=True) + "\n")
    manifest = {
        "protocolSha256": sha256(HERE / "protocol.json"),
        "stage1SnapshotSha256": sha256(AMENDMENT / "stage1-qualification-snapshot.json"),
        "amendmentModelSha256": sha256(AMENDMENT / "model.py"),
        "amendmentResultsSha256": sha256(OUTPUT.parent / "ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"),
        "runnerSha256": sha256(HERE / "run.py"),
        "resultsSha256": sha256(result_path),
    }
    (OUTPUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    write_report(results, OUTPUT / "report.md")
    print(json.dumps({"status": "PASS", "output": str(result_path), "decisions": [
        {"temperatureC": case["temperatureC"], "verdict": case["theoreticalStageVerdict"]}
        for case in results["temperatureCases"]
    ]}))


def write_report(results, path):
    lines = [
        "# Six-Component Counter-Current NMP/RRBO Extraction",
        "",
        "**Research-only · calibration-required · non-pilot-validated · non-release-eligible**",
        "",
        "Oil feed enters Stage 1; raffinate flows toward Stage N. Fresh NMP enters Stage N; extract flows toward Stage 1.",
        "Every stage simultaneously solves six component balances and six activity-equality equations. No fixed K values or constant-flow approximation is used.",
        "",
    ]
    for case in results["temperatureCases"]:
        lines += [f"## {case['temperatureC']:.0f}°C", "", f"**Stage requirement:** `{case['theoreticalStageVerdict']}`", ""]
        lines += ["| NT | Accepted | SAT wt% | Aromatics wt% | PA wt% | Recovery % | NMP in raffinate wt% | All calculable targets |", "|---:|:---:|---:|---:|---:|---:|---:|:---:|"]
        for trial in case["trials"]:
            v = trial["productMetrics"]
            lines.append(
                f"| {trial['stageCount']} | {'YES' if trial['accepted'] else 'NO'} | "
                f"{v['raffinateSaturatesWtNmpFree']:.4f} | {v['raffinateTotalAromaticsWtNmpFree']:.4f} | "
                f"{v['raffinatePolarAromaticsWtNmpFree']:.4f} | {v['nmpFreeHydrocarbonRecoveryPct']:.4f} | "
                f"{v['nmpInTotalRaffinateWt']:.4f} | {'PASS' if trial['allCalculableTargetsPass'] else 'FAIL'} |"
            )
        lines += ["", "Complete incoming/outgoing flows, six-component mole/mass profiles, K values, and closure residuals for every stage are in `results.json`.", ""]
    lines += [
        "## Governance decision", "",
        "`FULL_SIX_COMPONENT_MODEL_QUALIFICATION = NOT_QUALIFIED`", "",
        "These cascade values are numerical research diagnostics, not validated process-design results. The underlying Task #199 model failed the frozen blind LLE composition-RMSD ceiling. Sulfur remains `NOT_CALCULABLE`; PA transfer is provisional and is not sulfur removal.",
    ]
    path.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()