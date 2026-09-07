#!/usr/bin/env python3
"""Bounded, conservative finite-volume countercurrent Job-C kernel."""
from __future__ import annotations
import hashlib, importlib.util, json, math, os, sys, time
from pathlib import Path
from candidate_interface import CandidateInterfaceSolver, CandidateFailure, VERSION as CANDIDATE_VERSION

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

root=Path(os.environ["JOB_B_INTERFACE_RUNTIME_ROOT"]).resolve()
spec=importlib.util.spec_from_file_location("job_c_verified_job_b",root/"server/ecr-pre-pilot/job-b-interface/worker.py")
if spec is None or spec.loader is None: raise RuntimeError("JOB_C_JOB_B_IMPORT_FAILED")
job_b=importlib.util.module_from_spec(spec); spec.loader.exec_module(job_b)

class JobCBlocked(RuntimeError):
    def __init__(self, code, diagnostics):
        super().__init__(code)
        self.code, self.diagnostics = code, diagnostics

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
        "FIXED_GLOBAL_INLET_FLUX_APPROXIMATION_REPEATS_A_BOUNDARY_INCOMPATIBLE_JOB_B_ROOT",
      "physicalInfeasibilityClaimed":False}

def require_positive_frozen_solution(np, flow_vector, raw_max, scaled_max):
    minimum=float(np.min(flow_vector))
    accepted=(minimum>0 and raw_max<=1e-7 and scaled_max<=1e-7)
    return {"accepted":accepted,"minimumFlowMolS":minimum,
      "rawFvResidualMolS":raw_max,"scaledFvResidual":scaled_max,
      "maximumAllowedRawFvResidualMolS":1e-7,
      "maximumAllowedScaledFvResidual":1e-7,
      "requiredBefore":"INTERFACE_REFRESH_OR_189_EQUATION_SOLVE"}

