#!/usr/bin/env python3
"""Bounded, conservative finite-volume countercurrent Job-C kernel."""
from __future__ import annotations
import hashlib, importlib.util, json, math, multiprocessing, os, signal, sys, tempfile, time
from pathlib import Path
from candidate_interface import CandidateInterfaceSolver, CandidateFailure, VERSION as CANDIDATE_VERSION
from boundary_interface_qualifier import qualify as qualify_boundary, VERSION as QUALIFIER_VERSION

sys.dont_write_bytecode = True
PROTOCOL = "ECR_PRE_PILOT_JOB_C_V1"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")

def canonical(v): return json.dumps(v, sort_keys=True, separators=(",", ":"), allow_nan=False)
def hashed(v):
    if isinstance(v, bool) or v is None or isinstance(v, str): return v
    if isinstance(v, (int,float)):
        a,b=format(float(v), ".16e").split("e"); return {"$number":f"{a}e{int(b)}"}
    if isinstance(v,list): return [hashed(x) for x in v]
    return {k:hashed(x) for k,x in v.items()}
def digest(v): return hashlib.sha256(canonical(hashed(v)).encode()).hexdigest()
def progress(phase, completed=0, total=None):
    body={"phase":phase,"completed":completed}
    if total is not None: body["total"]=total
    print("JOB_C_PROGRESS "+json.dumps(body,separators=(",",":")),flush=True)

def require_runtime_budget(budget, now=None):
    """Raise at every expensive residual boundary once the budget is spent."""
    current=time.monotonic() if now is None else float(now)
    elapsed=current-budget["started"]
    if elapsed>budget["maximumSeconds"]:
        raise TimeoutError("JOB_C_MONOLITHIC_INTERNAL_RUNTIME_BUDGET")
    return elapsed

root=Path(os.environ["JOB_B_INTERFACE_RUNTIME_ROOT"]).resolve()
spec=importlib.util.spec_from_file_location("job_c_verified_job_b",root/"server/ecr-pre-pilot/job-b-interface/worker.py")
if spec is None or spec.loader is None: raise RuntimeError("JOB_C_JOB_B_IMPORT_FAILED")
job_b=importlib.util.module_from_spec(spec); spec.loader.exec_module(job_b)

_profile_qualification_context=None
_active_qualification_pool=None
_active_runtime_budgets=None
QUALIFICATION_BUDGET_SECONDS=600
NONLINEAR_SOLVER_BUDGET_SECONDS=720

def terminate_descendants(signum, frame):
    """A cancelled lease must also terminate and reap forked qualifiers."""
    pool=_active_qualification_pool
    if pool is not None:
        pool.terminate()
        pool.join()
    raise SystemExit(128+signum)

signal.signal(signal.SIGTERM,terminate_descendants)

def active_runtime_budget_report():
    state=_active_runtime_budgets
    if state is None: return None
    now=time.monotonic()
    qualification=state["qualification"]
    solver=state["nonlinearSolver"]
    qualification_elapsed=(
      qualification.get("ended",now)-qualification["started"])
    report={"qualification":{
      "budgetSeconds":qualification["maximumSeconds"],
      "elapsedSeconds":qualification_elapsed,
      "cacheStatus":qualification.get("cacheStatus","IN_PROGRESS")}}
    if qualification.get("cacheKeySha256") is not None:
        report["qualification"]["cacheKeySha256"]=qualification["cacheKeySha256"]
    if solver["started"] is None:
        report["nonlinearSolver"]={"budgetSeconds":solver["maximumSeconds"],
          "elapsedSeconds":0.0,"status":"NOT_STARTED"}
    else:
        report["nonlinearSolver"]={"budgetSeconds":solver["maximumSeconds"],
          "elapsedSeconds":now-solver["started"],"status":"STARTED"}
    report["totalElapsedSeconds"]=now-state["caseStarted"]
    return report

def qualified_interface(request, branch_reference_state=None):
    """Replay through Job-C's versioned qualifier, never Job-B solve."""
    temporary,engine,_,_=job_b.scientific.build_engine(request["T"],0.0)
    try:
        return qualify_boundary(engine,request["T"],request["kc"],request["kd"],
          request["CtC"],request["CtD"],request["phase_config"],
          request["x_bulk_continuous"],request["x_bulk_dispersed"],
          branch_reference_state)
    finally:
        temporary.cleanup()

class JobCBlocked(RuntimeError):
    def __init__(self, code, diagnostics):
        super().__init__(code)
        self.code, self.diagnostics = code, diagnostics

def qualification_budget_block(budget, cache_status):
    elapsed=time.monotonic()-budget["started"]
    return JobCBlocked("JOB_C_QUALIFICATION_RUNTIME_BUDGET",
      {"classification":"QUALIFICATION_RUNTIME_BUDGET_EXHAUSTED",
       "physicalInfeasibilityClaimed":False,
       "runtimeBudgets":{"qualification":{
         "budgetSeconds":budget["maximumSeconds"],
         "elapsedSeconds":elapsed,"cacheStatus":cache_status},
         "nonlinearSolver":{"budgetSeconds":NONLINEAR_SOLVER_BUDGET_SECONDS,
           "elapsedSeconds":0.0,"status":"NOT_STARTED"}},
       "claimsEmitted":{"height":False,"efficiency":False,
         "finalRpm":False,"jobD":False,"release":False}})

def run_with_qualification_budget(budget, operation, cache_status):
    """Interrupt a main-process qualifier at its independent deadline."""
    elapsed=require_runtime_budget(budget)
    remaining=budget["maximumSeconds"]-elapsed
    previous_handler=signal.getsignal(signal.SIGALRM)
    def deadline(signum,frame):
        raise TimeoutError("JOB_C_QUALIFICATION_INTERNAL_RUNTIME_BUDGET")
    signal.signal(signal.SIGALRM,deadline)
    signal.setitimer(signal.ITIMER_REAL,max(remaining,1e-6))
    try:
        result=operation()
        require_runtime_budget(budget)
        return result
    except TimeoutError:
        raise qualification_budget_block(budget,cache_status)
    finally:
        signal.setitimer(signal.ITIMER_REAL,0.0)
        signal.signal(signal.SIGALRM,previous_handler)

def qualify_profile_contact(index):
    """Fork-only independent contact qualification; results are reordered by index."""
    r,engine,branch=_profile_qualification_context
    contact=r["axialLocalContactProfile"][index]
    out=qualify_boundary(engine,r["temperatureK"],r["kc"],r["kd"],
      branch["CtC"],branch["CtD"],
      r["phaseConfiguration"],contact["x_bulk_continuous"],
      contact["x_bulk_dispersed"],None)
    evidence={"numericalCell":index+1,
      "provenance":contact["provenance"],"qualifier":out}
    if out.get("status")!="QUALIFIED_JOB_C_BOUNDARY_BRANCH":
        return {"index":index,"evidence":evidence}
    return {"index":index,"evidence":evidence,
      "flux":[float(x) for x in
        out["interface"]["continuousComponentFluxMolM2S"]],
      "unknowns":[float(x) for x in out["unknowns"]]}

def file_sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def qualification_cache_identity(r):
    """Bind reusable contact evidence to every scientific input and artifact."""
    job_b_manifest_path=root/"job-b-interface-manifest.json"
    job_b_manifest=json.loads(job_b_manifest_path.read_text())
    qualifier_path=Path(__file__).parent/"boundary_interface_qualifier.py"
    branch=r["boundaryBranchQualificationRequest"]
    thermodynamic_input={
      "temperatureK":r["temperatureK"],"kc":r["kc"],"kd":r["kd"],
      "branchCtC":branch["CtC"],"branchCtD":branch["CtD"],
      "phaseConfiguration":r["phaseConfiguration"]}
    qualification_requests=[{
      **thermodynamic_input,
      "xBulkContinuous":contact["x_bulk_continuous"],
      "xBulkDispersed":contact["x_bulk_dispersed"]}
      for contact in r["axialLocalContactProfile"]]
    identity={
      "schemaVersion":"ECR_JOB_C_AXIAL_CONTACT_QUALIFICATION_CACHE_V1",
      "engine":{
        "jobBManifestSha256":file_sha256(job_b_manifest_path),
        "jobBArtifactSha256":job_b_manifest.get("artifactSha256"),
        "stage4AdapterManifestSha256":
          job_b_manifest.get("stage4Adapter",{}).get("manifestSha256"),
        "stage4AdapterArtifactSha256":
          job_b_manifest.get("stage4Adapter",{}).get("artifactSha256")},
      "thermodynamicInputSha256":digest(thermodynamic_input),
      "qualificationRequestsSha256":digest(qualification_requests),
      "boundaryBranchSourceSha256":branch["sourceStateSha256"],
      "profileSha256":r["axialLocalContactProfileSha256"],
      "qualifier":{"version":QUALIFIER_VERSION,
        "sha256":file_sha256(qualifier_path)}}
    return identity,digest(identity)

def qualification_cache_path(cache_key):
    cache_root=Path(os.environ.get("JOB_C_QUALIFICATION_CACHE_DIR",
      Path(tempfile.gettempdir())/"ecr-job-c-qualification-cache-v1"))
    return cache_root/f"{cache_key}.json"

def finite_vector(value,length):
    return (isinstance(value,list) and len(value)==length
      and all(not isinstance(x,bool) and isinstance(x,(int,float))
        and math.isfinite(float(x)) for x in value))

def load_qualification_cache(r):
    identity,key=qualification_cache_identity(r)
    path=qualification_cache_path(key)
    try:
        envelope=json.loads(path.read_text())
        body={k:v for k,v in envelope.items() if k!="cacheEnvelopeSha256"}
        qualified=envelope["qualifiedContacts"]
        valid=(envelope.get("schemaVersion")==identity["schemaVersion"]
          and envelope.get("identity")==identity
          and envelope.get("cacheKeySha256")==key
          and envelope.get("cacheEnvelopeSha256")==digest(body)
          and isinstance(qualified,list) and len(qualified)==7)
        if not valid: return None,identity,key
        for index,value in enumerate(qualified):
            evidence=value.get("evidence",{})
            qualifier=evidence.get("qualifier",{})
            response={k:v for k,v in qualifier.items() if k!="resultHash"}
            if (value.get("index")!=index or "flux" not in value
              or "unknowns" not in value
              or evidence.get("numericalCell")!=index+1
              or evidence.get("provenance")!=
                r["axialLocalContactProfile"][index]["provenance"]
              or not finite_vector(value.get("flux"),7)
              or not finite_vector(value.get("unknowns"),13)
              or qualifier.get("status")!="QUALIFIED_JOB_C_BOUNDARY_BRANCH"
              or not finite_vector(qualifier.get("unknowns"),13)
              or not finite_vector(qualifier.get("interface",{}).get(
                "continuousComponentFluxMolM2S"),7)
              or not finite_vector(qualifier.get("interface",{}).get(
                "dispersedComponentFluxMolM2S"),7)
              or value["flux"]!=qualifier["interface"][
                "continuousComponentFluxMolM2S"]
              or value["unknowns"]!=qualifier["unknowns"]
              or qualifier.get("resultHash")!=digest(response)):
                return None,identity,key
        return qualified,identity,key
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError):
        return None,identity,key

def store_qualification_cache(identity,key,qualified):
    path=qualification_cache_path(key)
    path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(path.parent,0o700)
    body={"schemaVersion":identity["schemaVersion"],"identity":identity,
      "cacheKeySha256":key,"qualifiedContacts":qualified}
    envelope={**body,"cacheEnvelopeSha256":digest(body)}
    temporary=path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(descriptor,"w") as handle:
            handle.write(canonical(envelope))
    except BaseException:
        try: temporary.unlink()
        except OSError: pass
        raise
    os.replace(temporary,path)

def flux_direction(value, tolerance=1e-15):
    if value > tolerance: return "CONTINUOUS_TO_DISPERSED"
    if value < -tolerance: return "DISPERSED_TO_CONTINUOUS"
    return "ZERO_WITHIN_TOLERANCE"

def frozen_boundary_audit(np, feedc, feedd, nc, nd, transfer):
    """Necessary global outlet positivity implied by the signed FV balances."""
    nc,nd=np.asarray(nc),np.asarray(nd)
    transfer=np.asarray(transfer)
    continuous_out=np.asarray(feedc)-np.sum(transfer,axis=0)
    dispersed_out=np.asarray(feedd)+np.sum(transfer,axis=0)
    reversed_transfer=-transfer
    reversed_continuous_out=np.asarray(feedc)-np.sum(reversed_transfer,axis=0)
    reversed_dispersed_out=np.asarray(feedd)+np.sum(reversed_transfer,axis=0)
    rows=[]
    for i,component in enumerate(COMPONENTS):
        rows.append({"component":component,
          "continuousComponentFluxMolM2S":float(nc[i]),
          "dispersedComponentFluxMolM2S":float(nd[i]),
          "continuousToDispersedSignConvention":flux_direction(float(nc[i])),
          "filmFluxEqualityResidualMolM2S":float(nc[i]-nd[i]),
          "frozenTransferAcrossSevenCellsMolS":float(np.sum(transfer[:,i])),
          "governedContinuousInletMolS":float(feedc[i]),
          "governedDispersedInletMolS":float(feedd[i]),
          "impliedContinuousOutletMolS":float(continuous_out[i]),
          "impliedDispersedOutletMolS":float(dispersed_out[i])})
    violations=[
      {"phase":phase,"component":COMPONENTS[i],"impliedOutletMolS":float(value)}
      for phase,values in (("continuous",continuous_out),("dispersed",dispersed_out))
      for i,value in enumerate(values) if value<=0]
    reversed_violations=[
      {"phase":phase,"component":COMPONENTS[i],"impliedOutletMolS":float(value)}
      for phase,values in (
        ("continuous",reversed_continuous_out),("dispersed",reversed_dispersed_out))
      for i,value in enumerate(values) if value<=0]
    return {"componentFluxTable":rows,
      "continuousToDispersedSignConvention":
        "POSITIVE_NC_REMOVES_FROM_CONTINUOUS_AND_ADDS_TO_DISPERSED",
      "counterCurrentBoundaryOrientation":{
        "continuousSignedInletFaceFlux":"fc[0] = +continuousFeedMolS",
        "dispersedSignedInletFaceFlux":"fd[m] = -dispersedFeedMolS",
        "continuousCellBalance":"fc[j] - fc[j+1] - transfer[j] = 0",
        "dispersedCellBalance":"fd[j] - fd[j+1] + transfer[j] = 0",
        "integratedContinuousOutlet":"continuousFeedMolS - sum(transfer)",
        "integratedDispersedOutlet":"dispersedFeedMolS + sum(transfer)"},
      "impliedContinuousOutletMolS":continuous_out.tolist(),
      "impliedDispersedOutletMolS":dispersed_out.tolist(),
      "nonpositiveImpliedOutlets":violations,
      "sourceSignReversalNonpositiveImpliedOutlets":reversed_violations,
      "sourceSignReversalWouldResolveAllBoundaries":len(reversed_violations)==0,
      "positiveGlobalOutletNecessaryConditionPassed":len(violations)==0,
      "signAndBoundaryOrientationConclusion":
        "B_TO_C_SOURCE_SIGNS_AND_COUNTERCURRENT_BOUNDARIES_ANALYTICALLY_CONSERVATIVE",
      "negativeFlowOrigin":
         "FIXED_GLOBAL_INLET_FLUX_APPROXIMATION_DIAGNOSTIC_ONLY",
      "physicalInfeasibilityClaimed":False}

