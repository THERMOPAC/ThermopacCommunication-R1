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

def candidate_interface(r, c, d, context, cache, budget, solver):
    full={"compartment":context["compartment"],
          "continuous":[format(float(x),".17g") for x in c],
          "dispersed":[format(float(x),".17g") for x in d]}
    key=hashlib.sha256(canonical(full).encode()).hexdigest()
    if (time.monotonic()-budget["started"]) > budget["maximumSeconds"]:
        raise JobCBlocked("JOB_C_RUNTIME_BUDGET_EXHAUSTED",
                          {**context,"interfaceCalls":budget["calls"],
                           "maximumCalls":budget["maximumCalls"],
                           "maximumSeconds":budget["maximumSeconds"],
                           "compositionHash":key})
    if key in cache: return cache[key]
    if budget["calls"] >= budget["maximumCalls"]:
        raise JobCBlocked("JOB_C_INTERFACE_CALL_BUDGET_EXHAUSTED",
                          {**context,"interfaceCalls":budget["calls"],
                           "maximumCalls":budget["maximumCalls"],
                           "maximumSeconds":budget["maximumSeconds"],
                           "compositionHash":key})
    budget["calls"]+=1
    try: out=solver.solve(c,d)
    except CandidateFailure as error:
        raise JobCBlocked("JOB_C_CANDIDATE_INTERFACE_FAILED",
          {**context,"xc":list(c),"xd":list(d),"error":str(error),"compositionHash":key})
    nc=[float(x) for x in out["continuousComponentFluxMolM2S"]]
    answer=(nc,{"candidateOnly":True,"qualification":"UNQUALIFIED_NO_STABILITY_CLAIM",
               "candidateResultSha256":digest(out),"candidate":out})
    cache[key]=answer
    return answer

