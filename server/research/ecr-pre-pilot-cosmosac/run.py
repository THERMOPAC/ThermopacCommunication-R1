#!/usr/bin/env python3
"""Deterministic six-component COSMO-SAC-2010 phase-topology evaluation."""
import hashlib, json, math, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
OUT=ROOT/".agents/outputs/ecr-pre-pilot-cosmosac"; OUT.mkdir(parents=True,exist_ok=True)
CCOSMO_VENDOR=HERE/"vendor/python"
CCOSMO_BINARY=CCOSMO_VENDOR/"cCOSMO.cpython-312-x86_64-linux-gnu.so"
CCOSMO_BINARY_SHA256="a90b34a97bfc9b3fe06ac247a3feae7263f83aa1a29b4d79fea758bec587ce61"
if hashlib.sha256(CCOSMO_BINARY.read_bytes()).hexdigest() != CCOSMO_BINARY_SHA256:
    raise RuntimeError("vendored cCOSMO binary hash mismatch")
sys.path.insert(0,str(CCOSMO_VENDOR))
import cCOSMO
import numpy as np
import scipy
from scipy.optimize import minimize
if Path(cCOSMO.__file__).resolve() != CCOSMO_BINARY.resolve():
    raise RuntimeError("cCOSMO did not load from the pinned vendored binary")
if np.__version__ != "2.1.3" or not Path(np.__file__).resolve().is_relative_to(CCOSMO_VENDOR.resolve()):
    raise RuntimeError("NumPy did not load from the pinned vendored runtime")
if scipy.__version__ != "1.14.1" or not Path(scipy.__file__).resolve().is_relative_to(CCOSMO_VENDOR.resolve()):
    raise RuntimeError("SciPy did not load from the pinned vendored runtime")
PROFILES=ROOT/"server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles"
PROFILE_PROVENANCE=ROOT/"server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json"
FAMILIES=("SAT","MONO","DI","POLY","PA","NMP")
COMP={"SAT":("112-40-3","CCCCCCCCCCCC","InChI=1S/C12H26/c1-3-5-7-9-11-12-10-8-6-4-2/h3-12H2,1-2H3","SNRUBQQJIBEYMU-UHFFFAOYSA-N",170.3348),
"MONO":("103-65-1","CCCc1ccccc1","InChI=1S/C9H12/c1-2-6-9-7-4-3-5-8-9/h3-5,7-8H,2,6H2,1H3","ODLMAHJVESYWTB-UHFFFAOYSA-N",120.194),
"DI":("90-12-0","Cc1cccc2ccccc12","InChI=1S/C11H10/c1-9-5-4-7-10-6-2-3-8-11(9)10/h2-8H,1H3","QPUYECUOLPXSFR-UHFFFAOYSA-N",142.1971),
"POLY":("129-00-0","c1cc2ccc3cccc4ccc(c1)c2c34","InChI=1S/C16H10/c1-3-11-7-9-13-5-2-6-14-10-8-12(4-1)15(11)16(13)14/h1-10H","BBEAQIROQSPTKN-UHFFFAOYSA-N",202.2506),
"PA":("10081-67-1","CC(C)(c1ccccc1)c2ccc(Nc3ccc(C(C)(C)c4ccccc4)cc3)cc2","InChI=1S/C30H31N/c1-29(2,23-11-7-5-8-12-23)25-15-19-27(20-16-25)31-28-21-17-26(18-22-28)30(3,4)24-13-9-6-10-14-24/h5-22,31H,1-4H3","UJAWGGOCYUPCPS-UHFFFAOYSA-N",429.608),
"NMP":("872-50-4","CN1CCCC1=O","InChI=1S/C5H9NO/c1-6-4-2-3-5(6)7/h2-4H2,1H3","SECXISVLQFMRJM-UHFFFAOYSA-N",99.1311)}
TEMPERATURES_K=(298.15,313.15,323.15,333.15,348.15)
COMPOSITIONS=((.45,.12,.10,.06,.07,.20),(.20,.20,.20,.10,.10,.20),(.70,.05,.05,.05,.05,.10),(.10,.05,.05,.05,.05,.70))
KEY={k:v[3] for k,v in COMP.items()}
profile_provenance=json.loads(PROFILE_PROVENANCE.read_text())
if profile_provenance.get("profileSemanticsGate") != "PASSED":
    raise RuntimeError("six-component profile semantics gate is not passed")
profile_verification_path=ROOT/"server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profile-verification.json"
if hashlib.sha256(profile_verification_path.read_bytes()).hexdigest() != profile_provenance.get("profileVerificationSha256"):
    raise RuntimeError("six-component profile verification hash mismatch")
