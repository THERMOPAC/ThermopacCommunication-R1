#!/usr/bin/env python3
"""Conservative finite-volume countercurrent Job-C kernel."""
from __future__ import annotations
import hashlib, importlib.util, json, math, multiprocessing, os, signal, sys, tempfile, time
from pathlib import Path
from candidate_interface import CandidateInterfaceSolver, CandidateFailure, VERSION as CANDIDATE_VERSION
from boundary_interface_qualifier import qualify as qualify_boundary, VERSION as QUALIFIER_VERSION

sys.dont_write_bytecode = True
PROTOCOL = "ECR_PRE_PILOT_JOB_C_V1"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")

def native_json_scalar(v):
    if type(v).__module__.split(".")[0]=="numpy" and hasattr(v,"item"):
        return v.item()
    raise TypeError(f"unsupported JSON value {type(v).__name__}")
def canonical(v): return json.dumps(v, sort_keys=True, separators=(",", ":"),
  allow_nan=False, default=native_json_scalar)
def hashed(v):
    if type(v).__module__.split(".")[0]=="numpy" and hasattr(v,"item"):
        return hashed(v.item())
    if isinstance(v, bool) or v is None or isinstance(v, str): return v
    if isinstance(v, (int,float)):
        # JS Number.toExponential normalizes -0; signed zeros are the same
        # numeric value, not distinct scientific inventories.
        a,b=format(0.0 if float(v)==0.0 else float(v), ".16e").split("e"); return {"$number":f"{a}e{int(b)}"}
    if isinstance(v,list): return [hashed(x) for x in v]
    return {k:hashed(x) for k,x in v.items()}
def digest(v): return hashlib.sha256(canonical(hashed(v)).encode()).hexdigest()
_job_started=None
_last_progress={"phase":"initializing","completed":0,"total":None,
  "iteration":None,"residual":None,"residualKind":None,
  "elapsedSeconds":0.0,"heightCandidateM":None}
_last_progress_emit=0.0
_completed_results=[]
_request_sha256=None

def progress(phase, completed=0, total=None, iteration=None, residual=None,
             residual_kind=None, height_candidate_m=None, throttle=False):
    """Emit an honest, machine-readable live state (never a guessed total)."""
    global _last_progress,_last_progress_emit
    now=time.monotonic()
    if throttle and now-_last_progress_emit < 0.75:
        return
    finite_residual=(isinstance(residual,(int,float)) and not isinstance(residual,bool)
      and math.isfinite(float(residual)))
    _last_progress={"phase":phase,"completed":completed,"total":total,
      "iteration":iteration if isinstance(iteration,int) else None,
      "residual":float(residual) if finite_residual else None,
      "residualKind":residual_kind if finite_residual else None,
      "elapsedSeconds":max(0.0,now-_job_started) if _job_started is not None else 0.0,
      "heightCandidateM":float(height_candidate_m)
        if isinstance(height_candidate_m,(int,float)) and math.isfinite(height_candidate_m)
        else None}
    _last_progress_emit=now
    print("JOB_C_PROGRESS "+json.dumps(_last_progress,separators=(",",":")),flush=True)

def record_completed_result(identifier, kind, value, **metadata):
    """Only append independently qualified, finite scientific evidence."""
    global _completed_results
    row={"id":identifier,"kind":kind,"value":value,**metadata}
    _completed_results=[x for x in _completed_results if x["id"]!=identifier]
    _completed_results.append(row)

def checkpoint():
    body={"schemaVersion":"ECR_JOB_C_PARTIAL_V1","complete":False,
      "requestSha256":_request_sha256,"completedResults":_completed_results,
      "progress":_last_progress}
    print("JOB_C_CHECKPOINT "+canonical(body),flush=True)

def require_runtime_budget(budget, now=None):
    """Raise at every expensive residual boundary once the budget is spent."""
    current=time.monotonic() if now is None else float(now)
    elapsed=current-budget["started"]
    if budget["maximumSeconds"] is not None and elapsed>budget["maximumSeconds"]:
        raise TimeoutError("JOB_C_MONOLITHIC_INTERNAL_RUNTIME_BUDGET")
    return elapsed

root=Path(os.environ["JOB_B_INTERFACE_RUNTIME_ROOT"]).resolve()
spec=importlib.util.spec_from_file_location("job_c_verified_job_b",root/"server/ecr-pre-pilot/job-b-interface/worker.py")
if spec is None or spec.loader is None: raise RuntimeError("JOB_C_JOB_B_IMPORT_FAILED")
job_b=importlib.util.module_from_spec(spec); spec.loader.exec_module(job_b)

_profile_qualification_context=None
_active_qualification_pool=None
_active_qualification_jobs=None
_active_runtime_budgets=None
# Qualification has no wall-clock deadline; cancellation remains authoritative.
QUALIFICATION_BUDGET_SECONDS=None
# Wall-clock limits are intentionally absent.  Solver iteration criteria remain
# finite and conservative; orchestration cancellation is handled by SIGTERM.
NONLINEAR_SOLVER_BUDGET_SECONDS=None

class JobCInterrupted(BaseException):
    pass

def terminate_descendants(signum, frame):
    """Cancellation reaps qualifiers, then preserves all completed evidence."""
    pool=_active_qualification_pool
    jobs=_active_qualification_jobs
    # Ready results are already complete in children.  Harvest them before
    # terminating the remaining pool so a checkpoint cannot discard evidence.
    if jobs is not None:
        for index,job in enumerate(jobs):
            if job.ready():
                try:
                    value=job.get()
                    if "flux" in value:
                        record_completed_result(f"contact:{index+1}",
                          "QUALIFIED_AXIAL_CONTACT",value)
                except BaseException:
                    pass
    if pool is not None:
        pool.terminate()
        pool.join()
    checkpoint()
    raise JobCInterrupted()

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

class CoupledGateFeasible(RuntimeError):
    """Internal numerical stop after an unperturbed base state passes all gates."""

def checkpoint_request_payload(request):
    """Remove transport/resume fields absent from the persisted pristine request."""
    return {key:value for key,value in request.items()
      if key not in ("protocol","operation","resumeCheckpoint")}

