#!/usr/bin/env python3
"""Independent, bounded qualification of the literal-boundary excess adapter.

This program evaluates thermodynamics only.  It contains no phase-equilibrium,
job, finite-film, or saved-cell execution path.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "dist/predictive-nt-runtime-7c-1-5"
VENDOR = BASE / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
# The pinned binary and its pinned numerical dependencies must win before
# numpy or either research adapter is imported.
sys.path.insert(0, str(VENDOR))

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import verify_thermo
from boundary_adapter import BoundaryAdapterError, BoundaryExcessAdapter

OUT = ROOT / "research-results/finite-film-boundary-qualification.json"
INITIAL_REPORT = (
    ROOT
    / "research-results/finite-film-boundary-qualification-initial-failed.json"
)
CONTRACT_PATH = HERE / "boundary-qualification-contract.json"
DIAGNOSIS_PATH = ROOT / "research-results/finite-film-boundary-diagnosis.json"
SEGMENT_PROOF_PATH = (
    ROOT
    / "research-results/finite-film-boundary-native-segment-proof.json"
)
ADAPTER_PATH = HERE / "boundary_adapter.py"
PROOF_DIR = ROOT / "research/sources/job-b/boundary-native"
REGULARITY_PROOF_PATH = PROOF_DIR / "BOUNDARY-PROOF.md"
NATIVE_BINARY = VENDOR / "cCOSMO.cpython-312-x86_64-linux-gnu.so"
TIME_BUDGET_SECONDS = 120.0


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def maximum(value):
    return float(np.max(np.abs(value)))


def basis(dependent):
    eye = np.eye(7)
    return np.asarray(
        [eye[:, j] - eye[:, dependent] for j in range(7) if j != dependent]
    ).T


def portable(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {str(k): portable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [portable(v) for v in value]
    return value


def save(report):
    report["elapsedSeconds"] = time.monotonic() - report["_started"]
    clean = {k: v for k, v in report.items() if k != "_started"}
    evidence = json.dumps(clean, sort_keys=True, separators=(",", ":"))
    clean["reportEvidenceSha256"] = hashlib.sha256(evidence.encode()).hexdigest()
    OUT.write_text(json.dumps(portable(clean), sort_keys=True, indent=2,
                              allow_nan=False) + "\n")


def check_time(report):
    if time.monotonic() - report["_started"] > 115.0:
        save(report)
        raise TimeoutError("BOUNDARY_QUALIFICATION_TIME_BUDGET")


def provenance(contract, diagnosis, segment_proof):
    required = contract["sourceRequired"]
    sources = segment_proof["sources"]
    historical_sources = diagnosis["sources"]
    expected_archive = {
        "COSMO.hpp": sources["sourceArchive"]["COSMO.hpp"],
        "pybind11_interface.cxx":
            sources["sourceArchive"]["pybind11_interface.cxx"],
        "LICENSE": sources["sourceArchive"]["LICENSE"],
    }
    checks = {
        "repositoryMatches": required["repository"]
            == "https://github.com/usnistgov/COSMOSAC",
        "commitMatchesFreshSegmentProof":
            required["commit"] == sources["nistCosmosacCommit"],
        "binaryMatchesFreshSegmentProof": required["nativeBinarySha256"]
            == sources["pinnedCcosmoBinarySha256"],
        "binaryFileMatches": sha(NATIVE_BINARY)
            == required["nativeBinarySha256"],
        "adapterMatchesFreshSegmentProof": sha(ADAPTER_PATH)
            == sources["boundaryAdapterSha256"],
        "freshSegmentProofProvenanceChecksPassed":
            all(sources["provenanceChecks"][name] for name in (
                "loadedEngineBinaryHashMatches",
                "manifestBinaryHashMatches",
                "manifestSourceCommitMatches")),
    }
    archive = {}
    for name, expected in expected_archive.items():
        actual = sha(PROOF_DIR / name)
        archive[name] = {
            "path": str((PROOF_DIR / name).relative_to(ROOT)),
            "expectedSha256": expected, "actualSha256": actual,
            "passed": actual == expected,
        }
    checks["sourceArchiveHashesMatch"] = all(
        row["passed"] for row in archive.values())
    return {
        "status": "PASS" if all(checks.values()) else "FAIL",
        "checks": checks,
        "sourceArchive": archive,
        "repository": required["repository"],
        "commit": required["commit"],
        "nativeBinary": str(NATIVE_BINARY.relative_to(ROOT)),
        "nativeBinarySha256": sha(NATIVE_BINARY),
        "qualificationCaveat": required["qualification"],
        "binarySourceCaveat":
            "Archived source plus pinned ABI agreement is not reproducible-build certification.",
        "freshSegmentProof": {
            "path": str(SEGMENT_PROOF_PATH.relative_to(ROOT)),
            "sha256": sha(SEGMENT_PROOF_PATH),
            "schemaVersion": segment_proof["schemaVersion"],
            "adapterSha256": sources["boundaryAdapterSha256"],
        },
        "historicalDiagnosis": {
            "path": str(DIAGNOSIS_PATH.relative_to(ROOT)),
            "sha256": sha(DIAGNOSIS_PATH),
            "historicalAdapterSha256":
                historical_sources["boundaryAdapterSha256"],
            "currentAdapterSha256": sha(ADAPTER_PATH),
            "adapterHashStillExpectedToMatch": False,
            "retainedAsHistoricalEvidenceOnly": True,
        },
        "provenanceManifestSha256":
            sources["provenanceChecks"]["provenanceManifestSha256"],
    }


def refusal_checks(adapter):
    good = np.array([.19, .17, .15, .14, .13, .12, .10])
    requests = {
        "negative": np.array([-.01, .17, .15, .14, .13, .22, .20]),
        "nonfiniteNaN": np.array([np.nan, .17, .15, .14, .13, .22, .19]),
        "wrongDimension": np.ones(6) / 6,
        "scalarShape": 1.0,
        "notNormalized": good * .9,
    }
    rows = {}
    for name, value in requests.items():
        try:
            adapter.excess(value)
            rows[name] = {"refused": False}
        except (BoundaryAdapterError, ValueError, TypeError) as error:
            rows[name] = {
                "refused": True,
                "error": f"{type(error).__name__}: {error}",
            }
    return rows


def additional_physics_acceptance(probe, contract, regularity_proof):
    """Evaluate the actual probe schema; reported numbers alone never pass."""
    specification = contract["additionalPhysicsEvidence"]
    mixture_fixed = probe["mixtureSegmentGammaFixedPoint"]
    pure = probe["pureProfiles"]
    fixed_points = [mixture_fixed] + [
        row["segmentGamma"] for row in pure]
    fixed_rows = []
    for row in fixed_points:
        roundoff = 64.0 * np.finfo(float).eps
        accepted = bool(
            np.isfinite(row["actualMaximumRelativeFixedPointResidual"])
            and row["actualMaximumRelativeFixedPointResidual"]
            <= row["derivedMaximumFixedPointResidualBound"] + roundoff
        )
        fixed_rows.append({
            "actualMaximumRelativeFixedPointResidual":
                row["actualMaximumRelativeFixedPointResidual"],
            "derivedMaximumFixedPointResidualBound":
                row["derivedMaximumFixedPointResidualBound"],
            "roundoffAllowance": roundoff,
            "accepted": accepted,
        })
    fixed_accepted = all(row["accepted"] for row in fixed_rows)

    normalization_tolerance = probe[
        "profileNormalizationRoundoffTolerance"]
    normalization_rows = [{
        "kind": "mixture",
        "normalizationAbsError":
            probe["mixtureProfileNormalizationAbsError"],
        "tolerance": normalization_tolerance,
        "nonnegative": probe["mixtureProfileNonnegative"],
        "supportCount": probe["mixtureProfileSupportCount"],
    }] + [{
        "kind": f"pure_{row['componentIndex']}",
        "normalizationAbsError": row["normalizationAbsError"],
        "tolerance": row["normalizationRoundoffTolerance"],
        "nonnegative": row["nonnegative"],
        "supportCount": None,
    } for row in pure]
    for row in normalization_rows:
        row["accepted"] = bool(
            row["nonnegative"]
            and np.isfinite(row["normalizationAbsError"])
            and row["normalizationAbsError"] <= row["tolerance"]
            and (row["supportCount"] is None or row["supportCount"] > 0)
        )
    normalization_accepted = all(
        row["accepted"] for row in normalization_rows)

    reconstruction = probe["residualReconstruction"]
    independent = np.asarray(reconstruction["independent"], float)
    declared = np.asarray(reconstruction["declaredNative"], float)
    reconstruction_accepted = bool(
        independent.shape == (7,)
        and declared.shape == (7,)
        and np.all(np.isfinite(independent))
        and np.all(np.isfinite(declared))
        and np.isfinite(reconstruction["maximumAbsAgreement"])
        and reconstruction["maximumAbsAgreement"]
            <= reconstruction["declaredNativeGammaRelativeTolerance"]
        and reconstruction["agreementWithinDeclaredGammaRelativeTolerance"]
    )

    kernel = probe["fullKernel"]
    kernel_accepted = bool(
        kernel["fullKernelFiniteStrictlyPositive"]
        and np.isfinite(kernel["fullKernelMinimum"])
        and kernel["fullKernelMinimum"] > 0.0
        and np.isfinite(kernel["fullKernelMaximumAbsSymmetryError"])
        and kernel["fullKernelMaximumAbsSymmetryError"]
            <= kernel["symmetryRoundoffTolerance"]
    )
    proof_phrases = (
        "The Jacobian of the log fixed-point equations has form `I+P`",
        "`-1` is excluded from its spectrum and `I+P` is invertible",
        "smooth in composition by the implicit-function theorem",
    )
    normalized_proof = " ".join(regularity_proof.split())
    proof_supports_regularity = all(
        phrase in normalized_proof for phrase in proof_phrases)
    regularity_accepted = bool(
        proof_supports_regularity and kernel_accepted
        and fixed_accepted and normalization_accepted
    )
    rows = {
        "actualGammaFixedPointResidual": {
            "reported": True, "accepted": fixed_accepted,
            "diagnostics": {
                "mixtureAndSevenPure": fixed_rows,
                "maximumActualRelativeResidual":
                    max(row["actualMaximumRelativeFixedPointResidual"]
                        for row in fixed_rows),
            },
        },
        "pureAndMixtureNormalizedProfiles": {
            "reported": True, "accepted": normalization_accepted,
            "diagnostics": normalization_rows,
        },
        "independentNativeResidualReconstruction": {
            "reported": True, "accepted": reconstruction_accepted,
            "diagnostics": portable(reconstruction),
        },
        "analyticImplicitFunctionRegularity": {
            "reported": True, "accepted": regularity_accepted,
            "diagnostics": {
                "conditionalSourceProofPath":
                    str(REGULARITY_PROOF_PATH.relative_to(ROOT)),
                "conditionalSourceProofSha256": sha(REGULARITY_PROOF_PATH),
                "requiredProofPhrasesPresent": proof_supports_regularity,
                "finiteStrictlyPositiveSymmetricKernelAccepted":
                    kernel_accepted,
                "nonemptyNormalizedProbabilitySupportsAccepted":
                    normalization_accepted,
                "fixedPointResidualBoundsAccepted": fixed_accepted,
                "kernel": portable(kernel),
            },
        },
    }
    required_present = all(name in rows for name in specification["checks"])
    return {
        "reportedWithoutAcceptanceCounts":
            specification["reportedWithoutAcceptanceCounts"],
        "checks": {name: rows[name] for name in specification["checks"]},
        "status": "PASS" if all(
            row["accepted"] for row in rows.values()
        ) and required_present else "FAIL",
    }


def derivative_check(adapter, x, contract):
    d = int(np.argmax(x))
    B = basis(d)
    central = contract["centralSteps"]
    forward = contract["oneSidedSteps"]
    grids, matrices = [], []
    for central_step, forward_step in zip(central, forward):
        adapter._derivative_adapter.one_sided_step = float(forward_step)
        gamma = adapter.excess_jacobian_full(x, d, step=central_step)
        tangent = gamma @ B
        projected = B.T @ gamma @ B
        details = portable(adapter.last_derivative)
        per_direction = []
        for column, component in enumerate(j for j in range(7) if j != d):
            scheme = details["schemes"][str(component)]
            per_direction.append({
                "componentIndex": component,
                "method": scheme["method"],
                "actualStep": scheme["step"],
                "derivativeVectorInfinityNorm":
                    maximum(tangent[:, column]),
                "gibbsDuhemAbs":
                    abs(float(x @ tangent[:, column])),
            })
        grids.append({
            "requestedCentralStep": central_step,
            "requestedForwardStep": forward_step,
            "unsymmetrizedGibbsDuhemAbs": maximum(x @ tangent),
            "tangentIntegrabilityAbs":
                maximum(projected - projected.T),
            "perDirectionSchemes": per_direction,
            "adapterDerivativeDetails": details,
        })
        matrices.append(tangent)
    refinements = []
    for coarse, fine, left, right in zip(
            matrices, matrices[1:], grids, grids[1:]):
        directions = []
        for column, component in enumerate(j for j in range(7) if j != d):
            drift = (maximum(coarse[:, column] - fine[:, column])
                     / max(1.0, maximum(fine[:, column])))
            directions.append({
                "componentIndex": component, "relativeDrift": drift})
        refinements.append({
            "coarseCentralStep": left["requestedCentralStep"],
            "fineCentralStep": right["requestedCentralStep"],
            "coarseForwardStep": left["requestedForwardStep"],
            "fineForwardStep": right["requestedForwardStep"],
            "maximumRelativeDrift":
                max(row["relativeDrift"] for row in directions),
            "perDirection": directions,
        })
    thresholds = contract["thresholds"]
    passed = (
        all(row["unsymmetrizedGibbsDuhemAbs"]
            <= thresholds["gibbsDuhemAbs"]
            and row["tangentIntegrabilityAbs"]
            <= thresholds["tangentIntegrabilityAbs"] for row in grids)
        and all(row["maximumRelativeDrift"]
                <= thresholds["derivativeStepRelative"]
                for row in refinements)
    )
    return {
        "dependentIndex": d, "pairedRefinementGrid": grids,
        "successiveRefinements": refinements,
        "status": "PASS" if passed else "FAIL",
    }


def boundary_approaches(adapter, name, x0, fractions, threshold):
    absent = np.flatnonzero(x0 == 0.0).tolist()
    if not absent:
        return None
    limit = adapter.excess(x0)
    paths = []
    specifications = [("all_absent_equal", absent)]
    specifications.extend((f"single_absent_{j}", [j]) for j in absent)
    for path_name, injected in specifications:
        rows = []
        for epsilon in fractions:
            if path_name == "all_absent_equal":
                candidate = (1.0 - len(injected) * epsilon) * x0.copy()
            else:
                candidate = (1.0 - epsilon) * x0.copy()
            candidate[injected] += epsilon
            value = adapter.excess(candidate)
            rows.append({
                "epsilon": epsilon,
                "composition": candidate.tolist(),
                "maximumAbsErrorFromTrueBoundary": maximum(value - limit),
            })
        terminal = rows[-3:]
        paths.append({
            "name": path_name,
            "formula": (
                "(1-k*epsilon)*x0 + epsilon*sum(e_absent)"
                if path_name == "all_absent_equal"
                else "(1-epsilon)*x0 + epsilon*e_absent"),
            "rows": rows,
            "terminalThreeMaximumAbsError":
                max(row["maximumAbsErrorFromTrueBoundary"]
                    for row in terminal),
            "status": "PASS" if all(
                row["maximumAbsErrorFromTrueBoundary"] <= threshold
                for row in terminal) else "FAIL",
        })
    return {
        "case": name, "absentComponents": absent,
        "trueBoundaryExcess": limit.tolist(),
        "interpretation":
            "Approach compositions are diagnostics, not a physical trace feed or extrapolated model; only the terminal three are gated.",
        "allEpsilonsClaimedEqualToLimit": False,
        "paths": paths,
        "status": "PASS" if all(p["status"] == "PASS" for p in paths)
                  else "FAIL",
    }


def case_check(adapter, engine, name, category, x, contract):
    parts = adapter.component_parts(x)
    combinatorial = adapter.analytic_combinatorial(x)
    residual = np.asarray(
        adapter.native.get_lngamma_resid(adapter.temperature_k, x), float)
    probe = adapter.source_grounded_probe(x)
    additional_physics = additional_physics_acceptance(
        probe, contract, REGULARITY_PROOF_PATH.read_text())
    derivative = derivative_check(adapter, x, contract)
    away = bool(np.min(x) > 1e-10)
    mu_error = None
    if away:
        mu_error = maximum(
            adapter.excess(x)
            - (np.asarray(engine.mu(x, adapter.temperature_k)) - np.log(x)))
    thresholds = contract["thresholds"]
    finite_terms = bool(
        np.all(np.isfinite(combinatorial))
        and np.all(np.isfinite(residual))
        and np.all(np.isfinite(parts["rk"])))
    source_pass = bool(
        probe["maximumAbsCombinatorialAgreement"]
            <= thresholds["analyticCombinatorialAgreementAbs"]
        and probe["fullKernel"]["fullKernelFiniteStrictlyPositive"]
        and probe["fullKernel"]["fullKernelMinimum"] > 0.0
        and probe["fullKernel"]["fullKernelMaximumAbsSymmetryError"]
            <= probe["fullKernel"]["symmetryRoundoffTolerance"]
        and probe["segmentGammaMinimum"] > 0.0
        and probe["absentSpeciesHaveZeroMixtureNumeratorContribution"]
        and additional_physics["status"] == "PASS")
    passed = (finite_terms and source_pass
              and derivative["status"] == "PASS"
              and (not away or mu_error <= thresholds["muAgreementAbs"]))
    return {
        "name": name, "category": category, "composition": x.tolist(),
        "minimumFraction": float(np.min(x)),
        "literalZerosPassedUnchanged": bool(
            np.any(x == 0.0)
            and adapter.last_evaluation is not None
            and adapter.last_evaluation.get("literalZeroPreserved")),
        "fixedFloorsPresent": False,
        "componentDiagnostics": {
            "allCombinatorialResidualPolynomialFinite": finite_terms,
            "analyticCombinatorial": combinatorial.tolist(),
            "nativeResidual": residual.tolist(),
            "polynomialExcess": parts["rk"].tolist(),
        },
        "sourceProof": portable(probe),
        "additionalPhysicsAcceptance": additional_physics,
        "sourceProofStatus": "PASS" if source_pass else "FAIL",
        "muMinusLnXAgreementAdmitted": away,
        "muMinusLnXAgreementAbs": mu_error,
        "derivativeDiagnostics": derivative,
        "status": "PASS" if passed else "FAIL",
    }


def main():
    started = time.monotonic()
    contract = json.loads(CONTRACT_PATH.read_text())
    diagnosis = json.loads(DIAGNOSIS_PATH.read_text())
    segment_proof = json.loads(SEGMENT_PROOF_PATH.read_text())
    initial_report = json.loads(INITIAL_REPORT.read_text())
    initial_failed_curves = [
        portable(row) for row in initial_report["boundaryApproaches"]
        if row["status"] != "PASS"
    ]
    report = {
        "_started": started,
        "schemaVersion": "FINITE_FILM_BOUNDARY_QUALIFICATION_V1",
        "scope": contract["scope"],
        "actualInput": {"temperatureK": contract["temperatureK"]},
        "thresholds": contract["thresholds"],
        "centralSteps": contract["centralSteps"],
        "oneSidedSteps": contract["oneSidedSteps"],
        "boundaryApproachFractions":
            contract["boundaryApproachFractions"],
        "boundaryApproachGateInterpretation": {
            "terminalThreeFractions":
                contract["boundaryApproachFractions"][-3:],
            "unchangedThreshold":
                contract["thresholds"]["boundaryExcessLimitAbs"],
            "earlierPointsRetainedAndNotDiscarded": True,
            "resolutionAnnotation":
                contract["boundaryApproachResolutionAnnotation"],
        },
        "timeBudgetSeconds": TIME_BUDGET_SECONDS,
        "inputHashes": {
            "contract": str(CONTRACT_PATH.relative_to(ROOT)),
            "contractSha256": sha(CONTRACT_PATH),
            "diagnosis": str(DIAGNOSIS_PATH.relative_to(ROOT)),
            "diagnosisSha256": sha(DIAGNOSIS_PATH),
            "freshSegmentProof":
                str(SEGMENT_PROOF_PATH.relative_to(ROOT)),
            "freshSegmentProofSha256": sha(SEGMENT_PROOF_PATH),
            "initialFailedQualificationReport":
                str(INITIAL_REPORT.relative_to(ROOT)),
            "initialFailedQualificationReportSha256": sha(INITIAL_REPORT),
            "archivedSnapshot": str(verify_thermo.SNAPSHOT.relative_to(ROOT)),
            "archivedSnapshotSha256": sha(verify_thermo.SNAPSHOT),
        },
        "sourceHashes": {
            "verifier": str(Path(__file__).resolve().relative_to(ROOT)),
            "verifierSha256": sha(Path(__file__).resolve()),
            "boundaryAdapterActualFile": str(ADAPTER_PATH.relative_to(ROOT)),
            "boundaryAdapterSha256": sha(ADAPTER_PATH),
            "verifyThermoPinnedLoaderFile":
                str(Path(verify_thermo.__file__).resolve().relative_to(ROOT)),
            "verifyThermoSha256": sha(Path(verify_thermo.__file__).resolve()),
        },
        "sourceProof": provenance(contract, diagnosis, segment_proof),
        "initialQualificationEvidence": {
            "initialVerdict": initial_report["verdict"],
            "initialFailures": portable(initial_report["failures"]),
            "entireOriginalFailedBoundaryCurves": initial_failed_curves,
            "originalReportPreservedWholeFile": True,
            "originalReportEvidenceSha256":
                initial_report["reportEvidenceSha256"],
            "interpretation":
                "The original 1e-12 water-corner approach failure is retained as observed finite-epsilon truncation evidence, not relabeled as a derivative or floor failure.",
        },
        "syntheticReferenceChecks": None,
        "refusals": None,
        "cases": [],
        "boundaryApproaches": [],
        "failures": [],
        "phaseEquilibriumCalls": [],
        "jobExecutions": [],
        "filmSolverCalls": [],
        "savedCellSolve": "NOT_ATTEMPTED",
        "fixedFloorsPresent": False,
        "verdict": "NOT_SAFE_FOR_SAVED_CELL_SOLVE",
    }
    temporary = None
    try:
        if contract["temperatureK"] != 298.15:
            raise RuntimeError("FROZEN_CONTRACT_TEMPERATURE_CHANGED")
        _, engine, temporary, lineage = verify_thermo.load_pinned_adapter()
        verify_thermo.np = np
        states, audit, _ = verify_thermo.archived_state()
        report["runtimeLineage"] = portable(lineage)
        report["archivedStateHashes"] = {
            "sourceResponseSha256": audit["body"]["resultSha256"],
            "sourceInputSha256": audit["snapshot"]["inputSha256"],
            "sourceStateSha256": audit["digest"](audit["state"].tolist()),
            "actualFourSavedStatesSha256": hashlib.sha256(json.dumps(
                {k: np.asarray(states[k], float).tolist() for k in (
                    "cell1_continuous", "cell1_dispersed",
                    "cell1_interface_continuous",
                    "cell1_interface_dispersed")},
                sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        }
        adapter = BoundaryExcessAdapter(engine, contract["temperatureK"])
        report["adapterContract"] = {
            "class": "BoundaryExcessAdapter",
            "actualFile": str(ADAPTER_PATH.relative_to(ROOT)),
            "methods": {
                "excess": "literal full-simplex native combinatorial plus residual plus exact polynomial excess",
                "excess_jacobian_full": "simplex-direction finite-difference extension; no ideal logarithm",
                "analytic_combinatorial": "source-derived COSMO.hpp returned expression with no log(x_i)",
                "source_grounded_probe": "pinned ABI formula, profile support, Gamma and positive-kernel evidence",
            },
        }
        synthetic = verify_thermo.synthetic_checks()
        report["syntheticReferenceChecks"] = portable(synthetic)
        report["syntheticReferenceStatus"] = (
            "PASS" if verify_thermo.synthetic_passed(synthetic) else "FAIL")
        report["refusals"] = refusal_checks(adapter)
        report["existingDiagnosisRefusals"] = diagnosis["validationChecks"]

        cases = []
        for name in ("cell1_continuous", "cell1_dispersed",
                     "cell1_interface_continuous",
                     "cell1_interface_dispersed"):
            cases.append((name, "actual_saved_state",
                          np.asarray(states[name], float)))
        cases.append(("literal_zero_fresh_dispersed_inlet",
                      "literal_zero_feed",
                      np.asarray(states["literal_zero_dry_inlet"], float)))
        reference = np.array([.19, .17, .15, .14, .13, .12, .10])
        for absent in range(7):
            x = reference.copy()
            x[absent] = 0.0
            x /= x.sum()
            cases.append((f"reference_absent_{absent}",
                          "single_absent_reference", x))
        for present in range(7):
            x = np.zeros(7)
            x[present] = 1.0
            cases.append((f"pure_corner_{present}", "pure_corner", x))
        rng = np.random.default_rng(20250308)
        for index in range(8):
            x = rng.random(7) + .05
            x /= x.sum()
            cases.append((f"seeded_positive_interior_{index}",
                          "deterministic_positive_interior", x))

        for name, category, x in cases:
            check_time(report)
            try:
                row = case_check(adapter, engine, name, category, x, contract)
                report["cases"].append(row)
                if row["status"] != "PASS":
                    report["failures"].append(
                        {"gate": "case", "name": name,
                         "status": row["status"]})
                approach = boundary_approaches(
                    adapter, name, x,
                    contract["boundaryApproachFractions"],
                    contract["thresholds"]["boundaryExcessLimitAbs"])
                if approach is not None:
                    report["boundaryApproaches"].append(approach)
                    if approach["status"] != "PASS":
                        report["failures"].append(
                            {"gate": "boundaryApproach", "name": name,
                             "status": approach["status"]})
            except Exception as error:
                report["cases"].append({
                    "name": name, "category": category,
                    "composition": x.tolist(), "status": "ERROR",
                    "error": f"{type(error).__name__}: {error}"})
                report["failures"].append({
                    "gate": "caseException", "name": name,
                    "error": f"{type(error).__name__}: {error}"})
            save(report)

        required_categories = {
            "actual_saved_state": 4, "literal_zero_feed": 1,
            "single_absent_reference": 7, "pure_corner": 7,
            "deterministic_positive_interior": 8,
        }
        observed = {name: sum(
            row.get("category") == name for row in report["cases"])
                    for name in required_categories}
        report["caseCoverage"] = {
            "required": required_categories, "observed": observed,
            "status": "PASS" if observed == required_categories else "FAIL",
        }
        refusals_pass = all(
            row["refused"] for row in report["refusals"].values())
        diagnosis_refusals_pass = all(
            value == "REJECTED"
            for value in report["existingDiagnosisRefusals"].values())
        all_pass = (
            not report["failures"]
            and report["caseCoverage"]["status"] == "PASS"
            and report["sourceProof"]["status"] == "PASS"
            and report["syntheticReferenceStatus"] == "PASS"
            and refusals_pass and diagnosis_refusals_pass
            and len(report["boundaryApproaches"]) == 15
            and all(row["status"] == "PASS"
                    for row in report["boundaryApproaches"])
        )
        report["requiredGateSummary"] = {
            "allCasesPass": all(
                row.get("status") == "PASS" for row in report["cases"]),
            "allBoundaryApproachesPass": all(
                row["status"] == "PASS"
                for row in report["boundaryApproaches"]),
            "sourceAndProvenancePass":
                report["sourceProof"]["status"] == "PASS",
            "syntheticReferencePass":
                report["syntheticReferenceStatus"] == "PASS",
            "allIndependentRefusalsPass": refusals_pass,
            "existingDiagnosisRefusalsPass": diagnosis_refusals_pass,
        }
        report["verdict"] = (
            "QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY"
            if all_pass else "NOT_SAFE_FOR_SAVED_CELL_SOLVE")
    except Exception as error:
        report["failures"].append({
            "gate": "harness", "error": f"{type(error).__name__}: {error}"})
        report["verdict"] = "NOT_SAFE_FOR_SAVED_CELL_SOLVE"
    finally:
        if temporary is not None:
            temporary.cleanup()
        save(report)


if __name__ == "__main__":
    main()