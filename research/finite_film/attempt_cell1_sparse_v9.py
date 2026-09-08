"""One bounded, independently-started, defect-adaptive sparse cell-1 run."""
from __future__ import annotations
import hashlib, json, shutil, signal, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"research-results/finite-film-cell1-sparse-v9-terminal.json"
GATE=ROOT/"research-results/finite-film-boundary-qualification.json"
VALID=ROOT/"research-results/finite-film-sparse-collocation-v9-validation.json"
SNAP=ROOT/"research-results/source-snapshots/finite-film-sparse-v9"
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def compact(a):
    row={k:v for k,v in a.items() if k not in ("continuousProfile","dispersedProfile")}
    for phase in ("continuous","dispersed"):
        p=a[phase+"Profile"]
        row[phase+"Profile"]={"mesh":p.mesh,"bernsteinControls":p.controls,
                             "representation":"AUTHORITATIVE_BERNSTEIN_DE_CASTELJAU"}
    return row
def run():
    begun=time.monotonic()
    report={"schemaVersion":"ISOLATED_SAVED_CELL_1_SPARSE_V9_TERMINAL",
      "scope":"ISOLATED_SAVED_CELL_1_ONLY","sourceSha256":sha(Path(__file__)),
      "independentStarts":[],"refinements":[],"stageTimingsSeconds":{},
      "productionJobsRun":[],"columnContinuationRun":False,"physicalAcceptance":False,
      "tasksCreatedOrChanged":[],"physicalFeedModified":False,
      "boundaryAdapterModified":False,"acceptanceGatesModified":False}
    def write():
        OUT.write_text(json.dumps(report,indent=2,allow_nan=False,
          default=lambda x:x.tolist() if hasattr(x,"tolist") else x.item())+"\n")
    temporary=None
    try:
        # Snapshot every executed scientific byte before loading the solver.
        SNAP.mkdir(parents=True,exist_ok=True)
        names=("attempt_cell1_sparse_v9.py","sparse_collocation_v9.py",
               "verify_sparse_collocation_v9.py","bernstein_profile_v5.py",
               "physical_collocation_v4.py")
        report["executedSourceSnapshots"]={}
        for name in names:
            source=Path(__file__).with_name(name); target=SNAP/name
            if target.exists() and target.read_bytes()!=source.read_bytes():
                raise RuntimeError("IMMUTABLE_V9_SOURCE_SNAPSHOT_CONFLICT")
            if not target.exists(): shutil.copyfile(source,target)
            report["executedSourceSnapshots"][str(target.relative_to(ROOT))]=sha(target)
        gate,validation=json.loads(GATE.read_text()),json.loads(VALID.read_text())
        if gate["verdict"]!="QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
            raise RuntimeError("BOUNDARY_ADAPTER_NOT_QUALIFIED")
        if validation["outcome"]!="PASS": raise RuntimeError("SPARSE_V9_VALIDATION_FAILED")
        for p,h in validation["sourceHashes"].items():
            if sha(ROOT/p)!=h: raise RuntimeError("SPARSE_V9_VALIDATION_SOURCE_CHANGED")
        report["qualificationEvidenceSha256"]=sha(GATE)
        report["validationEvidenceSha256"]=sha(VALID)
        import verify_thermo
        _,engine,temporary,lineage=verify_thermo.load_pinned_adapter(); np=engine.np
        for key in ("jobBManifestSha256","stage4ManifestSha256","baseManifestSha256"):
            if lineage[key]!=gate["runtimeLineage"][key]: raise RuntimeError("RUNTIME_LINEAGE_CHANGED")
        sources=gate["sourceHashes"]
        for pk,hk in (("boundaryAdapterActualFile","boundaryAdapterSha256"),
                      ("verifier","verifierSha256"),
                      ("verifyThermoPinnedLoaderFile","verifyThermoSha256")):
            if sha(ROOT/sources[pk])!=sources[hk]: raise RuntimeError("QUALIFIED_SOURCE_CHANGED")
        from boundary_adapter import BoundaryExcessAdapter
        from exact_cache import ExactExcessCache
        from sparse_collocation_v9 import solve_sparse_lobatto
        states,audit,archived_n=verify_thermo.archived_state()
        for label,actual in (("sourceResponseSha256",audit["body"]["resultSha256"]),
          ("sourceInputSha256",audit["snapshot"]["inputSha256"]),
          ("sourceStateSha256",audit["digest"](audit["state"].tolist()))):
            if gate["archivedStateHashes"][label]!=actual: raise RuntimeError("ARCHIVED_STATE_CHANGED")
        bc,bd=states["cell1_continuous"].copy(),states["cell1_dispersed"].copy()
        gc,gd=audit["solver"].kcct.copy(),audit["solver"].kdct.copy()
        adapter=ExactExcessCache(BoundaryExcessAdapter(engine,298.15))
        report["input"]={"continuousBulk":bc,"dispersedBulk":bd,
          "freshDispersedInlet":states["literal_zero_dry_inlet"],
          "continuousConductances":gc,"dispersedConductances":gd,
          "archivedTotalFluxForReferenceOnly":archived_n,"sevenFluxesFree":True,
          "totalFluxDefinition":"sum(componentFluxes)","maximumTotalSeconds":600}
        archived=(states["cell1_interface_continuous"],states["cell1_interface_dispersed"])
        oriented=(np.array([.01,.01,.01,.005,.005,.88,.08]),
                  np.array([.72,.12,.06,.025,.015,.05,.01]))
        deadline=begun+600
        def alarm(signum,frame): raise TimeoutError("SPARSE_V9_TOTAL_BUDGET")
        old=signal.signal(signal.SIGALRM,alarm); signal.alarm(max(1,int(deadline-time.monotonic())))
        answers=[]
        try:
            for label,(sc,sd) in (("ARCHIVED",archived),("INDEPENDENT_ORIENTED",oriented)):
                t=time.monotonic()
                a=solve_sparse_lobatto(bc,bd,gc,gd,adapter,adapter,
                    interface_seed_c=sc,interface_seed_d=sd,nodes=9,
                    residual_tolerance=1e-8,max_iterations=18)
                row=compact(a); row["start"]=label; row["elapsedSeconds"]=time.monotonic()-t
                report["independentStarts"].append(row); answers.append(a); write()
            agreeing=all(a["status"]=="CONVERGED" for a in answers)
            report["independentStartMaximumScaledFluxDifference"]=float(np.max(
                np.abs(answers[0]["flux"]-answers[1]["flux"])/np.maximum(gc,gd)))
            seed=min(answers,key=lambda a:max(a["continuousAudit"]["maximumScaledConstitutiveDefect"],
                                              a["dispersedAudit"]["maximumScaledConstitutiveDefect"]))
            common=np.linspace(0,1,1001); previous=seed
            for nodes in (33,129):
                t=time.monotonic()
                a=solve_sparse_lobatto(bc,bd,gc,gd,adapter,adapter,
                    interface_seed_c=previous["interfaceContinuous"],
                    interface_seed_d=previous["interfaceDispersed"],flux_seed=previous["flux"],
                    profile_seed_c=previous["continuousProfile"].values,
                    profile_seed_d=previous["dispersedProfile"].values,
                    nodes=nodes,residual_tolerance=1e-8,max_iterations=18)
                row=compact(a); row["elapsedSeconds"]=time.monotonic()-t
                row["maximumScaledFluxDriftFromPrevious"]=float(np.max(
                    np.abs(a["flux"]-previous["flux"])/np.maximum(gc,gd)))
                row["maximumInterfaceDriftFromPrevious"]=float(max(
                    np.max(np.abs(a["interfaceContinuous"]-previous["interfaceContinuous"])),
                    np.max(np.abs(a["interfaceDispersed"]-previous["interfaceDispersed"]))))
                row["maximumCommonCoordinateProfileDriftFromPrevious"]=float(max(
                    np.max(np.abs(a["continuousProfile"].values(common)-
                                  previous["continuousProfile"].values(common))),
                    np.max(np.abs(a["dispersedProfile"].values(common)-
                                  previous["dispersedProfile"].values(common)))))
                report["refinements"].append(row); previous=a; write()
        finally:
            signal.alarm(0); signal.signal(signal.SIGALRM,old)
        rows=report["refinements"]
        qualified=agreeing and report["independentStartMaximumScaledFluxDifference"]<=1e-8 and \
          len(rows)==2 and all(r["numericalAccepted"] and
          r["maximumScaledFluxDriftFromPrevious"]<=1e-8 and
          r["maximumInterfaceDriftFromPrevious"]<=1e-8 and
          r["maximumCommonCoordinateProfileDriftFromPrevious"]<=1e-8 for r in rows)
        if qualified:
            payload={"flux":rows[-1]["flux"],"interfaceContinuous":rows[-1]["interfaceContinuous"],
                     "interfaceDispersed":rows[-1]["interfaceDispersed"]}
            report["candidateHash"]=hashlib.sha256(json.dumps(payload,sort_keys=True,
              separators=(",",":")).encode()).hexdigest()
        report["outcome"]="NUMERICAL_CANDIDATE_FOR_MATCHED_STABILITY" if qualified else \
                          "NO_QUALIFIED_SPARSE_V9_CANDIDATE"
    except Exception as e:
        report["outcome"]="BOUNDED_SPARSE_V9_HOLD"
        report["error"]=f"{type(e).__name__}: {e}"
    finally:
        if temporary is not None: temporary.cleanup()
        report["elapsedSeconds"]=time.monotonic()-begun; write()
    print(json.dumps({"outcome":report["outcome"],"elapsed":report["elapsedSeconds"]}))
    return report
if __name__=="__main__": run()