profile_verification=json.loads(profile_verification_path.read_text())
if profile_verification.get("decision") != "PROFILE_SEMANTICS_GATE_PASSED" or profile_verification.get("allComponentsPassed") is not True:
    raise RuntimeError("six-component segment-level profile gate failed")
if set(profile_provenance["componentIdentityKeys"]) != set(FAMILIES):
    raise RuntimeError("six-component profile family coverage changed")
if any(KEY[family] != profile_provenance["componentIdentityKeys"][family] for family in FAMILIES):
    raise RuntimeError("six-component profile identity mismatch")
if hashlib.sha256((PROFILES/"complist.txt").read_bytes()).hexdigest() != profile_provenance["complistSha256"]:
    raise RuntimeError("six-component complist hash mismatch")
for family in FAMILIES:
    profile_path=PROFILES/"sigma3"/f"{KEY[family]}.sigma"
    if hashlib.sha256(profile_path.read_bytes()).hexdigest() != profile_provenance["profileSha256ByFamily"][family]:
        raise RuntimeError(f"six-component profile hash mismatch for {family}")
db=cCOSMO.DelawareProfileDatabase(str(PROFILES/"complist.txt"),str(PROFILES/"sigma3"))
for k in KEY.values(): db.add_profile(k)
MODELS={}
def lngamma(names,T,x):
    names=tuple(names); m=MODELS.get(names)
    if m is None: m=MODELS.setdefault(names,cCOSMO.COSMO3([KEY[n] for n in names],db))
    x=np.maximum(np.asarray(x,dtype=float),1e-12);x/=x.sum()
    # Required COSMO-SAC-2010 definition; intentionally never call get_lngamma.
    return np.asarray(m.get_lngamma_comb(T,x))+np.asarray(m.get_lngamma_resid(T,x))
def norm(x): x=np.maximum(np.asarray(x,float),1e-10); return x/x.sum()
def softmax(y):
    y=np.r_[y,0.]; y-=max(y); return np.exp(y)/np.exp(y).sum()
def tpd_search(names,T,z):
    """Actual full-simplex lattice TPD followed by fixed deterministic BFGS refinements."""
    z=norm(z); gz=lngamma(names,T,z); n=len(z); den=8 if n==3 else 4
    grid=[]
    def rec(left,k,a):
        if k==n-1:
            w=norm(np.array(a+[left],float)); val=float(sum(w*(np.log(w)+lngamma(names,T,w)-np.log(z)-gz)))
            grid.append((val,w)); return
        for q in range(left+1): rec(left-q,k+1,a+[q])
    rec(den,0,[])
    grid.sort(key=lambda x:x[0]); refined=[]; refinement_diagnostics=[]
    for seed_index,(_,w) in enumerate(grid[:3]+[(0.0,z)]):
        sol=minimize(lambda y: float(sum((ww:=softmax(y))*(np.log(ww)+lngamma(names,T,ww)-np.log(z)-gz))),
                     np.log(w[:-1]/w[-1]),method="BFGS",options={"gtol":1e-6,"maxiter":200})
        ww=softmax(sol.x); refined.append((float(sol.fun),ww))
        refinement_diagnostics.append({"seed":"FEED" if seed_index==3 else f"GRID_{seed_index+1}",
            "success":bool(sol.success),"iterations":int(sol.nit),"objective":float(sol.fun),
            "gradientInfinityNorm":float(max(abs(sol.jac))),"message":str(sol.message)})
    val,w=min(refined+grid+[(0.0,z)],key=lambda x:x[0])
    return {"gridDenominator":den,"gridPointCount":len(grid),"coarseMinimum":grid[0][0],"refinedMinimum":val,
            "minimizingComposition":w.tolist(),"refinements":refinement_diagnostics,
            "refinementConverged":all(d["success"] or d["gradientInfinityNorm"]<=1e-6 for d in refinement_diagnostics),
            "verdict":"UNSTABLE_NEGATIVE_TPD" if val < -1e-7 else "STABLE_NO_NEGATIVE_TPD"}