def globally_conservative_interior_seed(np, feedc, feedd, cells, fraction,
                                        epsilon):
    """Create a positive counter-current interior without changing feed faces."""
    continuous=np.asarray(feedc,dtype=float)
    dispersed=np.asarray(feedd,dtype=float)
    transfer=np.zeros(7)
    for i in range(7):
        if continuous[i]>0.0 and dispersed[i]==0.0:
            transfer[i]=fraction*continuous[i]
        elif dispersed[i]>0.0 and continuous[i]==0.0:
            transfer[i]=-fraction*dispersed[i]
        elif continuous[i]==0.0 and dispersed[i]==0.0:
            raise JobCBlocked("JOB_C_BOOTSTRAP_COMPONENT_INVENTORY_ABSENT",
              {"component":COMPONENTS[i],"physicalInfeasibilityClaimed":False})
    per_cell=np.tile(transfer/cells,(cells,1))
    c=np.asarray([continuous-np.sum(per_cell[:j+1],axis=0)
      for j in range(cells)])
    d=np.asarray([dispersed+np.sum(per_cell[j:],axis=0)
      for j in range(cells)])
    flows=np.r_[c.reshape(-1),d.reshape(-1)]
    closure=c[-1]+d[0]-continuous-dispersed
    closure_limit=max(float(np.finfo(float).eps)
      *max(float(np.sum(continuous)+np.sum(dispersed)),1.0)*64.0,1e-18)
    if float(np.max(np.abs(closure)))>closure_limit:
        raise JobCBlocked("JOB_C_BOOTSTRAP_GLOBAL_INVENTORY_CLOSURE_FAILED",
          {"globalComponentBalanceResidualMolS":closure.tolist(),
           "physicalInfeasibilityClaimed":False})
    if float(np.min(flows))<=epsilon:
        raise JobCBlocked("JOB_C_BOUNDARY_AWARE_INITIAL_PROFILE_INVALID",
          {"minimumFlowMolS":float(np.min(flows)),
           "physicalInfeasibilityClaimed":False})
    return flows,per_cell

def split_coupled_warm_state(np, warm, cells):
    """Validate and split one accepted 27m coupled state without clipping."""
    state=np.asarray(warm,dtype=float)
    expected=27*cells
    if (state.ndim!=1 or state.size!=expected
        or not bool(np.all(np.isfinite(state)))):
        raise JobCBlocked("JOB_C_WARM_START_STATE_INVALID",
          {"expectedUnknownCount":expected,
           "observedUnknownCount":int(state.size),
           "finite":bool(np.all(np.isfinite(state))),
           "physicalInfeasibilityClaimed":False})
    return state[:14*cells].copy(),state[14*cells:].copy()

def coupled_lambda_targets(bootstrap_lambda):
    """Return the deterministic continuation path with lambda=0 first."""
    return sorted(set([0.0,1e-10,3e-10,1e-9,3e-9,bootstrap_lambda,
      .00003,.0001,.0003,.001,.0025,.005,.01,.025,.05,.1,.25,.5,.75,1.0]))

def coupled_lambda_failure_step(history, rejected_lambda, minimum_interval):
    """Return the accepted lower endpoint and optional retry midpoint."""
    previous=history[-1]["lambda"] if history else None
    midpoint=None
    if (previous is not None
        and rejected_lambda-previous>minimum_interval):
        midpoint=(previous+rejected_lambda)/2.0
    return previous,midpoint

def coupled_jacobian_sparsity(scipy, cells):
    """Build a conservative dependency mask for the 98 FV + 91 interface rows."""
    m=cells
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
    return sparsity.tocsr()

def coupled_solver_row_scale(np, inventory_scale):
    """Condition FV rows against both unchanged absolute and scaled gates."""
    return np.minimum(np.asarray(inventory_scale,dtype=float),1.0)

def coupled_gate_decision(raw, scaled, interface, minimum):
    """Apply the unchanged scientific acceptance gates independently."""
    raw_pass=bool(raw<=1e-7)
    scaled_pass=bool(scaled<=1e-7)
    interface_pass=bool(interface<=1e-7)
    positivity_pass=bool(minimum>0)
    return {"rawFvGatePassed":raw_pass,
      "scaledFvGatePassed":scaled_pass,
      "originalJobBGatePassed":interface_pass,
      "strictPositivityPassed":positivity_pass,
      "accepted":bool(raw_pass and scaled_pass and interface_pass
        and positivity_pass)}

def coupled_objective_channels(evaluate, observer, lam):
    """Separate optimizer base states from finite-difference probe states."""
    def base(state):
        return evaluate(state,lam,observer)
    def probe(state):
        return evaluate(state,lam,None)
    return base,probe

def coupled_observe_base_candidate(np, tracker, state, metrics):
    """Retain only an optimizer base state, never a Jacobian probe."""
    tracker["baseEvaluationCount"]+=1
    score=max(metrics["rawFvResidualMolS"]/1e-7,
      metrics["scaledFvResidual"]/1e-7,
      metrics["maximumOriginalJobBGateResidual"]/1e-7)
    if not metrics["strictPositivityPassed"]:
        score=math.inf
    if score<tracker["bestScore"]:
        tracker.update({"bestScore":score,
          "bestState":np.asarray(state).copy(),"bestMetrics":metrics})

def confirm_coupled_candidate(np, candidate_state, lam, raw_evaluate,
                              metrics_for):
    """Require two fresh full-system evaluations to pass every gate."""
    first=raw_evaluate(candidate_state,lam)
    second=raw_evaluate(np.asarray(candidate_state).copy(),lam)
    first_metrics=metrics_for(first); second_metrics=metrics_for(second)
    deltas={
      key:abs(first_metrics[key]-second_metrics[key])
      for key in ("rawFvResidualMolS","scaledFvResidual",
        "maximumOriginalJobBGateResidual","minimumFlowMolS")}
    return {"accepted":bool(first_metrics["accepted"]
        and second_metrics["accepted"]),
      "state":np.asarray(candidate_state).copy(),"evaluation":second,
      "metrics":second_metrics,
      "confirmation":{"independentRawReevaluationCount":2,
        "bothScientificGateEvaluationsPassed":bool(
          first_metrics["accepted"] and second_metrics["accepted"]),
        "maximumMetricDifference":max(deltas.values()),
        "exactlyRepeatable":all(value==0.0 for value in deltas.values())}}

def find_resume_zero_anchor(completed_results, height):
    """Select only a structurally shaped checkpoint candidate; never accept it."""
    for completed in completed_results:
        value=completed.get("value",{}) if isinstance(completed,dict) else {}
        if (completed.get("kind")=="ACCEPTED_ZERO_TRANSFER_COUPLED_ANCHOR"
            and value.get("heightM")==height and value.get("lambda")==0.0
            and isinstance(value.get("state"),list)):
            return value["state"]
    return None

