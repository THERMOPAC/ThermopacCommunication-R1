#!/usr/bin/env python3
"""Synthetic test of dominant-gauge Lobatto physical collocation."""
import hashlib, json
from pathlib import Path
import numpy as np
from physical_collocation_v4 import solve_lobatto
from thermo_adapter import ConstantExcessAdapter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-physical-collocation-v4-validation.json"


def run():
    gc, gd = np.full(7, .002), np.full(7, .001)
    bc = np.array([.02, .02, .015, .01, .005, .82, .11])
    truth = np.array([-.0001, -.00001, -.000005, -.000003, -.000002, .00004, .00001])
    n = truth.sum()
    ic = np.exp(n/gc[0])*bc-np.expm1(n/gc[0])*truth/n
    id_ = np.array([.72, .10, .05, .03, .02, .05, .03])
    bd = np.exp(n/gd[0])*id_-np.expm1(n/gd[0])*truth/n
    answer = solve_lobatto(
        bc, bd, gc, gd, ConstantExcessAdapter(np.zeros(7)),
        ConstantExcessAdapter(np.log(ic/id_)), interface_seed_c=bc,
        interface_seed_d=bd, nodes=5, residual_tolerance=1e-10,
    )
    error = float(np.max(np.abs(answer["flux"]-truth)/np.maximum(gc, gd)))
    compact = {k: v for k, v in answer.items()
               if k not in ("continuousProfile", "dispersedProfile")}
    report = {"schemaVersion": "ISOLATED_LOBATTO_V4_VALIDATION",
              "scope": "SYNTHETIC_ONLY", "result": compact,
              "scaledFluxError": error, "productionJobsRun": [],
              "outcome": "PASS" if answer["numericalAccepted"] and error <= 1e-8 else "FAIL",
              "sourceHashes": {}}
    for name in ("physical_collocation_v4.py", "bernstein_profile_v5.py",
                 "verify_physical_collocation_v4.py"):
        path = Path(__file__).with_name(name)
        report["sourceHashes"][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    OUT.write_text(json.dumps(report, indent=2,
        default=lambda x: x.tolist() if hasattr(x, "tolist") else x.item())+"\n")
    print(json.dumps({"outcome": report["outcome"], "fluxError": error,
                      "status": answer["status"]}))
    return report


if __name__ == "__main__":
    raise SystemExit(0 if run()["outcome"] == "PASS" else 1)