def flash(names,T,z,experimental=None):
    """Constrained total-Gibbs minimization in NMP-rich component amounts."""
    z=norm(z); n=len(z); eps=1e-12; gh=float(sum(z*(np.log(z)+lngamma(names,T,z))))
    tpd=tpd_search(names,T,z); starts=[]
    if experimental is not None: starts.append(.5*norm(experimental[1]))
    w=np.array(tpd["minimizingComposition"]); starts += [.5*w, .5*norm(np.arange(1,n+1)), .5*norm(np.arange(n,0,-1))]
    best=None
    for a in starts:
        a=np.clip(a,eps,z-eps)
        def obj(ne):
            beta=ne.sum(); nr=z-ne
            if beta<=eps or beta>=1-eps:return 1e6
            xe=ne/beta; xr=nr/(1-beta)
            return float(sum(ne*(np.log(xe)+lngamma(names,T,xe)))+sum(nr*(np.log(xr)+lngamma(names,T,xr))))
        sol=minimize(obj,a,method="L-BFGS-B",bounds=[(eps,float(zi-eps)) for zi in z],
                     options={"ftol":1e-11,"gtol":1e-6,"maxiter":20,"maxls":12})
        if best is None or sol.fun<best.fun:best=sol
    ne=best.x; b=float(ne.sum()); e=ne/b; r=(z-ne)/(1-b)
    resid=float(max(abs(np.log(r)+lngamma(names,T,r)-np.log(e)-lngamma(names,T,e))))
    improvement=gh-float(best.fun); boundary=any(ne<=eps*1.01)|any(ne>=z-eps*1.01)
    numerical_success=bool(tpd["refinementConverged"] and best.success)
    two=bool(numerical_success and tpd["refinedMinimum"]<-1e-7 and improvement>1e-8 and not boundary and resid<2e-5 and max(abs(e-r))>1e-4)
    ni=names.index("NMP")
    if r[ni]>e[ni]:r,e,b=e,r,1-b
    category="TWO_PHASE" if two else ("PREDICTED_STABLE_SINGLE_PHASE" if numerical_success and tpd["refinedMinimum"]>=-1e-7 and not boundary else "NONCONVERGED_OR_BOUNDARY")
    stable=category=="PREDICTED_STABLE_SINGLE_PHASE"
    failure_reasons=[]
    if not tpd["refinementConverged"]: failure_reasons.append("TPD_REFINEMENT_NOT_CONVERGED")
    if not best.success: failure_reasons.append("SPLIT_OPTIMIZER_NOT_CONVERGED")
    if boundary: failure_reasons.append("CANDIDATE_SPLIT_ON_BOUNDARY")
    if tpd["refinedMinimum"]<-1e-7 and not two: failure_reasons.append("NEGATIVE_TPD_WITHOUT_ACCEPTED_SPLIT")
    K=(e/r).tolist() if two else None
    selectivity=({names[i]:K[i]/K[0] for i in range(1,n)} if two else None)
    return {"phaseBehavior":category,"converged":two,
            "singleLiquidComposition":z.tolist() if stable else None,
            "singleLiquidFraction":1.0 if stable else None,
            "RRBO_rich":r.tolist() if two else None,"NMP_rich":e.tolist() if two else None,
            "beta_NMP_rich":b if two else None,
            "K_NMPrich_over_RRBO":K,"selectivityRelativeToSaturate":selectivity,
            "isoactivityLogResidual":resid if two else None,
            "massBalanceMaxResidual":float(max(abs(z-((1-b)*r+b*e)))),
            "iterations":int(best.nit),"objectiveHomogeneous":gh,"objectiveSplit":float(best.fun),"objectiveImprovement":improvement,
            "optimizerSuccess":bool(best.success),"boundarySolution":bool(boundary),"numericalFailureReasons":failure_reasons,
            "candidateSplitDiagnostics":{"phaseAComposition":r.tolist(),"phaseBComposition":e.tolist(),"phaseBFraction":b,
              "isoactivityLogResidual":resid,"massBalanceMaxResidual":float(max(abs(z-((1-b)*r+b*e)))),
              "maximumCompositionSeparation":float(max(abs(e-r)))},
            "TPD":tpd}
