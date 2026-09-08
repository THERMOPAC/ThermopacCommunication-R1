"""Versioned Job-C boundary branch qualifier.

This deliberately owns a copy of the Job-B mathematical solve.  It is not a
wrapper around Job-B: Job-B remains provenance only, while this module applies
the additional exact-zero inlet branch condition required by Job-C.
"""
from __future__ import annotations
import hashlib
import json
import math

VERSION = "ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V2"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
MAX_SCALED_FLUX_RESIDUAL = 1e-8
ABSOLUTE_FLUX_TOLERANCE = 1e-12
INDEPENDENT_START_MINIMUM_SCALED_SEPARATION = 2e-3

def canonical(v): return json.dumps(v, sort_keys=True, separators=(",", ":"), allow_nan=False)
def _number(v):
    a,b = format(float(v), ".16e").split("e")
    return {"$number": f"{a}e{int(b)}"}
def _hashed(v):
    if isinstance(v, (str, bool)) or v is None: return v
    if isinstance(v, (float, int)): return _number(v)
    if isinstance(v, list): return [_hashed(x) for x in v]
    return {k:_hashed(x) for k,x in v.items()}
def digest(v): return hashlib.sha256(canonical(_hashed(v)).encode()).hexdigest()
def native(v):
    """Prevent numpy scalar/array leakage into the persisted evidence."""
    if isinstance(v, dict): return {str(k):native(x) for k,x in v.items()}
    if isinstance(v, (list, tuple)): return [native(x) for x in v]
    if hasattr(v, "tolist"): return native(v.tolist())
    if hasattr(v, "item"): return v.item()
    return v
def maximum_scaled_difference(a,b):
    if len(a)!=len(b): raise ValueError("JOB_C_QUALIFIER_STATE_LENGTH_MISMATCH")
    return max((abs(float(x)-float(y))/max(abs(float(x)),abs(float(y)),1.0)
      for x,y in zip(a,b)),default=0.0)
def independent_pair_evidence(primary_state,witness_state,primary_initial,
                              witness_initial,primary_hash,witness_hash,
                              primary_lineage,witness_lineage,endpoint_tolerance):
    endpoint_difference=maximum_scaled_difference(primary_state,witness_state)
    initial_separation=maximum_scaled_difference(primary_initial,witness_initial)
    if (endpoint_difference>endpoint_tolerance or primary_hash==witness_hash
      or primary_lineage==witness_lineage
      or initial_separation<INDEPENDENT_START_MINIMUM_SCALED_SEPARATION):
        return None
    return {"initialStartMaximumScaledSeparation":initial_separation,
      "maximumRelativeDifference":endpoint_difference}
def compact_tpd(value):
    return native({"minimum":value["minimum"],"classification":value["classification"],
      "allRefinementsAccepted":value["allRefinementsAccepted"],
      "ambiguityTriggered":value["ambiguityTriggered"],"escalationUsed":value["escalationUsed"],
      "explicitMonoRichBasinSearch":value["explicitMonoRichBasinSearch"]})