def case(r, name, dc, dd, solvers):
    np=solvers[0].np
    m=r["compartments"]; A=math.pi*r["columnDiameterM"]**2/4
    feedc=[float(x) for x in r["continuousFeedMolS"]]; feedd=[float(x) for x in r["dispersedFeedMolS"]]
    if m<1 or min(sum(feedc),sum(feedd))<=0 or any(len(x)!=7 for x in [feedc,feedd,r["kc"],r["kd"]]):
        raise ValueError("JOB_C_INVALID_GOVERNED_FLOW_INPUT")
    budget={"calls":0,"residualCalls":0,"started":time.monotonic(),
            "maximumSeconds":720}
    accepted_by_height={}
    inlet_xc=np.asarray(feedc)/sum(feedc)
    inlet_xd=np.asarray(feedd)/sum(feedd)
    inlet_request={"protocol":"ECR_JOB_B_INTERFACE_V1","operation":"SOLVE_INTERFACE",
      "componentOrder":list(COMPONENTS),"T":r["temperatureK"],
      "x_bulk_continuous":inlet_xc.tolist(),
      "x_bulk_dispersed":inlet_xd.tolist(),"kc":r["kc"],"kd":r["kd"],
      "CtC":r["continuousTotalConcentrationMolM3"],
      "CtD":r["dispersedTotalConcentrationMolM3"],
      "phase_config":r["phaseConfiguration"]}
    inlet_job_b=job_b.solve(inlet_request)
    if inlet_job_b.get("status")!="CALCULATED_PRELIMINARY_INTERFACE":
        raise JobCBlocked("JOB_C_GLOBAL_INLET_JOB_B_REPRODUCTION_FAILED",
          {"jobBStatus":inlet_job_b.get("status"),
           "jobBError":inlet_job_b.get("error"),
           "startDiagnostics":inlet_job_b.get("startDiagnostics"),
           "endpointAssessments":inlet_job_b.get("endpointAssessments")})
    inlet_nc=np.asarray(
      inlet_job_b["interface"]["continuousComponentFluxMolM2S"])
    inlet_nd=np.asarray(
      inlet_job_b["interface"]["dispersedComponentFluxMolM2S"])

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
            # At lambda zero the exact conservative FV state is constant.
            # Solve its one repeated interface state once for initialization;
            # this solve is never called from the monolithic residual.
            xc=np.asarray(feedc)/sum(feedc); xd=np.asarray(feedd)/sum(feedd)
            try:
                seed=solvers[0].solve(xc,xd)
            except CandidateFailure as error:
                raise JobCBlocked("JOB_C_LAMBDA_ZERO_INTERFACE_INITIALIZATION_FAILED",
                  {"error":str(error),"numericalCellTemplate":"GLOBAL_INLET"})
            interface_u=np.asarray(seed["unknowns"])
            seed_residual=solvers[0].residual(interface_u,xc,xd)
            if float(np.max(np.abs(seed_residual)))>1e-7:
                raise JobCBlocked("JOB_C_LAMBDA_ZERO_INTERFACE_INITIALIZATION_FAILED",
                  {"maximumOriginalJobBEquationResidual":
                   float(np.max(np.abs(seed_residual)))})
            flows=np.asarray([[feedc]*m,[feedd]*m],dtype=float).reshape(-1)
            return np.r_[np.maximum(flows,epsilon),np.tile(interface_u,m)]

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
            if time.monotonic()-budget["started"] > budget["maximumSeconds"]:
                raise TimeoutError("JOB_C_MONOLITHIC_INTERNAL_RUNTIME_BUDGET")
            ev=raw_evaluate(x,lam)
            scaled_fv=np.asarray([v/scale[i%7] for i,v in enumerate(ev["fv"])])
            return np.r_[scaled_fv,ev["interface"]]

        # Explicit block sparsity: FV rows see adjacent phase flow blocks and
        # their local interface; interface rows see local bulk and interface.
        sparsity=scipy.sparse.lil_matrix((27*m,27*m),dtype=int)
        for j in range(m):
            neighboring={j}
            if j>0: neighboring.add(j-1)
            if j<m-1: neighboring.add(j+1)
            for row in range(14*j,14*j+7):
                for k in neighboring:
                    sparsity[row,7*k:7*k+7]=1
                sparsity[row,14*m+13*j:14*m+13*j+13]=1
            for row in range(14*j+7,14*j+14):
                for k in neighboring:
                    sparsity[row,7*m+7*k:7*m+7*k+7]=1
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
            """Plug-flow balance seed only; dispersion is closed by the solver."""
            c,d=np.asarray(base_flows).reshape(2,m,7).copy()
            transfer=lam*np.asarray(nc)*av*A*dz
            for j in range(m):
                c[j]=np.asarray(feedc)-np.sum(transfer[:j+1],axis=0)
                d[j]=np.asarray(feedd)+np.sum(transfer[j:],axis=0)
            candidate=np.r_[c.reshape(-1),d.reshape(-1)]
            return np.minimum(np.maximum(candidate,lower[:14*m]*10),upper[:14*m])

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

        def dominant_blocks(ev):
            rows=diagnostic_rows(ev); blocks={}
            for row in rows:
                key=(row["numericalCell"],row["type"])
                if key not in blocks or abs(row["rawValue"])>abs(blocks[key]["rawValue"]):
                    blocks[key]=row
            return sorted(blocks.values(),key=lambda row:abs(row["rawValue"]),reverse=True)

        x=initial(); history=[]; started=time.monotonic()
        # Lambda zero provides the exact no-transfer FV baseline while retaining
        # all 91 interface equations; every subsequent call remains 189 square.
        for lam in (0.0,.00125,.0025,.005,.01,.025,.05,.1,.25,.5,.75,1.0):
            progress(f"monolithic lambda {lam:g}")
            calls_before=budget["residualCalls"]
            predictor=None
            if lam>0.0:
                predictor_started=time.monotonic()
                previous=raw_evaluate(x,lam)
                frozen_nc=np.asarray([values[4] for values in previous["details"]])
                if history[-1]["lambda"]==0.0:
                    candidate_inlet_nc=frozen_nc.copy()
                    candidate_inlet_error=float(np.max(np.abs(
                      candidate_inlet_nc-np.tile(inlet_nc,(m,1)))))
                    inlet_flux_tolerance=max(1e-12,float(np.max(np.abs(inlet_nc)))*1e-8)
                    if candidate_inlet_error>inlet_flux_tolerance:
                        raise JobCBlocked("JOB_C_GLOBAL_INLET_CANDIDATE_JOB_B_MISMATCH",
                          {"heightM":h,"lambda":lam,
                           "maximumFluxErrorMolM2S":candidate_inlet_error,
                           "toleranceMolM2S":inlet_flux_tolerance})
                    frozen_nc=np.tile(inlet_nc,(m,1))
                    inlet_transfer=lam*frozen_nc*av*A*dz
                    inlet_flux_audit=frozen_boundary_audit(
                      np,feedc,feedd,inlet_nc,inlet_nd,inlet_transfer)
                    inlet_flux_audit.update({
                      "heightM":h,"lambda":lam,
                      "jobBStatus":inlet_job_b["status"],
                      "jobBSelectedStartClass":
                        inlet_job_b.get("selectedStartClass"),
                      "jobBIndependentReproductionStartClass":
                        inlet_job_b.get("independentReproductionStartClass"),
                      "candidateJobBMaximumFluxErrorMolM2S":
                        candidate_inlet_error,
                      "qualification":
                        "GOVERNING_JOB_B_GLOBAL_INLET_FROZEN_FLUX_BOUNDARY_AUDIT"})
                    if not inlet_flux_audit[
                      "positiveGlobalOutletNecessaryConditionPassed"]:
                        raise JobCBlocked(
                          "JOB_C_FROZEN_FV_POSITIVITY_GATE_FAILED",
                          {"heightM":h,"lambda":lam,
                           "inletFluxAudit":inlet_flux_audit,
                           "qualification":
                             "FROZEN_FLUX_BOUNDARY_DIAGNOSTIC_ONLY_NO_PHYSICAL_INFEASIBILITY_CLAIM"})
                predictor_start=frozen_conservative_seed(x[:14*m],lam,frozen_nc)
                sparsity_audit=audit_frozen_flow_sparsity(
                  predictor_start,lam,frozen_nc)
                def frozen_scaled(flow_vector):
                    values=frozen_flow_evaluate(flow_vector,lam,frozen_nc)
                    return np.asarray([v/scale[i%7] for i,v in enumerate(values)])
                predictor_starts=[
                  ("CONSERVATIVE_CUMULATIVE_TRANSFER_PROFILE",predictor_start),
                  ("PREVIOUS_ACCEPTED_CONSTANT_FLOW_PROFILE",x[:14*m].copy()),
                ]
                predictor_attempts=[]
                predictor_fits=[]
                for initialization,start_vector in predictor_starts:
                    start_values=frozen_flow_evaluate(start_vector,lam,frozen_nc)
                    candidate_fit=scipy.optimize.least_squares(
                      frozen_scaled,start_vector,
                      bounds=(lower[:14*m],upper[:14*m]),method="trf",
                      jac="2-point",tr_solver="exact",x_scale=flow_scale,
                      max_nfev=160,xtol=1e-11,ftol=1e-11,gtol=1e-11)
                    candidate_values=frozen_flow_evaluate(
                      candidate_fit.x,lam,frozen_nc)
                    predictor_fits.append(candidate_fit)
                    predictor_attempts.append({
                      "initialization":initialization,
                      "initialRawFvResidualMolS":
                        float(np.max(np.abs(start_values))),
                      "finalRawFvResidualMolS":
                        float(np.max(np.abs(candidate_values))),
                      "finalScaledFvResidual":
                        float(np.max(np.abs(frozen_scaled(candidate_fit.x)))),
                      "minimumFlowMolS":float(np.min(candidate_fit.x)),
                      "functionEvaluations":int(candidate_fit.nfev),
                      "optimizerSuccess":bool(candidate_fit.success)})
                predictor_fit=min(predictor_fits,
                  key=lambda fit:np.linalg.norm(frozen_scaled(fit.x)))
                predicted_flows=predictor_fit.x
                frozen_fv=frozen_flow_evaluate(predicted_flows,lam,frozen_nc)
                frozen_scaled_max=float(np.max(np.abs(
                  frozen_scaled(predicted_flows))))
                frozen_raw_max=float(np.max(np.abs(frozen_fv)))
                frozen_acceptance=require_positive_frozen_solution(
                  np,predicted_flows,frozen_raw_max,frozen_scaled_max)
                unconstrained=None
                if not frozen_acceptance["accepted"]:
                    unconstrained_fit=scipy.optimize.least_squares(
                      frozen_scaled,predicted_flows,method="lm",jac="2-point",
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
                    unconstrained={"functionEvaluations":int(unconstrained_fit.nfev),
                      "optimizerSuccess":bool(unconstrained_fit.success),
                      "rawFvResidualMolS":
                        float(np.max(np.abs(unconstrained_values))),
                      "scaledFvResidual":
                        float(np.max(np.abs(frozen_scaled(unconstrained_fit.x)))),
                      "minimumFlowMolS":float(np.min(unconstrained_fit.x)),
                      "nonpositiveFlowCount":len(nonpositive),
                      "nonpositiveFlows":sorted(nonpositive,
                        key=lambda row:row["flowMolS"])[:20],
                      "qualification":
                        "UNBOUNDED_DIAGNOSTIC_ONLY_NOT_PHYSICAL_ACCEPTANCE"}
                    raise JobCBlocked(
                      "JOB_C_FROZEN_FV_SUBSYSTEM_NONCONVERGENCE",
                      {"heightM":h,"lambda":lam,
                       "sparsityAudit":sparsity_audit,
                       "boundedAttempts":predictor_attempts,
                        "frozenFvAcceptance":frozen_acceptance,
                       "unconstrainedDiagnostic":unconstrained,
                       "qualification":
                         "FROZEN_FLUX_DIAGNOSTIC_ONLY_NO_PHYSICAL_INFEASIBILITY_CLAIM"})
                before_refresh=np.r_[predicted_flows,x[14*m:]]
                before_ev=raw_evaluate(before_refresh,lam)
                refreshed=[]
                for j in range(m):
                    c,d=predicted_flows.reshape(2,m,7)[:,j,:]
                    solvers[j].warm=x[14*m+13*j:14*m+13*j+13].copy()
                    try:
                        local=solvers[j].solve(c/c.sum(),d/d.sum())
                    except CandidateFailure as error:
                        raise JobCBlocked("JOB_C_MONOLITHIC_PREDICTOR_INTERFACE_FAILED",
                          {"heightM":h,"lambda":lam,"numericalCell":j+1,
                           "error":str(error)})
                    refreshed.extend(local["unknowns"])
                x=np.r_[predicted_flows,refreshed]
                after_ev=raw_evaluate(x,lam)
                before_gate=max(max(float(np.max(np.abs(v[0][:7]))),
                  float(np.max(np.abs(v[6])/solvers[j].scale)))
                  for j,v in enumerate(before_ev["details"]))
                after_gate=max(max(float(np.max(np.abs(v[0][:7]))),
                  float(np.max(np.abs(v[6])/solvers[j].scale)))
                  for j,v in enumerate(after_ev["details"]))
                predictor={"functionEvaluations":int(predictor_fit.nfev),
                  "optimizerSuccess":bool(predictor_fit.success),
                  "solver":"DENSE_EXACT_TRF_FINITE_DIFFERENCE_JACOBIAN",
                  "boundedAttempts":predictor_attempts,
                  "frozenFvAcceptance":frozen_acceptance,
                  "unconstrainedDiagnostic":unconstrained,
                  "sparsityAudit":sparsity_audit,
                  "frozenFluxRawFvResidualMolS":frozen_raw_max,
                  "frozenFluxScaledFvResidual":frozen_scaled_max,
                  "beforeInterfaceRefreshRawFvResidualMolS":
                    float(np.max(np.abs(before_ev["fv"]))),
                  "beforeInterfaceRefreshScaledFvResidual":float(np.max(np.abs(
                    [v/scale[i%7] for i,v in enumerate(before_ev["fv"])]))),
                  "afterInterfaceRefreshRawFvResidualMolS":
                    float(np.max(np.abs(after_ev["fv"]))),
                  "afterInterfaceRefreshScaledFvResidual":float(np.max(np.abs(
                    [v/scale[i%7] for i,v in enumerate(after_ev["fv"])]))),
                  "beforeInterfaceRefreshMaximumJobBGateResidual":before_gate,
                  "afterInterfaceRefreshMaximumJobBGateResidual":after_gate,
                  "runtimeSeconds":time.monotonic()-predictor_started,
                  "qualification":"PREDICTOR_ONLY_NOT_ACCEPTANCE"}
            ev=raw_evaluate(x,lam)
            skipped=False
            fit=None
            try:
                assembled=residual(x,lam)
                starting_norm=float(np.linalg.norm(assembled))
                skipped=(lam==0.0 and float(np.max(np.abs(assembled)))<=1e-7)
                if not skipped:
                    fit=scipy.optimize.least_squares(lambda q:residual(q,lam),x,
                      bounds=(lower,upper),method="trf",jac="2-point",
                      jac_sparsity=sparsity,x_scale=variable_scale,max_nfev=80,
                      xtol=1e-11,ftol=1e-11,gtol=1e-11)
                    x=fit.x
                    first_norm=float(np.linalg.norm(residual(x,lam)))
                    retry=(first_norm<starting_norm and fit.nfev>=80 and
                      time.monotonic()-budget["started"]<budget["maximumSeconds"]-60)
                    if retry:
                        retry_fit=scipy.optimize.least_squares(lambda q:residual(q,lam),x,
                          bounds=(lower,upper),method="trf",jac="2-point",
                          jac_sparsity=sparsity,x_scale=variable_scale,max_nfev=160,
                          xtol=1e-11,ftol=1e-11,gtol=1e-11)
                        if np.linalg.norm(residual(retry_fit.x,lam))<first_norm:
                            x=retry_fit.x
                ev=raw_evaluate(x,lam)
            except TimeoutError:
                raise JobCBlocked("JOB_C_MONOLITHIC_LAMBDA_NONCONVERGENCE",
                  {"heightM":h,"lambda":lam,"reason":"INTERNAL_RUNTIME_BUDGET",
                   "maximumSeconds":budget["maximumSeconds"],
                   "residualCallCount":budget["residualCalls"],
                   "lambdaResidualCallCount":budget["residualCalls"]-calls_before,
                   "dominantResidualRows":diagnostics(ev),
                   "dominantResidualBlocks":dominant_blocks(ev),
                   "boundedAttempts":history,
                   "runtimeSeconds":time.monotonic()-budget["started"]})
            fv_raw=float(np.max(np.abs(ev["fv"])))
            fv_scaled=float(np.max(np.abs(
              [v/scale[i%7] for i,v in enumerate(ev["fv"])])))
            iface=float(np.max(np.abs(ev["interface"])))
            interface_gate=max(max(float(np.max(np.abs(v[0][:7]))),
              float(np.max(np.abs(v[6])/solvers[j].scale))) for j,v in enumerate(ev["details"]))
            history.append({"lambda":lam,"unknownCount":27*m,"residualCount":27*m,
              "jacobianNonzeros":int(sparsity.nnz),
              "optimizerStatus":1 if skipped else int(fit.status),
              "optimizerSuccess":True if skipped else bool(fit.success),
              "functionEvaluations":0 if skipped else int(fit.nfev),
              "residualCallCount":budget["residualCalls"]-calls_before,
              "lambdaRuntimeSeconds":time.monotonic()-started-sum(
                row["lambdaRuntimeSeconds"] for row in history),
              "lambdaZeroAnalyticInitialization":skipped,
              "predictor":predictor,
              "retryFunctionEvaluations":0 if skipped or not retry else int(retry_fit.nfev),
              "rawFvResidualMolS":fv_raw,"scaledFvResidual":fv_scaled,
              "maximumOriginalJobBEquationResidual":iface,
              "maximumOriginalJobBGateResidual":interface_gate})
            if fv_raw>1e-7 or fv_scaled>1e-7 or interface_gate>1e-7:
                raise JobCBlocked("JOB_C_MONOLITHIC_LAMBDA_NONCONVERGENCE",
                  {"heightM":h,"lambda":lam,"unknownCount":27*m,"residualCount":27*m,
                   "optimizerStatus":1 if skipped else int(fit.status),
                   "functionEvaluations":0 if skipped else int(fit.nfev),
                   "residualCallCount":budget["residualCalls"],
                   "lambdaResidualCallCount":budget["residualCalls"]-calls_before,
                   "rawFvResidualMolS":fv_raw,"scaledFvResidual":fv_scaled,
                   "maximumOriginalJobBEquationResidual":iface,
                   "maximumOriginalJobBGateResidual":interface_gate,
                   "dominantResidualRows":diagnostics(ev),
                   "dominantResidualBlocks":dominant_blocks(ev),
                   "boundedAttempts":history,
                   "runtimeSeconds":time.monotonic()-started})

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
            out=job_b.solve(q)
            if out.get("status")!="CALCULATED_PRELIMINARY_INTERFACE":
                raise JobCBlocked("JOB_C_H2_EXACT_JOB_B_QUALIFICATION_FAILED",
                  {"heightM":2.0,"lambda":1.0,"numericalCell":j+1,
                   "jobBStatus":out.get("status"),"jobBError":out.get("error")})
            nc=[float(x) for x in out["interface"]["continuousComponentFluxMolM2S"]]
            candidate=ev["gates"][j]["candidate"]["continuousComponentFluxMolM2S"]
            flux_error=max(abs(nc[i]-candidate[i]) for i in range(7))
            rc=[ev["fc"][j][i]-ev["fc"][j+1][i]-nc[i]*area_per_cell for i in range(7)]
            rd=[ev["fd"][j][i]-ev["fd"][j+1][i]+nc[i]*area_per_cell for i in range(7)]
            exact_rc.extend(rc); exact_rd.extend(rd)
            if flux_error>flux_tolerance:
                raise JobCBlocked("JOB_C_H2_EXACT_JOB_B_QUALIFICATION_FAILED",
                  {"heightM":2.0,"lambda":1.0,"numericalCell":j+1,
                   "gate":"EXACT_FLUX_SUBSTITUTION","maximumFluxErrorMolM2S":flux_error,
                   "toleranceMolM2S":flux_tolerance})
            full={**job_b.identity(),**out}; full["resultHash"]=job_b.digest(full)
            evidence.append({"numericalCell":j+1,"status":"QUALIFIED_UNCHANGED_JOB_B",
              "fullResponseSha256":full["resultHash"],"maximumFluxErrorMolM2S":flux_error})
        raw=max(abs(x) for x in exact_rc+exact_rd)
        scaled=max(abs(x/fv_scale[i%7]) for i,x in enumerate(exact_rc+exact_rd))
        if raw>1e-7 or scaled>1e-7:
            raise JobCBlocked("JOB_C_H2_EXACT_FV_RECONSTRUCTION_FAILED",
              {"heightM":2.0,"lambda":1.0,"rawFvResidualMolS":raw,
               "scaledFvResidual":scaled})
        return {"status":"H2_LAMBDA1_EXACT_JOB_B_7_OF_7_QUALIFIED",
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
          "runtimeSeconds":time.monotonic()-budget["started"]},
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
        out=job_b.solve(q)
        full={**job_b.identity(),**out}; full["resultHash"]=job_b.digest(full)
        if out.get("status")!="CALCULATED_PRELIMINARY_INTERFACE":
            raise JobCBlocked("BLOCKED_EXACT_QUALIFICATION_FAILED",
               {"numericalCell":cell["numericalCell"],"jobBStatus":out.get("status"),
               "jobBError":out.get("error"),"startDiagnostics":out.get("startDiagnostics"),
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
          "exactJobBQualification":{"status":"QUALIFIED_UNCHANGED_JOB_B",
            "fullResponse":full,"fullResponseSha256":full["resultHash"],
            "candidateExactMaximumFluxErrorMolM2S":error,
            "candidateExactFluxToleranceMolM2S":flux_tolerance}})
        exact.append((rc,rd))
    feedc=r["continuousFeedMolS"]; feedd=r["dispersedFeedMolS"]
    cout=cells[-1]["continuousOutMolS"]; dout=cells[0]["dispersedOutMolS"]
    global_balance=[feedc[i]+feedd[i]-cout[i]-dout[i] for i in range(7)]
    raw=max(abs(x) for pair in exact for row in pair for x in row)
    positive=min(x for cell in cells for key in (
        "continuousLocalComponentMolarFlowMolS","dispersedLocalComponentMolarFlowMolS")
        for x in cell[key])
    if max(raw,max(abs(x) for x in global_balance))>balance_tolerance or positive<=0:
        raise JobCBlocked("BLOCKED_EXACT_QUALIFICATION_FAILED",
          {"gate":"FINAL_EXACT_FV_ACCEPTANCE","maximumCellResidualMolS":raw,
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
      "maximumExactGlobalBalanceResidualMolS":max(abs(x) for x in global_balance),
      "exactQualifiedCellCount":len(cells)})
    selected["exactQualificationStatus"]=f"EXACT_JOB_B_{len(cells)}_OF_{len(cells)}_QUALIFIED"
    progress(f"exact qualification {len(cells)}/{len(cells)}",len(cells),len(cells))
    return nominal

for line in sys.stdin:
 try:
    r=json.loads(line)
    if r.get("protocol")!=PROTOCOL or r.get("operation")!="SOLVE_HEIGHT" or r.get("componentOrder")!=list(COMPONENTS): raise ValueError("JOB_C_PROTOCOL_OR_COMPONENT_ORDER_INVALID")
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
          "finalQualificationRequirement":"UNCHANGED_PINNED_JOB_B_EVERY_LOCAL_STATE",
          "sensitivityCases":cases}
 except JobCBlocked as e:
    body={"protocol":PROTOCOL,"status":"BLOCKED_PRELIMINARY_JOB_C",
          "error":e.code,"diagnostics":e.diagnostics}
 except (ValueError,RuntimeError,KeyError,TypeError) as e:
    body={"protocol":PROTOCOL,"status":"FAILURE_INVALID_REQUEST","error":str(e)}
 body["resultSha256"]=digest(body)
 progress("terminal",1,1)
 print(canonical(body),flush=True)