def require_positive_frozen_solution(np, flow_vector, raw_max, scaled_max):
    minimum=float(np.min(flow_vector))
    accepted=(minimum>0 and raw_max<=1e-7 and scaled_max<=1e-7)
    return {"accepted":accepted,"minimumFlowMolS":minimum,
      "rawFvResidualMolS":raw_max,"scaledFvResidual":scaled_max,
      "maximumAllowedRawFvResidualMolS":1e-7,
      "maximumAllowedScaledFvResidual":1e-7,
      "requiredBefore":"INTERFACE_REFRESH_OR_189_EQUATION_SOLVE"}

def validate_branch_request(r):
    branch=r.get("boundaryBranchQualificationRequest")
    if not isinstance(branch,dict):
        raise ValueError("JOB_C_BOUNDARY_BRANCH_SOURCE_INVALID")
    def normalized_vector(value):
        return (isinstance(value,list) and len(value)==7
          and all(not isinstance(x,bool) and math.isfinite(float(x)) and float(x)>=0 for x in value)
          and abs(sum(float(x) for x in value)-1.0)<=1e-10)
    valid=(branch.get("componentOrder")==list(COMPONENTS)
      and branch.get("T")==r.get("temperatureK")
      and branch.get("kc")==r.get("kc") and branch.get("kd")==r.get("kd")
      and branch.get("phase_config")==r.get("phaseConfiguration")
      and normalized_vector(branch.get("x_bulk_continuous"))
      and normalized_vector(branch.get("x_bulk_dispersed"))
      and isinstance(branch.get("CtC"),(int,float)) and not isinstance(branch["CtC"],bool)
      and math.isfinite(float(branch["CtC"])) and float(branch["CtC"])>0
      and isinstance(branch.get("CtD"),(int,float)) and not isinstance(branch["CtD"],bool)
      and math.isfinite(float(branch["CtD"])) and float(branch["CtD"])>0
      and branch.get("provenance",{}).get("qualification")
        =="RECORDED_STAGE2_FEED_END_LOCAL_CONTACT_STATE")
    source={k:v for k,v in branch.items() if k!="sourceStateSha256"}
    if (not valid or branch.get("sourceStateSha256")!=digest(source)):
        raise ValueError("JOB_C_BOUNDARY_BRANCH_SOURCE_INVALID")
    profile=r.get("axialLocalContactProfile")
    authority=r.get("axialLocalContactProfileAuthority")
    source_bins=[] if not isinstance(profile,list) else [
      row.get("provenance",{}).get("sourceStageFromFeedEnd",[])
      for row in profile if isinstance(row,dict)]
    coverage=[ordinal for source_bin in source_bins
      if isinstance(source_bin,list) for ordinal in source_bin]
    source_stage_count=authority.get("sourceStageCount") if isinstance(authority,dict) else None
    expected_ascending_bins=[]
    if (isinstance(source_stage_count,int) and not isinstance(source_stage_count,bool)
        and source_stage_count>=7):
      for index in range(7):
        first=math.floor(index*source_stage_count/7)
        exclusive_last=math.floor((index+1)*source_stage_count/7)
        last=max(first+1,exclusive_last)
        expected_ascending_bins.append(list(range(first+1,last+1)))
    expected_source_bins=list(reversed(expected_ascending_bins))
    bins_valid=(len(source_bins)==7
      and all(isinstance(source_bin,list) and len(source_bin)>0
        and all(isinstance(ordinal,int) and not isinstance(ordinal,bool)
          and ordinal>0 for ordinal in source_bin)
        and source_bin==sorted(source_bin)
        and source_bin==list(range(source_bin[0],source_bin[-1]+1))
        for source_bin in source_bins)
      and all(max(source_bins[index+1])<min(source_bins[index])
        for index in range(len(source_bins)-1))
      and source_bins==expected_source_bins)
    profile_source={"authority":authority,"profile":profile}
    authority_valid=(isinstance(authority,dict)
      and authority.get("qualification")==
        "GOVERNED_PINNED_STAGE2_AXIAL_LOCAL_CONTACT_PROFILE"
      and authority.get("componentOrder")==list(COMPONENTS)
      and authority.get("phaseConfiguration")==r.get("phaseConfiguration")
      and authority.get("targetNumericalCells")==7
      and authority.get("sourceStageCount")==len(coverage)
      and authority.get("mapping")==
        "STAGE2_FEED_END_ASCENDING_EQUAL_BINS_REVERSED_TO_CONTINUOUS_INLET_FV_ORDER_V1"
      and isinstance(authority.get("stage2ResultSnapshotHash"),str)
      and len(authority["stage2ResultSnapshotHash"])==64
      and bins_valid
      and sorted(coverage)==list(range(1,len(coverage)+1))
      and len(set(coverage))==len(coverage))
    if (not isinstance(profile,list) or r.get("compartments")!=7
      or len(profile)!=r.get("compartments")
      or any(not isinstance(row,dict) or row.get("numericalCell")!=index+1
        or not normalized_vector(row.get("x_bulk_continuous"))
        or not normalized_vector(row.get("x_bulk_dispersed"))
        or row.get("provenance",{}).get("source")!=
          "PINNED_STAGE2_RECORDED_LOCAL_CONTACTS_REBINNED_TO_FV_CELLS"
        for index,row in enumerate(profile))):
        raise ValueError("JOB_C_AXIAL_LOCAL_CONTACT_PROFILE_INVALID")
    if (not authority_valid
      or r.get("axialLocalContactProfileSha256")!=digest(profile_source)):
        raise ValueError("JOB_C_AXIAL_LOCAL_CONTACT_PROFILE_AUTHORITY_INVALID")

