#!/usr/bin/env python3
"""Synthetic dense-vs-local-sparse Jacobian and profile audit verification."""
import hashlib, json, time
from pathlib import Path
import numpy as np
from thermo_adapter import ConstantExcessAdapter
from physical_collocation_v4 import solve_lobatto
from sparse_collocation_v9 import solve_sparse_lobatto

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/"research-results/finite-film-sparse-collocation-v9-validation.json"

def run():
    gc, gd = np.full(7,.002), np.full(7,.001)
    bc=np.array([.02,.02,.015,.01,.005,.82,.11])
    truth=np.array([-.0001,-.00001,-.000005,-.000003,-.000002,.00004,.00001]); n=truth.sum()
    ic=np.exp(n/gc[0])*bc-np.expm1(n/gc[0])*truth/n
    id_=np.array([.72,.10,.05,.03,.02,.05,.03])
    bd=np.exp(n/gd[0])*id_-np.expm1(n/gd[0])*truth/n
    ca,da=ConstantExcessAdapter(np.zeros(7)),ConstantExcessAdapter(np.log(ic/id_))
    answers=[]; timings=[]
    for solver in (solve_lobatto, solve_sparse_lobatto):
        start=time.monotonic()
        answers.append(solver(bc,bd,gc,gd,ca,da,interface_seed_c=bc,
                              interface_seed_d=bd,nodes=5,residual_tolerance=1e-10))
        timings.append(time.monotonic()-start)
    flux_difference=float(np.max(np.abs(answers[0]["flux"]-answers[1]["flux"])))
    interface_difference=float(max(np.max(np.abs(answers[0]["interfaceContinuous"]-
                                                answers[1]["interfaceContinuous"])),
                                   np.max(np.abs(answers[0]["interfaceDispersed"]-
                                                answers[1]["interfaceDispersed"]))))
    report={"schemaVersion":"SPARSE_COLLOCATION_V9_VALIDATION","scope":"SYNTHETIC_ONLY",
      "denseSeconds":timings[0],"sparseSeconds":timings[1],
      "maximumDenseSparseFluxDifference":flux_difference,
      "maximumDenseSparseInterfaceDifference":interface_difference,
      "sparseAccepted":answers[1]["numericalAccepted"],
      "sparseWholeProfilesNonnegative":[answers[1]["continuousAudit"]["wholeCurveNonnegativeByConvexHull"],
                                       answers[1]["dispersedAudit"]["wholeCurveNonnegativeByConvexHull"]],
      "sparseReducedJacobian":answers[1]["reducedJacobian"],
      "outcome":"PASS" if answers[1]["numericalAccepted"] and flux_difference<=1e-10
                and interface_difference<=1e-10 else "FAIL",
      "productionJobsRun":[],"sourceHashes":{}}
    for name in ("sparse_collocation_v9.py","verify_sparse_collocation_v9.py",
                 "bernstein_profile_v5.py"):
        p=Path(__file__).with_name(name)
        report["sourceHashes"][str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
    OUT.write_text(json.dumps(report,indent=2,default=lambda x:x.tolist() if hasattr(x,"tolist") else x.item())+"\n")
    print(json.dumps({"outcome":report["outcome"],"fluxDifference":flux_difference}))
    return report
if __name__=="__main__": raise SystemExit(0 if run()["outcome"]=="PASS" else 1)