def job_c_local_stability(engine, composition, temperature):
    """Cross-qualified log-ratio Hessian without noise-amplifying fine scalar differences."""
    np, gates = engine.np, engine.gates
    z=np.asarray(composition,dtype=float); z/=np.sum(z)
    y0=np.log(z[:-1]/z[-1])
    absolute=gates["hessianEigenvalueAbsoluteTolerance"]
    relative=gates["hessianEigenvalueRelativeTolerance"]
    def softmax(y):
        u=np.r_[y,0.]; u-=np.max(u); e=np.exp(u); return e/np.sum(e)
    reference_mu=engine.mu(z,temperature)
    def value(y):
        x=softmax(y)
        return float(x @ (engine.mu(x,temperature)-reference_mu))
    def scalar_spectrum(step):
        hessian=np.zeros((6,6)); center=value(y0)
        for i in range(6):
            di=np.eye(6)[i]*step
            hessian[i,i]=(value(y0+di)-2*center+value(y0-di))/step**2
            for j in range(i):
                dj=np.eye(6)[j]*step
                hessian[i,j]=hessian[j,i]=(
                  value(y0+di+dj)-value(y0+di-dj)
                  -value(y0-di+dj)+value(y0-di-dj))/(4*step**2)
        return np.linalg.eigvalsh(hessian)
    jacobian_x=np.empty((7,6))
    for i in range(7):
        for j in range(6):
            jacobian_x[i,j]=z[i]*((1.0 if i==j else 0.0)-z[j])
    def projected_spectrum(step):
        mu_jacobian=np.empty((7,6))
        for j in range(6):
            dj=np.eye(6)[j]*step
            mu_jacobian[:,j]=(engine.mu(softmax(y0+dj),temperature)
              -engine.mu(softmax(y0-dj),temperature))/(2*step)
        raw=jacobian_x.T @ mu_jacobian
        symmetry_error=float(np.max(abs(raw-raw.T)))
        return np.linalg.eigvalsh(.5*(raw+raw.T)),symmetry_error,float(np.max(abs(raw)))
    def agreement(first,second):
        allowed=absolute+relative*np.maximum(abs(first),abs(second))
        return bool(np.all(abs(first-second)<=allowed)),float(np.max(
          abs(first-second)/allowed))
    scalar_steps=(2e-3,1e-3)
    projected_steps=(5e-4,2.5e-4)
    scalar=[scalar_spectrum(step) for step in scalar_steps]
    projected_rows=[projected_spectrum(step) for step in projected_steps]
    projected=[row[0] for row in projected_rows]
    scalar_converged,scalar_ratio=agreement(scalar[0],scalar[1])
    projected_converged,projected_ratio=agreement(projected[0],projected[1])
    reconstruction_agrees,reconstruction_ratio=agreement(scalar[1],projected[1])
    symmetry_allowed=[absolute+relative*row[2] for row in projected_rows]
    symmetry_converged=all(row[1]<=allowed
      for row,allowed in zip(projected_rows,symmetry_allowed))
    return native({
      "version":"ECR_JOB_C_CROSS_QUALIFIED_LOG_RATIO_HESSIAN_V1",
      "dimension":6,
      "coordinate":"six independent log mole-fraction ratios ln(x_i/x_H2O)",
      "minimumEigenvalue":float(projected[1][0]),
      "eigenvalues":projected[1].tolist(),
      "stepSizeConverged":bool(scalar_converged and projected_converged
        and reconstruction_agrees and symmetry_converged),
      "projectedChemicalPotentialJacobian":{
        "steps":list(projected_steps),"spectra":[row.tolist() for row in projected],
        "modewiseStepAgreementAccepted":projected_converged,
        "maximumModewiseToleranceRatio":projected_ratio,
        "maximumRawSymmetryError":[row[1] for row in projected_rows],
        "symmetryAllowances":symmetry_allowed,
        "symmetryAccepted":symmetry_converged},
      "independentScalarTangentPlaneCrossCheck":{
        "steps":list(scalar_steps),"spectra":[row.tolist() for row in scalar],
        "modewiseStepAgreementAccepted":scalar_converged,
        "maximumModewiseToleranceRatio":scalar_ratio},
      "crossReconstructionAgreement":{
        "scalarStep":scalar_steps[1],"projectedStep":projected_steps[1],
        "accepted":reconstruction_agrees,
        "maximumModewiseToleranceRatio":reconstruction_ratio},
      "acceptanceThresholds":{
        "minimumLocalStabilityCurvature":gates["minimumLocalStabilityCurvature"],
        "hessianEigenvalueAbsoluteTolerance":absolute,
        "hessianEigenvalueRelativeTolerance":relative}})