def case(r, name, dc, dd, solvers):
    np=solvers[0].np
    m=r["compartments"]; A=math.pi*r["columnDiameterM"]**2/4
    feedc=[float(x) for x in r["continuousFeedMolS"]]; feedd=[float(x) for x in r["dispersedFeedMolS"]]
    if m<1 or min(sum(feedc),sum(feedd))<=0 or any(len(x)!=7 for x in [feedc,feedd,r["kc"],r["kd"]]):
        raise ValueError("JOB_C_INVALID_GOVERNED_FLOW_INPUT")
    case_started=time.monotonic()
    qualification_budget={"started":case_started,
      "maximumSeconds":QUALIFICATION_BUDGET_SECONDS}
    budget={"calls":0,"residualCalls":0,"started":None,
            "maximumSeconds":NONLINEAR_SOLVER_BUDGET_SECONDS}
    global _active_runtime_budgets
    _active_runtime_budgets={"caseStarted":case_started,
      "qualification":qualification_budget,"nonlinearSolver":budget}
    accepted_by_height={}
    inlet_xc=np.asarray(feedc)/sum(feedc)
    inlet_xd=np.asarray(feedd)/sum(feedd)
    # These are authoritative physical inlet compositions. They are consumed
    # literally; absent components are never epsilon-seeded at a feed face.
    if any((feedd[i] == 0.0 and inlet_xd[i] != 0.0) for i in range(7)):
        raise JobCBlocked("JOB_C_PHYSICAL_DISPERSED_INLET_ZERO_NOT_PRESERVED",
          {"dispersedFeedMolS":feedd,"dispersedInletMoleFractions":inlet_xd.tolist()})
    branch=r["boundaryBranchQualificationRequest"]
    if (branch.get("componentOrder")!=list(COMPONENTS)
      or branch.get("T")!=r["temperatureK"]
      or branch.get("kc")!=r["kc"] or branch.get("kd")!=r["kd"]
      or branch.get("phase_config")!=r["phaseConfiguration"]
      ):
        raise JobCBlocked("JOB_C_BOUNDARY_BRANCH_SOURCE_INVALID",
          {"sourceStateSha256":branch.get("sourceStateSha256")})
    source_for_hash={k:v for k,v in branch.items() if k!="sourceStateSha256"}
    if branch.get("sourceStateSha256")!=digest(source_for_hash):
        raise JobCBlocked("JOB_C_BOUNDARY_BRANCH_SOURCE_HASH_INVALID",{})
    inlet_qualifier=run_with_qualification_budget(qualification_budget,
      lambda:qualify_boundary(solvers[0].engine,branch["T"],branch["kc"],branch["kd"],
        branch["CtC"],branch["CtD"],branch["phase_config"],
        branch["x_bulk_continuous"],branch["x_bulk_dispersed"]),
      "NOT_CHECKED")
    if inlet_qualifier.get("status") != "QUALIFIED_JOB_C_BOUNDARY_BRANCH":
        raise JobCBlocked("JOB_C_BOUNDARY_INTERFACE_QUALIFIER_FAILED",
          {"qualifier":inlet_qualifier,
           "jobBProvenanceClassification":
             "PINNED_ENGINE_LINEAGE_ONLY_NO_JOB_B_FLUX_CONSUMED"})
    inlet_nc=np.asarray(inlet_qualifier["interface"]["continuousComponentFluxMolM2S"])
    inlet_nd=np.asarray(inlet_qualifier["interface"]["dispersedComponentFluxMolM2S"])
    inlet_qi=inlet_qualifier["interface"]
    qualified_candidate_seed=solvers[0].inverse_transform(
      inlet_qi["continuousMoleFractions"],inlet_qi["dispersedMoleFractions"],
      inlet_qi["totalMolarFluxMolM2S"])
    if any(branch["x_bulk_dispersed"][i]==0.0 and inlet_nc[i]<0.0
      for i in (5,6)):
        raise JobCBlocked("JOB_C_BOUNDARY_INTERFACE_QUALIFIER_FAILED",
          {"gate":"EXACT_ZERO_SOLVENT_TANGENT_CONE","qualifier":inlet_qualifier})
    # Reuse only a complete, hash-bound qualification set. Cache misses retain
    # the forked process tree so lease cancellation terminates every descendant.
    qualified,cache_identity,cache_key=load_qualification_cache(r)
    cache_hit=qualified is not None
    if cache_hit:
        progress("axial contact qualification cache",m,m)
    else:
        global _profile_qualification_context,_active_qualification_pool
        _profile_qualification_context=(r,solvers[0].engine,branch)
        context=multiprocessing.get_context("fork")
        pool=context.Pool(processes=min(3,m))
        _active_qualification_pool=pool
        jobs=[pool.apply_async(qualify_profile_contact,(index,)) for index in range(m)]
        try:
            completed=-1
            while completed<m:
                require_runtime_budget(qualification_budget)
                completed=sum(job.ready() for job in jobs)
                progress("axial contact qualification",completed,m)
                if completed<m: time.sleep(1)
            qualified=[job.get() for job in jobs]
            pool.close(); pool.join()
        except TimeoutError:
            pool.terminate(); pool.join()
            raise qualification_budget_block(qualification_budget,"MISS")
        except BaseException:
            pool.terminate(); pool.join()
            raise
        finally:
            _active_qualification_pool=None
            _profile_qualification_context=None
    qualified.sort(key=lambda value:value["index"])
    profile_evidence=[]; profile_flux=[]; profile_unknowns=[]
    for value in qualified:
        profile_evidence.append(value["evidence"])
        if "flux" not in value:
            raise JobCBlocked("JOB_C_AXIAL_CONTACT_QUALIFICATION_FAILED",
              {"numericalCell":value["index"]+1,
               "qualifier":value["evidence"]["qualifier"],
               "qualifiedLocalContacts":profile_evidence,
               "profileHeightClaimed":False})
        profile_flux.append(value["flux"])
        profile_unknowns.append(value["unknowns"])
    if not cache_hit:
        store_qualification_cache(cache_identity,cache_key,qualified)
    qualification_seconds=time.monotonic()-qualification_budget["started"]
    qualification_runtime={"budgetSeconds":qualification_budget["maximumSeconds"],
      "elapsedSeconds":qualification_seconds,
      "cacheStatus":"HIT_FULL_HASH_MATCH" if cache_hit else "MISS_QUALIFIED_AND_STORED",
      "cacheKeySha256":cache_key}
    try:
        require_runtime_budget(qualification_budget)
    except TimeoutError:
        raise qualification_budget_block(qualification_budget,
          qualification_runtime["cacheStatus"])
    qualification_budget.update({"ended":time.monotonic(),
      "cacheStatus":qualification_runtime["cacheStatus"],
      "cacheKeySha256":cache_key})
    budget["started"]=time.monotonic()
    profile_flux=np.asarray(profile_flux,dtype=float)
    # At H=2 m, B is positive. Therefore existence/nonexistence of a positive
    # lambda interval has the same sign result at every positive height.
    B=6*r["operatingHoldup"]/r["d32M"]*A*(2.0/m)
    constraints=[]; upper=math.inf
    for j in range(m):
        prefix=np.sum(profile_flux[:j+1],axis=0)*B
        suffix=np.sum(profile_flux[j:],axis=0)*B
        for phase,available,coefficient in (
          ("continuous",np.asarray(feedc),-prefix),
          ("dispersed",np.asarray(feedd),suffix)):
            for i in range(7):
                admitted=True; local_upper=math.inf
                if available[i]==0.0:
                    admitted=coefficient[i]>0.0
                elif coefficient[i]<0.0:
                    local_upper=available[i]/(-coefficient[i])
                    upper=min(upper,local_upper)
                constraints.append({"numericalCell":j+1,"phase":phase,
                  "component":COMPONENTS[i],"governedInletMolS":float(available[i]),
                  "lambdaCoefficientMolS":float(coefficient[i]),
                  "strictPositiveIntervalAdmitted":bool(admitted),
                  "lambdaUpperBound":None if math.isinf(local_upper) else float(local_upper)})
    violations=[row for row in constraints if not row["strictPositiveIntervalAdmitted"]]
    interval_exists=(not violations and upper>0.0)
    profile_audit={"status":"STRICTLY_POSITIVE_CONTINUATION_INTERVAL_PROVED"
        if interval_exists else "BLOCKED_NO_STRICTLY_POSITIVE_CONTINUATION_INTERVAL",
      "referenceHeightM":2.0,"geometricFactorPerCellM2":B,
      "lambdaInterval":{"lowerExclusive":0.0,
        "upperExclusive":None if math.isinf(upper) else float(upper)},
      "allHydrocarbonPrefixesAndSolventSuffixesAdmitted":interval_exists,
      "constraints":constraints,"violations":violations,
      "qualifiedLocalContacts":profile_evidence,
      "governedInletInventory":{"continuousFeedMolS":feedc,
        "dispersedFeedMolS":feedd},"numericalTraceAdded":False,
      "literalPhysicalFeedFacesPreserved":True,"profileHeightClaimed":False}
    if not interval_exists:
        raise JobCBlocked("JOB_C_AXIAL_PROFILE_NO_POSITIVE_CONTINUATION_INTERVAL",
          profile_audit)
    initial_lambda=min(1e-5,upper*.25) if math.isfinite(upper) else 1e-5
    if not initial_lambda>0.0:
        raise JobCBlocked("JOB_C_AXIAL_PROFILE_NO_POSITIVE_CONTINUATION_INTERVAL",
          profile_audit)

    def solve_height(h, warm=None):
        """Solve all 98 FV and 91 frozen Job-B equations simultaneously."""
        np,scipy=solvers[0].np,solvers[0].scipy
        if m != 7:
            raise JobCBlocked("JOB_C_REQUIRES_SEVEN_NUMERICAL_FV_CELLS",
              {"numericalCells":m,"qualification":"NUMERICAL_FV_DISCRETIZATION_NOT_PHYSICAL_STAGE_COUNT"})
        total_flow=sum(feedc)+sum(feedd)
        scale=np.asarray([max(feedc[i]+feedd[i],total_flow*1e-7) for i in range(7)])
        epsilon=max(total_flow*1e-13,1e-20)
        upper_flow=max(total_flow*10,epsilon*10)
        dz=h/m; av=6*r["operatingHoldup"]/r["d32M"]

        def initial():
            if warm is not None:
                return np.asarray(warm).copy()
            transfer=initial_lambda*profile_flux*av*A*dz
            c=np.asarray([np.asarray(feedc)-np.sum(transfer[:j+1],axis=0)
              for j in range(m)])
            d=np.asarray([np.asarray(feedd)+np.sum(transfer[j:],axis=0)
              for j in range(m)])
            flows=np.r_[c.reshape(-1),d.reshape(-1)]
            if (np.min(flows)<=epsilon or np.any(flows>upper[:14*m])):
                raise JobCBlocked("JOB_C_BOUNDARY_AWARE_INITIAL_PROFILE_INVALID",
                  {"heightM":h,"lambda":initial_lambda,
                   "minimumFlowMolS":float(np.min(flows)),
                   "profileIntervalQualification":profile_audit})
            return np.r_[flows,np.asarray(profile_unknowns).reshape(-1)]

        def unpack(x):
            # Direct bound-constrained molar-flow coordinates avoid the
            # zero-feed dF/dlog(F)=F lock while preserving strict positivity.
            flows=x[:14*m].reshape(2,m,7)
            return flows[0],flows[1],x[14*m:].reshape(m,13)

        def raw_evaluate(x,lam):
            c,d,u=unpack(x)
            cc=c/c.sum(axis=1)[:,None]*r["continuousTotalConcentrationMolM3"]
            cd=d/d.sum(axis=1)[:,None]*r["dispersedTotalConcentrationMolM3"]
            fc=np.zeros((m+1,7)); fd=np.zeros((m+1,7))
            fc[0]=feedc; fd[m]=-np.asarray(feedd)
            for j in range(1,m):
                fc[j]=(c[j-1]+c[j])/2-dc*A*(cc[j]-cc[j-1])/dz
                fd[j]=-(d[j-1]+d[j])/2-dd*A*(cd[j]-cd[j-1])/dz
            fc[m]=c[m-1]; fd[0]=-d[0]
            interface=[]; nc=[]; details=[]
            for j in range(m):
                values=solvers[j].equations(u[j],c[j]/c[j].sum(),d[j]/d[j].sum())
                interface.extend(values[0]); nc.append(values[4]); details.append(values)
            nc=np.asarray(nc)
            tr=lam*nc*av*A*dz
            rc=fc[:-1]-fc[1:]-tr
            rd=fd[:-1]-fd[1:]+tr
            fv=np.asarray([v for j in range(m) for v in np.r_[rc[j],rd[j]]])
            return {"c":c,"d":d,"u":u,"fc":fc,"fd":fd,"tr":tr,"rc":rc,"rd":rd,
                    "fv":fv,"interface":np.asarray(interface),"details":details}

        def frozen_flow_evaluate(flow_vector,lam,nc):
            c,d=flow_vector.reshape(2,m,7)
            cc=c/c.sum(axis=1)[:,None]*r["continuousTotalConcentrationMolM3"]
            cd=d/d.sum(axis=1)[:,None]*r["dispersedTotalConcentrationMolM3"]
            fc=np.zeros((m+1,7)); fd=np.zeros((m+1,7))
            fc[0]=feedc; fd[m]=-np.asarray(feedd)
            for j in range(1,m):
                fc[j]=(c[j-1]+c[j])/2-dc*A*(cc[j]-cc[j-1])/dz
                fd[j]=-(d[j-1]+d[j])/2-dd*A*(cd[j]-cd[j-1])/dz
            fc[m]=c[m-1]; fd[0]=-d[0]
            transfer=lam*np.asarray(nc)*av*A*dz
            rc=fc[:-1]-fc[1:]-transfer
            rd=fd[:-1]-fd[1:]+transfer
            return np.asarray([v for j in range(m) for v in np.r_[rc[j],rd[j]]])

        def residual(x,lam):
            budget["residualCalls"]+=1
            require_runtime_budget(budget)
            ev=raw_evaluate(x,lam)
            scaled_fv=np.asarray([v/scale[i%7] for i,v in enumerate(ev["fv"])])
            return np.r_[scaled_fv,ev["interface"]]

        # Explicit block sparsity: every FV source sees both local phase-flow
        # blocks through the interface equations, in addition to its own
        # phase's neighboring convective/dispersion blocks.
        sparsity=scipy.sparse.lil_matrix((27*m,27*m),dtype=int)
        for j in range(m):
            neighboring={j}
            if j>0: neighboring.add(j-1)
            if j<m-1: neighboring.add(j+1)
            for row in range(14*j,14*j+7):
                for k in neighboring:
                    sparsity[row,7*k:7*k+7]=1
                sparsity[row,7*m+7*j:7*m+7*j+7]=1
                sparsity[row,14*m+13*j:14*m+13*j+13]=1
            for row in range(14*j+7,14*j+14):
                for k in neighboring:
                    sparsity[row,7*m+7*k:7*m+7*k+7]=1
                sparsity[row,7*j:7*j+7]=1
                sparsity[row,14*m+13*j:14*m+13*j+13]=1
            for row in range(14*m+13*j,14*m+13*j+13):
                sparsity[row,7*j:7*j+7]=1
                sparsity[row,7*m+7*j:7*m+7*j+7]=1
                sparsity[row,14*m+13*j:14*m+13*j+13]=1
        sparsity=sparsity.tocsr()
        flow_sparsity=sparsity[:14*m,:14*m]
        lower=np.r_[np.full(14*m,epsilon),np.full(13*m,-35.0)]
        upper=np.r_[np.full(14*m,upper_flow),np.full(13*m,35.0)]
        variable_scale=np.r_[np.tile(scale,2*m),np.ones(13*m)]
        flow_scale=np.tile(scale,2*m)

        def frozen_conservative_seed(base_flows,lam,nc):
            """Unclipped plug-flow balance seed; dispersion is closed by solver."""
            c,d=np.asarray(base_flows).reshape(2,m,7).copy()
            transfer=lam*np.asarray(nc)*av*A*dz
            for j in range(m):
                c[j]=np.asarray(feedc)-np.sum(transfer[:j+1],axis=0)
                d[j]=np.asarray(feedd)+np.sum(transfer[j:],axis=0)
            return np.r_[c.reshape(-1),d.reshape(-1)]

        def audit_frozen_flow_sparsity(flow_vector,lam,nc):
            """Prove the declared 98x98 mask covers numerical dependencies."""
            baseline=frozen_flow_evaluate(flow_vector,lam,nc)
            declared=flow_sparsity.toarray().astype(bool)
            missing=[]; actual_nonzeros=0
            for column in range(14*m):
                component=column%7
                step=max(abs(float(flow_vector[column]))*1e-7,
                  float(scale[component])*1e-8,epsilon*10)
                perturbed=np.asarray(flow_vector).copy()
                if perturbed[column]+step>upper[column]:
                    step=-step
                perturbed[column]+=step
                derivative=(frozen_flow_evaluate(perturbed,lam,nc)-baseline)/step
                threshold=max(1e-10,float(np.max(np.abs(derivative)))*1e-9)
                rows=np.flatnonzero(np.abs(derivative)>threshold)
                actual_nonzeros+=len(rows)
                for row in rows:
                    if not declared[row,column]:
                        missing.append({"row":int(row),"column":int(column),
                          "derivative":float(derivative[row])})
            if missing:
                raise JobCBlocked("JOB_C_FROZEN_FV_JACOBIAN_SPARSITY_MISMATCH",
                  {"heightM":h,"lambda":lam,"missingDependencyCount":len(missing),
                   "missingDependencies":missing[:20]})
            return {"declaredNonzeros":int(flow_sparsity.nnz),
              "finiteDifferenceNonzeros":int(actual_nonzeros),
              "missingDependencyCount":0,
              "qualification":"NUMERICAL_JACOBIAN_COVERAGE_AUDIT"}

        def diagnostic_rows(ev):
            rows=[]
            for j in range(m):
                for phase,values in (("continuousFV",ev["rc"][j]),("dispersedFV",ev["rd"][j])):
                    rows.extend({"numericalCell":j+1,"type":phase,"component":COMPONENTS[i],
                                 "rawValue":float(values[i])} for i in range(7))
                eq,_,_,_,_,_,delta=ev["details"][j]
                rows.extend({"numericalCell":j+1,"type":"isoactivity","component":COMPONENTS[i],
                             "rawValue":float(eq[i])} for i in range(7))
                rows.extend({"numericalCell":j+1,"type":"filmFluxEquality","component":COMPONENTS[i],
                             "rawValue":float(delta[i])} for i in range(6))
            return sorted(rows,key=lambda row:abs(row["rawValue"]),reverse=True)

        def diagnostics(ev):
            return diagnostic_rows(ev)[:20]

        def acceptance_metrics(state,lam):
            ev=raw_evaluate(state,lam)
            raw=float(np.max(np.abs(ev["fv"])))
            scaled=float(np.max(np.abs(
              [v/scale[i%7] for i,v in enumerate(ev["fv"])])))
            interface=max(
              max(float(np.max(np.abs(values[0][:7]))),
                float(np.max(np.abs(values[6])/solvers[j].scale)))
              for j,values in enumerate(ev["details"]))
            minimum=float(min(np.min(ev["c"]),np.min(ev["d"])))
            return ev,{"rawFvResidualMolS":raw,
              "scaledFvResidual":scaled,
              "maximumOriginalJobBGateResidual":interface,
              "minimumFlowMolS":minimum,
              "accepted":bool(minimum>0 and raw<=1e-7 and scaled<=1e-7
                and interface<=1e-7)}

        def pseudo_arclength_qualification(
              base_state,base_lambda,target_lambda,independent_restart_state):
            """Trace the unchanged 189 equations in scaled (x, lambda) space."""
            progress("pseudo-arclength boundary qualification")
            y0=np.asarray(base_state)/variable_scale
            lambda_scale=max(abs(target_lambda-base_lambda),1e-7)
            steps=(2e-6,1e-6)
            jacobians=[]; tangents=[]; derivatives=[]; rank_rows=[]
            def scaled_residual(y,lam):
                return residual(np.asarray(y)*variable_scale,lam)
            for relative_step in steps:
                require_runtime_budget(budget)
                jac=scipy.optimize._numdiff.approx_derivative(
                  lambda y:scaled_residual(y,base_lambda),y0,
                  method="3-point",rel_step=relative_step)
                lambda_step=max(lambda_scale*relative_step,1e-12)
                rplus=scaled_residual(y0,base_lambda+lambda_step)
                rminus=scaled_residual(y0,base_lambda-lambda_step)
                rlambda=(rplus-rminus)/(2*lambda_step)
                augmented=np.column_stack((jac,rlambda))
                _,singular,vh=np.linalg.svd(augmented,full_matrices=True)
                jac_singular=np.linalg.svd(jac,compute_uv=False)
                tangent=vh[-1]
                if tangent[-1]<0: tangent=-tangent
                tangent/=np.linalg.norm(tangent)
                tangent_residual=float(np.max(np.abs(augmented@tangent)))
                threshold=float(singular[0]*max(augmented.shape)
                  *np.finfo(float).eps)
                rank=int(np.sum(singular>threshold))
                jac_threshold=float(jac_singular[0]*max(jac.shape)
                  *np.finfo(float).eps)
                jac_rank=int(np.sum(jac_singular>jac_threshold))
                declared=sparsity.toarray().astype(bool)
                numerical=np.zeros_like(declared)
                for column in range(jac.shape[1]):
                    column_threshold=max(1e-9,
                      float(np.max(np.abs(jac[:,column])))*1e-7)
                    numerical[:,column]=np.abs(jac[:,column])>column_threshold
                undeclared=np.argwhere(numerical & ~declared)
                if abs(tangent[-1])>1e-12:
                    derivative=variable_scale*tangent[:-1]/tangent[-1]
                else:
                    derivative=np.full(27*m,np.nan)
                jacobians.append((jac,rlambda))
                tangents.append(tangent)
                derivatives.append(derivative)
                rank_rows.append({"relativeFiniteDifferenceStep":relative_step,
                  "rank":rank,"requiredRank":27*m,
                  "fixedLambdaJacobianRank":jac_rank,
                  "requiredFixedLambdaJacobianRank":27*m,
                  "largestSingularValue":float(singular[0]),
                  "smallestNonzeroSingularValue":float(singular[-1]),
                  "fixedLambdaSmallestSingularValue":
                    float(jac_singular[-1]),
                  "declaredJacobianNonzeros":int(np.sum(declared)),
                  "finiteDifferenceJacobianNonzeros":int(np.sum(numerical)),
                  "undeclaredJacobianDependencyCount":int(len(undeclared)),
                  "rankThreshold":threshold,
                  "tangentLambdaComponent":float(tangent[-1]),
                  "maximumTangentEquationResidual":tangent_residual})
            alignment=float(abs(np.dot(tangents[0],tangents[1])))
            derivative_alignment=float(np.dot(derivatives[0],derivatives[1])
              /(np.linalg.norm(derivatives[0])*np.linalg.norm(derivatives[1])))
            flow0=np.asarray(base_state)[:14*m]
            limiting=[]
            for index,value in enumerate(flow0):
                slopes=[float(derivative[index]) for derivative in derivatives]
                if max(slopes)<0:
                    phase_index,rem=divmod(index,m*7)
                    cell_index,component_index=divmod(rem,7)
                    distances=[float(value/(-slope))
                      for slope in slopes]
                    limiting.append({
                      "variableIndex":index,
                      "phase":"continuous" if phase_index==0 else "dispersed",
                      "numericalCell":cell_index+1,
                      "component":COMPONENTS[component_index],
                      "baseFlowMolS":float(value),
                      "dFlowDlambda":slopes,
                      "predictedBoundaryLambda":[
                        float(base_lambda+distance) for distance in distances]})
            limiting.sort(key=lambda row:max(row["predictedBoundaryLambda"]))
            local_boundary=limiting[0] if limiting else None
            stable=(all(row["rank"]==27*m for row in rank_rows)
              and all(row["fixedLambdaJacobianRank"]==27*m
                for row in rank_rows)
              and all(row["undeclaredJacobianDependencyCount"]==0
                for row in rank_rows)
              and alignment>=.999
              and derivative_alignment>=.999
              and all(row["maximumTangentEquationResidual"]<=1e-7
                for row in rank_rows))
            report={"method":"SCALED_PSEUDO_ARCLENGTH_ORIGINAL_189_EQUATIONS",
              "baseLambda":float(base_lambda),
              "targetRejectedLambda":float(target_lambda),
              "finiteDifferenceQualifications":rank_rows,
              "tangentAlignmentAcrossStepSizes":alignment,
              "fixedLambdaDerivativeAlignmentAcrossStepSizes":
                derivative_alignment,
              "stableFullRowRankTangent":bool(stable),
              "limitingPositiveFlow":local_boundary,
              "baseStateSha256":digest([float(v) for v in base_state]),
              "variableScaleSha256":digest([float(v) for v in variable_scale]),
              "positiveLowerBoundMolS":epsilon,
              "strictPositiveFlowConstraintPreserved":True,
              "acceptanceGatesUnchanged":True,
              "physicalInfeasibilityClaimed":False,"attempts":[]}
            if not stable:
                report["classification"]="TANGENT_QUALIFICATION_UNSTABLE"
                return None,report
            tangent=tangents[1]
            state_y=y0.copy(); state_lambda=float(base_lambda)
            ds=max((target_lambda-base_lambda)*2.0,2e-8)
            ds=min(ds,2e-6)
            for attempt in range(4):
                require_runtime_budget(budget)
                predictor=np.r_[state_y,state_lambda]+ds*tangent
                predictor[-1]=min(max(predictor[-1],0.0),1.0)
                lower_aug=np.r_[lower/variable_scale,0.0]
                upper_aug=np.r_[upper/variable_scale,1.0]
                # The governing domain is flow > 0, not flow >= epsilon.
                # Epsilon remains the Picard solver's numerical floor only.
                lower_aug[:14*m]=0.0
                predictor=np.minimum(np.maximum(predictor,
                  lower_aug+1e-14),upper_aug-1e-14)
                def augmented_residual(q):
                    require_runtime_budget(budget)
                    arc=float(np.dot(tangent,q-predictor))
                    return np.r_[scaled_residual(q[:-1],q[-1]),arc]
                fit=scipy.optimize.least_squares(
                  augmented_residual,predictor,bounds=(lower_aug,upper_aug),
                  method="trf",jac="2-point",x_scale="jac",max_nfev=120,
                  xtol=1e-11,ftol=1e-11,gtol=1e-11)
                candidate=fit.x[:-1]*variable_scale
                candidate_lambda=float(fit.x[-1])
                _,metrics=acceptance_metrics(candidate,candidate_lambda)
                arc_residual=abs(float(np.dot(tangent,fit.x-predictor)))
                accepted=bool(metrics["accepted"] and arc_residual<=1e-7)
                report["attempts"].append({
                  "step":attempt+1,"arcLengthStep":float(ds),
                  "lambda":candidate_lambda,
                  "functionEvaluations":int(fit.nfev),
                  "optimizerSuccess":bool(fit.success),
                  "arcConstraintResidual":arc_residual,**metrics})
                if accepted:
                    state_y=fit.x[:-1]; state_lambda=candidate_lambda
                    if state_lambda>target_lambda+1e-9:
                        report["pseudoArclengthCandidate"]={
                          "lambda":state_lambda,
                          "stateSha256":digest([float(v) for v in candidate]),
                          "qualification":
                            "CANDIDATE_REQUIRES_TWO_START_FIXED_LAMBDA_CONFIRMATION"}
                        break
                    ds=min(ds*1.5,2e-5)
                    continue
                ds*=.5
                if ds<1e-10: break
            pseudo_restart_state=state_y*variable_scale
            probe_margin=target_lambda-base_lambda
            probe_lambda=target_lambda+probe_margin
            if probe_lambda>1.0:
                report["classification"]=(
                  "FULL_BRACKET_ADVANCE_EXCEEDS_LAMBDA_DOMAIN")
                report["complementarityQualification"]={
                  "targetRejectedLambda":target_lambda,
                  "requiredBeyondRejectedBoundaryMargin":probe_margin,
                  "lambdaUpperBound":1.0,
                  "accepted":False}
                return None,report
            complementarity_lower=lower.copy()
            complementarity_lower[:14*m]=0.0
            independent_restart=np.asarray(
              independent_restart_state).copy()
            flow_restart_factor=np.where(
              np.arange(14*m)%2==0,.995,1.005)
            independent_restart[:14*m]*=flow_restart_factor
            independent_restart[14*m:]+=np.where(
              np.arange(13*m)%2==0,-.005,.005)
            complementarity_starts=[
              ("PSEUDO_ARCLENGTH_CORRECTED_STATE",pseudo_restart_state),
              ("DETERMINISTIC_PERTURBED_REJECTED_PICARD_RESTART",
                independent_restart)]
            prepared_starts=[]
            for label,start in complementarity_starts:
                prepared=np.minimum(np.maximum(start,
                  complementarity_lower+1e-14),upper-1e-14)
                prepared_starts.append((label,prepared))
            initial_separation=float(np.max(np.abs(
              prepared_starts[0][1]-prepared_starts[1][1])
              /np.maximum(variable_scale,1e-30)))
            initial_hashes=[digest([float(v) for v in start])
              for _,start in prepared_starts]
            independent_start_minimum_separation=2e-3
            complementarity_attempts=[]; complementarity_solutions=[]
            confirmation_successes=[]
            if (initial_separation>=independent_start_minimum_separation
                and initial_hashes[0]!=initial_hashes[1]):
              for label,start in prepared_starts:
                confirmation_y=start/variable_scale
                confirmation_initial_residual=float(np.max(np.abs(
                  scaled_residual(confirmation_y,probe_lambda))))
                confirmation_iterations=0
                for _ in range(6):
                    confirmation_residual=scaled_residual(
                      confirmation_y,probe_lambda)
                    delta=np.linalg.solve(
                      jacobians[1][0],-confirmation_residual)
                    current_norm=float(np.max(np.abs(
                      confirmation_residual)))
                    accepted_newton_step=False
                    alpha=1.0
                    for _ in range(8):
                        trial_y=np.minimum(np.maximum(
                          confirmation_y+alpha*delta,
                          complementarity_lower/variable_scale+1e-14),
                          upper/variable_scale-1e-14)
                        trial_norm=float(np.max(np.abs(
                          scaled_residual(trial_y,probe_lambda))))
                        if trial_norm<current_norm:
                            confirmation_y=trial_y
                            accepted_newton_step=True
                            break
                        alpha*=.5
                    if not accepted_newton_step:
                        break
                    confirmation_iterations+=1
                confirmation_final_residual=float(np.max(np.abs(
                  scaled_residual(confirmation_y,probe_lambda))))
                confirmation_success=bool(
                  confirmation_iterations>0
                  and confirmation_final_residual<=1e-7)
                confirmation_successes.append(confirmation_success)
                confirmation_state=confirmation_y*variable_scale
                fit=scipy.optimize.least_squares(
                  lambda q:residual(q,probe_lambda),confirmation_state,
                  bounds=(complementarity_lower,upper),method="trf",
                  jac="2-point",tr_solver="exact",
                  x_scale=variable_scale,max_nfev=6,
                  xtol=1e-13,ftol=1e-13,gtol=1e-13)
                _,metrics=acceptance_metrics(fit.x,probe_lambda)
                attempt={"initialization":label,
                  "confirmationStartSha256":
                    digest([float(v) for v in start]),
                  "frozenJacobianConfirmationIterations":
                    confirmation_iterations,
                  "frozenJacobianConfirmationSuccess":
                    confirmation_success,
                  "frozenJacobianConfirmationInitialMaximumResidual":
                    confirmation_initial_residual,
                  "frozenJacobianConfirmationMaximumResidual":
                    confirmation_final_residual,
                  "functionEvaluations":int(fit.nfev),
                  "optimizerStatus":int(fit.status),
                  "optimizerOptimality":float(fit.optimality),
                  "optimizerSuccess":bool(fit.success),
                  "stateSha256":digest([float(v) for v in fit.x]),
                  **metrics}
                complementarity_attempts.append(attempt)
                if metrics["accepted"]:
                    complementarity_solutions.append(fit.x.copy())
            report["complementarityQualification"]={
              "solver":(
                "TWO_DISTINCT_START_DENSE_FROZEN_JACOBIAN_NEWTON_PLUS_"
                "DENSE_POLISH_"
                "189_FIXED_LAMBDA"),
              "lambda":probe_lambda,
              "beyondRejectedBoundaryMargin":probe_lambda-target_lambda,
              "minimumRequiredBeyondBoundaryMargin":probe_margin,
              "mathematicalFlowLowerBoundMolS":0.0,
              "strictPositiveFinalAcceptanceRequired":True,
              "optimizerSuccessIsAcceptanceGate":False,
              "independentStartMinimumScaledSeparation":
                independent_start_minimum_separation,
              "confirmationStartScaledStateSeparation":initial_separation,
              "confirmationStartStateSha256":initial_hashes,
              "initializations":[label for label,_ in prepared_starts],
              "pseudoArclengthRestartLambda":state_lambda,
              "attempts":complementarity_attempts}
            if len(complementarity_solutions)==len(complementarity_starts):
                state_difference=float(np.max(np.abs(
                  complementarity_solutions[0]-complementarity_solutions[1])
                  /np.maximum(variable_scale,1e-30)))
                report["complementarityQualification"][
                  "maximumScaledStateDifferenceAcrossStarts"]=state_difference
                agreement_tolerance=1e-3
                report["complementarityQualification"][
                  "scaledStateAgreementTolerance"]=agreement_tolerance
                if (state_difference<=agreement_tolerance
                    and all(confirmation_successes)):
                    report["classification"]=(
                      "ACCEPTED_POSITIVE_BRANCH_BEYOND_BRACKET")
                    report["acceptedLambda"]=probe_lambda
                    report["acceptedStateSha256"]=digest(
                      [float(v) for v in complementarity_solutions[0]])
                    return complementarity_solutions[0],report
            report["classification"]="PSEUDO_ARCLENGTH_POSITIVE_BRANCH_UNRESOLVED"
            if not stable or local_boundary is None:
                return None,report
            boundary_index=local_boundary["variableIndex"]
            predicted_lambda=float(np.mean(
              local_boundary["predictedBoundaryLambda"]))
            if not base_lambda<predicted_lambda<=target_lambda+1e-8:
                return None,report
            boundary_y=y0+(predicted_lambda-base_lambda)*(
              derivatives[1]/variable_scale)
            boundary_y[boundary_index]=0.0
            boundary_start=np.r_[np.delete(boundary_y,boundary_index),
              predicted_lambda]
            def boundary_residual(q):
                require_runtime_budget(budget)
                full_y=np.insert(q[:-1],boundary_index,0.0)
                return scaled_residual(full_y,q[-1])
            boundary_lower=np.r_[np.delete(
              lower/variable_scale,boundary_index),
              max(0.0,base_lambda-1e-8)]
            boundary_upper=np.r_[np.delete(
              upper/variable_scale,boundary_index),
              min(1.0,target_lambda+1e-8)]
            boundary_start=np.minimum(np.maximum(boundary_start,
              boundary_lower+1e-15),boundary_upper-1e-15)
            boundary_fit=scipy.optimize.least_squares(
              boundary_residual,boundary_start,
              bounds=(boundary_lower,boundary_upper),
              method="trf",jac="2-point",x_scale="jac",max_nfev=800,
              xtol=1e-12,ftol=1e-12,gtol=1e-12)
            solved_boundary_y=np.insert(
              boundary_fit.x[:-1],boundary_index,0.0)
            boundary_state=solved_boundary_y*variable_scale
            boundary_lambda=float(boundary_fit.x[-1])
            boundary_ev,boundary_metrics=acceptance_metrics(
              boundary_state,boundary_lambda)
            other_flows=np.delete(boundary_state[:14*m],boundary_index)
            boundary_flow=float(boundary_state[boundary_index])
            boundary_gate=max(abs(boundary_flow),
              boundary_metrics["rawFvResidualMolS"],
              boundary_metrics["scaledFvResidual"],
              boundary_metrics["maximumOriginalJobBGateResidual"])
            boundary_rank=[]; boundary_derivatives=[]
            for relative_step in steps:
                jac=scipy.optimize._numdiff.approx_derivative(
                  lambda y:scaled_residual(y,boundary_lambda),
                  solved_boundary_y,method="3-point",
                  rel_step=relative_step)
                lambda_step=max(lambda_scale*relative_step,1e-12)
                rlambda=(scaled_residual(solved_boundary_y,
                  boundary_lambda+lambda_step)
                  -scaled_residual(solved_boundary_y,
                    boundary_lambda-lambda_step))/(2*lambda_step)
                singular=np.linalg.svd(jac,compute_uv=False)
                threshold=float(singular[0]*max(jac.shape)
                  *np.finfo(float).eps)
                rank=int(np.sum(singular>threshold))
                derivative=variable_scale*np.linalg.solve(jac,-rlambda)
                boundary_derivatives.append(derivative)
                boundary_rank.append({
                  "relativeFiniteDifferenceStep":relative_step,
                  "rank":rank,"requiredRank":27*m,
                  "smallestSingularValue":float(singular[-1]),
                  "rankThreshold":threshold,
                  "limitingFlowDerivativeMolSPerLambda":
                    float(derivative[boundary_index])})
            boundary_derivative_alignment=float(np.dot(
              boundary_derivatives[0],boundary_derivatives[1])/(
                np.linalg.norm(boundary_derivatives[0])
                *np.linalg.norm(boundary_derivatives[1])))
            boundary_valid=(bool(boundary_fit.success)
              and boundary_gate<=1e-7
              and float(np.min(other_flows))>0
              and base_lambda<boundary_lambda<=target_lambda+1e-8
              and all(row["rank"]==row["requiredRank"]
                and row["limitingFlowDerivativeMolSPerLambda"]<0
                for row in boundary_rank)
              and boundary_derivative_alignment>=.999)
            report["correctedBoundary"]={
              "solver":
                "REDUCED_TANGENT_CONE_189_EQUATIONS_ACTIVE_FLOW_FIXED_ZERO",
              "functionEvaluations":int(boundary_fit.nfev),
              "optimizerSuccess":bool(boundary_fit.success),
              "lambda":boundary_lambda,
              "activeFlowMolS":boundary_flow,
              "minimumOtherFlowMolS":float(np.min(other_flows)),
              "maximumUnchangedGateResidual":boundary_gate,
              "finiteDifferenceQualifications":boundary_rank,
              "derivativeAlignmentAcrossStepSizes":
                boundary_derivative_alignment,
              "stateSha256":digest([float(v) for v in boundary_state]),
              "acceptedAsPhysicalOperatingState":False,
              "strictPositiveStatesOnlyAccepted":True}
            return None,report

        def dominant_blocks(ev):
            rows=diagnostic_rows(ev); blocks={}
            for row in rows:
                key=(row["numericalCell"],row["type"])
                if key not in blocks or abs(row["rawValue"])>abs(blocks[key]["rawValue"]):
                    blocks[key]=row
            return sorted(blocks.values(),key=lambda row:abs(row["rawValue"]),reverse=True)

        def frozen_diagnostic_rows(flow_vector, residual_vector):
            flows=np.asarray(flow_vector).reshape(2,m,7)
            residuals=np.asarray(residual_vector).reshape(m,2,7)
            active_bound=[
              {"phase":"continuous" if phase==0 else "dispersed",
               "numericalCell":j+1,"component":COMPONENTS[i],
               "flowMolS":float(flows[phase,j,i]),
               "positiveLowerBoundMolS":epsilon}
              for phase in range(2) for j in range(m) for i in range(7)
              if flows[phase,j,i]<=epsilon*(1+1e-6)]
            ranked=[
              {"phase":"continuous" if phase==0 else "dispersed",
               "numericalCell":j+1,"component":COMPONENTS[i],
               "rawFvResidualMolS":float(residuals[j,phase,i]),
               "scaledFvResidual":float(residuals[j,phase,i]/scale[i])}
              for j in range(m) for phase in range(2) for i in range(7)
            ]
            ranked.sort(key=lambda row:abs(row["rawFvResidualMolS"]),reverse=True)
            return active_bound,ranked[:20]

        def solve_local_interfaces(flow_vector, interface_vector):
            c,d=np.asarray(flow_vector).reshape(2,m,7)
            unknowns=[]; fluxes=[]; maximum_gate=0.0
            for j in range(m):
                solvers[j].warm=np.asarray(
                  interface_vector[13*j:13*j+13]).copy()
                local=solvers[j].solve(c[j]/c[j].sum(),d[j]/d[j].sum())
                budget["calls"]+=1
                u=np.asarray(local["unknowns"])
                values=solvers[j].equations(
                  u,c[j]/c[j].sum(),d[j]/d[j].sum())
                maximum_gate=max(maximum_gate,
                  float(np.max(np.abs(values[0][:7]))),
                  float(np.max(np.abs(values[6])/solvers[j].scale)))
                unknowns.extend(u); fluxes.append(values[4])
            return np.asarray(unknowns),np.asarray(fluxes),maximum_gate

        x=initial(); history=[]; started=time.monotonic()
        global_inlet_full_scale_audit=frozen_boundary_audit(
          np,feedc,feedd,inlet_nc,inlet_nd,
          np.tile(inlet_nc,(m,1))*av*A*dz)
        global_inlet_full_scale_audit.update({
          "heightM":h,"lambda":1.0,
           "physicalDispersedInletMoleFractions":inlet_xd.tolist(),
           "physicalDispersedInletZerosPreservedExactly":
             all(feedd[i] != 0.0 or inlet_xd[i] == 0.0 for i in range(7)),
           "incomingPhysicalFlowsRegularized":False,
           "qualifiedCandidateSeedTransformed":qualified_candidate_seed.tolist(),
           "frozenJobBProvenance":{"workerSha256":"70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d",
             "artifactSha256":"71c21d480c81e5971754fa664f42259ab9dd117f77ff37a8361a0e2d89de12db",
             "classification":"PINNED_ENGINE_LINEAGE_ONLY_NO_JOB_B_FLUX_CONSUMED"},
           "qualification":"GLOBAL_INLET_FULL_SCALE_FROZEN_FLUX_DIAGNOSTIC_ONLY;"
             "FLUX_SOURCE=QUALIFIED_JOB_C_BOUNDARY_BRANCH"})
        # Intermediate lambda points use deterministic local-flux Picard
        # continuation: seven independent candidate interface solves followed
        # by one bounded dense 98-equation FV solve.  The 189-equation system is
        # reserved for one limited lambda-one polish after Picard acceptance.
        lambda_targets=sorted(set([initial_lambda,.00003,.0001,.0003,.001,
          .0025,.005,.01,.025,.05,.1,.25,.5,.75,1.0]))
        lambda_targets=[value for value in lambda_targets if value>=initial_lambda]
        lambda_index=0
        minimum_lambda_interval=1e-8
        maximum_outer_iterations=24
        maximum_coupled_function_evaluations=24
        while lambda_index<len(lambda_targets):
            lam=lambda_targets[lambda_index]
            accepted_x=x.copy()
            previous_lambda=history[-1]["lambda"] if history else initial_lambda
            progress(f"local flux Picard lambda {lam:g}")
            lambda_started=time.monotonic()
            outer_rows=[]; step_accepted=False; step_error=None
            current_flows=x[:14*m].copy()
            current_interfaces=x[14*m:].copy()
            for outer in range(1,maximum_outer_iterations+1):
                if time.monotonic()-budget["started"]>budget["maximumSeconds"]:
                    step_error="INTERNAL_RUNTIME_BUDGET"
                    break
                try:
                    local_u,frozen_nc,pre_gate=solve_local_interfaces(
                      current_flows,current_interfaces)
                except CandidateFailure as error:
                    step_error=str(error)
                    break
                conservative=frozen_conservative_seed(
                  current_flows,lam,frozen_nc)
                starts=[("LAST_PICARD_POSITIVE_FLOWS",current_flows)]
                if (np.all(conservative>=lower[:14*m]) and
                    np.all(conservative<=upper[:14*m])):
                    starts.append(("UNCLIPPED_CONSERVATIVE_PROFILE",conservative))
                def frozen_scaled(flow_vector):
                    require_runtime_budget(budget)
                    values=frozen_flow_evaluate(flow_vector,lam,frozen_nc)
                    return np.asarray(
                      [v/scale[i%7] for i,v in enumerate(values)])
                fits=[]
                for initialization,start_vector in starts:
                    try:
                        fit=scipy.optimize.least_squares(
                          frozen_scaled,start_vector,
                          bounds=(lower[:14*m],upper[:14*m]),method="trf",
                          jac="2-point",tr_solver="exact",x_scale=flow_scale,
                          max_nfev=160,xtol=1e-11,ftol=1e-11,gtol=1e-11)
                    except TimeoutError:
                        outer_rows.append({"outerIteration":outer,
                          "flowInitialization":initialization,
                          "sourceRefreshMismatch":{"status":
                            "NOT_COMPUTED_INTERNAL_RUNTIME_BUDGET"},
                          "accepted":False})
                        step_error="INTERNAL_RUNTIME_BUDGET"
                        break
                    fits.append((np.linalg.norm(frozen_scaled(fit.x)),
                      initialization,fit))
                if step_error=="INTERNAL_RUNTIME_BUDGET":
                    break
                _,initialization,flow_fit=min(fits,key=lambda row:row[0])
                solved_flows=flow_fit.x
                frozen_values=frozen_flow_evaluate(
                  solved_flows,lam,frozen_nc)
                frozen_raw=float(np.max(np.abs(frozen_values)))
                frozen_scaled_max=float(np.max(np.abs(
                  frozen_scaled(solved_flows))))
                frozen_acceptance=require_positive_frozen_solution(
                  np,solved_flows,frozen_raw,frozen_scaled_max)
                if not frozen_acceptance["accepted"]:
                    active_bound,ranked_frozen=frozen_diagnostic_rows(
                      solved_flows,frozen_values)
                    outer_rows.append({"outerIteration":outer,
                      "flowInitialization":initialization,
                      "flowFunctionEvaluations":int(flow_fit.nfev),
                      "flowOptimizerStatus":int(flow_fit.status),
                      "flowOptimizerSuccess":bool(flow_fit.success),
                      "flowOptimizerOptimality":float(flow_fit.optimality),
                      "frozenFvAcceptance":frozen_acceptance,
                      "activePositiveLowerBoundFlows":active_bound,
                      "dominantFrozenFvResidualRows":ranked_frozen,
                      "sourceRefreshMismatch":{
                        "status":"NOT_COMPUTED_FROZEN_FV_DID_NOT_CLOSE"},
                      "accepted":False})
                    step_error="BOUNDED_FROZEN_FV_NONCONVERGENCE"
                    break
                try:
                    refreshed_u,refreshed_nc,interface_gate=(
                      solve_local_interfaces(solved_flows,local_u))
                except CandidateFailure as error:
                    step_error=str(error)
                    break
                trial=np.r_[solved_flows,refreshed_u]
                trial_ev=raw_evaluate(trial,lam)
                physical_fv=frozen_flow_evaluate(
                  solved_flows,lam,refreshed_nc)
                physical_raw=float(np.max(np.abs(physical_fv)))
                physical_scaled=float(np.max(np.abs(
                  [v/scale[i%7] for i,v in enumerate(physical_fv)])))
                source_delta=lam*(refreshed_nc-frozen_nc)*av*A*dz
                source_raw=float(np.max(np.abs(source_delta)))
                source_scaled=float(np.max(np.abs(
                  [v/scale[i%7] for i,v in enumerate(
                    source_delta.reshape(-1))])))
                minimum_flow=float(np.min(solved_flows))
                accepted=(minimum_flow>0 and physical_raw<=1e-7 and
                  physical_scaled<=1e-7 and source_raw<=1e-7 and
                  source_scaled<=1e-7 and interface_gate<=1e-7)
                outer_rows.append({"outerIteration":outer,
                  "flowInitialization":initialization,
                  "flowFunctionEvaluations":int(flow_fit.nfev),
                  "minimumFlowMolS":minimum_flow,
                  "frozenRawFvResidualMolS":frozen_raw,
                  "frozenScaledFvResidual":frozen_scaled_max,
                  "refreshedRawFvResidualMolS":physical_raw,
                  "refreshedScaledFvResidual":physical_scaled,
                  "integratedSourceMismatchRawMolS":source_raw,
                  "integratedSourceMismatchScaled":source_scaled,
                  "preRefreshMaximumCandidateGateResidual":pre_gate,
                  "postRefreshMaximumCandidateGateResidual":interface_gate,
                  "accepted":accepted})
                x=trial; current_flows=solved_flows
                current_interfaces=refreshed_u; ev=trial_ev
                if accepted:
                    step_accepted=True
                    break
            if not step_accepted:
                x=accepted_x
                if step_error=="INTERNAL_RUNTIME_BUDGET":
                    raise JobCBlocked("JOB_C_INTERNAL_RUNTIME_BUDGET",
                      {"heightM":h,"lambda":lam,
                       "phase":"BOUNDED_FROZEN_FV_SOLVE",
                       "classification":"NUMERICAL_RUNTIME_BUDGET_EXHAUSTED",
                       "physicalInfeasibilityClaimed":False,
                       "outerIterations":outer_rows,
                       "claimsEmitted":{"height":False,"efficiency":False,
                         "finalRpm":False,"jobD":False,"release":False}})
                if lam>0.0 and lam-previous_lambda>minimum_lambda_interval:
                    lambda_targets.insert(
                      lambda_index,(previous_lambda+lam)/2)
                    continue
                # A frozen-source FV failure is not a feasibility result for the
                # original coupled equations.  Give the bounded 189-equation
                # system a jointly consistent attempt at the terminal adaptive
                # bracket before issuing a governed block.
                coupled_starts=[("LAST_ACCEPTED_COUPLED_STATE",accepted_x)]
                current_joint=np.r_[current_flows,current_interfaces]
                if (np.all(current_joint>=lower) and np.all(current_joint<=upper)
                    and not np.array_equal(current_joint,accepted_x)):
                    coupled_starts.append(("LAST_PICARD_ITERATE",current_joint))
                coupled_fits=[]; coupled_attempts=[]
                coupled_budget_exhausted=False
                for coupled_initialization,coupled_start in coupled_starts:
                    try:
                        coupled_fit=scipy.optimize.least_squares(
                          lambda q:residual(q,lam),coupled_start,
                          bounds=(lower,upper),method="trf",jac="2-point",
                          jac_sparsity=sparsity,tr_solver="lsmr",
                          x_scale=variable_scale,
                          max_nfev=maximum_coupled_function_evaluations,
                          xtol=1e-11,ftol=1e-11,gtol=1e-11)
                    except TimeoutError:
                        coupled_budget_exhausted=True
                        coupled_attempts.append({
                          "initialization":coupled_initialization,
                          "terminatedBy":"INTERNAL_RUNTIME_BUDGET",
                          "accepted":False})
                        break
                    coupled_ev=raw_evaluate(coupled_fit.x,lam)
                    coupled_raw=float(np.max(np.abs(coupled_ev["fv"])))
                    coupled_scaled=float(np.max(np.abs(
                      [v/scale[i%7] for i,v in enumerate(coupled_ev["fv"])])))
                    coupled_interface=max(
                      max(float(np.max(np.abs(values[0][:7]))),
                        float(np.max(np.abs(values[6])/solvers[j].scale)))
                      for j,values in enumerate(coupled_ev["details"]))
                    coupled_minimum=float(min(
                      np.min(coupled_ev["c"]),np.min(coupled_ev["d"])))
                    coupled_accepted=(coupled_minimum>0
                      and coupled_raw<=1e-7 and coupled_scaled<=1e-7
                      and coupled_interface<=1e-7)
                    coupled_fits.append({
                      "initialization":coupled_initialization,
                      "fit":coupled_fit,"evaluation":coupled_ev,
                      "rawFvResidualMolS":coupled_raw,
                      "scaledFvResidual":coupled_scaled,
                      "maximumOriginalJobBGateResidual":coupled_interface,
                      "minimumFlowMolS":coupled_minimum,
                      "accepted":coupled_accepted})
                    coupled_attempts.append({
                      "initialization":coupled_initialization,
                      "functionEvaluations":int(coupled_fit.nfev),
                      "optimizerStatus":int(coupled_fit.status),
                      "optimizerSuccess":bool(coupled_fit.success),
                      "optimizerOptimality":float(coupled_fit.optimality),
                      "rawFvResidualMolS":coupled_raw,
                      "scaledFvResidual":coupled_scaled,
                      "maximumOriginalJobBGateResidual":coupled_interface,
                      "minimumFlowMolS":coupled_minimum,
                      "accepted":coupled_accepted})
                if coupled_fits:
                    coupled_best=min(coupled_fits,key=lambda row:max(
                      row["rawFvResidualMolS"],row["scaledFvResidual"],
                      row["maximumOriginalJobBGateResidual"]))
                else:
                    coupled_ev=raw_evaluate(accepted_x,lam)
                    coupled_best={"initialization":"LAST_ACCEPTED_COUPLED_STATE",
                      "fit":None,"evaluation":coupled_ev,
                      "rawFvResidualMolS":
                        float(np.max(np.abs(coupled_ev["fv"]))),
                      "scaledFvResidual":float(np.max(np.abs(
                        [v/scale[i%7] for i,v in enumerate(coupled_ev["fv"])]))),
                      "maximumOriginalJobBGateResidual":max(
                        max(float(np.max(np.abs(values[0][:7]))),
                          float(np.max(np.abs(values[6])/solvers[j].scale)))
                        for j,values in enumerate(coupled_ev["details"])),
                      "minimumFlowMolS":float(min(
                        np.min(coupled_ev["c"]),np.min(coupled_ev["d"]))),
                      "accepted":False}
                if coupled_best["accepted"]:
                    x=coupled_best["fit"].x
                    history.append({"lambda":lam,
                      "solver":"COUPLED_BOUNDED_SPARSE_189_CONTINUATION",
                      "picardFailureReason":step_error or "OUTER_ITERATION_LIMIT",
                      "picardOuterIterations":outer_rows,
                      "coupledAttempts":coupled_attempts,
                      "rawFvResidualMolS":coupled_best["rawFvResidualMolS"],
                      "scaledFvResidual":coupled_best["scaledFvResidual"],
                      "maximumOriginalJobBGateResidual":
                        coupled_best["maximumOriginalJobBGateResidual"],
                      "minimumFlowMolS":coupled_best["minimumFlowMolS"],
                      "lambdaRuntimeSeconds":time.monotonic()-lambda_started,
                      "boundaryAwareInitialProfile":profile_audit
                        if len(history)==0 else None,
                      "globalInletFluxAudit":
                        global_inlet_full_scale_audit if len(history)==0 else None})
                    lambda_index+=1
                    continue
                unconstrained=None
                unbounded_budget_exhausted=False
                if coupled_budget_exhausted:
                    unconstrained={
                      "qualification":"NOT_RUN_INTERNAL_RUNTIME_BUDGET",
                      "accepted":False}
                elif step_error=="BOUNDED_FROZEN_FV_NONCONVERGENCE":
                    try:
                        unconstrained_fit=scipy.optimize.least_squares(
                          frozen_scaled,solved_flows,method="lm",jac="2-point",
                          x_scale=flow_scale,max_nfev=1000,
                          xtol=1e-12,ftol=1e-12,gtol=1e-12)
                        unconstrained_values=frozen_flow_evaluate(
                          unconstrained_fit.x,lam,frozen_nc)
                        nonpositive=[]
                        for index,value in enumerate(unconstrained_fit.x):
                            if value<=0:
                                phase_index,rem=divmod(index,m*7)
                                cell_index,component_index=divmod(rem,7)
                                nonpositive.append({
                                  "phase":"continuous" if phase_index==0 else "dispersed",
                                  "numericalCell":cell_index+1,
                                  "component":COMPONENTS[component_index],
                                  "flowMolS":float(value)})
                        unconstrained={
                          "functionEvaluations":int(unconstrained_fit.nfev),
                          "optimizerStatus":int(unconstrained_fit.status),
                          "optimizerSuccess":bool(unconstrained_fit.success),
                          "optimizerOptimality":float(unconstrained_fit.optimality),
                          "rawFvResidualMolS":
                            float(np.max(np.abs(unconstrained_values))),
                          "scaledFvResidual":
                            float(np.max(np.abs(frozen_scaled(unconstrained_fit.x)))),
                          "minimumFlowMolS":float(np.min(unconstrained_fit.x)),
                          "nonpositiveFlowCount":len(nonpositive),
                          "nonpositiveFlows":sorted(nonpositive,
                            key=lambda row:row["flowMolS"])[:20],
                          "qualification":
                            "UNBOUNDED_TERMINAL_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE"}
                    except TimeoutError:
                        unbounded_budget_exhausted=True
                        unconstrained={
                          "qualification":"TERMINATED_INTERNAL_RUNTIME_BUDGET",
                          "accepted":False}
                if unbounded_budget_exhausted:
                    raise JobCBlocked("JOB_C_INTERNAL_RUNTIME_BUDGET",
                      {"heightM":h,"lambda":lam,
                       "phase":"UNBOUNDED_TERMINAL_DIAGNOSTIC",
                       "classification":"NUMERICAL_RUNTIME_BUDGET_EXHAUSTED",
                       "physicalInfeasibilityClaimed":False,
                       "outerIterations":outer_rows,
                       "coupledAttempts":coupled_attempts,
                       "unconstrainedTerminalDiagnostic":unconstrained,
                       "claimsEmitted":{"height":False,"efficiency":False,
                         "finalRpm":False,"jobD":False,"release":False}})
                arclength_state,arclength=(
                  pseudo_arclength_qualification(
                    accepted_x,previous_lambda,lam,current_joint))
                if arclength_state is not None:
                    arclength_ev,arclength_metrics=acceptance_metrics(
                      arclength_state,arclength["acceptedLambda"])
                    raise JobCBlocked(
                      "JOB_C_POSITIVE_BRANCH_BEYOND_SOLVENT_BOUNDARY_QUALIFIED",
                      {"heightM":h,"lambda":arclength["acceptedLambda"],
                       "classification":
                         "REPRODUCIBLE_ACCEPTED_POSITIVE_BRANCH_BEYOND_"
                         "SOLVENT_BOUNDARY",
                       "physicalInfeasibilityClaimed":False,
                       "adaptiveLambdaBracket":{"lowerAccepted":previous_lambda,
                         "upperRejected":lam,"width":lam-previous_lambda,
                         "minimumInterval":minimum_lambda_interval},
                       "acceptedBranch":arclength_metrics,
                       "pseudoArclengthQualification":arclength,
                       "strictPositiveFlowsAccepted":bool(
                         arclength_metrics["minimumFlowMolS"]>0),
                       "incomingPhysicalFeedsUnchanged":True,
                       "numericalTraceAdded":False,
                       "sourceSignReversed":False,
                       "governingInputsChanged":False,
                       "globalInletFluxAudit":global_inlet_full_scale_audit,
                       "claimsEmitted":{"height":False,"efficiency":False,
                         "finalRpm":False,"jobD":False,"release":False},
                       "runtimeSeconds":time.monotonic()-started,
                       "runtimeBudgets":{"qualification":
                         qualification_runtime,
                         "nonlinearSolver":{"budgetSeconds":
                           budget["maximumSeconds"],
                           "elapsedSeconds":
                             time.monotonic()-budget["started"]}}})
                last_accepted=history[-1] if history else None
                last_accepted_compact=None
                if last_accepted is not None:
                    if "integratedSourceMismatchRawMolS" in last_accepted:
                        accepted_source_refresh={"status":"MEASURED",
                          "rawMolS":
                            last_accepted["integratedSourceMismatchRawMolS"],
                          "scaled":
                            last_accepted["integratedSourceMismatchScaled"]}
                    else:
                        accepted_source_refresh={"status":
                          "NOT_APPLICABLE_JOINT_COUPLED_ACCEPTANCE"}
                    last_accepted_compact={
                      "lambda":last_accepted["lambda"],
                      "solver":last_accepted["solver"],
                      "rawFvResidualMolS":last_accepted["rawFvResidualMolS"],
                      "scaledFvResidual":last_accepted["scaledFvResidual"],
                      "sourceRefreshMismatch":accepted_source_refresh,
                      "minimumFlowMolS":last_accepted["minimumFlowMolS"]}
                if (outer_rows and
                    "integratedSourceMismatchRawMolS" in outer_rows[-1]):
                    rejected_source_refresh={"status":"MEASURED",
                      "rawMolS":
                        outer_rows[-1]["integratedSourceMismatchRawMolS"],
                      "scaled":
                        outer_rows[-1]["integratedSourceMismatchScaled"]}
                elif outer_rows and "sourceRefreshMismatch" in outer_rows[-1]:
                    rejected_source_refresh=outer_rows[-1][
                      "sourceRefreshMismatch"]
                else:
                    rejected_source_refresh={
                      "status":"NOT_COMPUTED_PICARD_TERMINATED_BEFORE_REFRESH"}
                raise JobCBlocked(
                  "JOB_C_COUPLED_POSITIVE_FEASIBILITY_UNRESOLVED",
                   {"heightM":h,"lambda":lam,
                    "classification":
                       "NUMERICAL_NONCONVERGENCE_NOT_PROCESS_INFEASIBILITY",
                    "physicalInfeasibilityClaimed":False,
                    "reason":step_error or "OUTER_ITERATION_LIMIT",
                   "maximumOuterIterations":maximum_outer_iterations,
                   "outerIterations":outer_rows,
                    "adaptiveLambdaBracket":{
                      "lowerAccepted":previous_lambda,
                      "upperRejected":lam,
                      "width":lam-previous_lambda,
                      "minimumInterval":minimum_lambda_interval},
                    "lastAcceptedContinuation":last_accepted_compact,
                    "coupledContinuation":{
                      "solver":"COUPLED_BOUNDED_SPARSE_189_CONTINUATION",
                      "maximumFunctionEvaluations":
                        maximum_coupled_function_evaluations,
                      "attempts":coupled_attempts,
                      "runtimeBudgetExhausted":coupled_budget_exhausted,
                      "dominantResidualRows":
                        diagnostics(coupled_best["evaluation"]),
                      "dominantResidualBlocks":
                        dominant_blocks(coupled_best["evaluation"]),
                      "classification":
                        "COUPLED_POSITIVE_FEASIBILITY_UNRESOLVED",
                      "physicalInfeasibilityClaimed":False},
                    "pseudoArclengthQualification":arclength,
                    "rejectedStepSourceRefreshMismatch":
                      rejected_source_refresh,
                    "unconstrainedTerminalDiagnostic":unconstrained,
                   "globalInletFluxAudit":global_inlet_full_scale_audit,
                    "claimsEmitted":{"height":False,"efficiency":False,
                      "finalRpm":False,"jobD":False,"release":False},
                   "runtimeSeconds":time.monotonic()-started,
                   "runtimeBudgets":{"qualification":qualification_runtime,
                     "nonlinearSolver":{"budgetSeconds":budget["maximumSeconds"],
                       "elapsedSeconds":time.monotonic()-budget["started"]}}})
            history.append({"lambda":lam,
              "solver":"LOCAL_FLUX_PICARD_BOUNDED_DENSE_98_FV",
              "outerIterationCount":len(outer_rows),
              "outerIterations":outer_rows,
              "rawFvResidualMolS":outer_rows[-1]["refreshedRawFvResidualMolS"],
              "scaledFvResidual":outer_rows[-1]["refreshedScaledFvResidual"],
              "integratedSourceMismatchRawMolS":
                outer_rows[-1]["integratedSourceMismatchRawMolS"],
              "integratedSourceMismatchScaled":
                outer_rows[-1]["integratedSourceMismatchScaled"],
              "minimumFlowMolS":outer_rows[-1]["minimumFlowMolS"],
              "lambdaRuntimeSeconds":time.monotonic()-lambda_started,
              "boundaryAwareInitialProfile":profile_audit
                if len(history)==0 else None,
              "globalInletFluxAudit":
                global_inlet_full_scale_audit if len(history)==0 else None})
            lambda_index+=1

        # Picard has established a positive, locally consistent lambda-one
        # state.  Run the square system once, only now, as limited verification.
        progress("lambda 1 monolithic polish")
        polish_start=x.copy()
        try:
            polish_fit=scipy.optimize.least_squares(
              lambda q:residual(q,1.0),polish_start,
              bounds=(lower,upper),method="trf",jac="2-point",
              jac_sparsity=sparsity,x_scale=variable_scale,max_nfev=40,
              xtol=1e-11,ftol=1e-11,gtol=1e-11)
        except TimeoutError:
            raise JobCBlocked("JOB_C_LAMBDA1_MONOLITHIC_POLISH_FAILED",
              {"heightM":h,"reason":"INTERNAL_RUNTIME_BUDGET",
               "physicalInfeasibilityClaimed":False,
               "claimsEmitted":{"height":False,"efficiency":False,
                 "finalRpm":False,"jobD":False,"release":False}})
        x=polish_fit.x
        ev=raw_evaluate(x,1.0)
        fv_raw=float(np.max(np.abs(ev["fv"])))
        fv_scaled=float(np.max(np.abs(
          [v/scale[i%7] for i,v in enumerate(ev["fv"])])))
        interface_gate=max(max(float(np.max(np.abs(v[0][:7]))),
          float(np.max(np.abs(v[6])/solvers[j].scale)))
          for j,v in enumerate(ev["details"]))
        minimum_flow=float(min(np.min(ev["c"]),np.min(ev["d"])))
        history[-1]["lambda1MonolithicPolish"]={
          "solver":"LIMITED_189_EQUATION_POLISH_AFTER_PICARD",
          "functionEvaluations":int(polish_fit.nfev),
          "optimizerSuccess":bool(polish_fit.success),
          "rawFvResidualMolS":fv_raw,"scaledFvResidual":fv_scaled,
          "maximumOriginalJobBGateResidual":interface_gate,
          "minimumFlowMolS":minimum_flow}
        if (fv_raw>1e-7 or fv_scaled>1e-7 or
            interface_gate>1e-7 or minimum_flow<=0):
            raise JobCBlocked("JOB_C_LAMBDA1_MONOLITHIC_POLISH_FAILED",
              {"heightM":h,"rawFvResidualMolS":fv_raw,
               "scaledFvResidual":fv_scaled,
               "maximumOriginalJobBGateResidual":interface_gate,
               "minimumFlowMolS":minimum_flow,
               "dominantResidualRows":diagnostics(ev),
               "dominantResidualBlocks":dominant_blocks(ev)})

        c,d,u=unpack(x); gates=[]
        for j,values in enumerate(ev["details"]):
            eq,xi_c,xi_d,n,nc,nd,delta=values
            gates.append({"candidateOnly":True,"qualification":"UNQUALIFIED_NO_STABILITY_CLAIM",
              "candidate":{"version":CANDIDATE_VERSION,"unknowns":u[j].tolist(),
                "interfaceContinuousMoleFractions":xi_c.tolist(),
                "interfaceDispersedMoleFractions":xi_d.tolist(),
                "continuousComponentFluxMolM2S":nc.tolist(),
                "dispersedComponentFluxMolM2S":nd.tolist(),
                "maximumEquationResidual":float(np.max(np.abs(eq))),
                "maximumIsoactivityResidual":float(np.max(np.abs(eq[:7]))),
                "maximumScaledFluxEqualityResidual":float(np.max(np.abs(delta)/solvers[j].scale)),
                "qualification":"CANDIDATE_ONLY_NO_STABILITY_CLAIM"}})
        global_balance=[feedc[i]+feedd[i]-ev["fc"][m][i]+ev["fd"][0][i] for i in range(7)]
        positive=float(min(np.min(c),np.min(d)))
        final={"height":h,"state":[c.tolist(),d.tolist()],"solution":x.tolist(),
          "fc":ev["fc"].tolist(),"fd":ev["fd"].tolist(),"tr":ev["tr"].tolist(),
          "rc":ev["rc"].tolist(),"rd":ev["rd"].tolist(),"gates":gates,
          "raw":float(np.max(np.abs(ev["fv"]))),
          "scaled":float(np.max(np.abs(
            [v/scale[i%7] for i,v in enumerate(ev["fv"])]))),
          "global":global_balance,"positive":positive,"homotopyHistory":history,
          "interfaceCalls":0,"monolithicRuntimeSeconds":time.monotonic()-started,
          "jacobianNonzeros":int(sparsity.nnz)}
        if max(final["raw"],final["scaled"],max(abs(x) for x in global_balance))>1e-7 or positive<=0:
            raise JobCBlocked("JOB_C_FINAL_UNDAMPED_ACCEPTANCE_GATE_FAILED",
              {"heightM":h,"rawResidualMolS":final["raw"],"scaledResidual":final["scaled"],
               "globalBalanceResidualMolS":global_balance,"minimumFlowMolS":positive,
               "dominantResidualRows":diagnostics(ev)})
        accepted_by_height[h]=final["solution"]
        return final

    def recovery(ev):
        outlet=ev["fc"][m] if r["phaseConfiguration"]=="rrbo-continuous-nmp-dispersed" else [-x for x in ev["fd"][0]]
        incoming=feedc if r["phaseConfiguration"]=="rrbo-continuous-nmp-dispersed" else feedd
        mw=[170.3348,120.194,142.1971,202.2506,405.58]
        return 100*sum(outlet[i]*mw[i] for i in range(5))/sum(incoming[i]*mw[i] for i in range(5))

    def qualify_h2(ev):
        """Fail closed at H=2 m before authorizing any height search."""
        dz=2.0/m; area_per_cell=6*r["operatingHoldup"]/r["d32M"]*A*dz
        flux_tolerance=1e-7/area_per_cell; evidence=[]
        total_flow=sum(feedc)+sum(feedd)
        fv_scale=[max(feedc[i]+feedd[i],total_flow*1e-7) for i in range(7)]
        exact_rc=[]; exact_rd=[]
        for j in range(m):
            c,d=ev["state"][0][j],ev["state"][1][j]
            q={"protocol":"ECR_JOB_B_INTERFACE_V1","operation":"SOLVE_INTERFACE",
              "componentOrder":list(COMPONENTS),"T":r["temperatureK"],
              "x_bulk_continuous":[x/sum(c) for x in c],
              "x_bulk_dispersed":[x/sum(d) for x in d],"kc":r["kc"],"kd":r["kd"],
              "CtC":r["continuousTotalConcentrationMolM3"],
              "CtD":r["dispersedTotalConcentrationMolM3"],
              "phase_config":r["phaseConfiguration"]}
            candidate_state=ev["gates"][j]["candidate"]
            reference=(candidate_state["interfaceContinuousMoleFractions"]+
              candidate_state["interfaceDispersedMoleFractions"]+
              [candidate_state.get("totalMolarFluxMolM2S",0.0)])
            out=qualified_interface(q,reference)
            if out.get("status")!="QUALIFIED_JOB_C_BOUNDARY_BRANCH":
                raise JobCBlocked("JOB_C_H2_BOUNDARY_QUALIFIER_FAILED",
                   {"heightM":2.0,"lambda":1.0,"numericalCell":j+1,
                    "qualifierStatus":out.get("status"),"qualifierError":out.get("error")})
            nc=[float(x) for x in out["interface"]["continuousComponentFluxMolM2S"]]
            candidate=ev["gates"][j]["candidate"]["continuousComponentFluxMolM2S"]
            flux_error=max(abs(nc[i]-candidate[i]) for i in range(7))
            rc=[ev["fc"][j][i]-ev["fc"][j+1][i]-nc[i]*area_per_cell for i in range(7)]
            rd=[ev["fd"][j][i]-ev["fd"][j+1][i]+nc[i]*area_per_cell for i in range(7)]
            exact_rc.extend(rc); exact_rd.extend(rd)
            if flux_error>flux_tolerance:
                raise JobCBlocked("JOB_C_H2_BOUNDARY_QUALIFIER_FAILED",
                  {"heightM":2.0,"lambda":1.0,"numericalCell":j+1,
                   "gate":"EXACT_FLUX_SUBSTITUTION","maximumFluxErrorMolM2S":flux_error,
                   "toleranceMolM2S":flux_tolerance})
            full=out
            evidence.append({"numericalCell":j+1,"status":"QUALIFIED_JOB_C_BOUNDARY_BRANCH",
              "fullResponseSha256":full["resultHash"],"maximumFluxErrorMolM2S":flux_error})
        raw=max(abs(x) for x in exact_rc+exact_rd)
        scaled=max(abs(x/fv_scale[i%7]) for i,x in enumerate(exact_rc+exact_rd))
        if raw>1e-7 or scaled>1e-7:
            raise JobCBlocked("JOB_C_H2_EXACT_FV_RECONSTRUCTION_FAILED",
              {"heightM":2.0,"lambda":1.0,"rawFvResidualMolS":raw,
               "scaledFvResidual":scaled})
        return {"status":"H2_LAMBDA1_QUALIFIED_JOB_C_BOUNDARY_BRANCH_7_OF_7",
          "heightM":2.0,"lambda":1.0,"rawFvResidualMolS":raw,
          "scaledFvResidual":scaled,"numericalCells":evidence,
          "monolithicRuntimeSeconds":ev["monolithicRuntimeSeconds"]}

    progress("candidate 2m")
    low=solve_height(2.0)
    h2_benchmark=qualify_h2(low)
    progress("candidate20m")
    high=solve_height(20.0,low["solution"])
    progress("height search")
    flo,fhi=recovery(low)-r["minimumRecoveryPct"],recovery(high)-r["minimumRecoveryPct"]
    if flo*fhi>0: return {"name":name,"status":"BLOCKED_NO_HEIGHT_BRACKET",
      "daxContinuousM2S":dc,"daxDispersedM2S":dd,
      "diagnostics":{"closedCandidateRecoveryAt2M":recovery(low),
        "closedCandidateRecoveryAt20M":recovery(high),
        "minimumRecoveryPct":r["minimumRecoveryPct"],
        "residualAt2M":flo,"residualAt20M":fhi,
        "bothBoundaryStatesPassedOriginalFvClosure":True,
        "h2Benchmark":h2_benchmark,
        "gridIndependenceStatus":"PENDING_NOT_IMPLEMENTED",
        "interfaceCalls":budget["calls"]}}
    lo,hi=2.,20.; selected=low
    for _ in range(10):
        mid=(lo+hi)/2
        nearest=min(accepted_by_height,key=lambda x:abs(x-mid))
        selected=solve_height(mid,accepted_by_height[nearest]); fm=recovery(selected)-r["minimumRecoveryPct"]
        if flo*fm<=0: hi=mid
        else: lo,flo=mid,fm
    # The reported height is a new point (the centre of the final bracket), not
    # necessarily the last midpoint evaluated above. Solve that exact point so
    # no profile, recovery, or qualification is paired with another height.
    final_height=(lo+hi)/2
    nearest=min(accepted_by_height,key=lambda x:abs(x-final_height))
    selected=solve_height(final_height,accepted_by_height[nearest])
    if selected["height"] != final_height:
        raise RuntimeError("JOB_C_PROFILE_HEIGHT_INTERNAL_MISMATCH")
    numerical_cells=[]
    for j in range(m):
        numerical_cells.append({"numericalCell":j+1,"continuousLocalComponentMolarFlowMolS":selected["state"][0][j],
          "dispersedLocalComponentMolarFlowMolS":selected["state"][1][j],
          "continuousInMolS":selected["fc"][j],"continuousOutMolS":selected["fc"][j+1],
          "dispersedInMolS":[-x for x in selected["fd"][j+1]],"dispersedOutMolS":[-x for x in selected["fd"][j]],
          "transferContinuousToDispersedMolS":selected["tr"][j],"localInterface":selected["gates"][j],
          "continuousResidualMolS":selected["rc"][j],"dispersedResidualMolS":selected["rd"][j]})
    out={"heightM":final_height,"profileSolvedHeightM":selected["height"],
         "profileStateSha256":digest([selected["state"][0],selected["state"][1]]),
         "recoveryPctNmpFreeRrboHydrocarbonMassBasis":recovery(selected),
          "numericalCells":numerical_cells,
          "qualification":"NUMERICAL_FV_DISCRETIZATION_NOT_PHYSICAL_STAGE_COUNT",
          "gridIndependenceStatus":"PENDING_NOT_IMPLEMENTED",
          "globalComponentBalanceResidualMolS":selected["global"],
          "residualDiagnostics":{"maxCellResidualMolS":selected["raw"],
          "maxScaledCellResidual":selected["scaled"],
          "maxGlobalComponentBalanceResidualMolS":max(abs(x) for x in selected["global"]),
          "minimumLocalComponentFlowMolS":selected["positive"],
          "interfaceCalls":selected["interfaceCalls"],
           "runtimeSeconds":time.monotonic()-budget["started"],
           "runtimeBudgets":{"qualification":qualification_runtime,
             "nonlinearSolver":{"budgetSeconds":budget["maximumSeconds"],
               "elapsedSeconds":time.monotonic()-budget["started"]},
             "totalElapsedSeconds":time.monotonic()-case_started}},
         "homotopyHistory":selected["homotopyHistory"],
          "h2Benchmark":h2_benchmark,
         "boundaryConditions":{"continuousInlet":"DANCKWERTS_TOTAL_COMPONENT_FACE_FLUX_EQUALS_GOVERNED_INLET_MOL_S",
          "dispersedInlet":"DANCKWERTS_TOTAL_COMPONENT_FACE_FLUX_EQUALS_NEGATIVE_GOVERNED_INLET_MOL_S",
          "outlets":"ZERO_DISPERSIVE_GRADIENT"}}
    return {"name":name,"status":"CALCULATED_PRELIMINARY_SENSITIVITY",
            "daxContinuousM2S":dc,"daxDispersedM2S":dd,"selected":out}

