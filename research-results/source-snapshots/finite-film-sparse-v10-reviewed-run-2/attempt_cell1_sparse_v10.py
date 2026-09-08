"""Prepared v10 real driver. Do not execute before architect authorization."""
from __future__ import annotations
import argparse, hashlib, json, shutil, signal, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"research-results/finite-film-cell1-sparse-v10-terminal-v2.json"
SNAP=ROOT/"research-results/source-snapshots/finite-film-sparse-v10-real-v2"
GATE=ROOT/"research-results/finite-film-boundary-qualification.json"
TEST=ROOT/"research-results/finite-film-sparse-collocation-v10-test-v6.json"
WARM=ROOT/"research-results/finite-film-cell1-lobatto-v6-focused-refinement.json"
WARM_SHA256="81cd9295dea730da37ddca9c9ff87451f85ba70df3f4803c37bd41c2c82bd394"
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def require_hash(path,expected,label):
    if sha(path)!=expected: raise RuntimeError(label)
def require_literal(actual,expected,label,np_module):
    if not np_module.array_equal(actual,expected): raise RuntimeError(label)

def serialize(answer):
    row={k:v for k,v in answer.items()
         if k not in ("u","continuousProfile","dispersedProfile")}
    for phase in ("continuous","dispersed"):
        p=answer[phase+"Profile"]
        row[phase+"Profile"]={"mesh":p.mesh.copy(),"bernsteinControls":p.controls.copy()}
    return row

def compare(current,previous,gc,gd,points):
    return {
      "maximumScaledFluxDriftFromPrevious":float(np.max(
        np.abs(current["flux"]-previous["flux"])/np.maximum(gc,gd))),
      "maximumInterfaceDriftFromPrevious":float(max(
        np.max(np.abs(current["interfaceContinuous"]-previous["interfaceContinuous"])),
        np.max(np.abs(current["interfaceDispersed"]-previous["interfaceDispersed"])))),
      "maximumCommonCoordinateProfileDriftFromPrevious":float(max(
        np.max(np.abs(current["continuousProfile"].values(points)-
                      previous["continuousProfile"].values(points))),
        np.max(np.abs(current["dispersedProfile"].values(points)-
                      previous["dispersedProfile"].values(points))))),
    }

