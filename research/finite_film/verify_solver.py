#!/usr/bin/env python3
"""Numerical BVP benchmarks; no real project engine or historical job is run."""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path
import numpy as np

from thermo_adapter import IdealExcessAdapter, ConstantExcessAdapter, FiniteFilmThermoAdapter
from solver import solve_single_film, solve_two_films, FilmDomainError

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-solver-validation.json"
THRESHOLDS = {"scaledFlux": 1e-8, "profile": 1e-8, "normalization": 1e-12,
              "isoactivity": 1e-7, "refinement": 1e-8}


def scientific_scalar(value):
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError(f"Unsupported scientific report value: {type(value).__name__}")


def run():
    rows = []
    left = np.array([.42, .10, .08, .04, .03, .23, .10])
    right = np.array([.72, .12, .08, .05, .03, 0., 0.])
    probes = np.linspace(0, 1, 257)
    ideal = IdealExcessAdapter()

    for pe in (-8., -1., 0., 1., 8.):
        g = 0.002
        n = pe * g
        expected = (g * (left - right) if pe == 0 else
                    n * (left + (left - right) / math.expm1(pe)))
        alpha = probes if pe == 0 else np.expm1(pe * probes) / math.expm1(pe)
        exact_profile = (1 - alpha[:, None]) * left + alpha[:, None] * right
        refinements = []
        for tolerance, nodes in ((1e-8, 17), (1e-9, 33), (1e-10, 65)):
            result = solve_single_film(left, right, np.full(7, g), n, ideal,
                                       tolerance=tolerance, nodes=nodes, max_nodes=4097)
            profile = result["profile"].values(probes)
            refinements.append({
                "requestedTolerance": tolerance, "initialNodes": nodes,
                "scipySuccess": result["scipySuccess"], "nodes": result["nodes"],
                "numericalAccepted": result["numericalAccepted"],
                "scaledFluxError": float(np.max(np.abs(result["flux"] - expected)) / g),
                "profileError": float(np.max(np.abs(profile - exact_profile))),
                "flux": result["flux"].tolist(), "audit": result["audit"],
            })
        drift = float(np.max(np.abs(
            np.array(refinements[-1]["flux"]) - refinements[-2]["flux"])) / g)
        fine = refinements[-1]
        rows.append({
            "name": f"equal_g_non_equimolar_Pe_{pe:g}", "refinements": refinements,
            "fineFluxDrift": drift,
            "status": "PASS" if fine["numericalAccepted"]
                and refinements[-2]["numericalAccepted"]
                and fine["scaledFluxError"] <= 1e-8 and fine["profileError"] <= 1e-8
                and fine["audit"]["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED"
                and drift <= 1e-8 else "FAIL",
        })

    # Binary unequal-g case embedded in seven components, with literal-zero
    # spectators. No log-activity evaluation is needed for this ideal benchmark.
    binary_l, binary_r = np.zeros(7), np.zeros(7)
    binary_l[:2], binary_r[:2] = [.8, .2], [.1, .9]
    g = np.array([.002, .006, .003, .003, .003, .003, .003])
    expected = (.8 - .1) * (.002 + (.006 - .002) * (.8 + .1) / 2)
    result = solve_single_film(binary_l, binary_r, g, 0., ideal,
                               tolerance=2e-12, nodes=33)
    expected_flux = np.r_[expected, -expected, np.zeros(5)]
    error = float(np.max(np.abs(result["flux"] - expected_flux) / g))
    rows.append({"name": "unequal_binary_equimolar", "scaledFluxError": error,
                 "audit": result["audit"], "scipySuccess": result["scipySuccess"],
                 "status": "PASS" if result["numericalAccepted"] and error <= 1e-8
                 and result["audit"]["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED" else "FAIL"})

    # Manufactured TWO-film partition benchmark. The seven nonzero fluxes and
    # interface conditions are known, but not supplied as solver answers.
    gc, gd = np.full(7, .002), np.full(7, .001)
    bulk_c = np.array([.02, .02, .015, .01, .005, .82, .11])
    truth_flux = np.array([-.0001, -.00001, -.000005, -.000003, -.000002, .00004, .00001])
    n = truth_flux.sum()
    interface_c = np.exp(n / gc[0]) * bulk_c - np.expm1(n / gc[0]) * truth_flux / n
    interface_d = np.array([.72, .10, .05, .03, .02, .05, .03])
    bulk_d = np.exp(n / gd[0]) * interface_d - np.expm1(n / gd[0]) * truth_flux / n
    c_adapter = ConstantExcessAdapter(np.zeros(7))
    d_adapter = ConstantExcessAdapter(np.log(interface_c / interface_d))
    starts = []
    for seed_label, seedc, seedd in (
        ("bulk_initialization", bulk_c, bulk_d),
        ("independent_oriented_template",
         np.array([.08, .03, .02, .015, .005, .75, .10]),
         np.array([.70, .10, .06, .03, .02, .06, .03])),
    ):
        answer = solve_two_films(
            bulk_c, bulk_d, gc, gd, c_adapter, d_adapter,
            interface_seed_c=seedc, interface_seed_d=seedd,
            tolerance=1e-11, nodes=25,
        )
        err = float(np.max(np.abs(answer["flux"] - truth_flux) / np.maximum(gc, gd)))
        starts.append({
            "start": seed_label, "scipySuccess": answer["scipySuccess"],
            "scaledFluxError": err, "flux": answer["flux"].tolist(),
            "totalFlux": answer["totalFlux"],
            "maximumIsoactivityResidual": answer["maximumIsoactivityResidual"],
            "maximumScaledFilmFluxDisagreement": answer["maximumScaledFilmFluxDisagreement"],
            "continuousAudit": answer["continuousAudit"], "dispersedAudit": answer["dispersedAudit"],
            "passed": answer["numericalAccepted"] and err <= 1e-8
                and answer["maximumIsoactivityResidual"] <= 1e-7
                and answer["maximumScaledFilmFluxDisagreement"] <= 1e-8
                and answer["continuousAudit"]["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED"
                and answer["dispersedAudit"]["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED",
        })
    agreement = float(np.max(np.abs(
        np.array(starts[0]["flux"]) - starts[1]["flux"])) / gc[0])
    rows.append({"name": "coupled_two_film_independent_starts", "starts": starts,
                 "scaledIndependentAgreement": agreement,
                 "status": "PASS" if all(s["passed"] for s in starts)
                 and agreement <= 1e-8 else "FAIL"})

    # Synthetic nonideal excess function; not the project's liquid model.
    # A regular-solution excess Gibbs function gives an independently known
    # analytic directional derivative for comparison to the finite-difference API.
    omega = np.diag(np.linspace(.01, .07, 7))
    def excess(x):
        return omega @ x - .5 * (x @ omega @ x)
    finite = FiniteFilmThermoAdapter(excess, step=1e-5)
    class AnalyticRegular(FiniteFilmThermoAdapter):
        kind = "synthetic_analytic_regular_solution"
        def __init__(self):
            super().__init__(excess)
        def excess_jacobian_full(self, x):
            return omega - np.outer(np.ones(7), x @ omega)
    l = np.array([.20, .15, .10, .10, .05, .25, .15])
    r = np.array([.18, .14, .12, .11, .06, .23, .16])
    g = np.linspace(.002, .005, 7)
    numerical = solve_single_film(l, r, g, .0001, finite, tolerance=1e-10, nodes=25)
    analytic = solve_single_film(l, r, g, .0001, AnalyticRegular(), tolerance=1e-10, nodes=25)
    difference = float(np.max(np.abs(numerical["flux"] - analytic["flux"]) / g))
    rows.append({"name": "nonideal_numeric_vs_analytic_derivative",
                 "scaledFluxDifference": difference,
                 "numericAudit": numerical["audit"], "analyticAudit": analytic["audit"],
                 "status": "PASS" if difference <= 1e-8 and numerical["numericalAccepted"]
                 and analytic["numericalAccepted"]
                 and numerical["audit"]["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED"
                 and analytic["audit"]["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED" else "FAIL"})

    report = {
        "schemaVersion": "ISOLATED_FINITE_FILM_NUMERICAL_VERIFICATION_V1",
        "scope": "SYNTHETIC_NUMERICAL_BVP_BENCHMARKS_NOT_PROJECT_PHYSICS",
        "thresholds": THRESHOLDS, "cases": rows,
        "outcome": "PASS" if all(r["status"] == "PASS" for r in rows) else "FAIL",
        "sourceHashes": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (Path(__file__), Path(__file__).with_name("solver.py"),
                      Path(__file__).with_name("thermo_adapter.py"))},
        "actualThermodynamicEngineCalled": False, "savedCellSolved": False,
        "productionJobsRun": [], "profileIntervalRoundoffCertification": False,
        "numericalBudgetHistory": {
            "firstPassEvidence": "research-results/finite-film-solver-first-pass.json",
            "extraRequestedTolerance": 2e-12,
            "firstPassHighPeOutcome": "MESH_BUDGET_EXCEEDED_NOT_ACCEPTED",
            "largerMeshAttempt": "STOPPED_AFTER_MORE_THAN_FIVE_MINUTES_NOT_ACCEPTED",
            "finalRefinementSchedule": [1e-8, 1e-9, 1e-10],
            "physicalAcceptanceThresholdsChanged": False,
            "explanation": "Requested adaptive-solver accuracy was retuned, not the 1e-8 flux/profile acceptance gates; both final refinements must independently pass.",
        },
    }
    OUT.write_text(json.dumps(report, indent=2, allow_nan=False,
                              default=scientific_scalar) + "\n")
    print(json.dumps({"outcome": report["outcome"], "cases":
                     [{"name": r["name"], "status": r["status"]} for r in rows]}))
    return report


if __name__ == "__main__":
    try:
        data = run()
    except Exception as error:
        OUT.write_text(json.dumps({"outcome": "ERROR", "error": str(error),
                                  "type": type(error).__name__,
                                  "actualThermodynamicEngineCalled": False,
                                  "productionJobsRun": []}, indent=2) + "\n")
        raise
    raise SystemExit(0 if data["outcome"] == "PASS" else 1)