def exact_qualify(r, nominal):
    if nominal.get("status")!="CALCULATED_PRELIMINARY_SENSITIVITY": return nominal
    selected=nominal["selected"]; cells=selected["numericalCells"]; height=selected["heightM"]
    if selected.get("profileSolvedHeightM") != height:
        raise JobCBlocked("BLOCKED_PROFILE_HEIGHT_MISMATCH",
          {"heightM":height,"profileSolvedHeightM":selected.get("profileSolvedHeightM")})
    qualified_state=[
      [cell["continuousLocalComponentMolarFlowMolS"] for cell in cells],
      [cell["dispersedLocalComponentMolarFlowMolS"] for cell in cells]]
    if digest(qualified_state) != selected.get("profileStateSha256"):
        raise JobCBlocked("BLOCKED_PROFILE_STATE_MISMATCH",
          {"recordedProfileStateSha256":selected.get("profileStateSha256"),
           "qualifiedProfileStateSha256":digest(qualified_state)})
    A=math.pi*r["columnDiameterM"]**2/4; dz=height/r["compartments"]
    aV=6*r["operatingHoldup"]/r["d32M"]*A*dz
    balance_tolerance=1e-7
    flux_tolerance=balance_tolerance/aV
    boundary_error=max(
      max(abs(cells[0]["continuousInMolS"][i]-r["continuousFeedMolS"][i]) for i in range(7)),
      max(abs(cells[-1]["dispersedInMolS"][i]-r["dispersedFeedMolS"][i]) for i in range(7)),
      max(abs(cells[-1]["continuousOutMolS"][i]-
              cells[-1]["continuousLocalComponentMolarFlowMolS"][i]) for i in range(7)),
      max(abs(cells[0]["dispersedOutMolS"][i]-
              cells[0]["dispersedLocalComponentMolarFlowMolS"][i]) for i in range(7)))
    if boundary_error != 0.0:
        raise JobCBlocked("BLOCKED_EXACT_BOUNDARY_CONDITIONS_FAILED",
          {"maximumBoundaryConditionErrorMolS":boundary_error})
    exact=[]
    for exact_index,cell in enumerate(cells):
        progress(f"exact qualification {exact_index}/{len(cells)}",exact_index,len(cells))
        c=cell["continuousLocalComponentMolarFlowMolS"]
        d=cell["dispersedLocalComponentMolarFlowMolS"]
        xc=[x/sum(c) for x in c]; xd=[x/sum(d) for x in d]
        q={"protocol":"ECR_JOB_B_INTERFACE_V1","operation":"SOLVE_INTERFACE",
           "componentOrder":list(COMPONENTS),"T":r["temperatureK"],
           "x_bulk_continuous":xc,"x_bulk_dispersed":xd,"kc":r["kc"],"kd":r["kd"],
           "CtC":r["continuousTotalConcentrationMolM3"],
           "CtD":r["dispersedTotalConcentrationMolM3"],
           "phase_config":r["phaseConfiguration"]}
        candidate_state=cell["localInterface"]["candidate"]
        reference=(candidate_state["interfaceContinuousMoleFractions"]+
          candidate_state["interfaceDispersedMoleFractions"]+
          [candidate_state.get("totalMolarFluxMolM2S",0.0)])
        out=qualified_interface(q,reference)
        full=out
        if out.get("status")!="QUALIFIED_JOB_C_BOUNDARY_BRANCH":
            raise JobCBlocked("BLOCKED_EXACT_QUALIFICATION_FAILED",
                {"numericalCell":cell["numericalCell"],"qualifierStatus":out.get("status"),
                "qualifierError":out.get("error"),"startDiagnostics":out.get("startDiagnostics"),
               "endpointAssessments":out.get("endpointAssessments"),
               "candidateRetainedForDiagnostics":cell["localInterface"]})
        nc=[float(x) for x in out["interface"]["continuousComponentFluxMolM2S"]]
        nd=[float(x) for x in out["interface"]["dispersedComponentFluxMolM2S"]]
        candidate=cell["localInterface"]["candidate"]["continuousComponentFluxMolM2S"]
        error=max(abs(nc[i]-candidate[i]) for i in range(7))
        film=max(abs(nc[i]-nd[i]) for i in range(7))
        if error>flux_tolerance:
            raise JobCBlocked("BLOCKED_EXACT_QUALIFICATION_FAILED",
               {"numericalCell":cell["numericalCell"],"gate":"CANDIDATE_EXACT_FLUX_ERROR",
               "maximumFluxErrorMolM2S":error,"toleranceMolM2S":flux_tolerance,
               "toleranceDerivation":"FV_BALANCE_TOLERANCE_MOL_S_DIVIDED_BY_CELL_INTERFACIAL_AREA_M2",
               "candidateRetainedForDiagnostics":cell["localInterface"]})
        if film>1e-12 and film/max(*(abs(x) for x in nc+nd),1e-12)>1e-8:
            raise JobCBlocked("BLOCKED_EXACT_QUALIFICATION_FAILED",
               {"numericalCell":cell["numericalCell"],"gate":"EXACT_FILMS_DISAGREE"})
        transfer=[x*aV for x in nc]
        rc=[cell["continuousInMolS"][i]-cell["continuousOutMolS"][i]-transfer[i] for i in range(7)]
        rd=[cell["dispersedInMolS"][i]-cell["dispersedOutMolS"][i]+transfer[i] for i in range(7)]
        cell.update({"transferContinuousToDispersedMolS":transfer,
          "continuousResidualMolS":rc,"dispersedResidualMolS":rd,
          "exactBoundaryQualifier":{"status":"QUALIFIED_JOB_C_BOUNDARY_BRANCH",
            "fullResponse":full,"fullResponseSha256":full["resultHash"],
            "candidateExactMaximumFluxErrorMolM2S":error,
            "candidateExactFluxToleranceMolM2S":flux_tolerance}})
        exact.append((rc,rd))
    feedc=r["continuousFeedMolS"]; feedd=r["dispersedFeedMolS"]
    cout=cells[-1]["continuousOutMolS"]; dout=cells[0]["dispersedOutMolS"]
    global_balance=[feedc[i]+feedd[i]-cout[i]-dout[i] for i in range(7)]
    raw=max(abs(x) for pair in exact for row in pair for x in row)
    total_flow=sum(feedc)+sum(feedd)
    exact_scale=[
      max(feedc[i]+feedd[i],total_flow*1e-7) for i in range(7)]
    scaled=max(abs(x/exact_scale[i%7])
      for pair in exact for row in pair for i,x in enumerate(row))
    positive=min(x for cell in cells for key in (
        "continuousLocalComponentMolarFlowMolS","dispersedLocalComponentMolarFlowMolS")
        for x in cell[key])
    if (raw>balance_tolerance or scaled>balance_tolerance or
        max(abs(x) for x in global_balance)>balance_tolerance or positive<=0):
        raise JobCBlocked("BLOCKED_EXACT_QUALIFICATION_FAILED",
          {"gate":"FINAL_EXACT_FV_ACCEPTANCE","maximumCellResidualMolS":raw,
           "maximumScaledCellResidual":scaled,
           "globalComponentBalanceResidualMolS":global_balance,
           "minimumLocalComponentFlowMolS":positive})
    rrbo_out=cout if r["phaseConfiguration"]=="rrbo-continuous-nmp-dispersed" else dout
    rrbo_in=feedc if r["phaseConfiguration"]=="rrbo-continuous-nmp-dispersed" else feedd
    mw=[170.3348,120.194,142.1971,202.2506,405.58]
    selected["recoveryPctNmpFreeRrboHydrocarbonMassBasis"]=100*sum(
        rrbo_out[i]*mw[i] for i in range(5))/sum(rrbo_in[i]*mw[i] for i in range(5))
    selected["globalComponentBalanceResidualMolS"]=global_balance
    selected["residualDiagnostics"].update({
      "maximumExactCellResidualMolS":raw,
      "maximumExactScaledCellResidual":scaled,
      "maximumExactGlobalBalanceResidualMolS":max(abs(x) for x in global_balance),
      "exactQualifiedCellCount":len(cells)})
    selected["exactQualificationStatus"]=f"QUALIFIED_JOB_C_BOUNDARY_BRANCH_{len(cells)}_OF_{len(cells)}_REPLAYED"
    progress(f"exact qualification {len(cells)}/{len(cells)}",len(cells),len(cells))
    return nominal

