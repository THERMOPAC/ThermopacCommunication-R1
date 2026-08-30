"""Independent, fail-closed verifier for the Task 205 diagnostic."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic"
INPUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/fixed-nt7-feed-sensitivity-results.json"
AMEND = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
MODEL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"

sys.path.insert(0, str(ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"))
import numpy as np
from scipy.optimize import minimize

spec = importlib.util.spec_from_file_location("task205_verify_model", MODEL)
model = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = model
spec.loader.exec_module(model)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def close(a, b, tol):
    return abs(float(a) - float(b)) <= tol


def main():
    results = json.loads((OUT / "results.json").read_text())
    source = json.loads(INPUT.read_text())
    fit = json.loads(AMEND.read_text())
    protocol = json.loads((HERE / "protocol.json").read_text())
    gates = protocol["numericalAcceptance"]
    multi_cfg = protocol["multistartDiagnostic"]
    temperature = float(protocol["temperatureK"])
    floor = float(gates["boundaryFloor"])
    params = np.array([fit["model"]["parameters"][k] for k in model.PARAMETER_NAMES])
    checks = []

    def check(name, value):
        checks.append((name, bool(value)))

    def norm(x):
        return model.normalize(np.asarray(x, float), floor)

    def base_lngamma(x):
        return model.base.lngamma(model.FAMILIES, temperature, norm(x))

    def residual_lngamma(x):
        return model.residual_lngamma(norm(x), temperature, params)

    def chemical_potential(x):
        x = norm(x)
        return np.log(x) + base_lngamma(x) + residual_lngamma(x)

    def gibbs(x):
        x = norm(x)
        return float(x @ chemical_potential(x))

    def tpd_terms(z, w):
        z, w = norm(z), norm(w)
        ideal = float(w @ (np.log(w) - np.log(z)))
        base = float(w @ (base_lngamma(w) - base_lngamma(z)))
        amendment = float(w @ (residual_lngamma(w) - residual_lngamma(z)))
        return ideal, base, amendment, ideal + base + amendment

    def tpd(z, w):
        return tpd_terms(z, w)[3]

    def tangent_gradient(z, w, h=2e-6):
        gradient = []
        for i in range(5):
            direction = np.zeros(6)
            direction[i] = h
            direction[5] = -h
            gradient.append((tpd(z, w + direction) - tpd(z, w - direction)) / (2 * h))
        return np.asarray(gradient)

    def gradient6(z, w):
        w = np.asarray(w, float)
        gradient = np.zeros(6)
        for i in range(6):
            h = max(2e-7, 2e-6 * w[i])
            plus = w.copy()
            plus[i] += h
            if w[i] - h < floor:
                gradient[i] = (tpd(z, plus) - tpd(z, w)) / h
            else:
                minus = w.copy()
                minus[i] -= h
                gradient[i] = (tpd(z, plus) - tpd(z, minus)) / (2 * h)
        return gradient

    def kkt_residual(z, w):
        w = norm(w)
        gradient = gradient6(z, w)
        interior = w > 20 * floor
        multiplier = float(np.mean(gradient[interior]))
        projected = np.where(w <= 20 * floor, np.minimum(gradient - multiplier, 0), gradient - multiplier)
        return float(np.max(np.abs(projected)))

    def chemical_consistency(x, h=2e-6):
        x = norm(x)
        mu = chemical_potential(x)
        residuals = []
        for i in range(5):
            direction = np.zeros(6)
            direction[i] = h
            direction[5] = -h
            dg = (gibbs(x + direction) - gibbs(x - direction)) / (2 * h)
            residuals.append(dg - (mu[i] - mu[5]))
        return float(np.max(np.abs(residuals)))

    def cascade_context(raw):
        trial = raw["trial"]
        nt = int(multi_cfg["stageCount"])
        feed = np.asarray(trial["boundaryStreams"]["oilFeed"]["componentMoles"], float)
        solvent = np.asarray(trial["boundaryStreams"]["freshNmp"]["componentMoles"], float)
        total = float((feed + solvent).sum())
        primary_r = np.array([
            s["raffinateLeaving"]["flowMol"] * np.asarray(s["raffinateLeaving"]["moleFractions"])
            for s in trial["stages"]
        ])
        primary_e = np.array([
            s["extractLeaving"]["flowMol"] * np.asarray(s["extractLeaving"]["moleFractions"])
            for s in trial["stages"]
        ])
        seed_r = np.asarray([.80839275, .04805118, .02223209, .00732792, .00245580, .11154027])
        seed_e = np.asarray([.03166653, .03270623, .01640959, .00607406, .00377994, .90936365])
        base_start = np.log(np.tile(np.r_[total * (1 - .614761) * seed_r, total * .614761 * seed_e], nt))
        secondary_start = base_start + np.tile(np.linspace(-.015, .015, 12), nt)

        def residual(log_flows):
            streams = np.exp(np.asarray(log_flows).reshape(nt, 12))
            raffinate, extract = streams[:, :6], streams[:, 6:]
            blocks = []
            for j in range(nt):
                raffinate_in = feed if j == 0 else raffinate[j - 1]
                extract_in = solvent if j == nt - 1 else extract[j + 1]
                x = raffinate[j] / raffinate[j].sum()
                y = extract[j] / extract[j].sum()
                balance = (raffinate_in + extract_in - raffinate[j] - extract[j]) / total
                isoactivity = chemical_potential(x) - chemical_potential(y)
                blocks.extend(np.r_[balance, isoactivity])
            return np.asarray(blocks), raffinate, extract

        return residual, primary_r, primary_e, base_start, secondary_start

    check("immutable input hash", results["inputImmutableSha256"] == sha(INPUT))
    check("model hash", results["modelSha256"] == sha(MODEL))
    check("protocol hash", results["protocolSha256"] == sha(HERE / "protocol.json"))
    check("governance fail closed", results["failClosed"] and results["governance"] == protocol["governance"])
    check("three scenarios", len(results["scenarios"]) == len(source["scenarios"]) == 3)

    source_by_name = {row["name"]: row for row in source["scenarios"]}
    for output in results["scenarios"]:
        name = output["scenario"]
        raw = source_by_name.get(name)
        check(name + " exists in immutable source", raw is not None)
        if raw is None:
            continue
        stage = raw["trial"]["stages"][0]
        source_z = norm(stage["extractLeaving"]["moleFractions"])
        source_w = norm(stage["postSplitTpdSearch"]["extract"]["minimizingComposition"])
        source_tpd = float(stage["postSplitTpdSearch"]["extract"]["minimum"])
        z = norm(output["referenceComposition"])
        w = norm(output["persistedHelper"]["composition"])
        check(name + " reference composition source match", np.max(np.abs(z - source_z)) <= 2e-12)
        check(name + " helper composition source match", np.max(np.abs(w - source_w)) <= 2e-12)
        check(name + " helper TPD source match", close(output["persistedHelper"]["minimum"], source_tpd, 2e-12))

        ideal, base, amendment, total_tpd = tpd_terms(z, w)
        reported = output["directMoleFractionTpd"]
        check(name + " ideal recomputation", close(ideal, reported["ideal"], 2e-9))
        check(name + " base recomputation", close(base, reported["pinnedBaseCosmoSac"], 2e-9))
        check(name + " amendment recomputation", close(amendment, reported["residualAmendment"], 2e-9))
        check(name + " total TPD recomputation", close(total_tpd, reported["total"], 2e-9))

        zero_tpd = tpd(z, z)
        tangent = gibbs(w) - gibbs(z) - float(chemical_potential(z) @ (w - z))
        tangent_difference = total_tpd - tangent
        gradient_at_z = tangent_gradient(z, z)
        consistency = chemical_consistency(z)
        check(name + " identity at reference", abs(zero_tpd) <= gates["identityTolerance"])
        check(name + " tangent-plane identity", abs(tangent_difference) <= gates["identityTolerance"])
        check(name + " tangent gradient at reference", np.max(np.abs(gradient_at_z)) <= gates["gradientTolerance"])
        check(name + " chemical-potential consistency", consistency <= gates["chemicalPotentialConsistencyTolerance"])
        check(name + " reported tangent identity", close(tangent_difference, output["exactTangentPlane"]["difference"], 2e-9))
        check(name + " reported reference gradient", np.max(np.abs(gradient_at_z - output["finiteDifferenceGradientAtZ"])) <= 2e-8)
        check(name + " reported chemical consistency", close(consistency, output["chemicalPotentialConsistencyMaxResidualAtZ"], 2e-9))

        boundary = []
        for row in output["boundaryApproachPureMono"]:
            f = float(row["floor"])
            candidate = np.array([f, 1 - 5 * f, f, f, f, f])
            value = tpd(z, candidate)
            boundary.append(value)
            check(name + " boundary value " + str(f), close(value, row["tpd"], 2e-9))
        boundary_pass = max(abs(boundary[-1] - source_tpd), abs(boundary[-2] - source_tpd)) <= 2e-5
        check(name + " boundary approach", boundary_pass)

        same_composition_difference = float(output["comparisonMatrix"]["sameCompositionObjectiveDifference"])
        check(name + " same-composition algebraic agreement", same_composition_difference <= gates["optimizerAgreementTolerance"])
        check(name + " assessment wording", output["tpdSearchAssessment"]["objectiveImplementation"] == "SAME_COMPOSITION_ALGEBRAIC_AGREEMENT")
        check(name + " no implementation overclaim", not output["tpdSearchAssessment"]["causedNegativeVerdict"])

        slsqp_rows = output["independentSLSQP"]["allDeterministicStarts"]
        for row in slsqp_rows:
            composition = norm(row["composition"])
            check(name + " SLSQP simplex " + row["start"], abs(composition.sum() - 1) <= 2e-12)
            check(name + " SLSQP objective " + row["start"], close(tpd(z, composition), row["tpd"], 2e-8))
        best = output["independentSLSQP"]["best"]
        best_x = norm(best["composition"])
        best_kkt = kkt_residual(z, best_x)
        check(name + " SLSQP best is minimum stored run", close(best["tpd"], min(row["tpd"] for row in slsqp_rows), 2e-12))
        check(name + " SLSQP KKT recomputation", best_kkt <= gates["kktTolerance"] and close(best_kkt, best["kktProjectedGradientInfinityNorm"], 2e-8))
        recomputed_validation = {
            "identityAtZ": abs(zero_tpd) <= gates["identityTolerance"],
            "tangentPlaneIdentity": abs(tangent_difference) <= gates["identityTolerance"],
            "finiteDifferenceTangentGradientAtZ": np.max(np.abs(gradient_at_z)) <= gates["gradientTolerance"],
            "gibbsDuhemChemicalPotentialConsistencyAtZ": consistency <= gates["chemicalPotentialConsistencyTolerance"],
            "boundaryApproach": boundary_pass,
            "slsqpKkt": best_kkt <= gates["kktTolerance"],
        }
        check(name + " stored validation booleans", output["validation"] == recomputed_validation)
        independent_search = minimize(
            lambda x: tpd(z, x),
            np.ones(6) / 6,
            method="SLSQP",
            bounds=[(floor, 1)] * 6,
            constraints={"type": "eq", "fun": lambda x: np.sum(x) - 1},
            options={"ftol": 1e-11, "maxiter": 80, "disp": False},
        )
        check(name + " independent SLSQP rerun success", independent_search.success)
        check(name + " independent SLSQP rerun objective", abs(tpd(z, independent_search.x) - best["tpd"]) <= 2e-5)

        split_rows = output["splitReseed"]["reseededStationarySplits"]
        metastable = False
        for row in split_rows:
            raffinate = norm(row["raffinate"])
            extract = norm(row["extract"])
            beta = float(row["betaExtract"])
            iso = float(np.max(np.abs(chemical_potential(raffinate) - chemical_potential(extract))))
            balance = float(np.max(np.abs((1 - beta) * raffinate + beta * extract - z)))
            reduction = gibbs(z) - ((1 - beta) * gibbs(raffinate) + beta * gibbs(extract))
            stationary = bool(row["solverSuccess"] and iso <= 2e-5 and balance <= 1e-8)
            admissible = bool(stationary and reduction > 1e-8 and 1e-8 < beta < 1 - 1e-8 and np.max(np.abs(raffinate - extract)) >= 1e-4)
            label = name + " split " + row["seed"]
            check(label + " isoactivity", close(iso, row["isoactivityLogResidual"], 2e-9))
            check(label + " balance", close(balance, row["materialBalanceMaxResidual"], 2e-9))
            check(label + " Gibbs reduction", close(reduction, row["gibbsReduction"], 2e-9))
            check(label + " stationary rule", stationary == row["stationary"])
            check(label + " admissibility rule", admissible == row["admissibleLowerGibbsPhaseSplit"])
            metastable = metastable or admissible
        check(name + " phase-metastability aggregate", metastable == output["splitReseed"]["phaseMetastabilityDemonstrated"] and metastable)
        check(name + " no full cascade branch overclaim", not output["splitReseed"]["fullCascadeAlternateBranchDemonstrated"] and "BRANCH_SELECTION_DRIVEN" not in output["classification"])

        cascade_residual, primary_r, primary_e, base_start, secondary_start = cascade_context(raw)
        starts = output["multistartCascade"]["starts"]
        check(name + " base-start hash", starts["baseStartSha256"] == hashlib.sha256(base_start.tobytes()).hexdigest())
        check(name + " secondary-start hash", starts["secondaryStartSha256"] == hashlib.sha256(secondary_start.tobytes()).hexdigest())
        runs = output["multistartCascade"]["runs"]
        expected_budgets = multi_cfg["sparseContinuationBudgets"]
        check(name + " multistart budget structure", len(runs) == 2 + len(expected_budgets))
        for index, run in enumerate(runs):
            log_flows = np.asarray(run["logFlowVariables"], float)
            residual_vector, raffinate, extract = cascade_residual(log_flows)
            maximum = float(np.max(np.abs(residual_vector)))
            rms = float(np.sqrt(np.mean(residual_vector ** 2)))
            product_difference = max(
                np.max(np.abs(raffinate[-1] - primary_r[-1])) / max(primary_r[-1].sum(), 1e-30),
                np.max(np.abs(extract[0] - primary_e[0])) / max(primary_e[0].sum(), 1e-30),
            )
            check(name + " cascade maximum " + run["run"], close(maximum, run["maximumResidual"], 2e-10))
            check(name + " cascade RMS " + run["run"], close(rms, run["rmsResidual"], 2e-10))
            check(name + " cascade product difference " + run["run"], close(product_difference, run["productDifferenceFromPrimary"], 2e-10))
            reshaped = residual_vector.reshape(multi_cfg["stageCount"], 12)
            family_values = {
                "scaledComponentBalances": reshaped[:, :6],
                "isoactivity": reshaped[:, 6:],
            }
            for family, values in family_values.items():
                reported_family = run["byEquationFamily"][family]
                check(name + " " + run["run"] + " " + family + " maximum", close(np.max(np.abs(values)), reported_family["maximum"], 2e-10))
                check(name + " " + run["run"] + " " + family + " RMS", close(np.sqrt(np.mean(values ** 2)), reported_family["rms"], 2e-10))
            for stage_index, stage_row in enumerate(run["byStage"]):
                block = reshaped[stage_index]
                balance_values, iso_values = block[:6], block[6:]
                check(name + " " + run["run"] + " stage index", stage_row["stageFromFeedEnd"] == stage_index + 1)
                check(name + " " + run["run"] + " stage balance maximum", close(np.max(np.abs(balance_values)), stage_row["balanceMaximum"], 2e-10))
                check(name + " " + run["run"] + " stage balance RMS", close(np.sqrt(np.mean(balance_values ** 2)), stage_row["balanceRms"], 2e-10))
                check(name + " " + run["run"] + " stage iso maximum", close(np.max(np.abs(iso_values)), stage_row["isoactivityMaximum"], 2e-10))
                check(name + " " + run["run"] + " stage iso RMS", close(np.sqrt(np.mean(iso_values ** 2)), stage_row["isoactivityRms"], 2e-10))
            closed = bool(run["solverSuccess"] and maximum <= 1e-8)
            expected_class = "PRIMARY_BRANCH" if closed and product_difference <= 1e-6 else ("DISTINCT_CLOSED_BRANCH" if closed else "UNRESOLVED")
            check(name + " cascade classification " + run["run"], expected_class == run["classification"])
            if index == 0:
                primary_interleaved = np.r_[primary_r, primary_e].reshape(2, multi_cfg["stageCount"], 6).transpose(1, 0, 2).reshape(-1)
                check(name + " persisted primary vector", np.max(np.abs(log_flows - np.log(primary_interleaved))) <= 2e-12)
        check(name + " original sparse budget", runs[1]["nfev"] <= expected_budgets[0])
        for i, budget in enumerate(expected_budgets):
            check(name + " sparse budget " + str(budget), runs[i + 1]["nfev"] <= budget)
        check(name + " dense budget", runs[-1]["nfev"] <= multi_cfg["denseFinalBudget"])
        persisted = output["multistartCascade"]["persistedTargets"]
        check(name + " primary residual persisted match", close(runs[0]["maximumResidual"], persisted["primaryMaximum"], 2e-10))
        check(name + " original secondary residual persisted match", close(runs[1]["maximumResidual"], persisted["secondary20Maximum"], 2e-7))

        base_only_total = ideal + base
        residual_rule = total_tpd < gates["negativeTpdThreshold"] and base_only_total >= gates["negativeTpdThreshold"]
        base_rule = base_only_total < gates["negativeTpdThreshold"]
        mismatch_rule = same_composition_difference > gates["optimizerAgreementTolerance"]
        check(name + " residual classification rule", ("RESIDUAL_AMENDMENT_DRIVEN" in output["classification"]) == residual_rule)
        check(name + " base classification rule", ("BASE_SURFACE_DRIVEN" in output["classification"]) == base_rule)
        check(name + " mismatch classification rule", ("TPD_IMPLEMENTATION_MISMATCH" in output["classification"]) == mismatch_rule)

    final_runs = [row["multistartCascade"]["runs"][-1] for row in results["scenarios"]]
    if all(row["classification"] == "PRIMARY_BRANCH" for row in final_runs):
        expected_prefix = "SEPARATE_PROXIMATE_FINDINGS"
    elif any(row["classification"] == "DISTINCT_CLOSED_BRANCH" for row in final_runs):
        expected_prefix = "POSSIBLY_LINKED_BUT_NOT_PROVEN"
    else:
        expected_prefix = "INDEPENDENT_EVIDENCE_TRACKS_UNRESOLVED"
    check("two-track synthesis decision rule", results["rootCauseSynthesis"]["relationship"].startswith(expected_prefix))

    passed = all(value for _, value in checks)
    verification = {
        "passed": passed,
        "checkCount": len(checks),
        "checks": [{"name": name, "passed": value} for name, value in checks],
    }
    (OUT / "verification.json").write_text(json.dumps(verification, indent=2) + "\n")
    manifest_files = [
        HERE / "protocol.json",
        HERE / "run.py",
        HERE / "verify.py",
        INPUT,
        AMEND,
        MODEL,
        OUT / "results.json",
        OUT / "report.md",
        OUT / "verification.json",
    ]
    manifest = {"files": {str(path.relative_to(ROOT)): sha(path) for path in manifest_files}}
    (OUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if not passed:
        failed = [name for name, value in checks if not value]
        raise SystemExit("Task 205 verification failed (fail closed): " + "; ".join(failed))


if __name__ == "__main__":
    main()