def case(r, name, dc, dd, solvers):
    m=r["compartments"]; A=math.pi*r["columnDiameterM"]**2/4
    feedc=[float(x) for x in r["continuousFeedMolS"]]; feedd=[float(x) for x in r["dispersedFeedMolS"]]
    if m<1 or min(sum(feedc),sum(feedd))<=0 or any(len(x)!=7 for x in [feedc,feedd,r["kc"],r["kd"]]):
        raise ValueError("JOB_C_INVALID_GOVERNED_FLOW_INPUT")
    cache={}; budget={"calls":0,"maximumCalls":1200,"started":time.monotonic(),"maximumSeconds":600}
    accepted_by_height={}

    def evaluate(h, lam, state, iteration):
        c,d=state; dz=h/m; av=6*r["operatingHoldup"]/r["d32M"]
        cc=[[x/sum(row)*r["continuousTotalConcentrationMolM3"] for x in row] for row in c]
        cd=[[x/sum(row)*r["dispersedTotalConcentrationMolM3"] for x in row] for row in d]
        fc=[[0.0]*7 for _ in range(m+1)]; fd=[[0.0]*7 for _ in range(m+1)]
        fc[0]=feedc[:]; fd[m]=[-x for x in feedd]
        for j in range(1,m):
            fc[j]=[(c[j-1][i]+c[j][i])/2-dc*A*(cc[j][i]-cc[j-1][i])/dz for i in range(7)]
            fd[j]=[-(d[j-1][i]+d[j][i])/2-dd*A*(cd[j][i]-cd[j-1][i])/dz for i in range(7)]
        fc[m]=c[m-1][:]; fd[0]=[-x for x in d[0]]
        tr=[]; gates=[]
        for j in range(m):
            context={"compartment":j+1,"iteration":iteration,"heightM":h,"lambda":lam}
            flux,gate=candidate_interface(r,[x/sum(c[j]) for x in c[j]],
                                      [x/sum(d[j]) for x in d[j]],context,cache,budget,solvers[j])
            tr.append([lam*x*av*A*dz for x in flux]); gates.append(gate)
        rc=[[fc[j][i]-fc[j+1][i]-tr[j][i] for i in range(7)] for j in range(m)]
        rd=[[fd[j][i]-fd[j+1][i]+tr[j][i] for i in range(7)] for j in range(m)]
        scale_floor=(sum(feedc)+sum(feedd))*1e-7
        scale=[max(feedc[i]+feedd[i],scale_floor) for i in range(7)]
        raw=max(abs(x) for row in rc+rd for x in row)
        scaled=max(abs(rc[j][i]/scale[i]) for j in range(m) for i in range(7))
        scaled=max(scaled,max(abs(rd[j][i]/scale[i]) for j in range(m) for i in range(7)))
        return {"c":c,"d":d,"cc":cc,"cd":cd,"fc":fc,"fd":fd,"tr":tr,"gates":gates,
                "rc":rc,"rd":rd,"raw":raw,"scaled":scaled}

    def solve_height(h, warm=None):
        np,scipy=solvers[0].np,solvers[0].scipy
        state=([[x for x in feedc] for _ in range(m)],[[x for x in feedd] for _ in range(m)]) if warm is None else (
            [row[:] for row in warm[0]],[row[:] for row in warm[1]])
        total_flow=sum(feedc)+sum(feedd)
        balance_tolerance=1e-7
        scale=[max(feedc[i]+feedd[i],total_flow*balance_tolerance) for i in range(7)]
        epsilon=max(total_flow*balance_tolerance*1e-6,1e-20)
        def encode(s):
            return np.log(np.maximum(np.asarray(s[0]+s[1]).reshape(-1),epsilon))
        def decode(y):
            upper=math.log(max(total_flow*10,epsilon*10))
            rows=np.exp(np.clip(y,math.log(epsilon),upper)).reshape(2*m,7).tolist()
            return rows[:m],rows[m:]
        def frozen_residual(y,tr):
            c,d=decode(y); dz=h/m
            cc=[[x/sum(row)*r["continuousTotalConcentrationMolM3"] for x in row] for row in c]
            cd=[[x/sum(row)*r["dispersedTotalConcentrationMolM3"] for x in row] for row in d]
            fc=[feedc[:]]+[[0.0]*7 for _ in range(m)]
            fd=[[0.0]*7 for _ in range(m)]+[[-x for x in feedd]]
            for j in range(1,m):
                fc[j]=[(c[j-1][i]+c[j][i])/2-dc*A*(cc[j][i]-cc[j-1][i])/dz for i in range(7)]
                fd[j]=[-(d[j-1][i]+d[j][i])/2-dd*A*(cd[j][i]-cd[j-1][i])/dz for i in range(7)]
            fc[m]=c[m-1][:]; fd[0]=[-x for x in d[0]]
            values=[]
            for j in range(m):
                values.extend((fc[j][i]-fc[j+1][i]-tr[j][i])/scale[i] for i in range(7))
                values.extend((fd[j][i]-fd[j+1][i]+tr[j][i])/scale[i] for i in range(7))
            return np.asarray(values)
        # Exact lambda-zero transport baseline: no constitutive source is
        # evaluated or hidden in this acceptance.
        zero=[[0.0]*7 for _ in range(m)]
        baseline_fit=scipy.optimize.least_squares(frozen_residual,encode(state),args=(zero,),
          method="trf",jac="2-point",x_scale="jac",max_nfev=80,
          xtol=1e-11,ftol=1e-11,gtol=1e-11)
        state=decode(baseline_fit.x)
        baseline_vector=frozen_residual(baseline_fit.x,zero)
        baseline_raw=max(abs(baseline_vector[k])*scale[(k%14)%7] for k in range(len(baseline_vector)))
        baseline_scaled=float(np.max(np.abs(baseline_vector)))
        if not baseline_fit.success or baseline_raw>balance_tolerance or baseline_scaled>balance_tolerance:
            raise JobCBlocked("JOB_C_LAMBDA_ZERO_BASELINE_FAILED",
              {"heightM":h,"optimizerStatus":int(baseline_fit.status),
               "functionEvaluations":int(baseline_fit.nfev),
               "rawResidualMolS":baseline_raw,"scaledResidual":baseline_scaled})
        lam=0.0; step=.01; minimum_step=.00125
        history=[{"lambda":0.0,"rawResidualMolS":baseline_raw,
          "scaledResidual":baseline_scaled,"optimizerStatus":int(baseline_fit.status),
          "functionEvaluations":int(baseline_fit.nfev)}]
        first_failure=None
        while lam < 1-1e-15:
            target=min(1.0,lam+step)
            checkpoint=([x[:] for x in state[0]],[x[:] for x in state[1]])
            warm_checkpoint=[None if s.warm is None else s.warm.copy() for s in solvers]
            try:
                ev=evaluate(h,target,state,0); ev["height"]=h
                def coupled(logflows):
                    dynamic=decode(logflows)
                    root_warm=[None if s.warm is None else s.warm.copy() for s in solvers]
                    try:
                        current=evaluate(h,target,dynamic,-1)
                    except JobCBlocked:
                        return np.full(14*m,1e3)
                    finally:
                        for root_solver,root_state in zip(solvers,root_warm):
                            root_solver.warm=None if root_state is None else root_state.copy()
                    values=[]
                    for j in range(m):
                        values.extend(current["rc"][j][i]/scale[i] for i in range(7))
                        values.extend(current["rd"][j][i]/scale[i] for i in range(7))
                    return np.asarray(values)
                coupled_fit=scipy.optimize.root(coupled,encode(state),method="anderson",
                  options={"maxiter":8,"fatol":1e-8,"line_search":None})
                coupled_state=decode(coupled_fit.x)
                old_merit=sum((x/scale[i])**2 for row in ev["rc"]+ev["rd"]
                              for i,x in enumerate(row))
                try:
                    coupled_ev=evaluate(h,target,coupled_state,0); coupled_ev["height"]=h
                    coupled_merit=sum((x/scale[i])**2 for row in coupled_ev["rc"]+coupled_ev["rd"]
                                      for i,x in enumerate(row))
                    if coupled_merit<old_merit:
                        state,ev=coupled_state,coupled_ev
                except JobCBlocked:
                    pass
                for iteration in range(6):
                    if ev["raw"]<=1e-7 and ev["scaled"]<=1e-7: break
                    fit=scipy.optimize.least_squares(frozen_residual,encode(state),args=(ev["tr"],),
                      method="trf",jac="2-point",x_scale="jac",max_nfev=60,
                      xtol=1e-10,ftol=1e-10,gtol=1e-10)
                    old_y,new_y=encode(state),fit.x
                    old_merit=sum((x/scale[i])**2 for row in ev["rc"]+ev["rd"]
                                  for i,x in enumerate(row))
                    accepted=False; damping=1.0
                    while damping>=1/128:
                        trial=decode(old_y+damping*(new_y-old_y))
                        tested=evaluate(h,target,trial,iteration+1); tested["height"]=h
                        merit=sum((x/scale[i])**2 for row in tested["rc"]+tested["rd"]
                                  for i,x in enumerate(row))
                        if merit<old_merit:
                            state,ev,accepted=trial,tested,True; break
                        damping/=2
                    if not accepted: raise JobCBlocked("JOB_C_BACKTRACKING_EXHAUSTED",
                        {"heightM":h,"lambda":target,"iteration":iteration,
                         "rawResidualMolS":ev["raw"],"scaledResidual":ev["scaled"],
                         "transportOptimizerStatus":int(fit.status),
                         "transportFunctionEvaluations":int(fit.nfev)})
                if ev["raw"]>1e-7 or ev["scaled"]>1e-7:
                    raise JobCBlocked("JOB_C_HOMOTOPY_RESIDUAL_NOT_CONVERGED",
                        {"heightM":h,"lambda":target,"rawResidualMolS":ev["raw"],
                         "scaledResidual":ev["scaled"]})
                lam=target; history.append({"lambda":lam,"step":step,
                  "rawResidualMolS":ev["raw"],"scaledResidual":ev["scaled"],
                  "coupledRootSuccess":bool(coupled_fit.success),
                  "coupledRootEvaluations":int(coupled_fit.nfev),
                  "candidateWarmFallbackCount":sum(s.fallback_count for s in solvers)})
                if step<.08: step=min(.08,step*2)
            except JobCBlocked as error:
                if first_failure is None:
                    first_failure={"code":error.code,"diagnostics":error.diagnostics}
                state=checkpoint; step/=2
                for solver,warm_state in zip(solvers,warm_checkpoint):
                    solver.warm=None if warm_state is None else warm_state.copy()
                if step<minimum_step:
                    raise JobCBlocked("JOB_C_HOMOTOPY_MINIMUM_STEP_EXHAUSTED",
                      {"heightM":h,"lastAcceptedLambda":lam,"attemptedLambda":target,
                       "minimumStep":minimum_step,"firstExhaustedGate":
                       first_failure,"lastAttemptGate":
                       {"code":error.code,"diagnostics":error.diagnostics},
                       "lambdaZeroBaseline":history[0],
                       "interfaceCalls":budget["calls"]})
        final=evaluate(h,1.0,state,25); final["height"]=h
        global_balance=[feedc[i]+feedd[i]-final["fc"][m][i]+final["fd"][0][i] for i in range(7)]
        positive=min(x for phase in state for row in phase for x in row)
        if max(final["raw"],max(abs(x) for x in global_balance))>1e-7 or positive<=0:
            raise JobCBlocked("JOB_C_FINAL_UNDAMPED_ACCEPTANCE_GATE_FAILED",
                {"heightM":h,"rawResidualMolS":final["raw"],
                 "globalBalanceResidualMolS":global_balance,"minimumFlowMolS":positive})
        final.update({"state":state,"global":global_balance,"positive":positive,
                      "homotopyHistory":history,"interfaceCalls":budget["calls"]})
        accepted_by_height[h]=state
        return final

    def recovery(ev):
        outlet=ev["fc"][m] if r["phaseConfiguration"]=="rrbo-continuous-nmp-dispersed" else [-x for x in ev["fd"][0]]
        incoming=feedc if r["phaseConfiguration"]=="rrbo-continuous-nmp-dispersed" else feedd
        mw=[170.3348,120.194,142.1971,202.2506,405.58]
        return 100*sum(outlet[i]*mw[i] for i in range(5))/sum(incoming[i]*mw[i] for i in range(5))

    progress("candidate 2m")
    low=solve_height(2.0)
    progress("candidate20m")
    high=solve_height(20.0,low["state"])
    progress("height search")
    flo,fhi=recovery(low)-r["minimumRecoveryPct"],recovery(high)-r["minimumRecoveryPct"]
    if flo*fhi>0: return {"name":name,"status":"BLOCKED_NO_HEIGHT_BRACKET",
      "daxContinuousM2S":dc,"daxDispersedM2S":dd,
      "diagnostics":{"closedCandidateRecoveryAt2M":recovery(low),
        "closedCandidateRecoveryAt20M":recovery(high),
        "minimumRecoveryPct":r["minimumRecoveryPct"],
        "residualAt2M":flo,"residualAt20M":fhi,
        "bothBoundaryStatesPassedOriginalFvClosure":True,
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
    cells=[]
    for j in range(m):
        cells.append({"compartment":j+1,"continuousLocalComponentMolarFlowMolS":selected["state"][0][j],
          "dispersedLocalComponentMolarFlowMolS":selected["state"][1][j],
          "continuousInMolS":selected["fc"][j],"continuousOutMolS":selected["fc"][j+1],
          "dispersedInMolS":[-x for x in selected["fd"][j+1]],"dispersedOutMolS":[-x for x in selected["fd"][j]],
          "transferContinuousToDispersedMolS":selected["tr"][j],"localInterface":selected["gates"][j],
          "continuousResidualMolS":selected["rc"][j],"dispersedResidualMolS":selected["rd"][j]})
    out={"heightM":final_height,"profileSolvedHeightM":selected["height"],
         "profileStateSha256":digest([selected["state"][0],selected["state"][1]]),
         "recoveryPctNmpFreeRrboHydrocarbonMassBasis":recovery(selected),
         "cells":cells,"globalComponentBalanceResidualMolS":selected["global"],
         "residualDiagnostics":{"maxCellResidualMolS":selected["raw"],
          "maxScaledCellResidual":selected["scaled"],
          "maxGlobalComponentBalanceResidualMolS":max(abs(x) for x in selected["global"]),
          "minimumLocalComponentFlowMolS":selected["positive"],
          "interfaceCalls":selected["interfaceCalls"],
          "runtimeSeconds":time.monotonic()-budget["started"]},
         "homotopyHistory":selected["homotopyHistory"],
         "boundaryConditions":{"continuousInlet":"DANCKWERTS_TOTAL_COMPONENT_FACE_FLUX_EQUALS_GOVERNED_INLET_MOL_S",
          "dispersedInlet":"DANCKWERTS_TOTAL_COMPONENT_FACE_FLUX_EQUALS_NEGATIVE_GOVERNED_INLET_MOL_S",
          "outlets":"ZERO_DISPERSIVE_GRADIENT"}}
    return {"name":name,"status":"CALCULATED_PRELIMINARY_SENSITIVITY",
            "daxContinuousM2S":dc,"daxDispersedM2S":dd,"selected":out}

def exact_qualify(r, nominal):
    if nominal.get("status")!="CALCULATED_PRELIMINARY_SENSITIVITY": return nominal
    selected=nominal["selected"]; cells=selected["cells"]; height=selected["heightM"]
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
              {"compartment":cell["compartment"],"jobBStatus":out.get("status"),
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
              {"compartment":cell["compartment"],"gate":"CANDIDATE_EXACT_FLUX_ERROR",
               "maximumFluxErrorMolM2S":error,"toleranceMolM2S":flux_tolerance,
               "toleranceDerivation":"FV_BALANCE_TOLERANCE_MOL_S_DIVIDED_BY_CELL_INTERFACIAL_AREA_M2",
               "candidateRetainedForDiagnostics":cell["localInterface"]})
        if film>1e-12 and film/max(*(abs(x) for x in nc+nd),1e-12)>1e-8:
            raise JobCBlocked("BLOCKED_EXACT_QUALIFICATION_FAILED",
              {"compartment":cell["compartment"],"gate":"EXACT_FILMS_DISAGREE"})
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