#!/usr/bin/env python3
"""Synthetic manufactured check for domain-aware physical collocation."""
import hashlib
import json
from pathlib import Path
import numpy as np

from physical_collocation_v3 import solve_physical_collocation
from thermo_adapter import ConstantExcessAdapter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-physical-collocation-v3-validation.json"


def run():
    gc, gd = np.full(7, .002), np.full(7, .001)
    bc = np.array([.02, .02, .015, .01, .005, .82, .11])
    truth = np.array([-.0001, -.00001, -.000005, -.000003, -.000002, .00004, .00001])
    n = truth.sum()
    ic = np.exp(n / gc[0]) * bc - np.expm1(n / gc[0]) * truth / n
    id_ = np.array([.72, .10, .05, .03, .02, .05, .03])
    bd = np.exp(n / gd[0]) * id_ - np.expm1(n / gd[0]) * truth / n
    answer = solve_physical_collocation(
        bc, bd, gc, gd, ConstantExcessAdapter(np.zeros(7)),
        ConstantExcessAdapter(np.log(ic / id_)),
        interface_seed_c=bc, interface_seed_d=bd, nodes=5,
        residual_tolerance=1e-10, max_iterations=30,
    )
    # Midpoint discretization has O(h^2) flux error; acceptance here tests the
    # nonlinear/domain algorithm, not continuum refinement.
    flux_error = float(np.max(np.abs(answer["flux"] - truth) / np.maximum(gc, gd)))
    report = {
        "schemaVersion": "ISOLATED_PHYSICAL_COLLOCATION_V3_VALIDATION",
        "scope": "SYNTHETIC_ONLY", "result": answer,
        "scaledManufacturedFluxError": flux_error,
        "outcome": "PASS" if answer["status"] == "CONVERGED" and
                   answer["maximumIsoactivityResidual"] <= 1e-8 and
                   flux_error <= 2e-5 else "FAIL",
        "productionJobsRun": [], "sourceHashes": {},
    }
    for name in ("physical_collocation_v3.py", "verify_physical_collocation_v3.py"):
        path = Path(__file__).with_name(name)
        report["sourceHashes"][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    OUT.write_text(json.dumps(report, indent=2,
                              default=lambda x: x.tolist() if hasattr(x, "tolist") else x.item()) + "\n")
    print(json.dumps({"outcome": report["outcome"], "status": answer["status"],
                      "fluxError": flux_error}))
    return report


if __name__ == "__main__":
    raise SystemExit(0 if run()["outcome"] == "PASS" else 1)