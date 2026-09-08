#!/usr/bin/env python3
"""Bounded factorial diagnosis of the pinned model's composition wrappers."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from verify_thermo import archived_state, load_pinned_adapter

from boundary_adapter import (
    BoundaryExcessAdapter,
    BoundaryAdapterError,
    RESEARCH_UNQUALIFIED,
    TASK238_MODEL,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-boundary-native-segment-proof.json"
TEMPERATURE_K = 298.15
STEPS = (2e-6, 1e-6, 5e-7)
NATIVE_FLOORS = (1e-8, 1e-10, 1e-12, 1e-14)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def maximum(np, value):
    return float(np.max(np.abs(value)))


def basis(np, dependent):
    eye = np.eye(7)
    return np.asarray(
        [eye[:, j] - eye[:, dependent] for j in range(7) if j != dependent]
    ).T


def direct_native(np, native, temperature, x):
    value = (
        np.asarray(native.get_lngamma_comb(temperature, x), dtype=float)
        + np.asarray(native.get_lngamma_resid(temperature, x), dtype=float)
    )
    if value.shape != (7,) or not np.all(np.isfinite(value)):
        raise BoundaryAdapterError("DIAGNOSIS_NATIVE_RAW_LIMIT_UNDEFINED")
    return value


def replaced(np, x, floor):
    value = np.maximum(np.asarray(x, dtype=float), floor)
    return value / value.sum()


def directional(np, excess, x, dependent, h):
    gamma = np.zeros((7, 7), dtype=float)
    methods = {}
    f0 = None
    for j in range(7):
        if j == dependent:
            continue
        direction = np.zeros(7)
        direction[j], direction[dependent] = 1.0, -1.0
        if x[j] >= h and x[dependent] >= h:
            gamma[:, j] = (
                excess(x + h * direction) - excess(x - h * direction)
            ) / (2.0 * h)
            methods[str(j)] = "central"
        else:
            if x[dependent] < 2.0 * h:
                raise BoundaryAdapterError(
                    "DIAGNOSIS_FORWARD_DIRECTION_OUTSIDE_SIMPLEX"
                )
            if f0 is None:
                f0 = excess(x)
            gamma[:, j] = (
                -3.0 * f0
                + 4.0 * excess(x + h * direction)
                - excess(x + 2.0 * h * direction)
            ) / (2.0 * h)
            methods[str(j)] = "second_order_forward"
    return gamma, methods


def diagnose_control(np, excess, x, dependent):
    B = basis(np, dependent)
    rows = []
    tangents = []
    for h in STEPS:
        gamma, methods = directional(np, excess, x, dependent, h)
        tangent = gamma @ B
        projected = B.T @ gamma @ B
        rows.append(
            {
                "h": h,
                "methods": methods,
                "gibbsDuhemAbs": maximum(np, x @ tangent),
                "tangentIntegrabilityAbs": maximum(
                    np, projected - projected.T
                ),
            }
        )
        tangents.append(tangent)
    consistency = []
    for coarse, fine, h_coarse, h_fine in zip(
        tangents, tangents[1:], STEPS, STEPS[1:]
    ):
        consistency.append(
            {
                "coarseH": h_coarse,
                "fineH": h_fine,
                "relativeChange": maximum(np, coarse - fine)
                / max(1.0, maximum(np, fine)),
            }
        )
    return {"oneSidedGrid": rows, "stepConsistency": consistency}


def validation_checks(np, adapter):
    good = np.asarray([0.1, 0.1, 0.1, 0.1, 0.1, 0.25, 0.25])
    cases = {
        "wrongDimension": good[:6],
        "negative": np.asarray([-0.1, 0.1, 0.1, 0.1, 0.1, 0.35, 0.35]),
        "notNormalized": good * 0.9,
        "nonfinite": np.asarray(
            [np.inf, 0.1, 0.1, 0.1, 0.1, 0.25, 0.25]
        ),
    }
    result = {}
    for name, value in cases.items():
        try:
            adapter.excess(value)
            result[name] = "FAILED_TO_REJECT"
        except BoundaryAdapterError:
            result[name] = "REJECTED"
    try:
        adapter.excess(good, temperature_k=0.0)
        result["invalidTemperature"] = "FAILED_TO_REJECT"
    except BoundaryAdapterError:
        result["invalidTemperature"] = "REJECTED"
    return result


def main():
    temporary = None
    report = {
        "schemaVersion": "FINITE_FILM_BOUNDARY_NATIVE_SEGMENT_PROOF_V1",
        "qualificationStatus": RESEARCH_UNQUALIFIED,
        "savedCellSolve": "NOT_ATTEMPTED",
        "filmSolverCalls": [],
        "controls": {
            "assembled": "outer floor 1e-12, then historical native floor 1e-10; RK uses outer state",
            "outerOnly": "one 1e-12 replacement before direct native and RK",
            "nativeOnly": "direct native receives stated replaced state; RK receives unchanged physical state",
            "fullyUnfloored": "literal physical state passed to direct native and exact RK polynomial",
        },
        "oneSidedSteps": list(STEPS),
        "nativeOnlyFloors": list(NATIVE_FLOORS),
        "cases": [],
    }
    try:
        _, engine, temporary, lineage = load_pinned_adapter()
        np = engine.np
        adapter = BoundaryExcessAdapter(engine, TEMPERATURE_K)
        states, _, total_flux = archived_state()
        native = engine.model.native_model.native_seven
        correction = adapter.task238.correction
        parameters = engine.model.parameters
        expected_commit = "1b82456be38026719b16cad4076109bef3fcb309"
        expected_binary = (
            "a90b34a97bfc9b3fe06ac247a3feae7263f83aa1a29b4d79fea758bec587ce61"
        )
        provenance_path = (
            ROOT
            / "dist/predictive-nt-runtime-7c-1-5/server/research"
            / "ecr-pre-pilot-cosmosac/provenance-manifest.json"
        )
        provenance = json.loads(provenance_path.read_text())

        def assembled(x):
            return np.asarray(
                engine.model.wet_lngamma(np, TEMPERATURE_K, x), dtype=float
            )

        def outer_only(x):
            value = replaced(np, x, 1e-12)
            _, delta = correction(np, value, TEMPERATURE_K, parameters)
            return direct_native(np, native, TEMPERATURE_K, value) + delta

        native_only = {}
        for floor in NATIVE_FLOORS:
            def evaluator(x, floor=floor):
                native_x = replaced(np, x, floor)
                _, delta = correction(np, x, TEMPERATURE_K, parameters)
                return direct_native(np, native, TEMPERATURE_K, native_x) + delta
            native_only[floor] = evaluator

        report["lineage"] = lineage
        report["sources"] = {
            "task238Model": str(TASK238_MODEL.relative_to(ROOT)),
            "task238ModelSha256": sha(TASK238_MODEL),
            "boundaryAdapterSha256": sha(
                ROOT / "research/finite_film/boundary_adapter.py"
            ),
            "diagnosisSourceSha256": sha(Path(__file__)),
            "pinnedCcosmoBinarySha256":
                expected_binary,
            "nistCosmosacCommit": expected_commit,
            "archivedRawUrls": {
                "COSMO.hpp":
                    "https://raw.githubusercontent.com/usnistgov/COSMOSAC/1b82456be38026719b16cad4076109bef3fcb309/include/COSMO_SAC/COSMO.hpp",
                "pybind11_interface.cxx":
                    "https://raw.githubusercontent.com/usnistgov/COSMOSAC/1b82456be38026719b16cad4076109bef3fcb309/src/pybind11_interface.cxx",
                "LICENSE":
                    "https://raw.githubusercontent.com/usnistgov/COSMOSAC/1b82456be38026719b16cad4076109bef3fcb309/LICENSE",
            },
            "provenanceChecks": {
                "manifestSourceCommitMatches": (
                    provenance.get("NIST_COSMOSAC_source_commit")
                    == expected_commit
                ),
                "manifestBinaryHashMatches": (
                    provenance.get("runtime", {}).get(
                        "cCOSMOBinarySha256"
                    )
                    == expected_binary
                ),
                "loadedEngineBinaryHashMatches": (
                    lineage.get("runtime", {}).get("cCOSMOBinarySha256")
                    == expected_binary
                ),
                "provenanceManifestSha256": sha(provenance_path),
            },
            "sourceArchive": {
                "COSMO.hpp": sha(
                    ROOT / "research/sources/job-b/boundary-native/COSMO.hpp"
                ),
                "pybind11_interface.cxx": sha(
                    ROOT
                    / "research/sources/job-b/boundary-native/pybind11_interface.cxx"
                ),
                "LICENSE": sha(
                    ROOT / "research/sources/job-b/boundary-native/LICENSE"
                ),
            },
        }
        report["savedState"] = {
            "cell1TotalMolarFluxMolM2S": total_flux,
            "compositionSource": "verify_thermo.archived_state() unchanged vectors",
        }
        report["validationChecks"] = validation_checks(np, adapter)

        for name, raw_x in states.items():
            x = np.asarray(raw_x, dtype=float)
            dependent = int(np.argmax(x))
            row = {
                "name": name,
                "composition": x.tolist(),
                "dependentIndex": dependent,
                "minimumFraction": float(x.min()),
                "controls": {},
            }
            try:
                probe = adapter.source_grounded_probe(x)
                row["sourceGroundedProbe"] = {
                    key: (
                        value.tolist()
                        if hasattr(value, "tolist")
                        else value
                    )
                    for key, value in probe.items()
                }
            except Exception as error:
                row["sourceGroundedProbe"] = {
                    "status": "SOURCE_ABI_PROBE_FAILED",
                    "error": f"{type(error).__name__}: {error}",
                }
            evaluators = [
                ("assembled", assembled),
                ("outerOnly", outer_only),
            ] + [
                (f"nativeOnly_{floor:.0e}", native_only[floor])
                for floor in NATIVE_FLOORS
            ]
            direct_defined = True
            try:
                direct_value = adapter.excess(x)
                row["fullyUnflooredValue"] = direct_value.tolist()
                evaluators.append(("fullyUnfloored", adapter.excess))
            except BoundaryAdapterError as error:
                direct_defined = False
                row["fullyUnfloored"] = {
                    "status": "NATIVE_RAW_LIMIT_UNDEFINED",
                    "error": str(error),
                }
            for control_name, evaluator in evaluators:
                try:
                    value = np.asarray(evaluator(x), dtype=float)
                    detail = {
                        "status": "DIAGNOSTIC_ONLY",
                        "value": value.tolist(),
                        **diagnose_control(
                            np, evaluator, x, dependent
                        ),
                    }
                    if np.all(x > 1e-10) and direct_defined:
                        detail["positiveInteriorGammaAgreementAbs"] = maximum(
                            np, value - direct_value
                        )
                    row["controls"][control_name] = detail
                except Exception as error:
                    row["controls"][control_name] = {
                        "status": "LIMIT_OR_DERIVATIVE_UNDEFINED",
                        "error": f"{type(error).__name__}: {error}",
                    }
            row["fullyUnflooredDirectDefined"] = direct_defined
            row["qualificationUse"] = False
            report["cases"].append(row)
        report["outcome"] = (
            "DIAGNOSTIC_COMPLETE_RESEARCH_UNQUALIFIED"
            if all(r["fullyUnflooredDirectDefined"] for r in report["cases"])
            else "PARTIAL_NATIVE_RAW_BOUNDARY_LIMIT_UNDEFINED"
        )
    except Exception as error:
        report["outcome"] = "PARTIAL_DIAGNOSIS_STOPPED"
        report["error"] = f"{type(error).__name__}: {error}"
    finally:
        if temporary is not None:
            temporary.cleanup()
        OUT.write_text(
            json.dumps(report, sort_keys=True, indent=2, allow_nan=False) + "\n"
        )


if __name__ == "__main__":
    main()