def main():
  cases=[]
  names=list(FAMILIES)
  for ti,T in enumerate(TEMPERATURES_K):
    for ci,z in enumerate(COMPOSITIONS):
      q=flash(names,T,z)
      pinned={"temperatureK":T,"composition":list(z),"components":names}
      q.update({"caseId":f"T{ti+1:02d}-Z{ci+1:02d}","temperatureK":T,"components":names,
                "overallComposition":list(z),"pinnedInputSha256":hashlib.sha256(json.dumps(pinned,sort_keys=True,separators=(",",":")).encode()).hexdigest()})
      cases.append(q)
  counts={c:sum(q["phaseBehavior"]==c for q in cases) for c in ("TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY")}
  topology_pass=counts["TWO_PHASE"]==len(cases)
  result={"schemaVersion":"2.0.0","deterministic":True,"researchOnly":True,"calibrationRequired":True,
          "pilotValidated":False,"releaseEligible":False,"sulfurPrediction":"NOT_CALCULABLE",
          "profileSource":{"directory":"server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles",
          "complistSha256":hashlib.sha256((PROFILES/"complist.txt").read_bytes()).hexdigest(),
          "profileSha256ByFamily":{f:hashlib.sha256((PROFILES/"sigma3"/f"{KEY[f]}.sigma").read_bytes()).hexdigest() for f in FAMILIES},
          "restrictedOrVendoredProfileInputsUsed":False},
          "model":{"name":"COSMO-SAC-2010","lnGamma":"get_lngamma_comb(T,x)+get_lngamma_resid(T,x)","excluded":"get_lngamma / multicomponent dispersive mode"},
          "runtime":{"vendorDirectory":"server/research/ecr-pre-pilot-cosmosac/vendor/python","cCOSMOModulePath":"server/research/ecr-pre-pilot-cosmosac/vendor/python/cCOSMO.cpython-312-x86_64-linux-gnu.so","cCOSMOBinarySha256":CCOSMO_BINARY_SHA256,"python":sys.version,"numpy":np.__version__,"scipy":scipy.__version__},
          "numerics":{"flash":"constrained total-Gibbs L-BFGS-B over conserved NMP-rich component amounts; four deterministic starts","TPD":"full-simplex denominator 4, then deterministic BFGS refinement; two-phase acceptance requires negative TPD, objective improvement, interior solution, and isoactivity closure","compositionFloor":1e-10},
          "frozenGrid":{"temperaturesK":list(TEMPERATURES_K),"compositions":[list(z) for z in COMPOSITIONS],"caseCount":len(cases),"cases":cases},
          "topologyGate":{"requiredBehavior":"TWO_PHASE_AT_EVERY_DECLARED_GRID_POINT","passed":topology_pass,"counts":counts,
          "decision":"QUALITATIVE_TOPOLOGY_CONFIRMED" if topology_pass else "QUALITATIVE_TOPOLOGY_FAILED"},
          "admissionGates":{"quantitativeLle":{"status":"NOT_EVALUATED_SEPARATE_GATE","admitted":False},
          "sulfurPrediction":{"status":"NOT_EVALUATED_SEPARATE_GATE","admitted":False}},
          "finalDecision":"ACCEPT_FOR_QUANTITATIVE_LLE_GATE" if topology_pass else "REJECT"}
  (OUT/"results.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
  man={"schemaVersion":"2.0.0","researchOnly":True,"calibrationRequired":True,"pilotValidated":False,
       "releaseEligible":False,"sulfurPrediction":"NOT_CALCULABLE",
       "NIST_COSMOSAC_source_commit":"1b82456be38026719b16cad4076109bef3fcb309","runnerSha256":hashlib.sha256((HERE/"run.py").read_bytes()).hexdigest(),"sixComponentProfileProvenanceSha256":hashlib.sha256(PROFILE_PROVENANCE.read_bytes()).hexdigest(),"runtime":result["runtime"],"identities":{k:{"CAS":v[0],"SMILES":v[1],"InChI":v[2],"InChIKey":v[3],"MW_g_mol":v[4]} for k,v in COMP.items()},"profileSource":result["profileSource"],"frozenGridSha256":hashlib.sha256(json.dumps({"temperaturesK":list(TEMPERATURES_K),"compositions":[list(z) for z in COMPOSITIONS]},sort_keys=True,separators=(",",":")).encode()).hexdigest(),"caseInputSha256":{q["caseId"]:q["pinnedInputSha256"] for q in cases},"settings":result["numerics"],"modelVariant":result["model"],"phaseEquilibriumAlgorithm":result["numerics"]["flash"]}
  (HERE/"provenance-manifest.json").write_text(json.dumps(man,indent=2,sort_keys=True)+"\n")
  report=f"""# Six-component COSMO-SAC-2010 topology evaluation

This reproducible research-only calculation uses NIST cCOSMO `COSMO3` with only the six project-generated profiles. No NIST UD/VT, ThermoSAC, NRTL, Dortmund, or simulator profile/model inputs were used.

## Results
* Frozen points evaluated: {len(cases)}
* Two phase: {counts['TWO_PHASE']}
* Stable single phase: {counts['PREDICTED_STABLE_SINGLE_PHASE']}
* Nonconverged or boundary: {counts['NONCONVERGED_OR_BOUNDARY']}
* Required behavior: two phases at every declared temperature/composition point
* Topology decision: {result['topologyGate']['decision']}

## Decision basis

Every case records its pinned-input hash, TPD search, Gibbs objectives, optimizer status, boundary status, isoactivity residual, and material-balance residual. A failed or nonconverged case fails the topology gate honestly.

This result is qualitative only. Quantitative LLE validation and sulfur-prediction admission remain separate, not evaluated, and not admitted. This artifact is never release eligible.

{result['finalDecision']}
"""
  (OUT/"report.md").write_text(report)
if __name__=="__main__": main()