def run(*, preflight_only=False, review_approved=False):
    if not preflight_only and not review_approved:
        raise RuntimeError("V10_REAL_RUN_REQUIRES_ARCHITECT_REVIEW_APPROVAL")
    begun=time.monotonic()
    dependencies=("attempt_cell1_sparse_v10.py","sparse_collocation_v10.py",
      "solver.py","thermo_adapter.py","exact_cache.py","bernstein_profile_v5.py",
      "boundary_adapter.py","verify_thermo.py")
    SNAP.mkdir(parents=True,exist_ok=True); snapshots={}
    for name in dependencies:
        source=Path(__file__).with_name(name); target=SNAP/name
        if target.exists() and target.read_bytes()!=source.read_bytes():
            raise RuntimeError("IMMUTABLE_V10_REAL_SNAPSHOT_CONFLICT")
        if not target.exists(): shutil.copyfile(source,target)
        snapshots[str(target.relative_to(ROOT))]=sha(target)
    report={"schemaVersion":"ISOLATED_SAVED_CELL_1_SPARSE_V10_TERMINAL",
      "executedSourceSnapshots":snapshots,"branches":[],"productionJobsRun":[],
      "columnContinuationRun":False,"physicalAcceptance":False}
    def write():
        OUT.write_text(json.dumps(report,indent=2,allow_nan=False,
          default=lambda x:x.tolist() if hasattr(x,"tolist") else x.item())+"\n")
    temporary=None
    try:
        gate,test=json.loads(GATE.read_text()),json.loads(TEST.read_text())
        if gate["verdict"]!="QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
            raise RuntimeError("BOUNDARY_ADAPTER_NOT_QUALIFIED")
        if test["outcome"]!="PASS": raise RuntimeError("V10_TEST_GATE_FAILED")
        for relative,expected in test["sourceHashes"].items():
            require_hash(ROOT/relative,expected,"V10_TEST_BOUND_SOURCE_CHANGED: "+relative)
        require_hash(WARM,WARM_SHA256,"PINNED_WARM_ARTIFACT_CHANGED")
        report["gateSha256"],report["testSha256"]=sha(GATE),sha(TEST)
        import verify_thermo
        _,engine,temporary,lineage=verify_thermo.load_pinned_adapter(); np=engine.np
        for key in ("jobBManifestSha256","stage4ManifestSha256","baseManifestSha256"):
            if lineage[key]!=gate["runtimeLineage"][key]: raise RuntimeError("RUNTIME_CHANGED")
        for prefix in ("archivedSnapshot","contract"):
            if sha(ROOT/gate["inputHashes"][prefix])!=gate["inputHashes"][prefix+"Sha256"]:
                raise RuntimeError("QUALIFIED_INPUT_CHANGED: "+prefix)
        sources=gate["sourceHashes"]
        for path_key,hash_key in (
          ("boundaryAdapterActualFile","boundaryAdapterSha256"),
          ("verifier","verifierSha256"),
          ("verifyThermoPinnedLoaderFile","verifyThermoSha256")):
            if sha(ROOT/sources[path_key])!=sources[hash_key]:
                raise RuntimeError("QUALIFIED_ADAPTER_SOURCE_CHANGED: "+path_key)
        from boundary_adapter import BoundaryExcessAdapter
        from exact_cache import ExactExcessCache
        from sparse_collocation_v10 import (LocalLobattoSystem,solve_sparse_v10,
                                            qualification_gate,root_fingerprint)
        states,audit,archived_n=verify_thermo.archived_state()
        for label,actual in (
          ("sourceResponseSha256",audit["body"]["resultSha256"]),
          ("sourceInputSha256",audit["snapshot"]["inputSha256"]),
          ("sourceStateSha256",audit["digest"](audit["state"].tolist()))):
            if gate["archivedStateHashes"][label]!=actual:
                raise RuntimeError("QUALIFIED_ARCHIVED_STATE_CHANGED: "+label)
        bc,bd=states["cell1_continuous"].copy(),states["cell1_dispersed"].copy()
        gc,gd=audit["solver"].kcct.copy(),audit["solver"].kdct.copy()
        report["input"]={"continuousBulk":bc.copy(),"dispersedBulk":bd.copy(),
          "freshDispersedInlet":states["literal_zero_dry_inlet"].copy(),
          "continuousConductances":gc.copy(),"dispersedConductances":gd.copy(),
          "archivedTotalFluxForReferenceOnly":archived_n,
          "stages":[33,65,129],"maximumScientificSeconds":350}
        require_literal(report["input"]["dispersedBulk"],states["cell1_dispersed"],
                        "LITERAL_STORED_DISPERSED_ENDPOINT_CHANGED",np)
        require_literal(report["input"]["freshDispersedInlet"],
                        states["literal_zero_dry_inlet"],
                        "LITERAL_ZERO_FRESH_INLET_CHANGED",np)
        warm=json.loads(WARM.read_text())["attempts"][0]
        from bernstein_profile_v5 import BernsteinHermiteProfile
        def recorded_profile(record,left=None,right=None):
            profile=BernsteinHermiteProfile.__new__(BernsteinHermiteProfile)
            profile.mesh=np.asarray(record["mesh"],dtype=float)
            profile.controls=np.asarray(record["bernsteinControls"],dtype=float)
            profile.left=left; profile.right=right
            if left is not None and not np.array_equal(profile.values([0])[0],left):
                raise RuntimeError("WARM_LITERAL_LEFT_ENDPOINT_MISMATCH")
            if right is not None and not np.array_equal(profile.values([1])[0],right):
                raise RuntimeError("WARM_LITERAL_RIGHT_ENDPOINT_MISMATCH")
            return profile
        warm_pc=recorded_profile(warm["continuousProfile"],left=bc)
        warm_pd=recorded_profile(warm["dispersedProfile"],right=bd)
        if preflight_only:
            report["outcome"]="PREFLIGHT_ONLY_PASS_NO_NATIVE_SCIENCE"
            report["preflightOnly"]=True
            report["warmArtifactSha256"]=sha(WARM)
            report["warmLiteralEndpointsVerified"]={
              "continuousLeft":np.array_equal(warm_pc.values([0])[0],bc),
              "dispersedRight":np.array_equal(warm_pd.values([1])[0],bd)}
            report["serializationProbe"]={"unavailableFirstDrifts":{
              "maximumScaledFluxDriftFromPrevious":None,
              "maximumInterfaceDriftFromPrevious":None,
              "maximumCommonCoordinateProfileDriftFromPrevious":None}}
            return report
        adapter=ExactExcessCache(BoundaryExcessAdapter(engine,298.15))
        oriented=(np.array([.01,.01,.01,.005,.005,.88,.08]),
                  np.array([.72,.12,.06,.025,.015,.05,.01]))
        common=np.linspace(0,1,2049)
        def branch(branch_row,ic,id_,flux=None,pc=None,pd=None):
            levels=branch_row["levels"]; previous=None
            for nodes in (33,65,129):
                system=LocalLobattoSystem(bc,bd,gc,gd,adapter,adapter,nodes)
                u=system.pack_initial(ic,id_,flux,pc,pd)
                t=time.monotonic(); answer=solve_sparse_v10(system,u)
                row=serialize(answer); row["nodes"]=nodes
                row["elapsedSeconds"]=time.monotonic()-t
                if previous is not None: row.update(compare(answer,previous,gc,gd,common))
                else:
                    # First comparison is to the independently supplied warm state
                    # only for diagnostics; it cannot be one of two final refinements.
                    row.update({k:None for k in (
                      "maximumScaledFluxDriftFromPrevious",
                      "maximumInterfaceDriftFromPrevious",
                      "maximumCommonCoordinateProfileDriftFromPrevious")})
                levels.append(row); previous=answer
                write()
                ic,id_,flux=answer["interfaceContinuous"],answer["interfaceDispersed"],answer["flux"]
                pc,pd=answer["continuousProfile"].values,answer["dispersedProfile"].values
            return levels,previous
        def budget(signum,frame): raise TimeoutError("V10_350_SECOND_SCIENTIFIC_BUDGET")
        old_handler=signal.signal(signal.SIGALRM,budget); signal.alarm(350)
        try:
            first_branch={"start":"ARCHIVED_17_WARM","levels":[]}
            report["branches"].append(first_branch); write()
            first,root1=branch(first_branch,warm["interfaceContinuous"],
              warm["interfaceDispersed"],warm["flux"],warm_pc.values,warm_pd.values)
            second_branch={"start":"INDEPENDENT_ORIENTED","levels":[]}
            report["branches"].append(second_branch); write()
            second,root2=branch(second_branch,oriented[0],oriented[1])
        finally:
            signal.alarm(0); signal.signal(signal.SIGALRM,old_handler)
        target_hash=root_fingerprint(root1)
        independent=serialize(root2); independent["nodes"]=129
        independent["comparisonTargetRootHash"]=target_hash
        independent.update({"maximumScaledFluxDifference":float(np.max(
          np.abs(root2["flux"]-root1["flux"])/np.maximum(gc,gd))),
          "maximumInterfaceDifference":float(max(
          np.max(np.abs(root2["interfaceContinuous"]-root1["interfaceContinuous"])),
          np.max(np.abs(root2["interfaceDispersed"]-root1["interfaceDispersed"])))),
          "maximumCommonCoordinateProfileDifference":float(max(
          np.max(np.abs(root2["continuousProfile"].values(common)-
                        root1["continuousProfile"].values(common))),
          np.max(np.abs(root2["dispersedProfile"].values(common)-
                        root1["dispersedProfile"].values(common)))))})
        decision=qualification_gate(first,independent)
        report["qualificationDecision"]=decision
        report["candidateHash"]=target_hash if decision["qualified"] else None
        report["outcome"]="NUMERICAL_CANDIDATE_FOR_MATCHED_STABILITY" if decision["qualified"] \
                         else "NO_QUALIFIED_SPARSE_V10_CANDIDATE"
    except BaseException as error:
        report["outcome"]="SPARSE_V10_BOUNDED_HOLD"
        report["error"]=f"{type(error).__name__}: {error}"
    finally:
        if temporary is not None: temporary.cleanup()
        report["elapsedSeconds"]=time.monotonic()-begun; write()
    return report
if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--preflight-only",action="store_true")
    parser.add_argument("--review-approved",action="store_true")
    parser.add_argument("--output",type=Path,default=OUT)
    parser.add_argument("--snapshot-directory",type=Path,default=SNAP)
    args=parser.parse_args()
    OUT=args.output.resolve()
    SNAP=args.snapshot_directory.resolve()
    if OUT.exists():
        parser.error("Refusing to overwrite existing execution evidence; select a new --output.")
    result=run(preflight_only=args.preflight_only,review_approved=args.review_approved)
    print(json.dumps({"outcome":result["outcome"],"elapsedSeconds":result["elapsedSeconds"]}))