def qualify(engine, temperature, kc, kd, ctc, ctd, phase_config, xb_c, xb_d,
            branchReferenceState=None):
    """Solve and select only an independently reproduced stable compatible root."""
    np, scipy, gates = engine.np, engine.scipy, engine.gates
    xb_c, xb_d = np.asarray(xb_c, dtype=float), np.asarray(xb_d, dtype=float)
    if len(xb_c) != 7 or len(xb_d) != 7 or abs(float(sum(xb_c))-1)>1e-10 or abs(float(sum(xb_d))-1)>1e-10:
        raise ValueError("JOB_C_QUALIFIER_INVALID_NORMALIZED_BOUNDARY")
    if phase_config not in ("nmp-continuous-rrbo-dispersed", "rrbo-continuous-nmp-dispersed"):
        raise ValueError("JOB_C_QUALIFIER_INVALID_PHASE_CONFIGURATION")
    kcct, kdct = np.asarray(kc)*ctc, np.asarray(kd)*ctd
    scale=np.maximum(np.maximum(kcct,kdct), ABSOLUTE_FLUX_TOLERANCE)
    bound=float(2*np.sum(kcct+kdct))
    def softmax(z):
        y=np.r_[z,0.]; y-=np.max(y); e=np.exp(y); return e/np.sum(e)
    def logits(x):
        y=np.maximum(np.asarray(x),1e-14); y/=np.sum(y); return np.log(y[:-1]/y[-1])
    def evaluate(u):
        xc,xd,n=softmax(u[:6]),softmax(u[6:12]),float(u[12])
        mu=engine.mu(xc,temperature)-engine.mu(xd,temperature)
        rawc=kcct*(xb_c-xc); rawd=kdct*(xd-xb_d)
        jc=rawc-xc*np.sum(rawc); jd=rawd-xd*np.sum(rawd)
        nc=jc+xc*n; nd=jd+xd*n; delta=nc-nd
        return np.r_[mu,delta[:6]/scale[:6]],xc,xd,n,jc,jd,nc,nd,delta
    nmp=np.asarray((.01,.01,.01,.005,.005,.88,.08))
    rrbo=np.asarray((.72,.12,.06,.025,.015,.05,.01))
    oriented=(nmp,rrbo) if phase_config=="nmp-continuous-rrbo-dispersed" else (rrbo,nmp)
    perturb=np.linspace(-.02,.02,6)
    witness_perturb=np.asarray((-1.0,-.6,-.2,.2,.6,1.0))
    starts=[
      ("ORIENTED_PHASE_TEMPLATE",*oriented,0.0,"ORIENTED_PHASE_TEMPLATE"),
      ("FROZEN_BULK_BOUNDARIES",xb_c,xb_d,0.0,"FROZEN_BULK_BOUNDARIES"),
      ("ORIENTED_TEMPLATE_BULK_C",oriented[0],xb_d,0.0,"ORIENTED_TEMPLATE_BULK_C"),
      ("ORIENTED_BULK_D_TEMPLATE",xb_c,oriented[1],0.0,"ORIENTED_BULK_D_TEMPLATE"),
      ("ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS",softmax(logits(oriented[0])+perturb),
        softmax(logits(oriented[1])-perturb),0.0,"ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS"),
      ("ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS",softmax(logits(oriented[0])-perturb),
        softmax(logits(oriented[1])+perturb),0.0,"ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS"),
      ("INDEPENDENT_HYBRID_PERTURB_PLUS",
        softmax(logits(oriented[0])+.15*witness_perturb),
        softmax(logits(xb_d)-.15*witness_perturb),
        .08*bound,"STRUCTURED_HYBRID_LOGIT_AND_NONZERO_FLUX_V1"),
      ("INDEPENDENT_HYBRID_FLUX_PLUS",oriented[0],xb_d,
        .01*bound,"INPUT_DERIVED_HYBRID_NONZERO_FLUX_V1")]
    lower=np.r_[np.full(12,-35.),-bound]; upper=np.r_[np.full(12,35.),bound]
    rows=[]; eligible=[]
    def scaled_difference(a,b):
        return maximum_scaled_difference(a,b)
    for label,sc,sd,n0,start_lineage in starts:
        initial=np.r_[logits(sc),logits(sd),n0]
        fit=scipy.optimize.least_squares(lambda u:evaluate(u)[0],initial,
          bounds=(lower,upper),method="trf",jac="2-point",max_nfev=2500,
          xtol=1e-11,ftol=1e-11,gtol=1e-11,x_scale="jac")
        eq,xc,xd,n,jc,jd,nc,nd,delta=evaluate(fit.x)
        singular=np.linalg.svd(fit.jac,compute_uv=False)
        tol=max(fit.jac.shape)*np.finfo(float).eps*singular[0] if len(singular) and singular[0]>0 else math.inf
        mu=engine.mu(xc,temperature)-engine.mu(xd,temperature)
        compatible=all(float(nc[i])>=0.0 for i in (5,6) if float(xb_d[i]) == 0.0)
        numerical=bool(fit.success) and int(np.sum(singular>tol))==13 and float(np.max(abs(mu)))<=gates["maximumIsoactivityLogResidual"] and float(np.max(abs(delta)/scale))<=MAX_SCALED_FLUX_RESIDUAL
        separated=float(np.max(abs(xc-xd)))>=gates["minimumPhaseCompositionSeparation"]
        oriented_ok=bool(xc[5]>xd[5]) if phase_config=="nmp-continuous-rrbo-dispersed" else bool(xd[5]>xc[5])
        row={"startClass":label,"startLineage":start_lineage,
          "startStateSha256":digest(initial.tolist()),
          "optimizerSuccess":bool(fit.success),"functionEvaluations":int(fit.nfev),
          "numericalJacobianRank":int(np.sum(singular>tol)),"requiredNumericalJacobianRank":13,
          "maximumIsoactivityLogResidual":float(np.max(abs(mu))),"maximumFluxEqualityResidualMolM2S":float(np.max(abs(delta))),
          "maximumScaledFluxEqualityResidual":float(np.max(abs(delta)/scale)),
          "maximumInterfaceCompositionSeparation":float(np.max(abs(xc-xd))),
          "boundaryCompatibleExactZeroSolvents":compatible,
          "nmpFluxMolM2S":float(nc[5]),"h2oFluxMolM2S":float(nc[6]),
          "numericalAccepted":numerical,"phaseSeparationAccepted":separated,"phaseOrientationAccepted":oriented_ok}
        rows.append(row)
        if numerical and separated and oriented_ok and compatible:
            eligible.append((fit,(eq,xc,xd,n,jc,jd,nc,nd,delta),row,initial))
    reproduction_tol=gates["multistartProductRelativeTolerance"]
    def state_of(candidate):
        return np.r_[candidate[1][1],candidate[1][2],candidate[1][3]]
    def state_difference(a,b):
        return scaled_difference(a,b)
    # Partition each eligible start exactly once into deterministic equivalence
    # classes, using the first start in governed start order as representative.
    classes=[]
    for candidate in eligible:
        state=state_of(candidate)
        found=None
        for root_class in classes:
            if state_difference(state,root_class["_state"])<=reproduction_tol:
                found=root_class; break
        if found is None:
            found={"rootClass":f"ROOT_{len(classes)+1}","_state":state,
              "_representative":candidate,"_members":[]}
            classes.append(found)
        found["_members"].append(candidate)
    qualifying_pairs=[]; selectable=[]
    for root_class in classes:
        members=root_class["_members"]; representative=root_class["_representative"]
        independent_pairs=[]
        for second in members:
            if second is representative: continue
            pair=independent_pair_evidence(
              state_of(representative),state_of(second),
              representative[3],second[3],
              representative[2]["startStateSha256"],second[2]["startStateSha256"],
              representative[2]["startLineage"],second[2]["startLineage"],
              reproduction_tol)
            if pair is not None:
                independent_pairs.append((representative,second,pair))
        evidence={"rootClass":root_class["rootClass"],
          "representativeStartClass":representative[2]["startClass"],
          "members":[member[2]["startClass"] for member in members],
          "independentlyReproduced":len(independent_pairs)>0}
        if independent_pairs:
            xc,xd=representative[1][1],representative[1][2]
            local={"continuous":job_c_local_stability(engine,xc,temperature),
              "dispersed":job_c_local_stability(engine,xd,temperature)}
            tpd={"continuous":engine.routine_tpd(xc,temperature,refine_best_global_and_local=True),
              "dispersed":engine.routine_tpd(xd,temperature,refine_best_global_and_local=True)}
            stable=all(local[p]["minimumEigenvalue"]>=gates["minimumLocalStabilityCurvature"]
              and local[p]["stepSizeConverged"]
              and tpd[p]["minimum"]>=gates["postSplitTpdThreshold"]
              and tpd[p]["allRefinementsAccepted"]
              and tpd[p].get("explicitMonoRichBasinSearch",{}).get("allRequiredSearchesAccepted") is True
              for p in ("continuous","dispersed"))
            evidence.update({"fullyStable":bool(stable),"localStability":native(local),
              "routineTpd":{p:compact_tpd(tpd[p]) for p in ("continuous","dispersed")}})
            for first,second,pair in independent_pairs:
                qualifying_pairs.append({"rootClass":root_class["rootClass"],
                  "primaryStartClass":first[2]["startClass"],
                  "reproductionStartClass":second[2]["startClass"],
                  "primaryStartStateSha256":first[2]["startStateSha256"],
                  "reproductionStartStateSha256":second[2]["startStateSha256"],
                  **pair})
            reference_distance=0.0 if branchReferenceState is None else state_difference(
              root_class["_state"],np.asarray(branchReferenceState,dtype=float))
            evidence["branchReferenceMaximumNormalizedDifference"]=reference_distance
            if stable:
                reproduction=independent_pairs[0]
                selectable.append((reference_distance,representative[2]["startClass"],
                  root_class["rootClass"],reproduction[0],reproduction[1],local,tpd))
        root_class["_evidence"]=evidence
    selected=min(selectable,default=None,key=lambda x:(x[0],x[1],x[2]))
    root_classes=[root_class["_evidence"] for root_class in classes]
    body={"version":VERSION,"operation":"QUALIFY_BOUNDARY_INTERFACE","componentOrder":list(COMPONENTS),
      "boundaryExactZeroSolventRequirement":{"NMP":float(xb_d[5])==0.0,"H2O":float(xb_d[6])==0.0,"required":"NC_GTE_ZERO_EXACTLY"},
      "acceptanceThresholds":{"maximumIsoactivityLogResidual":gates["maximumIsoactivityLogResidual"],"maximumScaledFluxEqualityResidual":MAX_SCALED_FLUX_RESIDUAL,"requiredNumericalJacobianRank":13,"independentStartReproductionRelativeTolerance":reproduction_tol,"independentStartMinimumScaledSeparation":INDEPENDENT_START_MINIMUM_SCALED_SEPARATION,"minimumLocalStabilityCurvature":gates["minimumLocalStabilityCurvature"],"postInterfaceTpdThreshold":gates["postSplitTpdThreshold"]},
      "startDiagnostics":rows,"rootClasses":root_classes,
      "qualifyingPairs":qualifying_pairs,
      "branchReferenceState":native(branchReferenceState),
      "status":"BLOCKED_NO_QUALIFIED_JOB_C_BOUNDARY_BRANCH"}
    if not selected:
        body["resultHash"]=digest(body); return native(body)
    distance,_,selected_class,first,second,local,tpd=selected
    reproduction_difference=state_difference(state_of(first),state_of(second))
    _,xc,xd,n,jc,jd,nc,nd,delta=first[1]
    body.update({"status":"QUALIFIED_JOB_C_BOUNDARY_BRANCH","selectedStartClass":first[2]["startClass"],
      "independentReproductionStartClass":second[2]["startClass"],"independentReproductionMaximumRelativeDifference":reproduction_difference,
      "selectedRootClass":selected_class,
      "selectedBranchReferenceMaximumNormalizedDifference":distance,
      "selectedGateEvidence":{"localStability":native(local),"routineTpd":{p:compact_tpd(tpd[p]) for p in ("continuous","dispersed")},"boundaryCompatibleExactZeroSolvents":True},
      "interface":{"continuousMoleFractions":xc.tolist(),"dispersedMoleFractions":xd.tolist(),"totalMolarFluxMolM2S":float(n),"continuousDiffusiveFluxMolM2S":jc.tolist(),"dispersedDiffusiveFluxMolM2S":jd.tolist(),"continuousComponentFluxMolM2S":nc.tolist(),"dispersedComponentFluxMolM2S":nd.tolist(),"fluxEqualityResidualMolM2S":delta.tolist()},
      "unknowns":first[0].x.tolist()})
    body=native(body); body["resultHash"]=digest(body)
    return body