def find_resume_coupled_anchor(completed_results, height,
                               expected_state_size=189):
    """Return the highest structurally valid accepted continuation checkpoint."""
    accepted_kinds={"ACCEPTED_ZERO_TRANSFER_COUPLED_ANCHOR",
      "ACCEPTED_COUPLED_CONTINUATION_ANCHOR"}
    candidates=[]
    for completed in completed_results:
        if not isinstance(completed,dict):
            continue
        value=completed.get("value",{})
        if not isinstance(value,dict):
            continue
        lam=value.get("lambda")
        state=value.get("state")
        try:
            lam_value=(float(lam)
              if isinstance(lam,(int,float)) and not isinstance(lam,bool)
              else None)
            state_values=([float(item) for item in state]
              if isinstance(state,list)
                and len(state)==expected_state_size
                and all(isinstance(item,(int,float))
                  and not isinstance(item,bool) for item in state)
              else None)
        except (TypeError,ValueError,OverflowError):
            continue
        state_valid=(state_values is not None
          and all(math.isfinite(item) for item in state_values))
        kind=completed.get("kind")
        kind_lambda_consistent=(
          (kind=="ACCEPTED_ZERO_TRANSFER_COUPLED_ANCHOR"
            and lam_value==0.0)
          or (kind=="ACCEPTED_COUPLED_CONTINUATION_ANCHOR"
            and lam_value is not None and 0.0<lam_value<=1.0))
        if (completed.get("kind") in accepted_kinds
            and value.get("heightM")==height
            and lam_value is not None and math.isfinite(lam_value)
            and 0.0<=lam_value<=1.0
            and state_valid and kind_lambda_consistent
            and value.get("stateSha256")==digest(state)):
            candidates.append({"lambda":lam_value,"state":state})
    return max(candidates,key=lambda candidate:candidate["lambda"]) if candidates else None

def validate_coupled_warm_flows(np, flows, lower, upper, epsilon, height=None):
    """Fail closed before any checkpoint-derived flow can enter a solve."""
    values=np.asarray(flows,dtype=float)
    if (not np.all(np.isfinite(values)) or np.min(values)<=epsilon
        or np.any(values<lower) or np.any(values>upper)):
        raise JobCBlocked("JOB_C_WARM_START_FLOW_BOUNDS_INVALID",
          {"minimumFlowMolS":float(np.min(values))
            if values.size and np.all(np.isfinite(values)) else None,
           "heightM":height,
           "physicalInfeasibilityClaimed":False})
    return values

def coupled_bound_proximity(np, state, lower, upper, variable_scale,
                            relative_threshold=1e-10):
    """Report diagnostic-only near bounds that TRF active_mask can omit."""
    values=np.asarray(state,dtype=float)
    lower_distance=values-lower; upper_distance=upper-values
    threshold=relative_threshold*np.maximum(np.abs(variable_scale),1.0)
    near_lower=(lower_distance>=0)&(lower_distance<=threshold)
    near_upper=(upper_distance>=0)&(upper_distance<=threshold)
    return {"qualification":"DIAGNOSTIC_ONLY_NO_BOUND_OR_GATE_CHANGE",
      "relativeThreshold":relative_threshold,
      "thresholdByCoordinate":threshold,
      "lowerDistance":lower_distance,"upperDistance":upper_distance,
      "nearLower":near_lower,"nearUpper":near_upper}

def coupled_gauss_newton_candidate(np, state, correction, lower, upper,
                                   safety_fraction=0.95):
    """Build the largest strict-interior correction step without clipping."""
    values=np.asarray(state,dtype=float)
    delta=np.asarray(correction,dtype=float)
    low=np.asarray(lower,dtype=float); high=np.asarray(upper,dtype=float)
    if (values.shape!=delta.shape or values.shape!=low.shape
        or values.shape!=high.shape or not np.all(np.isfinite(values))
        or not np.all(np.isfinite(delta))):
        return {"admitted":False,"reason":"NONFINITE_OR_SHAPE_MISMATCH",
          "stepScale":None,"fullStepAdmissible":False,"state":None}
    full=values+delta
    full_admissible=bool(np.all(full>low) and np.all(full<high))
    scale=1.0
    if not full_admissible:
        ratios=[]
        positive=delta>0; negative=delta<0
        if np.any(positive):
            ratios.extend(((high[positive]-values[positive])
              /delta[positive]).tolist())
        if np.any(negative):
            ratios.extend(((values[negative]-low[negative])
              /(-delta[negative])).tolist())
        maximum_scale=min(ratios) if ratios else 0.0
        scale=float(safety_fraction*maximum_scale)
    candidate=values+scale*delta
    admitted=bool(scale>0.0 and math.isfinite(scale)
      and np.all(np.isfinite(candidate))
      and np.all(candidate>low) and np.all(candidate<high))
    return {"admitted":admitted,
      "reason":"STRICT_INTERIOR_UNCLIPPED_STEP" if admitted
        else "NO_STRICT_INTERIOR_CORRECTION_STEP",
      "stepScale":scale if admitted else None,
      "fullStepAdmissible":full_admissible,
      "state":candidate if admitted else None}

def budgeted_least_squares(budget, phase, optimizer, residual, *args, **kwargs):
    """Guard optimizer entry, callbacks, and return with one fail-closed contract.

    Tests replace the clock and optimizer in-process; no request or environment
    switch can enable fault injection in the packaged worker.
    """
    def guarded_residual(*values, **options):
        require_runtime_budget(budget)
        result=residual(*values, **options)
        require_runtime_budget(budget)
        # least_squares does not expose an iteration callback on every scipy
        # version.  Report the available residual evaluation honestly instead.
        try:
            norm=float(math.sqrt(sum(float(x)*float(x) for x in result)))
        except (TypeError,ValueError,OverflowError):
            norm=None
        # residualCalls is a function-evaluation count, not an optimizer
        # iteration.  Keep iteration null rather than mislabeling it.
        progress(phase, budget.get("residualCalls",0), None, None, norm,
          "RESIDUAL_L2", budget.get("heightCandidateM"), throttle=True)
        return result
    try:
        require_runtime_budget(budget)
        result=optimizer(guarded_residual, *args, **kwargs)
        require_runtime_budget(budget)
        return result
    except TimeoutError:
        raise JobCBlocked("JOB_C_INTERNAL_RUNTIME_BUDGET", {
          "classification":"NUMERICAL_RUNTIME_BUDGET_EXHAUSTED",
          "phase":phase,
          "physicalInfeasibilityClaimed":False,
          "claimsEmitted":{"height":False,"efficiency":False,
            "finalRpm":False,"jobD":False,"release":False}})