for line in sys.stdin:
 try:
    _active_runtime_budgets=None
    r=json.loads(line)
    if r.get("protocol")!=PROTOCOL or r.get("operation")!="SOLVE_HEIGHT" or r.get("componentOrder")!=list(COMPONENTS): raise ValueError("JOB_C_PROTOCOL_OR_COMPONENT_ORDER_INVALID")
    validate_branch_request(r)
    temporary,engine,_,_=job_b.scientific.build_engine(r["temperatureK"],0.0)
    try:
       solvers=[CandidateInterfaceSolver(engine,r["temperatureK"],r["kc"],r["kd"],
         r["continuousTotalConcentrationMolM3"],r["dispersedTotalConcentrationMolM3"],
         r["phaseConfiguration"]) for _ in range(r["compartments"])]
       nominal=case(r,"NOMINAL",.010,.0010,solvers)
    finally: temporary.cleanup()
    nominal=exact_qualify(r,nominal)
    cases=[nominal]+[{"name":x,"status":"NOT_RUN_PENDING_NOMINAL","reason":"SENSITIVITIES_DEFERRED_UNTIL_NOMINAL_VIABLE"} for x in ("CONTINUOUS_LOW","CONTINUOUS_HIGH","DISPERSED_LOW","DISPERSED_HIGH")]
    body={"protocol":PROTOCOL,"status":"CALCULATED_PRELIMINARY_JOB_C" if nominal["status"].startswith("CALCULATED") else "BLOCKED_PRELIMINARY_JOB_C","componentOrder":list(COMPONENTS),
          "candidateInterfaceImplementation":{"version":CANDIDATE_VERSION,
            "sha256":hashlib.sha256((Path(__file__).parent/"candidate_interface.py").read_bytes()).hexdigest(),
            "qualification":"CANDIDATE_ONLY_NO_STABILITY_CLAIM"},
           "boundaryInterfaceQualifier":{"version":QUALIFIER_VERSION,
             "sha256":hashlib.sha256((Path(__file__).parent/"boundary_interface_qualifier.py").read_bytes()).hexdigest(),
             "qualification":"QUALIFIED_JOB_C_BOUNDARY_BRANCH"},
           "finalQualificationRequirement":"VERSIONED_JOB_C_BOUNDARY_QUALIFIER_EVERY_LOCAL_STATE",
          "sensitivityCases":cases}
 except JobCBlocked as e:
    diagnostics=dict(e.diagnostics)
    runtime_budgets=active_runtime_budget_report()
    if runtime_budgets is not None:
        diagnostics.setdefault("runtimeBudgets",runtime_budgets)
    body={"protocol":PROTOCOL,"status":"BLOCKED_PRELIMINARY_JOB_C",
          "error":e.code,"diagnostics":diagnostics}
 except TimeoutError:
    runtime_budgets=active_runtime_budget_report()
    body={"protocol":PROTOCOL,"status":"BLOCKED_PRELIMINARY_JOB_C",
          "error":"JOB_C_INTERNAL_RUNTIME_BUDGET",
          "diagnostics":{"classification":"NUMERICAL_RUNTIME_BUDGET_EXHAUSTED",
            "physicalInfeasibilityClaimed":False,
             "runtimeBudgets":runtime_budgets,
            "claimsEmitted":{"height":False,"efficiency":False,
              "finalRpm":False,"jobD":False,"release":False}}}
 except (ValueError,RuntimeError,KeyError,TypeError) as e:
    body={"protocol":PROTOCOL,"status":"FAILURE_INVALID_REQUEST","error":str(e)}
 body["resultSha256"]=digest(body)
 progress("terminal",1,1)
 print(canonical(body),flush=True)