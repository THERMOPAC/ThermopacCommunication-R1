#!/usr/bin/env python3
"""Frozen, deterministic global-TPD evidence harness for Task 215 endpoints."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import itertools
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/task-216-mono-rich-global-stability"
TASK215 = ROOT / "server/research/task-215-multistart-resolution"
TASK206 = ROOT / "server/research/task-206-stability-constrained-amendment"
TASK213 = ROOT / "server/research/task-213-mono-rich-qualification"
AMEND = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
COUNTER = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"
WORKER = ROOT / "server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py"


def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def digest(value): return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
def norm(x, floor=1e-10):
    x = np.maximum(np.asarray(x, float), floor)
    return x / x.sum()


def load_worker():
    spec = importlib.util.spec_from_file_location("task216_worker", WORKER)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def simplex_lattice(denominator, n=6):
    for cuts in itertools.combinations(range(denominator + n - 1), n - 1):
        marks = (-1,) + cuts + (denominator + n - 1,)
        yield np.asarray([marks[i + 1] - marks[i] - 1 for i in range(n)], float) / denominator


def result_status(result):
    return {
        "success": bool(result.success), "status": int(result.status),
        "message": str(result.message), "iterations": int(getattr(result, "nit", 0) or 0),
        "functionEvaluations": int(getattr(result, "nfev", 0) or 0),
        "objective": float(result.fun),
    }


def qualify_phase(
    cc, helper, names, temperature, reference, parameters,
    protocol, counter_protocol, identity,
):
    """Use an independently assembled TPD objective and three deterministic routes."""
    global np
    np = cc.np
    from scipy.optimize import minimize
    methods = protocol["methods"]; floor = methods["compositionFloor"]; h = methods["finiteDifferenceStep"]
    reference = norm(reference, floor)
    def mu(x):  # chemical potentials, deliberately not tpd_search
        x = norm(x, floor)
        return np.log(x) + cc.model.total_lngamma(names, temperature, x, parameters)
    reference_mu = mu(reference)
    def objective(x):
        x = norm(x, floor)
        return float(x @ (mu(x) - reference_mu))
    def projected_gradient(x):
        value = mu(x) - reference_mu
        return value[:-1] - value[-1]
    def logit_gradient(x):
        x = norm(x, floor)
        difference = mu(x) - reference_mu
        return x[:-1] * (difference[:-1] - float(x @ difference))
    def simplex_kkt(x):
        """Active-set KKT residual for x_i >= floor and sum(x_i) = 1."""
        x = norm(x, floor)
        difference = mu(x) - reference_mu
        free = x > 10 * floor
        if not np.any(free):
            free[int(np.argmax(x))] = True
        multiplier = float(np.mean(difference[free]))
        free_residual = float(np.max(np.abs(difference[free] - multiplier)))
        bound_residual = (
            float(np.max(np.maximum(multiplier - difference[~free], 0.0)))
            if np.any(~free) else 0.0
        )
        return max(free_residual, bound_residual)
    def fd_gradient(x):
        x = norm(x, floor); out = []
        for i in range(5):
            step = min(h, x[i] * .2, x[-1] * .2)
            if step <= floor: return None
            d = np.zeros(6); d[i] = step; d[-1] = -step
            out.append((objective(x+d)-objective(x-d))/(2*step))
        return np.asarray(out)
    def logits(z):
        a = np.r_[z, 0.0]; a -= a.max(); e = np.exp(a); return e/e.sum()
    def log_objective(z): return objective(logits(z))
    def fd_logit_gradient(z):
        values = []
        for i in range(5):
            d = np.zeros(5); d[i] = h
            values.append((log_objective(z+d)-log_objective(z-d))/(2*h))
        return np.asarray(values)
    lattice = list(simplex_lattice(methods["globalLatticeDenominator"]))
    # Full simplex includes vertices; objective protects logarithms at the frozen floor.
    lattice_values = [objective(x) for x in lattice]
    order = np.argsort(lattice_values)[:min(8, len(lattice))]
    local = []
    for index in order:
        center = lattice[index]
        # denominator-8 cells adjacent to each best denominator-4 cell.
        for x in simplex_lattice(methods["localRefinementDenominator"]):
            if np.max(np.abs(x-center)) <= 1.0 / methods["globalLatticeDenominator"] + 1e-15:
                local.append(x)
    local = list({tuple(x.tolist()): x for x in local}.values())
    reference_logits = np.log(reference[:-1] / reference[-1])
    phase_local = []
    for coordinate in range(5):
        for sign in (-1.0, 1.0):
            perturbation = np.zeros(5)
            perturbation[coordinate] = sign * methods["perturbationMagnitude"]
            phase_local.append(logits(reference_logits + perturbation))
    seeds = [("global-simplex", lattice[i]) for i in order] + [("reference", reference)] + [("phase-local-log-ratio", x) for x in phase_local]
    candidates = [(objective(x), x, kind) for kind, x in seeds] + [(objective(x), x, "denominator-8-local-refinement") for x in local]
    _, start, start_class = min(candidates, key=lambda row: row[0])
    bfgs = minimize(log_objective, np.log(norm(start)[:-1]/norm(start)[-1]), method="BFGS",
                    options={"gtol": 1e-10, "maxiter": 500})
    constraints = {"type": "eq", "fun": lambda x: float(x.sum()-1), "jac": lambda x: np.ones(6)}
    bounds = [(floor, 1.0)] * 6
    slsqp = minimize(objective, start, method="SLSQP", bounds=bounds, constraints=constraints,
                     options={"ftol": 1e-12, "maxiter": 1000})
    trust = minimize(objective, start, method="trust-constr", bounds=cc.scipy.optimize.Bounds(floor, 1.0),
                     constraints=cc.scipy.optimize.LinearConstraint(np.ones((1,6)), 1, 1),
                     options={"gtol": 1e-10, "xtol": 1e-12, "maxiter": 500})
    optimized = [
        ("BFGS-log-ratio", norm(logits(bfgs.x)), result_status(bfgs)),
        ("SLSQP-simplex", norm(slsqp.x), result_status(slsqp)),
        ("trust-constr-simplex", norm(trust.x), result_status(trust)),
    ]
    optimized_candidates = [
        (objective(x), x, label) for label, x, _ in optimized
    ]
    minimum, accepted, method = min(
        optimized_candidates + candidates, key=lambda row: row[0]
    )
    analytic_ref, finite_ref = projected_gradient(reference), fd_gradient(reference)
    analytic_min, finite_min = projected_gradient(accepted), fd_gradient(accepted)
    analytic_ref_logit = logit_gradient(reference)
    finite_ref_logit = fd_logit_gradient(reference_logits)
    accepted_logits = np.log(accepted[:-1] / accepted[-1])
    analytic_logit, finite_logit = logit_gradient(accepted), fd_logit_gradient(accepted_logits)
    perturbations = []
    for i in range(5):
        d = np.zeros(6); d[i] = methods["perturbationMagnitude"]; d[-1] = -d[i]
        perturbations.append({"coordinate": i, "plus": objective(accepted+d), "minus": objective(accepted-d)})
    # A two-phase split with overall composition fixed is an explicit lower-G witness.
    split = []
    witness_fractions = list(methods["splitWitnessFractions"])
    adaptive = methods["adaptiveSplitWitness"]
    increasing = accepted > reference
    if np.any(increasing):
        maximum_feasible = float(np.min(
            (reference[increasing] - floor)
            / (accepted[increasing] - reference[increasing])
        ))
        adaptive_fraction = min(
            adaptive["maximumFraction"],
            adaptive["feasibilitySafetyFactor"] * maximum_feasible,
        )
        if (
            adaptive_fraction >= adaptive["minimumFraction"]
            and all(
                abs(adaptive_fraction - fraction) > 1e-15
                for fraction in witness_fractions
            )
        ):
            witness_fractions.append(adaptive_fraction)
    for fraction in witness_fractions:
        other = (reference - fraction * accepted) / (1.0 - fraction)
        feasible = bool(np.all(other >= floor))
        if feasible:
            def gibbs(x):
                x = norm(x, floor)
                return float(x @ mu(x))
            difference = float(
                (1.0-fraction)*gibbs(other) + fraction*gibbs(accepted)
                - gibbs(reference)
            )
        else:
            difference = None
        split.append({"epsilon": fraction, "feasible": feasible,
                      "otherComposition": norm(other, floor).tolist() if feasible else None,
                      "gibbsDifference": difference})
    helper_result = helper(
        names, temperature, reference, parameters, counter_protocol,
        include_local_seeds=True, refine_best_global_and_local=True,
    )
    local_result = cc.local_stability(
        names, temperature, reference, parameters, counter_protocol,
    )
    helper_minimum = float(helper_result.get("minimum", math.nan))
    helper_composition = norm(
        helper_result.get("minimizingComposition", reference), floor,
    )
    helper_reproduced_minimum = objective(helper_composition)
    gradient_error = lambda a,b: None if b is None else float(np.max(np.abs(a-b)))
    boundary = bool(np.min(accepted) <= 10*floor)
    tolerance = methods["acceptanceTolerances"]
    routes = [
        {"method": label, "composition": x, **status,
         "simplexProjectedKktInfinityNorm": float(np.max(np.abs(projected_gradient(x)))),
         "simplexKktInfinityNorm": simplex_kkt(x),
         "logitKktInfinityNorm": float(np.max(np.abs(logit_gradient(x))))}
        for label, x, status in optimized
    ]
    accepted_routes = [route for route in routes if route["success"]
                       and route["objective"] < protocol["postSplitTpdThreshold"]
                        and route["simplexKktInfinityNorm"] <= tolerance["simplexProjectedKktInfinityNorm"]
                       and route["logitKktInfinityNorm"] <= tolerance["logitKktInfinityNorm"]]
    optimizer_agreement = bool(len(accepted_routes) >= 2 and max(
        route["objective"] for route in accepted_routes
    ) - min(route["objective"] for route in accepted_routes)
        <= tolerance["optimizerAgreement"])
    helper_objective_reproduced = bool(
        math.isfinite(helper_minimum)
        and abs(helper_reproduced_minimum - helper_minimum)
        <= tolerance["productionHelperObjectiveReproduction"]
    )
    gradient_agreement = bool(
        gradient_error(analytic_ref_logit, finite_ref_logit) is not None
        and gradient_error(analytic_ref_logit, finite_ref_logit)
        <= tolerance["analyticFiniteDifferenceGradientMaximumAbsoluteDifference"]
        and gradient_error(analytic_logit, finite_logit) is not None
        and gradient_error(analytic_logit, finite_logit)
        <= tolerance["analyticFiniteDifferenceGradientMaximumAbsoluteDifference"])
    perturbation_local_minimum = all(
        check["plus"] >= minimum-tolerance["localPerturbationObjectiveTolerance"]
        and check["minus"] >= minimum-tolerance["localPerturbationObjectiveTolerance"]
        for check in perturbations
    )
    lower_gibbs_witness = any(
        row["feasible"] and row["gibbsDifference"] < tolerance["lowerGibbsWitness"]
        for row in split
    )
    criteria = {
        "directMinimumNegative": bool(minimum < protocol["postSplitTpdThreshold"]),
        "productionHelperNegative": bool(helper_minimum < protocol["postSplitTpdThreshold"]),
        "twoIndependentAcceptedOptimizerRoutesAgreeNegative": optimizer_agreement,
        "productionHelperObjectiveReproducedIndependently": helper_objective_reproduced,
        "simplexAndLogitKktAccepted": bool(
            simplex_kkt(accepted) <= tolerance["simplexProjectedKktInfinityNorm"]
            and np.max(np.abs(logit_gradient(accepted))) <= tolerance["logitKktInfinityNorm"]),
        "analyticFiniteDifferenceGradientAgreement": gradient_agreement,
        "deterministicPerturbationLocalMinimum": perturbation_local_minimum,
        "lowerGibbsWitness": lower_gibbs_witness,
    }
    reproducible_negative = all(criteria.values())
    if reproducible_negative:
        classification = ("GENUINE_LOWER_GIBBS_BOUNDARY_BASIN" if boundary
                          else "GENUINE_LOWER_GIBBS_BASIN")
    elif minimum < protocol["postSplitTpdThreshold"]: classification = "OPTIMIZER_REFINEMENT_FAILURE"
    elif boundary: classification = "BOUNDARY_ARTIFACT"
    elif helper_result.get("minimum", 0) >= protocol["postSplitTpdThreshold"]: classification = "LOCAL_HESSIAN_ONLY_ARTIFACT"
    else: classification = "STABLE_PHASE"
    return {
        **identity, "referenceComposition": reference.tolist(), "modelIdentity": "COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL",
        "modelSha256": protocol["pinnedInputs"]["amendmentModelSha256"],
        "parameterVectorSha256": digest([float(v) for v in parameters.tolist()]),
        "directTangentPlaneObjective": "sum trial_i*(mu_trial_i-mu_reference_i)",
        "productionHelper": {
            "minimum": helper_minimum,
            "minimizingComposition": helper_composition.tolist(),
            "independentlyAssembledTpdAtReportedComposition":
                float(helper_reproduced_minimum),
            "independentReproductionAbsoluteDifference":
                float(abs(helper_reproduced_minimum - helper_minimum)),
            "allRefinementsAccepted": helper_result.get("allRefinementsAccepted"),
            "raw": helper_result,
        },
        "deterministicCounts": {"denominator4FullSimplex": len(lattice), "denominator8LocalRefinement": len(local), "globalSimplexSeeds": len(order), "referenceSeeds": 1, "phaseLocalSeeds": len(phase_local), "totalSeedObjectives": len(candidates)},
        "bestLattice": {"objective": float(min(lattice_values)), "composition": lattice[int(np.argmin(lattice_values))].tolist(), "selectedStartClass": start_class},
        "seedObjectives": [
            {"class": kind, "composition": norm(x, floor).tolist(),
             "objective": float(objective(x))}
            for kind, x in seeds
        ],
        "optimizers": [{**route, "composition": route["composition"].tolist()} for route in routes],
        "productionLocalStability": local_result,
        "minimum": float(minimum), "minimumComposition": accepted.tolist(), "minimumMethod": method,
        "projectedKktInfinityNorm": float(np.max(np.abs(projected_gradient(accepted)))),
        "simplexKktInfinityNorm": simplex_kkt(accepted),
        "logitKktInfinityNorm": float(np.max(np.abs(logit_gradient(accepted)))),
        "gradientAgreement": {"referenceSimplexMaximumAbsoluteDifference": gradient_error(analytic_ref, finite_ref), "minimumSimplexMaximumAbsoluteDifference": gradient_error(analytic_min, finite_min), "referenceLogitMaximumAbsoluteDifference": gradient_error(analytic_ref_logit, finite_ref_logit), "minimumLogitMaximumAbsoluteDifference": gradient_error(analytic_logit, finite_logit), "finiteDifferenceStep": h},
        "splitWitness": split, "deterministicPerturbations": perturbations,
        "tpdDecomposition": {"basePlusIdeal": float(objective(accepted) - accepted @ (cc.model.residual_feature_matrix(accepted, temperature) - cc.model.residual_feature_matrix(reference, temperature)) @ parameters), "residualAmendment": float(accepted @ (cc.model.residual_feature_matrix(accepted, temperature) - cc.model.residual_feature_matrix(reference, temperature)) @ parameters), "complete": float(minimum)},
        "reproductionCriteria": criteria, "classification": classification,
        "fullyReproducedNegative": reproducible_negative,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-export", type=Path, default=Path("/tmp/job170.json"))
    args = parser.parse_args()
    protocol = json.loads((HERE/"protocol.json").read_text())
    pinned = {
        "task215ProtocolSha256": TASK215/"protocol.json", "task215ResultsSha256": ROOT/".agents/outputs/task-215-multistart-resolution/results.json",
        "task215ProvenanceSha256": ROOT/".agents/outputs/task-215-multistart-resolution/provenance-manifest.json",
        "task206ProtocolSha256": TASK206/"protocol.json", "task206ResultsSha256": ROOT/".agents/outputs/task-206-stability-constrained-amendment/results.json",
        "task213ProtocolSha256": TASK213/"protocol.json", "task213ResultsSha256": ROOT/".agents/outputs/task-213-mono-rich-qualification/results.json",
        "amendmentModelSha256": AMEND/"model.py", "amendmentProtocolSha256": AMEND/"protocol.json",
        "amendmentResultsSha256": ROOT/".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
        "countercurrentProtocolSha256": COUNTER/"protocol.json",
        "countercurrentRunnerSha256": COUNTER/"run.py",
        "productionWorkerSha256": WORKER,
        "cosmoSacRunnerSha256": ROOT/"server/research/ecr-pre-pilot-cosmosac/run.py",
        "cosmoSacProvenanceSha256": ROOT/"server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json",
        "sixComponentProvenanceSha256": ROOT/"server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json",
        "profileVerificationSha256": ROOT/"server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profile-verification.json",
        "multiTemperatureLleDataSha256": ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json",
    }
    for key, path in pinned.items():
        if sha(path) != protocol["pinnedInputs"][key]: raise ValueError("PINNED_HASH_MISMATCH:"+key)
    source = json.loads(args.job_export.read_text())
    ref = protocol["referenceJob"]
    if digest(source.get("input_snapshot")) != ref["inputSnapshotSha256"] or digest(source.get("result_snapshot")) != ref["priorResultSnapshotSha256"]: raise ValueError("REFERENCE_JOB_SNAPSHOT_HASH_MISMATCH")
    if source["result_snapshot"].get("engine",{}).get("engineHash") != ref["priorEngineHash"] or source["result_snapshot"].get("model",{}).get("modelHash") != ref["priorModelHash"]: raise ValueError("REFERENCE_JOB_MODEL_HASH_MISMATCH")
    worker = load_worker(); cc = worker.cc; np = cc.np
    helper, local = cc.model.tpd_search, cc.local_stability  # retain originals before stubbing closure
    request = source["input_snapshot"]; snapshot, stage1, snapshot_hash = worker.stage1_from_request(request)
    _, parameters, flash, charge = worker.get_equilibrium(request, stage1)
    mw = np.asarray([charge["molecularWeightsGmol"][x] for x in worker.FAMILIES], float)
    feed = np.asarray([stage1[x] for x in ("saturatesWt","monoAromaticsWt","diAromaticsWt","polyAromaticsWt","polarAromaticsWt","nmpInFeedWt")],float)/mw
    solvent = np.asarray([0,0,0,0,0,100*float(stage1["solventOilRatio"])],float)/mw
    seed = {"raffinate":np.asarray(flash["raffinate"]),"extract":np.asarray(flash["extract"]),"beta":float(flash["betaExtract"]),"mw":mw}
    cc.local_stability = lambda *_a,**_k: {"minimumEigenvalue":0.0,"independentReconstructionsAgree":True,"stepSizeConverged":True}
    cc.model.tpd_search = lambda *_a,**_k: {"minimum":0.0,"allRefinementsAccepted":True}
    task215_frozen = json.loads(
        (ROOT/".agents/outputs/task-215-multistart-resolution/results.json").read_text()
    )
    frozen_trials = {row["stageCount"]: row for row in task215_frozen["trials"]}
    previous=None; endpoints=[]; solver_evidence=[]
    for nt in range(1, 11):
        trial=cc.solve_cascade(nt,float(stage1["operatingTemperatureC"])+273.15,feed,solvent,parameters,cc.load_json(COUNTER/"protocol.json"),seed,previous)
        streams=trial.pop("_streamSolution"); trial.pop("_raffinateProduct")
        if trial["residualClosureStatus"] == "CLOSED": previous=streams
        frozen_trial = frozen_trials.get(nt)
        if frozen_trial is None:
            raise RuntimeError("PINNED_TASK215_TRIAL_MISSING:"+str(nt))
        solver_evidence.append({
            "stageCount": nt,
            "rerunPrimaryClosed": trial["multistartEvidence"]["primary"]["residualClosureStatus"] == "CLOSED",
            "rerunSecondaryClosed": trial["multistartEvidence"]["secondary"]["residualClosureStatus"] == "CLOSED",
            "rerunBranchReproduced": bool(trial["multistartEvidence"]["branchReproduced"]),
            "pinnedPrimaryClosed": bool(frozen_trial["bothStartsClosed"]),
            "pinnedBranchReproduced": bool(frozen_trial["branchReproduced"]),
            "rerunPrimaryResidual": trial["multistartEvidence"]["primary"]["maximumScaledEquationResidual"],
            "rerunSecondaryResidual": trial["multistartEvidence"]["secondary"]["maximumScaledEquationResidual"],
            "pinnedProductRelativeDifference": frozen_trial["multistartProductRelativeDifference"],
            "rerunProductRelativeDifference": trial["multistartProductRelativeDifference"],
        })
        r,e=streams
        for stage in range(nt):
            for phase, stream in (("raffinate",r[stage]),("extract",e[stage])):
                endpoints.append((stream / stream.sum(), {
                    "trialStageCount": nt, "stageFromFeedEnd": stage + 1,
                    "phase": phase,
                }))
        print(f"TASK216_CASCADE_PROGRESS {nt} 10", file=sys.stderr, flush=True)
    cc.local_stability = local; cc.model.tpd_search = helper
    phases = []
    for index, (composition, identity) in enumerate(endpoints, start=1):
        phases.append(qualify_phase(
            cc, helper, worker.FAMILIES,
            float(stage1["operatingTemperatureC"]) + 273.15, composition,
            parameters, protocol, cc.load_json(COUNTER/"protocol.json"), identity,
        ))
        print(
            f"TASK216_ACTIVE_TPD_PROGRESS {index} {len(endpoints)}",
            file=sys.stderr, flush=True,
        )
    if len(phases) != protocol["expectedReturnedPhaseEndpoints"]: raise RuntimeError("PHASE_ENDPOINT_COVERAGE_FAILED")
    if not all(row["rerunPrimaryClosed"] and row["rerunSecondaryClosed"]
               and row["rerunBranchReproduced"] and row["pinnedPrimaryClosed"]
               and row["pinnedBranchReproduced"] for row in solver_evidence):
        raise RuntimeError("TASK215_SOLVER_CLOSURE_OR_BRANCH_REPRODUCTION_FAILED")
    constrained=json.loads((ROOT/".agents/outputs/task-206-stability-constrained-amendment/results.json").read_text())
    task213 = json.loads((ROOT/".agents/outputs/task-213-mono-rich-qualification/results.json").read_text())
    validation_pass=all(x["status"]=="PASS" for x in constrained["frozenValidation"].values())
    candidate_parameters = np.asarray([
        constrained["parameters"][name] for name in worker.model.PARAMETER_NAMES
    ], float)
    candidate_comparison = []
    for index, (composition, identity) in enumerate(endpoints, start=1):
        candidate_comparison.append(qualify_phase(
            cc, helper, worker.FAMILIES,
            float(stage1["operatingTemperatureC"]) + 273.15,
            composition, candidate_parameters, protocol,
            cc.load_json(COUNTER/"protocol.json"),
            {**identity, "comparisonModel": "TASK206_STABILITY_CONSTRAINED_CANDIDATE"},
        ))
        print(
            f"TASK216_CANDIDATE_TPD_PROGRESS {index} {len(endpoints)}",
            file=sys.stderr, flush=True,
        )
    failures=[p for p in phases if p["fullyReproducedNegative"]]
    negative_or_unresolved=[
        p for p in phases
        if (
            p["minimum"] < protocol["postSplitTpdThreshold"]
            or p["productionHelper"]["minimum"] < protocol["postSplitTpdThreshold"]
        )
    ]
    direct_six_component = bool(task213["molecularAndPhaseEquilibriumEvidence"]["directMatchingSixComponentEvidenceAvailable"])
    task213_blockers = list(task213["blockers"])
    blockers=(["FROZEN_COMPOSITION_VALIDATION_FAILED"] if not validation_pass else []) + (["POST_SPLIT_TPD_STABILITY_FAILED"] if negative_or_unresolved else []) + (["DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING"] if not direct_six_component else []) + task213_blockers
    blockers=list(dict.fromkeys(blockers))
    result={"schemaVersion":"1.0.0","analysis":protocol["analysis"],**protocol["governance"],"referenceJob":{**ref,"stage1ImmutableHash":snapshot_hash},"postSplitTpdThreshold":protocol["postSplitTpdThreshold"],"solverEvidence":solver_evidence,"coverage":{"expectedPhaseEndpoints":protocol["expectedReturnedPhaseEndpoints"],"returnedPhaseEndpoints":len(phases),"failingPhaseCount":len(failures),"negativeOrUnresolvedPhaseCount":len(negative_or_unresolved),"failingPhases":[{"trialStageCount":x["trialStageCount"],"stageFromFeedEnd":x["stageFromFeedEnd"],"phase":x["phase"],"minimum":x["minimum"]} for x in failures]},"task206CandidateComparison":{"frozenValidation":constrained["frozenValidation"],"sameEndpointFullGlobalSearches":candidate_comparison,"qualifiedForThisHarness":False,"reason":"Task 206 frozen validation fails; candidate is comparison-only."},"carriedTopologyAndTieLineGates":{"task206And213":"UNCHANGED_PINNED","minimumTopologyRecall":protocol["frozenGates"]["minimumTopologyRecall"],"maximumTieLineCompositionRmsd":protocol["frozenGates"]["maximumTieLineCompositionRmsd"]},"task213Evidence":{"directMatchingSixComponentEvidenceAvailable":direct_six_component,"preservedBlockers":task213_blockers},"phases":phases,"blockers":blockers,"status":"BLOCKED_FAIL_CLOSED" if blockers else "EVIDENCE_COMPLETE","qualified":not blockers}
    OUT.mkdir(parents=True,exist_ok=True); rp=OUT/"results.json"; rp.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    report=[
        "# Task 216 MONO-rich global stability harness", "",
        "Status: `"+result["status"]+"`", "",
        f"All {len(phases)} exact returned Task-215 phase endpoints were independently assessed with complete coverage at the unchanged -1e-8 threshold.",
        f"Fully reproduced lower-Gibbs minima: {len(failures)}.",
        f"Negative or unresolved phase searches: {len(negative_or_unresolved)}.",
        "Task 206 is comparison-only and cannot qualify because its frozen composition validation fails.", "",
        "## Per-phase evidence", "",
        "| N_T | Stage | Phase | Direct minimum | Classification | simplex KKT | logit KKT | max gradient error | Fully reproduced |",
        "|---:|---:|---|---:|---|---:|---:|---:|---|",
    ]
    for row in phases:
        gradients = row["gradientAgreement"]
        error = max(x for x in (
            gradients["minimumSimplexMaximumAbsoluteDifference"],
            gradients["minimumLogitMaximumAbsoluteDifference"],
        ) if x is not None)
        report.append(
            f"| {row['trialStageCount']} | {row['stageFromFeedEnd']} | {row['phase']} | "
            f"{row['minimum']:.6g} | {row['classification']} | "
            f"{row['simplexKktInfinityNorm']:.3g} | {row['logitKktInfinityNorm']:.3g} | "
            f"{error:.3g} | {row['fullyReproducedNegative']} |"
        )
    report += ["", "## Blockers", *["- `"+x+"`" for x in blockers]]
    (OUT/"report.md").write_text("\n".join(report)+"\n")
    (OUT/"provenance-manifest.json").write_text(json.dumps({"runnerSha256":sha(HERE/"run.py"),"protocolSha256":sha(HERE/"protocol.json"),"resultsSha256":sha(rp),"reportSha256":sha(OUT/"report.md"),"pinnedInputs":protocol["pinnedInputs"],"jobExport":str(args.job_export),"jobInputSnapshotSha256":ref["inputSnapshotSha256"],"jobPriorResultSnapshotSha256":ref["priorResultSnapshotSha256"]},indent=2,sort_keys=True)+"\n")
    print(json.dumps({"status":result["status"],"coverage":len(phases),"blockers":blockers}))

if __name__ == "__main__": main()