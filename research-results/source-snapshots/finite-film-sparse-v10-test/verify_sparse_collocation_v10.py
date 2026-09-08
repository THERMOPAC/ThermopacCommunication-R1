#!/usr/bin/env python3
"""Tests only: local Jacobian values, structure, zero boundary and audits."""
import hashlib, json, shutil
from pathlib import Path
import numpy as np
from thermo_adapter import FiniteFilmThermoAdapter, ConstantExcessAdapter
from sparse_collocation_v10 import (LocalLobattoSystem, solve_sparse_v10,
                                    qualification_gate)

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"research-results/finite-film-sparse-collocation-v10-test-v4.json"
SNAP=ROOT/"research-results/source-snapshots/finite-film-sparse-v10-test"
class AnalyticRegular(FiniteFilmThermoAdapter):
    kind="synthetic_analytic_regular_solution"
    def __init__(self,omega):
        self.omega=omega
        super().__init__(lambda x:omega@x-.5*(x@omega@x))
    def excess_jacobian_full(self,x,dependent_index=None,step=None):
        return self.omega-np.outer(np.ones(7),x@self.omega)

def check_case(name,bc,bd):
    gc,gd=np.linspace(.002,.004,7),np.linspace(.001,.002,7)
    omega=np.diag(np.linspace(.01,.07,7)); adapter=AnalyticRegular(omega)
    ic=np.array([.08,.03,.02,.015,.005,.75,.10])
    id_=np.array([.70,.10,.06,.03,.02,.06,.03])
    system=LocalLobattoSystem(bc,bd,gc,gd,adapter,adapter,5)
    u=system.pack_initial(ic,id_)
    base=system.base(u)
    before=dict(system.instrumentation)
    local=system.local_column(u,base,0,2e-7)
    after=dict(system.instrumentation)
    local_delta={k:after[k]-before[k] for k in after}
    sparse=system.jacobian(u,base).toarray()
    dense=system.dense_reference_jacobian(u)
    return {"name":name,"maximumLocalDenseJacobianDifference":
        float(np.max(np.abs(sparse-dense))),
        "singleInteriorColumnInstrumentation":local_delta,
        "singleColumnNonzeroRows":int(np.count_nonzero(local)),
        "wholeFilmResidualCallsDuringSingleLocalColumn":
            local_delta["fullResidualCalls"],
        "passed":bool(np.max(np.abs(sparse-dense))<=2e-8 and
                      local_delta["fullResidualCalls"]==0 and
                      local_delta["endpointFieldCalls"]==3 and
                      local_delta["intervalCalls"]==2)}

def run():
    dependencies=("sparse_collocation_v10.py","verify_sparse_collocation_v10.py",
      "solver.py","thermo_adapter.py","exact_cache.py","bernstein_profile_v5.py")
    SNAP.mkdir(parents=True,exist_ok=True)
    snapshots={}
    for name in dependencies:
        source=Path(__file__).with_name(name); target=SNAP/name
        if target.exists() and target.read_bytes()!=source.read_bytes():
            raise RuntimeError("IMMUTABLE_V10_TEST_SNAPSHOT_CONFLICT")
        if not target.exists(): shutil.copyfile(source,target)
        snapshots[str(target.relative_to(ROOT))]=hashlib.sha256(target.read_bytes()).hexdigest()
    positive_c=np.array([.02,.02,.015,.01,.005,.82,.11])
    positive_d=np.array([.72,.10,.05,.03,.02,.05,.03])
    zero_d=np.array([.82,.10,.04,.025,.015,0.,0.])
    cases=[check_case("nonideal_positive",positive_c,positive_d),
           check_case("nonideal_literal_zero_fixed_boundary",positive_c,zero_d)]
    # Full nonlinear smoke verifies authoritative Bernstein, normalization,
    # positivity and rank gates on a manufactured constant-excess problem.
    gc,gd=np.full(7,.002),np.full(7,.001)
    truth=np.array([-.0001,-.00001,-.000005,-.000003,-.000002,.00004,.00001])
    n=truth.sum()
    ic=np.exp(n/gc[0])*positive_c-np.expm1(n/gc[0])*truth/n
    id_=positive_d.copy()
    bd=np.exp(n/gd[0])*id_-np.expm1(n/gd[0])*truth/n
    system=LocalLobattoSystem(positive_c,bd,gc,gd,
        ConstantExcessAdapter(np.zeros(7)),ConstantExcessAdapter(np.log(ic/id_)),5)
    answer=solve_sparse_v10(system,system.pack_initial(positive_c,bd),
                            max_iterations=18,tolerance=1e-10)
    smoke={"status":answer["status"],"numericalAccepted":answer["numericalAccepted"],
      "wholeProfilesNonnegative":[answer["continuousAudit"]["wholeCurveNonnegativeByConvexHull"],
                                 answer["dispersedAudit"]["wholeCurveNonnegativeByConvexHull"]],
      "normalizationDefects":[answer["continuousAudit"]["maximumNormalizationDefect"],
                              answer["dispersedAudit"]["maximumNormalizationDefect"],
      ],"fullRank":answer["reducedJacobian"]["fullRank"],
      "scaledFluxError":float(np.max(np.abs(answer["flux"]-truth)/np.maximum(gc,gd)))}
    gate_levels=[]
    for nodes,drift in ((33,1e-6),(65,5e-9),(129,2e-9)):
        gate_levels.append({"nodes":nodes,"numericalAccepted":True,
          "reducedJacobian":{"rank":10,"dimension":10,"fullRank":True},
          "maximumScaledFluxDriftFromPrevious":drift,
          "maximumInterfaceDriftFromPrevious":drift,
          "maximumCommonCoordinateProfileDriftFromPrevious":drift})
    gate=qualification_gate(gate_levels,{"numericalAccepted":True,
      "reducedJacobian":{"fullRank":True},"maximumScaledFluxDifference":2e-9,
      "maximumInterfaceDifference":2e-9,
      "maximumCommonCoordinateProfileDifference":2e-9})
    report={"schemaVersion":"SPARSE_COLLOCATION_V10_TEST_ONLY_V4",
      "scope":"SYNTHETIC_TESTS_ONLY_NO_REAL_SAVED_CELL_RUN","cases":cases,
      "manufacturedSmoke":smoke,"qualificationBookkeepingTest":gate,
      "realSavedCellRun":False,"productionJobsRun":[],
      "executedSourceSnapshotsPinnedBeforeScientificTests":snapshots,
      "outcome":"PASS" if all(c["passed"] for c in cases) and
        smoke["numericalAccepted"] and smoke["scaledFluxError"]<=1e-8 and
        gate["qualified"] and gate["successiveQualifyingPair"]==[65,129] else "FAIL",
      "sourceHashes":{}}
    for name in dependencies:
        p=Path(__file__).with_name(name)
        report["sourceHashes"][str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
    OUT.write_text(json.dumps(report,indent=2,
      default=lambda x:x.tolist() if hasattr(x,"tolist") else x.item())+"\n")
    print(json.dumps({"outcome":report["outcome"],"cases":cases,"smoke":smoke}))
    return report
if __name__=="__main__": raise SystemExit(0 if run()["outcome"]=="PASS" else 1)