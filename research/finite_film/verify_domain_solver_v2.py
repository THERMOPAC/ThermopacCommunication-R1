#!/usr/bin/env python3
"""Synthetic checks for the positive-coordinate research algorithm."""
import hashlib
import json
from pathlib import Path

import numpy as np

from domain_solver_v2 import solve_two_films_logratio
from thermo_adapter import ConstantExcessAdapter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-domain-solver-v2-validation.json"


def run():
    gc, gd = np.full(7, .002), np.full(7, .001)
    bulk_c = np.array([.02, .02, .015, .01, .005, .82, .11])
    truth = np.array([-.0001, -.00001, -.000005, -.000003, -.000002, .00004, .00001])
    n = truth.sum()
    ic = np.exp(n / gc[0]) * bulk_c - np.expm1(n / gc[0]) * truth / n
    id_ = np.array([.72, .10, .05, .03, .02, .05, .03])
    bulk_d = np.exp(n / gd[0]) * id_ - np.expm1(n / gd[0]) * truth / n
    ca, da = ConstantExcessAdapter(np.zeros(7)), ConstantExcessAdapter(np.log(ic / id_))
    rows = []
    for label, sc, sd in (("bulk", bulk_c, bulk_d), ("independent", ic, id_)):
        answer = solve_two_films_logratio(
            bulk_c, bulk_d, gc, gd, ca, da,
            interface_seed_c=sc, interface_seed_d=sd,
            tolerance=1e-9, nodes=25, max_nodes=2049,
        )
        error = float(np.max(np.abs(answer["flux"] - truth) / np.maximum(gc, gd)))
        rows.append({"start": label, "success": answer["scipySuccess"],
                     "accepted": answer["numericalAccepted"], "scaledFluxError": error,
                     "isoactivity": answer["maximumIsoactivityResidual"],
                     "minimumFractions": [answer["continuousAudit"]["minimumSampledFraction"],
                                          answer["dispersedAudit"]["minimumSampledFraction"]]})
    # A manufactured extreme positive boundary proves that the transform does
    # not inject epsilon or clip small components.
    extreme = bulk_d.copy()
    extreme[5], extreme[6] = 1e-30, 1e-35
    extreme[:5] *= (1 - extreme[5:].sum()) / extreme[:5].sum()
    from domain_solver_v2 import log_ratios, simplex_from_log_ratios
    roundtrip = simplex_from_log_ratios(log_ratios(extreme))
    extreme_error = float(np.max(np.abs(roundtrip - extreme)))
    report = {
        "schemaVersion": "ISOLATED_FINITE_FILM_DOMAIN_SOLVER_V2_VALIDATION",
        "scope": "SYNTHETIC_ONLY", "cases": rows,
        "extremePositiveBoundaryRoundtripMaximumAbsError": extreme_error,
        "noClippingOrEpsilonFeed": True, "productionJobsRun": [],
        "outcome": "PASS" if all(r["success"] and r["accepted"] and
                                 r["scaledFluxError"] <= 1e-8 for r in rows)
                   and extreme_error <= 1e-14 else "FAIL",
        "sourceHashes": {},
    }
    for name in ("domain_solver_v2.py", "verify_domain_solver_v2.py"):
        path = Path(__file__).with_name(name)
        report["sourceHashes"][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"outcome": report["outcome"], "cases": rows}))
    return report


if __name__ == "__main__":
    raise SystemExit(0 if run()["outcome"] == "PASS" else 1)