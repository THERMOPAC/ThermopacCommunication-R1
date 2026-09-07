#!/usr/bin/env python3
"""Isolated seven-component simultaneous two-film interface solver.

The transport equations are a preliminary mixture-averaged Fickian closure.
They enforce a molar-average diffusive reference frame (sum(J_i) = 0), but are
not a Maxwell-Stefan model and are not release-qualified for RRBO/NMP.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True

PROTOCOL = "ECR_JOB_B_INTERFACE_V1"
VERSION = "1.0.0"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
PHASE_CONFIGURATIONS = (
    "nmp-continuous-rrbo-dispersed",
    "rrbo-continuous-nmp-dispersed",
)
LOG_FLOOR = 1e-14
MAX_SCALED_FLUX_RESIDUAL = 1e-8
ABSOLUTE_FLUX_TOLERANCE = 1e-12
MAXIMUM_FUNCTION_EVALUATIONS = 2500

ROOT = Path(os.environ.get(
    "JOB_B_INTERFACE_RUNTIME_ROOT", Path(__file__).resolve().parents[3]
)).resolve()
MANIFEST_PATH = ROOT / "job-b-interface-manifest.json"
ADAPTER_ROOT = Path(os.environ.get(
    "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT", ""
)).resolve()
if os.environ.get("JOB_B_INTERFACE_PROTOCOL") != PROTOCOL:
    raise RuntimeError("JOB_B_INTERFACE_LAUNCH_PROTOCOL_MISMATCH")
if os.environ.get("STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL") != (
    "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1"
):
    raise RuntimeError("JOB_B_INTERFACE_ADAPTER_PROTOCOL_MISMATCH")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def contained(root, relative):
    candidate = (root / relative).resolve()
    if root not in candidate.parents:
        raise RuntimeError("JOB_B_INTERFACE_MANIFEST_PATH_INVALID")
    return candidate


manifest = json.loads(MANIFEST_PATH.read_text())
unsigned_manifest = dict(manifest)
unsigned_manifest.pop("artifactSha256", None)
if (
    manifest.get("schemaVersion") != "ECR_JOB_B_INTERFACE_RUNTIME_MANIFEST_V1"
    or manifest.get("protocol") != PROTOCOL
    or manifest.get("version") != VERSION
    or manifest.get("componentOrder") != list(COMPONENTS)
    or hashlib.sha256(canonical(unsigned_manifest).encode()).hexdigest()
    != manifest.get("artifactSha256")
):
    raise RuntimeError("JOB_B_INTERFACE_MANIFEST_IDENTITY_INVALID")
records = []
for record in manifest.get("files", []):
    content = contained(ROOT, record["path"]).read_bytes()
    if len(content) != record["bytes"] or hashlib.sha256(content).hexdigest() != record["sha256"]:
        raise RuntimeError("JOB_B_INTERFACE_RUNTIME_FILE_HASH_MISMATCH")
    records.append(f'{record["path"]}:{record["bytes"]}:{record["sha256"]}')
if (
    len(records) != manifest.get("fileCount")
    or hashlib.sha256("\n".join(records).encode()).hexdigest()
    != manifest.get("aggregateSha256")
):
    raise RuntimeError("JOB_B_INTERFACE_RUNTIME_AGGREGATE_MISMATCH")

adapter_pin = manifest.get("stage4Adapter", {})
adapter_manifest_path = ADAPTER_ROOT / "stage4-seven-component-adapter-manifest.json"
if (
    sha_file(adapter_manifest_path) != adapter_pin.get("manifestSha256")
    or json.loads(adapter_manifest_path.read_text()).get("artifactSha256")
    != adapter_pin.get("artifactSha256")
):
    raise RuntimeError("JOB_B_INTERFACE_STAGE4_ADAPTER_PIN_MISMATCH")


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("JOB_B_INTERFACE_ADAPTER_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Importing this exact old worker performs its own adapter and base-manifest
# verification before exposing the unmodified scientific.build_engine.
adapter = load(
    ADAPTER_ROOT / "server/ecr-pre-pilot/stage4-seven-component-adapter/worker.py",
    "verified_stage4_adapter_for_job_b_interface",
)
scientific = adapter.scientific


def hash_number(value):
    mantissa, exponent = format(float(value), ".16e").lower().split("e")
    return f"{mantissa}e{int(exponent)}"


def hash_value(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError("JOB_B_INTERFACE_NON_FINITE_HASH_VALUE")
        return {"$number": hash_number(value)}
    if isinstance(value, list):
        return [hash_value(item) for item in value]
    if isinstance(value, dict):
        return {key: hash_value(item) for key, item in value.items()}
    raise ValueError("JOB_B_INTERFACE_UNHASHABLE_VALUE")


def digest(value):
    return hashlib.sha256(canonical(hash_value(value)).encode()).hexdigest()


def vector(value, code, *, normalized=False, positive=False):
    if not isinstance(value, list) or len(value) != 7:
        raise ValueError(code)
    result = []
    for item in value:
        if isinstance(item, bool):
            raise ValueError(code)
        number = float(item)
        if not math.isfinite(number) or number < 0 or (positive and number <= 0):
            raise ValueError(code)
        result.append(number)
    if normalized and abs(sum(result) - 1.0) > 1e-10:
        raise ValueError(f"{code}_NOT_NORMALIZED")
    return result


def mono_audit(search):
    return (
        isinstance(search, dict)
        and search.get("explicitMonoRichBasinSearch", {})
        .get("allRequiredSearchesAccepted") is True
    )


def compact_tpd(value):
    return {
        "minimum": value["minimum"],
        "classification": value["classification"],
        "allRefinementsAccepted": value["allRefinementsAccepted"],
        "ambiguityTriggered": value["ambiguityTriggered"],
        "escalationUsed": value["escalationUsed"],
        "explicitMonoRichBasinSearch": value["explicitMonoRichBasinSearch"],
    }


def solve(request):
    allowed = {
        "protocol", "operation", "componentOrder", "T",
        "x_bulk_continuous", "x_bulk_dispersed", "kc", "kd", "CtC", "CtD",
        "phase_config",
    }
    if any(key not in allowed for key in request):
        raise ValueError("JOB_B_INTERFACE_UNSUPPORTED_FIELD")
    if request.get("componentOrder") != list(COMPONENTS):
        raise ValueError("JOB_B_INTERFACE_COMPONENT_ORDER_MISMATCH")
    xb_c = vector(
        request.get("x_bulk_continuous"),
        "JOB_B_INTERFACE_INVALID_CONTINUOUS_BULK", normalized=True,
    )
    xb_d = vector(
        request.get("x_bulk_dispersed"),
        "JOB_B_INTERFACE_INVALID_DISPERSED_BULK", normalized=True,
    )
    kc = vector(request.get("kc"), "JOB_B_INTERFACE_INVALID_KC", positive=True)
    kd = vector(request.get("kd"), "JOB_B_INTERFACE_INVALID_KD", positive=True)
    temperature = float(request.get("T", math.nan))
    ctc, ctd = float(request.get("CtC", math.nan)), float(request.get("CtD", math.nan))
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("JOB_B_INTERFACE_INVALID_T")
    if not math.isfinite(ctc) or ctc <= 0 or not math.isfinite(ctd) or ctd <= 0:
        raise ValueError("JOB_B_INTERFACE_INVALID_FROZEN_BULK_CONCENTRATION")
    phase_config = request.get("phase_config")
    if phase_config not in PHASE_CONFIGURATIONS:
        raise ValueError("JOB_B_INTERFACE_INVALID_PHASE_CONFIGURATION")

    temporary, engine, integrity, runtime = scientific.build_engine(temperature, 0.0)
    np, scipy, gates = engine.np, engine.scipy, engine.gates
    xb_c_np, xb_d_np = np.asarray(xb_c), np.asarray(xb_d)
    kcct, kdct = np.asarray(kc) * ctc, np.asarray(kd) * ctd
    flux_scale = np.maximum(np.maximum(kcct, kdct), ABSOLUTE_FLUX_TOLERANCE)
    total_bound = float(2.0 * np.sum(kcct + kdct))

    def softmax(log_ratios):
        y = np.r_[log_ratios, 0.0]
        y -= np.max(y)
        exp = np.exp(y)
        return exp / np.sum(exp)

    def logits(composition):
        safe = np.maximum(np.asarray(composition), LOG_FLOOR)
        safe /= np.sum(safe)
        return np.log(safe[:-1] / safe[-1])

    def evaluate(unknown):
        xi_c, xi_d, n_total = (
            softmax(unknown[:6]), softmax(unknown[6:12]), float(unknown[12])
        )
        mu_delta = engine.mu(xi_c, temperature) - engine.mu(xi_d, temperature)
        raw_c = kcct * (xb_c_np - xi_c)
        raw_d = kdct * (xi_d - xb_d_np)
        j_c = raw_c - xi_c * np.sum(raw_c)
        j_d = raw_d - xi_d * np.sum(raw_d)
        n_c = j_c + xi_c * n_total
        n_d = j_d + xi_d * n_total
        flux_delta = n_c - n_d
        independent = np.r_[mu_delta, flux_delta[:6] / flux_scale[:6]]
        return independent, xi_c, xi_d, n_total, j_c, j_d, n_c, n_d, flux_delta

    nmp_rich = np.asarray((.01, .01, .01, .005, .005, .88, .08))
    rrbo_rich = np.asarray((.72, .12, .06, .025, .015, .05, .01))
    oriented = (
        (nmp_rich, rrbo_rich)
        if phase_config == "nmp-continuous-rrbo-dispersed"
        else (rrbo_rich, nmp_rich)
    )
    starts = [
        ("ORIENTED_PHASE_TEMPLATE", *oriented),
        ("FROZEN_BULK_BOUNDARIES", xb_c_np, xb_d_np),
        ("ORIENTED_TEMPLATE_BULK_C", oriented[0], xb_d_np),
        ("ORIENTED_BULK_D_TEMPLATE", xb_c_np, oriented[1]),
    ]
    perturbation = np.linspace(-0.02, 0.02, 6)
    starts += [
        ("ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS",
         softmax(logits(oriented[0]) + perturbation),
         softmax(logits(oriented[1]) - perturbation)),
        ("ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS",
         softmax(logits(oriented[0]) - perturbation),
         softmax(logits(oriented[1]) + perturbation)),
    ]
    diagnostics, candidates = [], []
    lower = np.r_[np.full(12, -35.0), -total_bound]
    upper = np.r_[np.full(12, 35.0), total_bound]
    try:
        for label, seed_c, seed_d in starts:
            x0 = np.r_[logits(seed_c), logits(seed_d), 0.0]
            result = scipy.optimize.least_squares(
                lambda value: evaluate(value)[0], x0, bounds=(lower, upper),
                method="trf", jac="2-point", max_nfev=MAXIMUM_FUNCTION_EVALUATIONS,
                xtol=1e-11, ftol=1e-11, gtol=1e-11, x_scale="jac",
            )
            values = evaluate(result.x)
            _, xi_c, xi_d, n_total, j_c, j_d, n_c, n_d, delta = values
            mu_delta = engine.mu(xi_c, temperature) - engine.mu(xi_d, temperature)
            singular_values = np.linalg.svd(result.jac, compute_uv=False)
            rank_tolerance = (
                max(result.jac.shape) * np.finfo(float).eps * singular_values[0]
                if len(singular_values) and singular_values[0] > 0 else math.inf
            )
            row = {
                "startClass": label,
                "optimizerSuccess": bool(result.success),
                "optimizerStatus": int(result.status),
                "functionEvaluations": int(result.nfev),
                "numericalJacobianRank": int(np.sum(singular_values > rank_tolerance)),
                "requiredNumericalJacobianRank": 13,
                "cost": float(result.cost),
                "maximumIsoactivityLogResidual": float(np.max(np.abs(mu_delta))),
                "maximumFluxEqualityResidualMolM2S": float(np.max(np.abs(delta))),
                "maximumScaledFluxEqualityResidual": float(
                    np.max(np.abs(delta) / flux_scale)
                ),
                "maximumInterfaceCompositionSeparation": float(
                    np.max(np.abs(xi_c - xi_d))
                ),
                "continuousDiffusiveSumResidualMolM2S": float(abs(np.sum(j_c))),
                "dispersedDiffusiveSumResidualMolM2S": float(abs(np.sum(j_d))),
                "continuousTotalFluxIdentityResidualMolM2S": float(
                    abs(np.sum(n_c) - n_total)
                ),
                "dispersedTotalFluxIdentityResidualMolM2S": float(
                    abs(np.sum(n_d) - n_total)
                ),
            }
            diagnostics.append(row)
            candidates.append(((
                max(row["maximumIsoactivityLogResidual"]
                    / gates["maximumIsoactivityLogResidual"],
                    row["maximumScaledFluxEqualityResidual"]
                    / MAX_SCALED_FLUX_RESIDUAL),
                row["cost"], label,
            ), result, values, row))

        ordered_candidates = sorted(candidates, key=lambda item: item[0])
        eligible = []
        assessed = []
        for _, result, values, row in ordered_candidates:
            _, xi_c, xi_d, n_total, j_c, j_d, n_c, n_d, delta = values
            orientation = (
                xi_c[5] > xi_d[5]
                if phase_config == "nmp-continuous-rrbo-dispersed"
                else xi_d[5] > xi_c[5]
            )
            numerical = (
                bool(result.success)
                and row["numericalJacobianRank"] == 13
                and row["maximumIsoactivityLogResidual"]
                <= gates["maximumIsoactivityLogResidual"]
                and row["maximumScaledFluxEqualityResidual"]
                <= MAX_SCALED_FLUX_RESIDUAL
            )
            separated = (
                row["maximumInterfaceCompositionSeparation"]
                >= gates["minimumPhaseCompositionSeparation"]
            )
            assessment = {
                "startClass": row["startClass"],
                "numericalAccepted": numerical,
                "phaseSeparationAccepted": separated,
                "phaseOrientationAccepted": bool(orientation),
            }
            assessed.append(assessment)
            if numerical and separated and orientation:
                eligible.append((result, values, row, assessment))

        reproduction_tolerance = gates["multistartProductRelativeTolerance"]
        selected = None
        for primary_index, primary in enumerate(eligible):
            _, primary_values, _, _ = primary
            primary_state = np.r_[
                primary_values[1], primary_values[2], primary_values[3]
            ]
            for reproduction in eligible[primary_index + 1:]:
                _, reproduction_values, _, _ = reproduction
                reproduction_state = np.r_[
                    reproduction_values[1], reproduction_values[2],
                    reproduction_values[3],
                ]
                difference = float(np.max(
                    np.abs(primary_state - reproduction_state)
                    / np.maximum(np.maximum(
                        np.abs(primary_state), np.abs(reproduction_state)
                    ), 1.0)
                ))
                if difference <= reproduction_tolerance:
                    selected = (primary, reproduction, difference)
                    break
            if selected is not None:
                break

        if selected is not None:
            primary, reproduction, reproduction_difference = selected
            _, values, row, assessment = primary
            _, xi_c, xi_d, _, _, _, _, _, _ = values
            local = {
                "continuous": engine.local_stability(xi_c, temperature),
                "dispersed": engine.local_stability(xi_d, temperature),
            }
            post = {
                "continuous": engine.routine_tpd(
                    xi_c, temperature, refine_best_global_and_local=True
                ),
                "dispersed": engine.routine_tpd(
                    xi_d, temperature, refine_best_global_and_local=True
                ),
            }
            stable = all(
                local[phase]["minimumEigenvalue"]
                >= gates["minimumLocalStabilityCurvature"]
                and local[phase]["stepSizeConverged"]
                and post[phase]["minimum"] >= gates["postSplitTpdThreshold"]
                and post[phase]["allRefinementsAccepted"]
                and mono_audit(post[phase])
                for phase in ("continuous", "dispersed")
            )
            assessment.update({
                "endpointStabilityAccepted": stable,
                "localStability": local,
                "postInterfaceTpd": {
                    phase: compact_tpd(post[phase])
                    for phase in ("continuous", "dispersed")
                },
            })
            if stable:
                selected = (
                    values, row, assessment, reproduction[2]["startClass"],
                    reproduction_difference,
                )
            else:
                selected = None

        body = {
            "operation": "SOLVE_INTERFACE",
            "temperatureK": temperature,
            "componentOrder": list(COMPONENTS),
            "phaseConfiguration": phase_config,
            "bulkBoundary": {
                "continuousMoleFractions": xb_c,
                "dispersedMoleFractions": xb_d,
                "continuousTotalMolarConcentrationMolM3": ctc,
                "dispersedTotalMolarConcentrationMolM3": ctd,
                "boundaryZerosPreserved": True,
                "sourceQualification":
                    "CALLER_MUST_BIND_RECORDED_GOVERNED_INCOMING_STAGE2_BOUNDARIES",
            },
            "closure": {
                "name": "PRELIMINARY_MIXTURE_AVERAGED_FICKIAN_MOLAR_FRAME",
                "qualification": "PRE_PILOT_APPROXIMATION_NOT_RELEASE_QUALIFIED",
                "evidenceQualification":
                    "MOLAR_ANALOGUE_OF_ESTABLISHED_MIXTURE_AVERAGE_CORRECTION;"
                    "NO_REPOSITORY_PRIMARY_SOURCE_OR_RRBO_NMP_VALIDATION",
                "sumDiffusiveFluxConstraint": "ENFORCED_BY_MIXTURE_AVERAGED_CORRECTION",
                "imposedZeroTotalMolarFlux": False,
                "holdupUsed": False,
                "d32Used": False,
                "logFloor": LOG_FLOOR,
                "logFloorScope": "NUMERICAL_INTERFACE_COORDINATES_ONLY",
            },
            "acceptanceThresholds": {
                "maximumIsoactivityLogResidual":
                    gates["maximumIsoactivityLogResidual"],
                "maximumScaledFluxEqualityResidual": MAX_SCALED_FLUX_RESIDUAL,
                "absoluteFluxToleranceMolM2S": ABSOLUTE_FLUX_TOLERANCE,
                "minimumInterfaceCompositionSeparation":
                    gates["minimumPhaseCompositionSeparation"],
                "requiredNumericalJacobianRank": 13,
                "independentStartReproductionRelativeTolerance":
                    reproduction_tolerance,
                "minimumLocalStabilityCurvature":
                    gates["minimumLocalStabilityCurvature"],
                "postInterfaceTpdThreshold": gates["postSplitTpdThreshold"],
            },
            "nonApplicableFlashGates": {
                "holdupWeightedGibbsFeedTest": "NOT_APPLICABLE_INTERFACE_BOUNDARY_SOLVE",
                "mixedFeedTpdTest": "NOT_APPLICABLE_NO_ARTIFICIAL_MIXED_FEED_CREATED",
            },
            "startDiagnostics": diagnostics,
            "endpointAssessments": assessed,
            "scientificIntegrity": integrity,
            "scientificRuntime": runtime,
        }
        if selected is None:
            body["status"] = "BLOCKED_NO_ACCEPTED_PHYSICAL_INTERFACE_ROOT"
            body["interface"] = None
            return body
        values, row, assessment, reproduction_start, reproduction_difference = selected
        _, xi_c, xi_d, n_total, j_c, j_d, n_c, n_d, delta = values
        body.update({
            "status": "CALCULATED_PRELIMINARY_INTERFACE",
            "selectedStartClass": row["startClass"],
            "independentReproductionStartClass": reproduction_start,
            "independentReproductionMaximumRelativeDifference":
                reproduction_difference,
            "selectedGateEvidence": assessment,
            "interface": {
                "continuousMoleFractions": xi_c.tolist(),
                "dispersedMoleFractions": xi_d.tolist(),
                "totalMolarFluxMolM2S": n_total,
                "continuousDiffusiveFluxMolM2S": j_c.tolist(),
                "dispersedDiffusiveFluxMolM2S": j_d.tolist(),
                "continuousComponentFluxMolM2S": n_c.tolist(),
                "dispersedComponentFluxMolM2S": n_d.tolist(),
                "fluxEqualityResidualMolM2S": delta.tolist(),
            },
        })
        return body
    finally:
        temporary.cleanup()


def identity():
    evidence = adapter.active.engine_evidence()
    return {
        "protocol": PROTOCOL,
        "version": VERSION,
        "componentOrder": list(COMPONENTS),
        "engineId": evidence["engineId"],
        "engineVersion": evidence["engineVersion"],
        "engineHash": evidence["engineHash"],
        "stage4AdapterArtifactSha256": adapter.adapter_manifest["artifactSha256"],
        "jobBInterfaceArtifactSha256": manifest["artifactSha256"],
        "workerSha256": sha_file(__file__),
    }


def execute(request):
    if request.get("protocol") != PROTOCOL:
        raise ValueError("JOB_B_INTERFACE_PROTOCOL_MISMATCH")
    if request.get("operation") == "PREFLIGHT":
        if set(request) != {"protocol", "operation"}:
            raise ValueError("JOB_B_INTERFACE_UNSUPPORTED_PREFLIGHT_FIELD")
        return {
            "status": "PASS",
            "operation": "PREFLIGHT",
            "launchEnvironmentKeys": sorted(os.environ),
            **identity(),
        }
    if request.get("operation") == "SOLVE_INTERFACE":
        return solve(request)
    raise ValueError("JOB_B_INTERFACE_UNSUPPORTED_OPERATION")


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            response = {**identity(), **execute(json.loads(line))}
        except (ValueError, RuntimeError, KeyError, TypeError) as error:
            response = {
                **identity(), "status": "FAILURE_INVALID_REQUEST", "error": str(error),
            }
        response["resultHash"] = digest(response)
        print(canonical(response), flush=True)


if __name__ == "__main__":
    main()