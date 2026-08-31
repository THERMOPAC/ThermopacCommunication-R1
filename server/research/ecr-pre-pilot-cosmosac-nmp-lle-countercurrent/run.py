"""Stage-1-authoritative coupled six-component counter-current cascade."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import subprocess
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
scipy = model.base.scipy


def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source_path(path):
    resolved = Path(path).resolve()
    try:
        return str(resolved.relative_to(ROOT))
    except ValueError:
        return str(resolved)


def validate_snapshot_with_application(path):
    completed = subprocess.run(
        [
            str(ROOT / "node_modules/.bin/tsx"),
            str(ROOT / "scripts/validate-ecr-pre-pilot-stage1.ts"),
            str(Path(path).resolve()),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise ValueError("STAGE1_APPLICATION_VALIDATION_FAILED:" + detail)
    return json.loads(completed.stdout.strip().splitlines()[-1])


def validate_authoritative_stage1_snapshot(snapshot):
    if snapshot.get("schemaVersion") != "ECR_PRE_PILOT_STAGE_1_V1":
        raise ValueError(
            "STAGE1_AUTHORITY_INVALID: complete immutable ECR_PRE_PILOT_STAGE_1_V1 snapshot required"
        )
    if not isinstance(snapshot.get("immutableHash"), str) or not snapshot["immutableHash"]:
        raise ValueError("STAGE1_AUTHORITY_INVALID: immutableHash is required")
    if snapshot.get("sixComponentCosmoSacBinding", {}).get("status") != "VERIFIED":
        raise ValueError("STAGE1_SIX_COMPONENT_BINDING_NOT_VERIFIED")
    if snapshot["sixComponentCosmoSacBinding"].get("componentOrder") != list(model.FAMILIES):
        raise ValueError("STAGE1_SIX_COMPONENT_ORDER_MISMATCH")
    basis_qualification = snapshot.get("sixComponentCosmoSacBasis", {}).get("qualification", {})
    if basis_qualification.get("profileSemanticsGate") != "PASSED":
        raise ValueError("STAGE1_SIX_COMPONENT_PROFILE_SEMANTICS_NOT_VERIFIED")
    components = snapshot["sixComponentCosmoSacBinding"].get("components", [])
    if len(components) != len(model.FAMILIES):
        raise ValueError("STAGE1_SIX_COMPONENT_BINDING_INCOMPLETE")
    for expected_family, component in zip(model.FAMILIES, components):
        profile = component.get("profile", {})
        if (
            component.get("family") != expected_family
            or component.get("blocker") is not None
            or profile.get("available") is not True
            or not isinstance(profile.get("sha256"), str)
        ):
            raise ValueError(
                "STAGE1_SIX_COMPONENT_PROFILE_INVALID:" + expected_family
            )
    pa_component = components[model.FAMILIES.index("PA")]
    if (
        pa_component.get("identity")
        != "4,4'-Bis(alpha,alpha-dimethylbenzyl)diphenylamine"
        or pa_component.get("inchiKey") != "UJAWGGOCYUPCPS-UHFFFAOYSA-N"
        or pa_component.get("profile", {}).get("sha256")
        != "474736e63fd99749f7dad0cd5569959e9dd47a8a2dfe55b6ef80642ed3d1c03e"
    ):
        raise ValueError("STAGE1_MANDATORY_PA_PROFILE_MISMATCH")
    stage1 = snapshot.get("stage1")
    if not isinstance(stage1, dict):
        raise ValueError("STAGE1_AUTHORITY_INVALID: stage1 object is required")
    required = (
        "operatingTemperatureC",
        "saturatesWt",
        "monoAromaticsWt",
        "diAromaticsWt",
        "polyAromaticsWt",
        "polarAromaticsWt",
        "nmpInFeedWt",
        "rrboDensityKgM3",
        "rrboDynamicViscosityCp",
        "rrboInterfacialTensionMnM",
        "nmpPurityWt",
        "nmpWaterWt",
        "nmpTemperatureC",
        "nmpDensityKgM3",
        "nmpDynamicViscosityCp",
        "solventOilRatio",
        "maximumStages",
    )
    missing = [key for key in required if key not in stage1]
    if missing:
        raise ValueError(
            "STAGE1_AUTHORITY_INCOMPLETE: missing saved fields " + ",".join(missing)
        )
    positive_properties = (
        "rrboDensityKgM3",
        "rrboDynamicViscosityCp",
        "rrboInterfacialTensionMnM",
        "nmpDensityKgM3",
        "nmpDynamicViscosityCp",
    )
    if any(not math.isfinite(float(stage1[key])) or float(stage1[key]) <= 0
           for key in positive_properties):
        raise ValueError("STAGE1_PHYSICAL_PROPERTIES_INVALID")
    return stage1


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


def local_stability(names, temperature_k, composition, parameters, protocol):
    return model.tangent_stability(
        names, temperature_k, composition, parameters, protocol
    )


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


def solve_cascade(
    stage_count, temperature_k, feed, solvent, parameters, protocol, seed,
    previous=None, dense_polish=False,
):
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

    jacobian_pattern = scipy.sparse.lil_matrix(
        (12 * stage_count, 12 * stage_count), dtype=int
    )
    for stage in range(stage_count):
        rows = slice(12 * stage, 12 * (stage + 1))
        jacobian_pattern[rows, 12 * stage:12 * (stage + 1)] = 1
        if stage > 0:
            jacobian_pattern[rows, 12 * (stage - 1):12 * (stage - 1) + 6] = 1
        if stage < stage_count - 1:
            jacobian_pattern[rows, 12 * (stage + 1) + 6:12 * (stage + 2)] = 1
    jacobian_pattern = jacobian_pattern.tocsr()

    if previous is None:
        base_start = initial_vector(stage_count, total, seed)
    else:
        previous_r, previous_e = previous
        previous_count = len(previous_r)
        mapped = []
        for stage in range(stage_count):
            position = stage / max(stage_count - 1, 1)
            coordinate = position * max(previous_count - 1, 0)
            lower = int(math.floor(coordinate))
            upper = min(lower + 1, previous_count - 1)
            fraction = coordinate - lower
            mapped.extend((1 - fraction) * previous_r[lower] + fraction * previous_r[upper])
            mapped.extend((1 - fraction) * previous_e[lower] + fraction * previous_e[upper])
        base_start = np.log(np.maximum(np.asarray(mapped), 1e-12))
    starts = [
        base_start,
        base_start + np.tile(np.linspace(-0.015, 0.015, 12), stage_count),
    ]
    primary = least_squares(
            residual,
            starts[0],
            bounds=(math.log(1e-12), math.log(10 * total)),
            xtol=1e-11,
            ftol=1e-11,
            gtol=1e-11,
            max_nfev=200 if dense_polish else (20 if stage_count >= 8 else 750),
            **({
                "jac_sparsity": jacobian_pattern,
                "tr_solver": "lsmr",
            } if stage_count >= 8 and not dense_polish else {}),
        )
    # Every trial receives an independently perturbed deterministic start.
    # A bounded sparse solve keeps branch evidence explicit: nonclosure blocks
    # acceptance rather than being silently represented as zero difference.
    secondary = least_squares(
        residual,
        starts[1],
        bounds=(math.log(1e-12), math.log(10 * total)),
        xtol=1e-11,
        ftol=1e-11,
        gtol=1e-11,
        max_nfev=20,
        jac_sparsity=jacobian_pattern,
        tr_solver="lsmr",
    )
    solutions = [primary, secondary]
    best = primary
    raffinate, extract = unpack(best.x)
    alternate_raffinate, alternate_extract = unpack(secondary.x)
    product_difference = max(
        np.max(np.abs(raffinate[-1] - alternate_raffinate[-1])) / max(raffinate[-1].sum(), 1e-30),
        np.max(np.abs(extract[0] - alternate_extract[0])) / max(extract[0].sum(), 1e-30),
    )
    secondary_residual = float(np.max(np.abs(secondary.fun)))
    secondary_closed = bool(
        secondary.success
        and secondary_residual <= gates["maximumScaledEquationResidual"]
    )
    stages = []
    accepted = bool(
        best.success
        and np.max(np.abs(best.fun)) <= gates["maximumScaledEquationResidual"]
        and secondary_closed
    )
    for stage in range(stage_count):
        r_in = feed if stage == 0 else raffinate[stage - 1]
        e_in = solvent if stage == stage_count - 1 else extract[stage + 1]
        x = raffinate[stage] / raffinate[stage].sum()
        y = extract[stage] / extract[stage].sum()
        mu_residual = np.log(x) + model.total_lngamma(model.FAMILIES, temperature_k, x, parameters) - np.log(y) - model.total_lngamma(model.FAMILIES, temperature_k, y, parameters)
        component_balance = r_in + e_in - raffinate[stage] - extract[stage]
        stability_r = local_stability(
            model.FAMILIES, temperature_k, x, parameters, protocol
        )
        stability_e = local_stability(
            model.FAMILIES, temperature_k, y, parameters, protocol
        )
        post_tpd_r = model.tpd_search(
            model.FAMILIES, temperature_k, x, parameters, protocol,
            include_local_seeds=True, refine_best_global_and_local=True,
        )
        post_tpd_e = model.tpd_search(
            model.FAMILIES, temperature_k, y, parameters, protocol,
            include_local_seeds=True, refine_best_global_and_local=True,
        )
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
            and stability_r["minimumEigenvalue"] >= gates["minimumLocalStabilityCurvature"]
            and stability_e["minimumEigenvalue"] >= gates["minimumLocalStabilityCurvature"]
            and stability_r["independentReconstructionsAgree"]
            and stability_e["independentReconstructionsAgree"]
            and stability_r["stepSizeConverged"]
            and stability_e["stepSizeConverged"]
            and post_tpd_r["minimum"] >= gates["postSplitTpdThreshold"]
            and post_tpd_e["minimum"] >= gates["postSplitTpdThreshold"]
            and post_tpd_r["allRefinementsAccepted"]
            and post_tpd_e["allRefinementsAccepted"]
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
            "postSplitTpdSearch": {"raffinate": post_tpd_r, "extract": post_tpd_e},
            "stageGibbsReduction": gibbs_reduction,
            "accepted": stage_accepted,
        })
    accepted = accepted and product_difference <= gates["multistartProductRelativeTolerance"]
    overall_balance = feed + solvent - raffinate[-1] - extract[0]
    blockers = []
    if not best.success or np.max(np.abs(best.fun)) > gates["maximumScaledEquationResidual"]:
        blockers.append({
            "code": "COUPLED_SOLVER_CLOSURE_FAILED",
            "maximumScaledEquationResidual": float(np.max(np.abs(best.fun))),
            "limit": gates["maximumScaledEquationResidual"],
        })
    if product_difference > gates["multistartProductRelativeTolerance"]:
        blockers.append({
            "code": "MULTISTART_BRANCH_REPRODUCTION_FAILED",
            "calculated": float(product_difference),
            "limit": gates["multistartProductRelativeTolerance"],
        })
    if not secondary_closed:
        blockers.append({
            "code": "MULTISTART_SECONDARY_CLOSURE_FAILED",
            "maximumScaledEquationResidual": secondary_residual,
            "limit": gates["maximumScaledEquationResidual"],
        })
    unstable_stages = [
        stage["stageFromFeedEnd"] for stage in stages
        if (
            stage["localPostSplitStability"]["raffinate"]["minimumEigenvalue"]
            < gates["minimumLocalStabilityCurvature"]
            or stage["localPostSplitStability"]["extract"]["minimumEigenvalue"]
            < gates["minimumLocalStabilityCurvature"]
            or not stage["localPostSplitStability"]["raffinate"]["independentReconstructionsAgree"]
            or not stage["localPostSplitStability"]["extract"]["independentReconstructionsAgree"]
            or not stage["localPostSplitStability"]["raffinate"]["stepSizeConverged"]
            or not stage["localPostSplitStability"]["extract"]["stepSizeConverged"]
        )
    ]
    if unstable_stages:
        blockers.append({
            "code": "POST_SPLIT_LOCAL_STABILITY_FAILED",
            "stagesFromFeedEnd": unstable_stages,
            "limit": gates["minimumLocalStabilityCurvature"],
        })
    negative_tpd_stages = [
        stage["stageFromFeedEnd"] for stage in stages
        if (
            stage["postSplitTpdSearch"]["raffinate"]["minimum"] < gates["postSplitTpdThreshold"]
            or stage["postSplitTpdSearch"]["extract"]["minimum"] < gates["postSplitTpdThreshold"]
        )
    ]
    if negative_tpd_stages:
        blockers.append({
            "code": "POST_SPLIT_TPD_STABILITY_FAILED",
            "stagesFromFeedEnd": negative_tpd_stages,
            "limit": gates["postSplitTpdThreshold"],
        })
    failed_tpd_refinement_stages = [
        stage["stageFromFeedEnd"] for stage in stages
        if (
            not stage["postSplitTpdSearch"]["raffinate"]["allRefinementsAccepted"]
            or not stage["postSplitTpdSearch"]["extract"]["allRefinementsAccepted"]
        )
    ]
    if failed_tpd_refinement_stages:
        blockers.append({
            "code": "POST_SPLIT_TPD_REFINEMENT_FAILED",
            "stagesFromFeedEnd": failed_tpd_refinement_stages,
        })
    failed_gibbs_stages = [
        stage["stageFromFeedEnd"] for stage in stages
        if stage["stageGibbsReduction"] < gates["minimumStageGibbsReduction"]
    ]
    if failed_gibbs_stages:
        blockers.append({
            "code": "STAGE_GIBBS_REDUCTION_FAILED",
            "stagesFromFeedEnd": failed_gibbs_stages,
            "limit": gates["minimumStageGibbsReduction"],
        })
    return {
        "stageCount": stage_count,
        "solverSuccess": bool(best.success),
        "solverMessage": str(best.message),
        "maximumScaledEquationResidual": float(np.max(np.abs(best.fun))),
        "multistartProductRelativeDifference": float(product_difference),
        "multistartEvidence": {
            "startCount": 2,
            "startDefinition": "continuation/base plus deterministic component-log-flow perturbation [-0.015,+0.015]",
            "primary": {
                "solverSuccess": bool(primary.success),
                "maximumScaledEquationResidual": float(np.max(np.abs(primary.fun))),
            },
            "secondary": {
                "solverSuccess": bool(secondary.success),
                "maximumScaledEquationResidual": secondary_residual,
            },
            "bothStartsClosed": secondary_closed and bool(
                primary.success
                and np.max(np.abs(primary.fun)) <= gates["maximumScaledEquationResidual"]
            ),
        },
        "accepted": accepted,
        "acceptanceBlockers": blockers,
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
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--stage1-snapshot",
        type=Path,
        required=True,
        help="Validated user-saved ECR_PRE_PILOT_STAGE_1_V1 snapshot exported from ecr_pre_pilot_designs.input_data",
    )
    parser.add_argument(
        "--equilibrium-result",
        type=Path,
        help="Six-component equilibrium result generated from the exact same Stage-1 snapshot",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Validate Stage-1 authority, mandatory profiles, inlet streams, and solvent representation without solving",
    )
    args = parser.parse_args()
    protocol = load_json(HERE / "protocol.json")
    snapshot_path = args.stage1_snapshot.resolve()
    validated_authority = validate_snapshot_with_application(snapshot_path)
    snapshot = load_json(snapshot_path)
    stage1 = validate_authoritative_stage1_snapshot(snapshot)
    if validated_authority["immutableHash"] != snapshot["immutableHash"]:
        raise ValueError("STAGE1_VALIDATOR_RESULT_MISMATCH")
    temperature_c = float(stage1["operatingTemperatureC"])
    temperature_k = temperature_c + 273.15
    maximum_stages = int(stage1["maximumStages"])
    if maximum_stages < 1 or float(maximum_stages) != float(stage1["maximumStages"]):
        raise ValueError("STAGE1_INVALID_NT_RANGE: maximumStages must be a positive integer")
    feed_mass = np.asarray([
        stage1["saturatesWt"], stage1["monoAromaticsWt"], stage1["diAromaticsWt"],
        stage1["polyAromaticsWt"], stage1["polarAromaticsWt"], stage1["nmpInFeedWt"],
    ])
    if not np.isclose(feed_mass.sum(), 100.0, rtol=0.0, atol=1e-10):
        raise ValueError("STAGE1_INVALID_FEED_COMPOSITION: six-component feed wt% must sum to 100")
    solvent_oil_ratio = float(stage1["solventOilRatio"])
    nmp_purity_wt = float(stage1["nmpPurityWt"])
    nmp_water_wt = float(stage1["nmpWaterWt"])
    if solvent_oil_ratio < 0:
        raise ValueError("STAGE1_INVALID_SOLVENT_RATIO: solventOilRatio must be non-negative")
    if not (0.0 < nmp_purity_wt <= 100.0 and 0.0 <= nmp_water_wt <= 100.0):
        raise ValueError("STAGE1_INVALID_FRESH_SOLVENT_SPECIFICATION")
    fresh_solvent_mass = 100.0 * solvent_oil_ratio
    fresh_nmp_mass = fresh_solvent_mass
    overall_inlet_nmp_mass = float(feed_mass[model.FAMILIES.index("NMP")]) + fresh_nmp_mass
    if fresh_solvent_mass <= 0.0 or fresh_nmp_mass <= 0.0 or overall_inlet_nmp_mass <= 0.0:
        raise ValueError("STAGE1_SOLVENT_SIDE_NMP_INLET_MUST_BE_POSITIVE")
    if args.preflight_only:
        print(json.dumps({
            "status": "PASS",
            "projectReference": stage1["projectReference"],
            "componentOrder": list(model.FAMILIES),
            "oilFeedNmpMassBasis": float(feed_mass[model.FAMILIES.index("NMP")]),
            "freshSolventNmpMassBasis": fresh_nmp_mass,
            "overallInletNmpMassBasis": overall_inlet_nmp_mass,
            "modeledComponentCount": len(model.FAMILIES),
            "freshSolventModelingBasis": "PURE_NMP_FROM_SAVED_SOLVENT_OIL_RATIO",
            "nmpPurityAndWaterSpecificationOnly": {
                "nmpPurityWt": nmp_purity_wt,
                "nmpWaterWt": nmp_water_wt,
            },
            "flowConvention": protocol["flowConvention"],
            "stageRange": {"minimum": 1, "maximum": maximum_stages},
            "temperatureC": temperature_c,
        }, sort_keys=True))
        return
    if args.equilibrium_result is None:
        raise ValueError("MATCHING_SIX_COMPONENT_EQUILIBRIUM_RESULT_REQUIRED")
    prior = load_json(args.equilibrium_result.resolve())
    if prior.get("stage1Authority", {}).get("snapshotSha256") != sha256(snapshot_path):
        raise ValueError("STAGE1_AUTHORITY_MISMATCH: equilibrium result uses another Stage-1 snapshot")
    p_map = prior["model"]["parameters"]
    parameters = np.asarray([p_map[name] for name in model.PARAMETER_NAMES])
    molecular_weights = np.asarray([
        prior["stage1Authority"]["charge"]["molecularWeightsGmol"][name]
        for name in model.FAMILIES
    ], dtype=float)
    solvent_mass = np.asarray([
        0, 0, 0, 0, 0, fresh_nmp_mass
    ], dtype=float)
    feed = feed_mass / molecular_weights
    solvent = solvent_mass / molecular_weights
    targets = prior["stage1Authority"]["charge"]["targets"]
    prior_charge = prior["stage1Authority"]["charge"]
    if not np.isclose(float(prior_charge["temperatureK"]), temperature_k, rtol=0.0, atol=1e-10):
        raise ValueError("STAGE1_AUTHORITY_MISMATCH: equilibrium seed temperature differs from saved Stage 1")
    prior_feed = prior_charge["feedMassPercent"]
    if any(not np.isclose(float(prior_feed[name]), feed_mass[index], rtol=0.0, atol=1e-10)
           for index, name in enumerate(model.FAMILIES)):
        raise ValueError("STAGE1_AUTHORITY_MISMATCH: equilibrium seed feed differs from saved Stage 1")
    if not np.isclose(
        float(prior_charge["freshSolventMassBasis"]),
        fresh_solvent_mass,
        rtol=0.0,
        atol=1e-10,
    ):
        raise ValueError("STAGE1_AUTHORITY_MISMATCH: equilibrium seed solvent charge differs from saved Stage 1")
    results = {
        "schemaVersion": "1.0.0",
        "executionMode": "USER_SAVED_STAGE1_RESEARCH_DIAGNOSTIC",
        "modelIdentity": protocol["modelIdentity"],
        "componentOrder": list(model.FAMILIES),
        "governance": protocol["governance"],
        "stage1Authority": {
            "source": "USER_SAVED_ECR_PRE_PILOT_STAGE_1_V1",
            "projectReference": stage1["projectReference"],
            "snapshotPath": source_path(snapshot_path),
            "snapshotSha256": sha256(snapshot_path),
            "oilFeedMassBasis": dict(zip(model.FAMILIES, feed_mass.tolist())),
            "freshSolventMassBasis": dict(zip(model.FAMILIES, solvent_mass.tolist())),
            "overallInletMassBalanceBasis": dict(zip(
                model.FAMILIES,
                (feed_mass + solvent_mass).tolist(),
            )),
            "freshSolventModelingBasis": "PURE_NMP_FROM_SAVED_SOLVENT_OIL_RATIO",
            "nmpPurityAndWaterSpecificationOnly": {
                "nmpPurityWt": nmp_purity_wt,
                "nmpWaterWt": nmp_water_wt,
            },
            "operatingTemperatureC": temperature_c,
            "rrboPhysicalProperties": {
                "densityKgM3": float(stage1["rrboDensityKgM3"]),
                "dynamicViscosityCp": float(stage1["rrboDynamicViscosityCp"]),
                "interfacialTensionMnM": float(stage1["rrboInterfacialTensionMnM"]),
                "temperatureC": temperature_c,
            },
            "nmpPhysicalProperties": {
                "densityKgM3": float(stage1["nmpDensityKgM3"]),
                "dynamicViscosityCp": float(stage1["nmpDynamicViscosityCp"]),
                "temperatureC": float(stage1["nmpTemperatureC"]),
            },
            "solventOilMassRatio": solvent_oil_ratio,
            "stageRange": {"minimum": 1, "maximum": maximum_stages},
            "targets": targets,
        },
        "flowConvention": protocol["flowConvention"],
        "temperatureCases": [],
    }
    seed = {
        "raffinate": np.asarray(prior["stage1Prediction"]["flash"]["raffinate"]),
        "extract": np.asarray(prior["stage1Prediction"]["flash"]["extract"]),
        "beta": prior["stage1Prediction"]["flash"]["betaExtract"],
        "mw": molecular_weights,
    }
    for selected_temperature_k in [temperature_k]:
        trials = []
        first_passing = None
        previous = None
        for stage_count in range(1, maximum_stages + 1):
            trial = solve_cascade(
                stage_count, selected_temperature_k, feed, solvent, parameters,
                protocol, seed, previous,
            )
            candidate_solution = trial.pop("_streamSolution")
            if trial["maximumScaledEquationResidual"] <= protocol["numericalAcceptance"]["maximumScaledEquationResidual"]:
                previous = candidate_solution
            values, checks, calculable_pass = product_metrics(
                trial.pop("_raffinateProduct"), feed_mass, molecular_weights, targets
            )
            trial["productMetrics"] = values
            trial["targetCompliance"] = checks
            trial["allCalculableTargetsPass"] = bool(trial["accepted"] and calculable_pass)
            if trial["allCalculableTargetsPass"] and first_passing is None:
                first_passing = stage_count
            trials.append(trial)
            print(
                json.dumps({
                    "temperatureC": selected_temperature_k - 273.15,
                    "stageCount": stage_count,
                    "accepted": trial["accepted"],
                    "maximumScaledEquationResidual": trial["maximumScaledEquationResidual"],
                }),
                flush=True,
            )
        results["temperatureCases"].append({
            "temperatureC": selected_temperature_k - 273.15,
            "temperatureK": selected_temperature_k,
            "trials": trials,
            "firstStageCountMeetingAllCalculableTargets": first_passing,
            "theoreticalStageVerdict": cascade_verdict(trials, first_passing),
        })
    results["decision"] = {
        "numericalCascadeResult": "RESEARCH_DIAGNOSTIC_ONLY",
        "fullSixComponentModelQualification": "NOT_QUALIFIED",
        "releaseEligible": False,
        "reason": "The amended equilibrium model fails the frozen blind composition-RMSD qualification gate; stationary phase pairs are independently gated by full tangent Hessians and locally seeded post-split TPD.",
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result_path = OUTPUT / "results.json"
    result_path.write_text(json.dumps(json_safe(results), indent=2, sort_keys=True) + "\n")
    write_report(results, OUTPUT / "report.md")
    manifest = {
        "sources": {
            "stage1Snapshot": source_path(snapshot_path),
            "amendmentResults": source_path(args.equilibrium_result),
        },
        "protocolSha256": sha256(HERE / "protocol.json"),
        "stage1SnapshotSha256": sha256(snapshot_path),
        "amendmentModelSha256": sha256(AMENDMENT / "model.py"),
        "amendmentResultsSha256": sha256(args.equilibrium_result.resolve()),
        "runnerSha256": sha256(HERE / "run.py"),
        "resultsSha256": sha256(result_path),
        "reportSha256": sha256(OUTPUT / "report.md"),
    }
    (OUTPUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": "PASS", "output": str(result_path), "decisions": [
        {"temperatureC": case["temperatureC"], "verdict": case["theoreticalStageVerdict"]}
        for case in results["temperatureCases"]
    ]}))


def write_report(results, path):
    gates = load_json(HERE / "protocol.json")["numericalAcceptance"]
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
        lines += ["| NT | Primary closed | Both starts closed | Accepted | SAT wt% | Aromatics wt% | PA wt% | Recovery % | NMP in raffinate wt% |", "|---:|:---:|:---:|:---:|---:|---:|---:|---:|---:|"]
        for trial in case["trials"]:
            v = trial["productMetrics"]
            lines.append(
                f"| {trial['stageCount']} | {'YES' if trial['maximumScaledEquationResidual'] <= 1e-8 else 'NO'} | "
                f"{'YES' if trial['multistartEvidence']['bothStartsClosed'] else 'NO'} | "
                f"{'YES' if trial['accepted'] else 'NO'} | "
                f"{v['raffinateSaturatesWtNmpFree']:.4f} | {v['raffinateTotalAromaticsWtNmpFree']:.4f} | "
                f"{v['raffinatePolarAromaticsWtNmpFree']:.4f} | {v['nmpFreeHydrocarbonRecoveryPct']:.4f} | "
                f"{v['nmpInTotalRaffinateWt']:.4f} |"
            )
        stable_closure = [
            trial["stageCount"] for trial in case["trials"]
            if trial["maximumScaledEquationResidual"] <= 1e-8
        ]
        solver_failed = [
            trial["stageCount"] for trial in case["trials"]
            if trial["maximumScaledEquationResidual"] > 1e-8
        ]
        phase_evidence = [
            (
                stage["localPostSplitStability"][phase],
                stage["postSplitTpdSearch"][phase],
            )
            for trial in case["trials"]
            for stage in trial["stages"]
            for phase in ("raffinate", "extract")
        ]
        negative_tpd_count = sum(
            search["minimum"] < gates["postSplitTpdThreshold"]
            for _, search in phase_evidence
        )
        step_convergence_failures = sum(
            not stability["stepSizeConverged"]
            for stability, _ in phase_evidence
        )
        reconstruction_failures = sum(
            not stability["independentReconstructionsAgree"]
            for stability, _ in phase_evidence
        )
        minimum_eigenvalue = min(
            stability["minimumEigenvalue"] for stability, _ in phase_evidence
        )
        minimum_tpd = min(search["minimum"] for _, search in phase_evidence)
        lines += [
            "",
            f"- Primary coupled equation closure passed for NT = {stable_closure}.",
            f"- Primary coupled equation closure failed for NT = {solver_failed}.",
            f"- Both deterministic starts closed for NT = {[trial['stageCount'] for trial in case['trials'] if trial['multistartEvidence']['bothStartsClosed']]}.",
            "- Every candidate raffinate and extract has a complete five-dimensional tangent-Hessian eigenspectrum from free-energy differences and an independent chemical-potential-Jacobian reconstruction, with three persisted step sizes.",
            "- Every post-split TPD search combines global simplex seeds with explicit local perturbations around the returned phase.",
            f"- Stability evidence covers {len(phase_evidence)} phases: minimum tangent eigenvalue = {minimum_eigenvalue:.6e}; minimum post-split TPD = {minimum_tpd:.6e}.",
            f"- Formal stability failures: negative TPD = {negative_tpd_count}; step-size convergence = {step_convergence_failures}; independent reconstruction agreement = {reconstruction_failures}.",
            "- Any negative tangent eigenvalue, derivative-reconstruction disagreement, or negative post-split TPD formally downgrades that stationary phase pair; all product metrics remain diagnostic only.",
            (
                f"- The first accepted target-satisfying trial is NT = {case['firstStageCountMeetingAllCalculableTargets']}."
                if case["firstStageCountMeetingAllCalculableTargets"] is not None
                else f"- No accepted target-satisfying trial exists within the saved Stage-1 range NT = 1–{case['trials'][-1]['stageCount']}."
            ),
            "",
            "Complete incoming/outgoing flows, six-component mole/mass profiles, K values, acceptance blockers, and closure residuals for every stage are in `results.json`.",
            "",
        ]
    lines += [
        "## Governance decision", "",
        "`FULL_SIX_COMPONENT_MODEL_QUALIFICATION = NOT_QUALIFIED`", "",
        "These cascade values are numerical research diagnostics, not validated process-design results. The prior single-stage stationary split is not accepted as a stable phase pair unless the full tangent-Hessian and locally seeded TPD gates pass. The frozen blind LLE composition-RMSD verdict remains failed and unchanged. Sulfur remains `NOT_CALCULABLE`; PA transfer is provisional and is not sulfur removal.",
    ]
    path.write_text("\n".join(lines) + "\n")


def cascade_verdict(trials, first_passing):
    if first_passing is not None:
        return f"TARGETS_ACHIEVED_AT_NT_{first_passing}"
    unresolved_primary = [
        trial["stageCount"] for trial in trials
        if trial["maximumScaledEquationResidual"] > 1e-8
    ]
    unresolved_multistart = [
        trial["stageCount"] for trial in trials
        if not trial.get("multistartEvidence", {}).get("bothStartsClosed", False)
    ]
    if unresolved_primary or unresolved_multistart:
        return "NO_ACCEPTED_SOLUTION_FOUND_WITHIN_NT_LIMIT_MULTISTART_OR_HIGHER_TRIALS_UNRESOLVED"
    return "TARGETS_NOT_ACHIEVED_WITHIN_NT_LIMIT"


if __name__ == "__main__":
    main()