def run_with_qualification_budget(budget, operation, cache_status):
    """Run qualification until completion or the process receives Stop."""
    return operation()

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
    budget={"calls":0,"residualCalls":0,"started":None,"heightCandidateM":None,
            "maximumSeconds":NONLINEAR_SOLVER_BUDGET_SECONDS}
    global _active_runtime_budgets
    _active_runtime_budgets={"caseStarted":case_started,
      "qualification":qualification_budget,"nonlinearSolver":budget}
    progress("boundary interface qualification")
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
    record_completed_result("boundary-interface","QUALIFIED_BOUNDARY_INTERFACE",
      inlet_qualifier,inputSha256=branch["sourceStateSha256"])
    # Reuse only a complete, hash-bound qualification set. Cache misses retain
    # the forked process tree so lease cancellation terminates every descendant.
    qualified,cache_identity,cache_key=load_qualification_cache(r)
    cache_hit=qualified is not None
    if cache_hit:
        progress("axial contact qualification cache",m,m)
        for value in qualified:
            record_completed_result(f"contact:{value['index']+1}",
              "QUALIFIED_AXIAL_CONTACT",value,
              inputSha256=digest(r["axialLocalContactProfile"][value["index"]]),
              source="HASH_BOUND_CACHE_REPLAY")
    else:
        global _profile_qualification_context,_active_qualification_pool,_active_qualification_jobs
        _profile_qualification_context=(r,solvers[0].engine,branch)
        context=multiprocessing.get_context("fork")
        pool=context.Pool(processes=min(3,m))
        _active_qualification_pool=pool
        jobs=[pool.apply_async(qualify_profile_contact,(index,)) for index in range(m)]
        _active_qualification_jobs=jobs
        try:
            completed=-1
            collected=set()
            while completed<m:
                require_runtime_budget(qualification_budget)
                completed=sum(job.ready() for job in jobs)
                progress("axial contact qualification",completed,m)
                # Harvest each ready contact immediately.  If cancellation
                # follows, this is recoverable qualified evidence, not an
                # all-or-nothing pool result.
                for index,job in enumerate(jobs):
                    if index not in collected and job.ready():
                        value=job.get()
                        collected.add(index)
                        if "flux" in value:
                            record_completed_result(f"contact:{index+1}",
                              "QUALIFIED_AXIAL_CONTACT",value,
                              inputSha256=digest(r["axialLocalContactProfile"][index]))
                if completed<m: time.sleep(1)
            qualified=[job.get() for job in jobs]
            pool.close(); pool.join()
        except BaseException:
            pool.terminate(); pool.join()
            raise
        finally:
            _active_qualification_pool=None
            _active_qualification_jobs=None
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
    qualification_budget.update({"ended":time.monotonic(),
      "cacheStatus":qualification_runtime["cacheStatus"],
      "cacheKeySha256":cache_key})
    budget["started"]=time.monotonic()
    progress("nonlinear solver started")
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
    profile_interval_probe_lambda=(
      min(1e-5,upper*.25) if math.isfinite(upper) else 1e-5)
    if not profile_interval_probe_lambda>0.0:
        raise JobCBlocked("JOB_C_AXIAL_PROFILE_NO_POSITIVE_CONTINUATION_INTERVAL",
          profile_audit)
    bootstrap_lambda=1e-8

    def solve_height(h, warm=None):
        """Solve the unchanged 98 FV and 91 Job-B equations simultaneously."""
        budget["heightCandidateM"]=float(h)
        np,scipy=solvers[0].np,solvers[0].scipy
        resume_lambda=(float(warm["lambda"])
          if isinstance(warm,dict) and isinstance(warm.get("lambda"),(int,float))
          else None)
        warm_state=(warm.get("state") if isinstance(warm,dict) else warm)
        if m != 7:
            raise JobCBlocked("JOB_C_REQUIRES_SEVEN_NUMERICAL_FV_CELLS",
              {"numericalCells":m,"qualification":"NUMERICAL_FV_DISCRETIZATION_NOT_PHYSICAL_STAGE_COUNT"})
        total_flow=sum(feedc)+sum(feedd)
        scale=np.asarray([max(feedc[i]+feedd[i],total_flow*1e-7) for i in range(7)])
        # Solver-only row conditioning must represent both unchanged FV gates:
        # the inventory-scaled gate and the absolute 1e-7 mol/s gate.  Capping
        # the divisor at 1 mol/s changes neither equation nor acceptance test.
        solver_scale=coupled_solver_row_scale(np,scale)
        epsilon=max(total_flow*1e-13,1e-20)
        upper_flow=max(total_flow*10,epsilon*10)
        dz=h/m; av=6*r["operatingHoldup"]/r["d32M"]

        def initial():
            if warm_state is not None:
                return split_coupled_warm_state(np,warm_state,m)
            # Build a boundary-consistent numerical interior from the two
            # global feed inventories only.  This transfer is an initializer,
            # never a frozen physical source in the coupled equations.
            flows,_=globally_conservative_interior_seed(
              np,feedc,feedd,m,bootstrap_lambda,epsilon)
            if np.any(flows>upper[:14*m]):
                raise JobCBlocked("JOB_C_BOUNDARY_AWARE_INITIAL_PROFILE_INVALID",
                  {"heightM":h,"lambda":bootstrap_lambda,
                   "minimumFlowMolS":float(np.min(flows)),
                   "profileIntervalQualification":profile_audit})
            return flows,np.asarray(profile_unknowns).reshape(-1)

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

        def residual(x,lam,observer=None):
            budget["residualCalls"]+=1
            require_runtime_budget(budget)
            ev=raw_evaluate(x,lam)
            if observer is not None:
                observer(x,ev)
            scaled_fv=np.asarray(
              [v/solver_scale[i%7] for i,v in enumerate(ev["fv"])])
            return np.r_[scaled_fv,ev["interface"]]

        # Explicit block sparsity: every FV source sees both local phase-flow
        # blocks through the interface equations, in addition to its own
        # phase's neighboring convective/dispersion blocks.
        sparsity=coupled_jacobian_sparsity(scipy,m)
        lower=np.r_[np.full(14*m,epsilon),np.full(13*m,-35.0)]
        upper=np.r_[np.full(14*m,upper_flow),np.full(13*m,35.0)]
        variable_scale=np.r_[np.tile(scale,2*m),np.ones(13*m)]

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

        def dominant_blocks(ev):
            rows=diagnostic_rows(ev); blocks={}
            for row in rows:
                key=(row["numericalCell"],row["type"])
                if key not in blocks or abs(row["rawValue"])>abs(blocks[key]["rawValue"]):
                    blocks[key]=row
            return sorted(blocks.values(),key=lambda row:abs(row["rawValue"]),reverse=True)

        def gate_metrics(ev):
            raw=float(np.max(np.abs(ev["fv"])))
            scaled=float(np.max(np.abs(
              [v/scale[i%7] for i,v in enumerate(ev["fv"])])))
            interface=max(
              max(float(np.max(np.abs(values[0][:7]))),
                float(np.max(np.abs(values[6])/solvers[j].scale)))
              for j,values in enumerate(ev["details"]))
            minimum=float(min(np.min(ev["c"]),np.min(ev["d"])))
            decision=coupled_gate_decision(raw,scaled,interface,minimum)
            return {"rawFvResidualMolS":raw,"scaledFvResidual":scaled,
              "maximumOriginalJobBGateResidual":interface,
              "minimumFlowMolS":minimum,
              **decision}

        def component_balance_audit(ev):
            continuous=np.sum(ev["rc"],axis=0)
            dispersed=np.sum(ev["rd"],axis=0)
            combined=continuous+dispersed
            transfer=np.sum(ev["tr"],axis=0)
            return {"componentOrder":list(COMPONENTS),
              "continuousFvResidualSumMolS":continuous.tolist(),
              "dispersedFvResidualSumMolS":dispersed.tolist(),
              "combinedFvResidualSumMolS":combined.tolist(),
              "transferSumMolS":transfer.tolist(),
              "nmp":{"continuousFvResidualSumMolS":float(continuous[5]),
                "dispersedFvResidualSumMolS":float(dispersed[5]),
                "combinedFvResidualSumMolS":float(combined[5]),
                "transferSumMolS":float(transfer[5])}}

        def coordinate_label(index):
            if index<7*m:
                return {"phase":"continuous","numericalCell":index//7+1,
                  "component":COMPONENTS[index%7]}
            if index<14*m:
                local=index-7*m
                return {"phase":"dispersed","numericalCell":local//7+1,
                  "component":COMPONENTS[local%7]}
            local=index-14*m
            return {"phase":"interface","numericalCell":local//13+1,
              "interfaceUnknownIndex":local%13}

        def jacobian_audit(fit):
            matrix=fit.jac.toarray() if hasattr(fit.jac,"toarray") else np.asarray(fit.jac)
            gradient=np.asarray(matrix.T@fit.fun).reshape(-1)
            largest=np.argsort(np.abs(gradient))[-10:][::-1]
            correction=scipy.sparse.linalg.lsmr(
              scipy.sparse.csr_matrix(matrix),-np.asarray(fit.fun),
              atol=1e-10,btol=1e-10,maxiter=4*(27*m))
            predicted=np.asarray(fit.fun)+matrix@correction[0]
            active=np.asarray(fit.active_mask)
            proximity=coupled_bound_proximity(
              np,fit.x,lower,upper,variable_scale)
            near_indices=np.flatnonzero(
              proximity["nearLower"]|proximity["nearUpper"])
            audit={"shape":[int(matrix.shape[0]),int(matrix.shape[1])],
              "activeLowerBoundCount":int(np.count_nonzero(active<0)),
              "activeUpperBoundCount":int(np.count_nonzero(active>0)),
              "activeCoordinates":[
                {**coordinate_label(int(index)),
                 "bound":"LOWER" if active[index]<0 else "UPPER"}
                for index in np.flatnonzero(active)[:30]],
              "nearBoundQualification":proximity["qualification"],
              "nearBoundRelativeThreshold":proximity["relativeThreshold"],
              "nearLowerBoundCount":int(np.count_nonzero(
                proximity["nearLower"])),
              "nearUpperBoundCount":int(np.count_nonzero(
                proximity["nearUpper"])),
              "minimumLowerBoundDistance":float(np.min(
                proximity["lowerDistance"])),
              "minimumUpperBoundDistance":float(np.min(
                proximity["upperDistance"])),
              "nearBoundCoordinates":[
                {**coordinate_label(int(index)),
                 "nearLower":bool(proximity["nearLower"][index]),
                 "nearUpper":bool(proximity["nearUpper"][index]),
                 "lowerDistance":float(
                   proximity["lowerDistance"][index]),
                 "upperDistance":float(
                   proximity["upperDistance"][index]),
                 "diagnosticThreshold":float(
                   proximity["thresholdByCoordinate"][index])}
                for index in near_indices[:30]],
              "largestGradientCoordinates":[
                {**coordinate_label(int(index)),
                 "value":float(gradient[index])} for index in largest],
              "gaussNewtonCorrectionNorm":float(np.linalg.norm(correction[0])),
              "predictedResidualL2":float(np.linalg.norm(predicted)),
              "lsmrStopCode":int(correction[1]),
              "lsmrIterations":int(correction[2])}
            try:
                singular=np.linalg.svd(matrix,compute_uv=False)
                cutoff=max(matrix.shape)*np.finfo(float).eps*singular[0]
                condition=(float(singular[0]/singular[-1])
                  if singular[-1]>0 else None)
                audit.update({"svdStatus":"CALCULATED",
                  "numericalRank":int(np.count_nonzero(singular>cutoff)),
                  "rankCutoff":float(cutoff),
                  "largestSingularValue":float(singular[0]),
                  "smallestSingularValue":float(singular[-1]),
                  "conditionNumber":condition
                    if condition is None or math.isfinite(condition) else None})
            except np.linalg.LinAlgError:
                audit.update({"svdStatus":"UNAVAILABLE_NONCONVERGENCE",
                  "numericalRank":None,"rankCutoff":None,
                  "largestSingularValue":None,"smallestSingularValue":None,
                  "conditionNumber":None})
            return audit,np.asarray(correction[0],dtype=float)

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

        seed_flows,seed_interface_warm=initial()
        seed_flows=validate_coupled_warm_flows(
          np,seed_flows,lower[:14*m],upper[:14*m],epsilon,h)
        # V2/interface unknowns are lineage-only warm starts.  Recompute them
        # on the evolving inventory seed before the first coupled residual.
        seed_interfaces,_,seed_gate=solve_local_interfaces(
          seed_flows,seed_interface_warm)
        if seed_gate>1e-7:
            raise JobCBlocked("JOB_C_INITIAL_INTERFACE_RECOMPUTATION_FAILED",
              {"heightM":h,"maximumCandidateGateResidual":seed_gate,
               "physicalInfeasibilityClaimed":False})
        x=np.r_[seed_flows,seed_interfaces]; history=[]; started=time.monotonic()
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
         # Establish an accepted zero-transfer anchor before introducing any
         # homotopic transfer.  The conservative positive profile is only the
         # initializer; all 189 unchanged equations remain active at lambda=0.
         #
         # Every continuation target is solved directly as the bounded,
         # coupled 189-equation system.  There is deliberately no frozen-source
         # precomputed-source stage: raw_evaluate recomputes local interface equations and
         # fluxes from the evolving bulk state on every residual evaluation.
        lambda_targets=coupled_lambda_targets(bootstrap_lambda)
        if resume_lambda is not None:
            lambda_targets=[resume_lambda]+[
              target for target in lambda_targets if target>resume_lambda]
        lambda_index=0
        minimum_lambda_interval=1e-10
        maximum_coupled_optimizer_nfev=240
        while lambda_index<len(lambda_targets):
            lam=lambda_targets[lambda_index]
            accepted_x=x.copy()
            reference_lambda=history[-1]["lambda"] if history else None
            solve_phase=("COUPLED_BOUNDED_SPARSE_189_ZERO_TRANSFER_BOOTSTRAP"
              if lam==0.0 else "COUPLED_BOUNDED_SPARSE_189_CONTINUATION")
            progress("direct coupled zero-transfer bootstrap"
              if lam==0.0 else f"direct coupled lambda {lam:g}")
            lambda_started=time.monotonic()
            coupled_attempts=[]
            pre_ev=raw_evaluate(accepted_x,lam)
            pre_metrics=gate_metrics(pre_ev)
            reference_ev=(raw_evaluate(accepted_x,reference_lambda)
              if reference_lambda is not None else None)
            pre_solve_audit={
              "evaluatedLambda":lam,
              "referenceAcceptedLambda":reference_lambda,
              **pre_metrics,
              "dominantResidualRows":diagnostics(pre_ev),
              "dominantResidualBlocks":dominant_blocks(pre_ev),
              "componentBalanceAudit":component_balance_audit(pre_ev),
              "maximumFvChangeFromAcceptedReferenceMolS":(
                float(np.max(np.abs(pre_ev["fv"]-reference_ev["fv"])))
                if reference_ev is not None else None),
              "solverRowConditioning":{
                "qualification":"NUMERICAL_ONLY_EQUATIONS_AND_GATES_UNCHANGED",
                "componentOrder":list(COMPONENTS),
                "inventoryScaleMolS":scale.tolist(),
                "gateAlignedDivisorMolS":solver_scale.tolist(),
                "divisorRule":"MIN_INVENTORY_SCALE_AND_1_MOL_PER_S"}}
            pre_confirmed=(confirm_coupled_candidate(
              np,accepted_x,lam,raw_evaluate,gate_metrics)
              if pre_metrics["accepted"] else None)
            residual_calls_before=budget["residualCalls"]
            coupled_fit=None; jacobian_diagnostics=None
            selected_source=None; selected_confirmation=None
            if pre_confirmed is not None and pre_confirmed["accepted"]:
                selected=pre_confirmed
                selected_source="ACCEPTED_REFERENCE_DIRECT_REEVALUATION"
                coupled_attempts.append({
                  "initialization":("GLOBALLY_CONSERVATIVE_POSITIVE_SEED"
                    if not history else "LAST_ACCEPTED_COUPLED_STATE"),
                  "solvePhase":solve_phase,
                  "selectedStateSource":selected_source,
                  "jacobianAudit":{
                    "status":"NOT_COMPUTED_DIRECT_ACCEPTED_REFERENCE",
                    "qualification":"NOT_REQUIRED_FOR_ACCEPTANCE",
                  },
                  "optimizerFunctionEvaluations":0,
                  "actualResidualEvaluations":0,
                  "optimizerStatus":None,"optimizerSuccess":None,
                  "optimizerOptimality":None,
                  **selected["metrics"],
                  "deterministicConfirmation":selected["confirmation"]})
            else:
                tracker={"baseEvaluationCount":0,"bestScore":math.inf,
                  "bestState":None,"bestMetrics":None}
                def observe_base_state(q,ev):
                    metrics=gate_metrics(ev)
                    coupled_observe_base_candidate(
                      np,tracker,q,metrics)
                    if metrics["accepted"]:
                        raise CoupledGateFeasible()
                base_residual,probe_residual=coupled_objective_channels(
                  residual,observe_base_state,lam)
                def numerical_jacobian(q):
                    require_runtime_budget(budget)
                    matrix=scipy.optimize._numdiff.approx_derivative(
                      probe_residual,q,method="3-point",
                      bounds=(lower,upper),sparsity=sparsity)
                    require_runtime_budget(budget)
                    return matrix
                try:
                    coupled_fit=budgeted_least_squares(
                      budget,solve_phase,
                      scipy.optimize.least_squares,
                      base_residual,accepted_x,
                      bounds=(lower,upper),method="trf",jac=numerical_jacobian,
                      tr_solver="lsmr",
                      tr_options={"atol":1e-10,"btol":1e-10,
                        "maxiter":4*(27*m),"regularize":True},
                      x_scale=variable_scale,
                      max_nfev=maximum_coupled_optimizer_nfev,
                      xtol=None,ftol=1e-11,gtol=1e-11)
                except CoupledGateFeasible:
                    coupled_fit=None
                except TimeoutError:
                    raise JobCBlocked("JOB_C_INTERNAL_RUNTIME_BUDGET",
                      {"heightM":h,"lambda":lam,
                       "phase":"DIRECT_COUPLED_189_EQUATION_SOLVE",
                       "classification":"NUMERICAL_RUNTIME_BUDGET_EXHAUSTED",
                       "physicalInfeasibilityClaimed":False,
                       "claimsEmitted":{"height":False,"efficiency":False,
                         "finalRpm":False,"jobD":False,"release":False}})
                final_confirmed=(confirm_coupled_candidate(
                  np,coupled_fit.x,lam,raw_evaluate,gate_metrics)
                  if coupled_fit is not None else None)
                best_confirmed=(confirm_coupled_candidate(
                  np,tracker["bestState"],lam,raw_evaluate,gate_metrics)
                  if tracker["bestState"] is not None
                    and tracker["bestMetrics"]["accepted"] else None)
                if coupled_fit is not None:
                    jacobian_diagnostics,correction_vector=jacobian_audit(
                      coupled_fit)
                    correction_trial=coupled_gauss_newton_candidate(
                      np,coupled_fit.x,correction_vector,lower,upper)
                    correction_confirmed=(confirm_coupled_candidate(
                      np,correction_trial["state"],lam,raw_evaluate,
                      gate_metrics) if correction_trial["admitted"] else None)
                    jacobian_diagnostics["correctionCandidate"]={
                      "admitted":correction_trial["admitted"],
                      "reason":correction_trial["reason"],
                      "stepScale":correction_trial["stepScale"],
                      "fullStepAdmissible":
                        correction_trial["fullStepAdmissible"],
                      "stateSha256":(digest(
                        correction_trial["state"].tolist())
                        if correction_trial["admitted"] else None),
                      "metrics":(correction_confirmed["metrics"]
                        if correction_confirmed is not None else None),
                      "deterministicConfirmation":(
                        correction_confirmed["confirmation"]
                        if correction_confirmed is not None else None)}
                else:
                    correction_confirmed=None
                    jacobian_diagnostics={
                      "status":"NOT_COMPUTED_AFTER_FIRST_GATE_FEASIBLE_BASE_STATE",
                      "qualification":"NOT_REQUIRED_FOR_ACCEPTANCE",
                      "reason":"OPTIMIZER_STOPPED_BY_UNPERTURBED_GATE_PASS",
                    }
                confirmed_options=[]
                if final_confirmed is not None and final_confirmed["accepted"]:
                    confirmed_options.append(
                      ("OPTIMIZER_FINAL_STATE",final_confirmed))
                if best_confirmed is not None and best_confirmed["accepted"]:
                    confirmed_options.append((
                      "FIRST_GATE_FEASIBLE_BASE_STATE"
                      if coupled_fit is None
                      else "OPTIMIZER_BASE_ITERATE_CAPTURE",
                      best_confirmed))
                if (correction_confirmed is not None
                    and correction_confirmed["accepted"]):
                    confirmed_options.append(
                      ("GAUSS_NEWTON_CORRECTED_STATE",correction_confirmed))
                if confirmed_options:
                    selected_source,selected=min(confirmed_options,
                      key=lambda item:max(
                        item[1]["metrics"]["rawFvResidualMolS"]/1e-7,
                        item[1]["metrics"]["scaledFvResidual"]/1e-7,
                        item[1]["metrics"][
                          "maximumOriginalJobBGateResidual"]/1e-7))
                else:
                    selected=(final_confirmed
                      if final_confirmed is not None else best_confirmed)
                    selected_source="OPTIMIZER_FINAL_STATE_REJECTED"
                if selected is None:
                    raise RuntimeError(
                      "JOB_C_GATE_FEASIBLE_BASE_CONFIRMATION_FAILED")
                coupled_attempts.append({
                  "initialization":("GLOBALLY_CONSERVATIVE_POSITIVE_SEED"
                    if not history else "LAST_ACCEPTED_COUPLED_STATE"),
                  "solvePhase":solve_phase,
                  "selectedStateSource":selected_source,
                  "baseIterationEvaluations":tracker["baseEvaluationCount"],
                  "bestBaseIterationMetrics":tracker["bestMetrics"],
                  "optimizerFunctionEvaluations":(
                    int(coupled_fit.nfev) if coupled_fit is not None
                    else tracker["baseEvaluationCount"]),
                  "actualResidualEvaluations":
                    int(budget["residualCalls"]-residual_calls_before),
                  "optimizerStatus":(
                    int(coupled_fit.status) if coupled_fit is not None else None),
                  "optimizerSuccess":(
                    bool(coupled_fit.success) if coupled_fit is not None else None),
                  "optimizerOptimality":(
                    float(coupled_fit.optimality) if coupled_fit is not None
                    else None),
                  **selected["metrics"],
                  "deterministicConfirmation":selected["confirmation"],
                  "jacobianAudit":jacobian_diagnostics})
            coupled_ev=selected["evaluation"]
            coupled_metrics=selected["metrics"]
            coupled_raw=coupled_metrics["rawFvResidualMolS"]
            coupled_scaled=coupled_metrics["scaledFvResidual"]
            coupled_interface=coupled_metrics[
              "maximumOriginalJobBGateResidual"]
            coupled_minimum=coupled_metrics["minimumFlowMolS"]
            coupled_accepted=selected["accepted"]
            coupled_dominant_rows=diagnostics(coupled_ev)
            coupled_dominant_blocks=dominant_blocks(coupled_ev)
            coupled_attempts[-1].update({
              "preSolveAcceptedStateAudit":pre_solve_audit,
              "dominantResidualRows":coupled_dominant_rows,
              "dominantResidualBlocks":coupled_dominant_blocks,
              "componentBalanceAudit":component_balance_audit(coupled_ev),
              "accepted":coupled_accepted})
            if coupled_accepted:
                x=selected["state"]
                history.append({"lambda":lam,
                  "solver":solve_phase,
                  "selectedStateSource":selected_source,
                  "stateSha256":digest(x.tolist()),
                  "coupledAttempts":coupled_attempts,
                  "rawFvResidualMolS":coupled_raw,
                  "scaledFvResidual":coupled_scaled,
                  "maximumOriginalJobBGateResidual":coupled_interface,
                  "minimumFlowMolS":coupled_minimum,
                  "lambdaRuntimeSeconds":time.monotonic()-lambda_started,
                  "boundaryAwareInitialProfile":profile_audit
                    if len(history)==0 else None,
                  "globalInletFluxAudit":
                    global_inlet_full_scale_audit if len(history)==0 else None})
                anchor_kind=("ACCEPTED_ZERO_TRANSFER_COUPLED_ANCHOR"
                  if lam==0.0 else "ACCEPTED_COUPLED_CONTINUATION_ANCHOR")
                record_completed_result(
                  f"coupled-anchor:{h:g}:lambda:{lam:.12g}",
                  anchor_kind,
                  {"heightM":float(h),"lambda":float(lam),
                   "state":x.tolist(),"stateSha256":digest(x.tolist()),
                   "gateMetrics":coupled_metrics,
                   "deterministicConfirmation":selected["confirmation"]},
                  inputSha256=_request_sha256)
                checkpoint()
                lambda_index+=1
                continue
            # A failed direct solve is a numerical positive-feasibility
            # uncertainty, never a physical infeasibility conclusion.
            previous_lambda,retry_midpoint=coupled_lambda_failure_step(
              history,lam,minimum_lambda_interval)
            if retry_midpoint is not None:
                lambda_targets.insert(lambda_index,retry_midpoint)
                progress(f"adaptive direct coupled lambda "
                  f"{retry_midpoint:g}")
                continue
            raise JobCBlocked(
              "JOB_C_ZERO_TRANSFER_BOOTSTRAP_UNRESOLVED" if lam==0.0
                else "JOB_C_COUPLED_POSITIVE_FEASIBILITY_UNRESOLVED",
              {"heightM":h,"lambda":lam,
                "phase":("DIRECT_COUPLED_189_EQUATION_ZERO_TRANSFER_BOOTSTRAP"
                  if lam==0.0 else "DIRECT_COUPLED_189_EQUATION_SOLVE"),
                "lastAcceptedLambda":previous_lambda,
                "rejectedLambdaBracket":None if previous_lambda is None else {
                  "lowerAccepted":previous_lambda,"upperRejected":lam},
               "coupledAttempts":coupled_attempts,
               "acceptedContinuationHistory":history,
               "preSolveAcceptedStateAudit":pre_solve_audit,
               "rawFvResidualMolS":coupled_raw,
               "scaledFvResidual":coupled_scaled,
               "maximumOriginalJobBGateResidual":coupled_interface,
               "minimumFlowMolS":coupled_minimum,
                "dominantResidualRows":coupled_dominant_rows,
                "dominantResidualBlocks":coupled_dominant_blocks,
               "physicalInfeasibilityClaimed":False,
               "claimsEmitted":{"height":False,"efficiency":False,
                 "finalRpm":False,"jobD":False,"release":False}})
        # Replay lambda=1 with the same square coupled system for final
        # verification; no frozen-source state is used to establish acceptance.
        progress("lambda 1 monolithic replay")
        replay_start=x.copy()
        try:
            replay_fit=budgeted_least_squares(
              budget,"LAMBDA_ONE_REPLAY",scipy.optimize.least_squares,
              lambda q:residual(q,1.0),replay_start,
              bounds=(lower,upper),method="trf",jac="2-point",
              jac_sparsity=sparsity,x_scale=variable_scale,max_nfev=40,
              xtol=1e-11,ftol=1e-11,gtol=1e-11)
        except TimeoutError:
            raise JobCBlocked("JOB_C_LAMBDA1_MONOLITHIC_REPLAY_FAILED",
              {"heightM":h,"reason":"INTERNAL_RUNTIME_BUDGET",
               "physicalInfeasibilityClaimed":False,
               "claimsEmitted":{"height":False,"efficiency":False,
                 "finalRpm":False,"jobD":False,"release":False}})
        x=replay_fit.x
        ev=raw_evaluate(x,1.0)
        fv_raw=float(np.max(np.abs(ev["fv"])))
        fv_scaled=float(np.max(np.abs(
          [v/scale[i%7] for i,v in enumerate(ev["fv"])])))
        interface_gate=max(max(float(np.max(np.abs(v[0][:7]))),
          float(np.max(np.abs(v[6])/solvers[j].scale)))
          for j,v in enumerate(ev["details"]))
        minimum_flow=float(min(np.min(ev["c"]),np.min(ev["d"])))
        history[-1]["lambda1MonolithicReplay"]={
          "solver":"COUPLED_BOUNDED_SPARSE_189_LAMBDA_ONE_REPLAY",
          "functionEvaluations":int(replay_fit.nfev),
          "optimizerSuccess":bool(replay_fit.success),
          "rawFvResidualMolS":fv_raw,"scaledFvResidual":fv_scaled,
          "maximumOriginalJobBGateResidual":interface_gate,
          "minimumFlowMolS":minimum_flow}
        if (fv_raw>1e-7 or fv_scaled>1e-7 or
            interface_gate>1e-7 or minimum_flow<=0):
            raise JobCBlocked("JOB_C_LAMBDA1_MONOLITHIC_REPLAY_FAILED",
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
                 "totalMolarFluxMolM2S":float(n),
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

    def outlet_duty_report(ev):
        """Only expose product duty after lambda-one physical qualification."""
        continuous=[float(x) for x in ev["fc"][m]]
        dispersed=[float(-x) for x in ev["fd"][0]]
        return {"componentOrder":list(COMPONENTS),"lambda":1.0,
          "heightM":ev["height"],
          "continuousOutlet":{"componentMolarFlowMolS":continuous,
            "totalMolarFlowMolS":sum(continuous),
            "moleFractions":[x/sum(continuous) for x in continuous]},
          "dispersedOutlet":{"componentMolarFlowMolS":dispersed,
            "totalMolarFlowMolS":sum(dispersed),
            "moleFractions":[x/sum(dispersed) for x in dispersed]},
          "productDuty":{"basis":"NMP_FREE_RRBO_HYDROCARBON_MASS_SAT_MONO_DI_POLY_PA",
            "recoveryPct":recovery(ev),"targetRecoveryPct":r["minimumRecoveryPct"],
            "errorPercentagePoints":recovery(ev)-r["minimumRecoveryPct"],
            "aromaticsOrSulfurDutyClaimed":False},
          "globalComponentBalanceResidualMolS":ev["global"]}

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

    # A checkpoint state is only a warm start.  solve_height reruns local
    # interface closure and independently re-evaluates every unchanged
    # lambda=0 gate before it can be accepted.
    resume_anchor=find_resume_coupled_anchor(_completed_results,2.0)
    progress("candidate 2m",height_candidate_m=2.0)
    low=solve_height(2.0,resume_anchor)
    h2_benchmark=qualify_h2(low)
    h2_benchmark["outletDuty"]=outlet_duty_report(low)
    progress("candidate20m",height_candidate_m=20.0)
    high=solve_height(20.0,low["solution"])
    progress("height search",height_candidate_m=20.0)
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
    for search_iteration in range(10):
        mid=(lo+hi)/2
        progress("height search",search_iteration,10,search_iteration,
          None,None,mid)
        nearest=min(accepted_by_height,key=lambda x:abs(x-mid))
        selected=solve_height(mid,accepted_by_height[nearest]); fm=recovery(selected)-r["minimumRecoveryPct"]
        if flo*fm<=0: hi=mid
        else: lo,flo=mid,fm
    # The reported height is a new point (the centre of the final bracket), not
    # necessarily the last midpoint evaluated above. Solve that exact point so
    # no profile, recovery, or qualification is paired with another height.
    final_height=(lo+hi)/2
    progress("height candidate final solve",10,10,None,None,None,final_height)
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
          "outletDuty":outlet_duty_report(selected),
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
        record_completed_result(f"exact-cell:{cell['numericalCell']}",
          "EXACT_QUALIFIED_NUMERICAL_CELL",
          {"numericalCell":cell["numericalCell"],
           "exactBoundaryQualifier":cell["exactBoundaryQualifier"],
           "continuousResidualMolS":rc,"dispersedResidualMolS":rd})
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
    record_completed_result("height-candidate","EXACT_QUALIFIED_HEIGHT_CANDIDATE",
      {"heightM":height,"selected":selected})
    return nominal

for line in sys.stdin:
 try:
    _active_runtime_budgets=None
    _job_started=time.monotonic()
    _last_progress={"phase":"initializing","completed":0,"total":None,
      "iteration":None,"residual":None,"residualKind":None,
      "elapsedSeconds":0.0,"heightCandidateM":None}
    _last_progress_emit=0.0
    _completed_results=[]
    r=json.loads(line)
    _request_sha256=digest(checkpoint_request_payload(r))
    resume=r.get("resumeCheckpoint")
    resume_status="NOT_REQUESTED"
    if resume is not None:
        if (not isinstance(resume,dict) or
            resume.get("schemaVersion")!="ECR_JOB_C_PARTIAL_V1" or
            resume.get("requestSha256")!=_request_sha256):
            raise ValueError("JOB_C_RESUME_CHECKPOINT_REQUEST_HASH_MISMATCH")
        # Snapshots are deliberately retained only as analysis evidence.  A
        # numerical state is never accepted from a checkpoint: the hash-bound
        # qualification/cache path below replays every accepted local state.
        resume_status="SNAPSHOT_ACCEPTED_REQUALIFICATION_REQUIRED"
        completed=resume.get("completedResults",[])
        if not isinstance(completed,list):
            raise ValueError("JOB_C_RESUME_CHECKPOINT_RESULTS_INVALID")
        _completed_results=[
          value for value in completed if isinstance(value,dict)]
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
          "resume":{"status":resume_status,
            "checkpointCompletedResultCount":len(resume.get("completedResults",[]))
              if isinstance(resume,dict) else 0},
          "sensitivityCases":cases}
 except JobCInterrupted:
    body={"protocol":PROTOCOL,"status":"INTERRUPTED_PRELIMINARY_JOB_C",
      "requestSha256":_request_sha256,"complete":False,
      "completedResults":_completed_results,"progress":_last_progress,
      "interruption":"SIGTERM_GRACEFUL_CHECKPOINT_EMITTED"}
 except JobCBlocked as e:
    diagnostics=dict(e.diagnostics)
    runtime_budgets=active_runtime_budget_report()
    if runtime_budgets is not None:
        diagnostics.setdefault("runtimeBudgets",runtime_budgets)
    body={"protocol":PROTOCOL,"status":"BLOCKED_PRELIMINARY_JOB_C",
          "error":e.code,"diagnostics":diagnostics,
          "completedResults":_completed_results}
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