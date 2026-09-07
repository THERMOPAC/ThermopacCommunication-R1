"""Versioned Job-C boundary branch qualifier.

This deliberately owns a copy of the Job-B mathematical solve.  It is not a
wrapper around Job-B: Job-B remains provenance only, while this module applies
the additional exact-zero inlet branch condition required by Job-C.
"""
from __future__ import annotations
import hashlib
import json
import math

VERSION = "ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V1"
COMPONENTS = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
MAX_SCALED_FLUX_RESIDUAL = 1e-8
ABSOLUTE_FLUX_TOLERANCE = 1e-12

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
def compact_tpd(value):
    return native({"minimum":value["minimum"],"classification":value["classification"],
      "allRefinementsAccepted":value["allRefinementsAccepted"],
      "ambiguityTriggered":value["ambiguityTriggered"],"escalationUsed":value["escalationUsed"],
      "explicitMonoRichBasinSearch":value["explicitMonoRichBasinSearch"]})

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
    starts=[("ORIENTED_PHASE_TEMPLATE",*oriented),("FROZEN_BULK_BOUNDARIES",xb_c,xb_d),
      ("ORIENTED_TEMPLATE_BULK_C",oriented[0],xb_d),("ORIENTED_BULK_D_TEMPLATE",xb_c,oriented[1]),
      ("ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS",softmax(logits(oriented[0])+perturb),softmax(logits(oriented[1])-perturb)),
      ("ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS",softmax(logits(oriented[0])-perturb),softmax(logits(oriented[1])+perturb))]
    lower=np.r_[np.full(12,-35.),-bound]; upper=np.r_[np.full(12,35.),bound]
    rows=[]; eligible=[]
    for label,sc,sd in starts:
        fit=scipy.optimize.least_squares(lambda u:evaluate(u)[0],np.r_[logits(sc),logits(sd),0.],
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
        row={"startClass":label,"optimizerSuccess":bool(fit.success),"functionEvaluations":int(fit.nfev),
          "numericalJacobianRank":int(np.sum(singular>tol)),"requiredNumericalJacobianRank":13,
          "maximumIsoactivityLogResidual":float(np.max(abs(mu))),"maximumFluxEqualityResidualMolM2S":float(np.max(abs(delta))),
          "maximumScaledFluxEqualityResidual":float(np.max(abs(delta)/scale)),
          "maximumInterfaceCompositionSeparation":float(np.max(abs(xc-xd))),
          "boundaryCompatibleExactZeroSolvents":compatible,
          "nmpFluxMolM2S":float(nc[5]),"h2oFluxMolM2S":float(nc[6]),
          "numericalAccepted":numerical,"phaseSeparationAccepted":separated,"phaseOrientationAccepted":oriented_ok}
        rows.append(row)
        if numerical and separated and oriented_ok and compatible: eligible.append((fit, (eq,xc,xd,n,jc,jd,nc,nd,delta),row))
    reproduction_tol=gates["multistartProductRelativeTolerance"]
    def state_of(candidate):
        return np.r_[candidate[1][1],candidate[1][2],candidate[1][3]]
    def state_difference(a,b):
        return float(np.max(abs(a-b)/np.maximum(np.maximum(abs(a),abs(b)),1.)))
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
        evidence={"rootClass":root_class["rootClass"],
          "representativeStartClass":representative[2]["startClass"],
          "members":[member[2]["startClass"] for member in members],
          "independentlyReproduced":len(members)>=2}
        if len(members)>=2:
            xc,xd=representative[1][1],representative[1][2]
            local={"continuous":engine.local_stability(xc,temperature),
              "dispersed":engine.local_stability(xd,temperature)}
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
            for i,first in enumerate(members):
                for second in members[i+1:]:
                    qualifying_pairs.append({"rootClass":root_class["rootClass"],
                      "primaryStartClass":first[2]["startClass"],
                      "reproductionStartClass":second[2]["startClass"],
                      "maximumRelativeDifference":state_difference(state_of(first),state_of(second))})
            reference_distance=0.0 if branchReferenceState is None else state_difference(
              root_class["_state"],np.asarray(branchReferenceState,dtype=float))
            evidence["branchReferenceMaximumNormalizedDifference"]=reference_distance
            if stable:
                selectable.append((reference_distance,representative[2]["startClass"],
                  root_class["rootClass"],representative,members[1],local,tpd))
        root_class["_evidence"]=evidence
    selected=min(selectable,default=None,key=lambda x:(x[0],x[1],x[2]))
    root_classes=[root_class["_evidence"] for root_class in classes]
    body={"version":VERSION,"operation":"QUALIFY_BOUNDARY_INTERFACE","componentOrder":list(COMPONENTS),
      "boundaryExactZeroSolventRequirement":{"NMP":float(xb_d[5])==0.0,"H2O":float(xb_d[6])==0.0,"required":"NC_GTE_ZERO_EXACTLY"},
      "acceptanceThresholds":{"maximumIsoactivityLogResidual":gates["maximumIsoactivityLogResidual"],"maximumScaledFluxEqualityResidual":MAX_SCALED_FLUX_RESIDUAL,"requiredNumericalJacobianRank":13,"independentStartReproductionRelativeTolerance":reproduction_tol,"minimumLocalStabilityCurvature":gates["minimumLocalStabilityCurvature"],"postInterfaceTpdThreshold":gates["postSplitTpdThreshold"]},
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