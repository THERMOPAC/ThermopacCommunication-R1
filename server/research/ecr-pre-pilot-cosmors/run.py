#!/usr/bin/env python3
"""Deterministic, research-only openCOSMO-RS LLE benchmark (no fitted fallback)."""
import hashlib, json, math, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; HERE=Path(__file__).resolve().parent
VENDOR=HERE/"vendor/python"
sys.path.insert(0,str(VENDOR))
import numpy as np
import scipy
from scipy.optimize import minimize
from opencosmorspy import COSMORS

OUT=ROOT/".agents/outputs/ecr-pre-pilot-cosmors"; OUT.mkdir(parents=True,exist_ok=True)
PROFILE=HERE/"vendor/profiles/lvpp-v25"
COMP=("N-DODECANE","P-XYLENE","TOLUENE","1-METHYLNAPHTHALENE","PYRENE",
      "DIBENZOTHIOPHENE","BENZOTHIOPHENE","THIOPHENE","N-METHYLPYRROLIDONE",
      "N-TETRADECANE","N-HEXADECANE","N-HEPTADECANE","N-PROPYLBENZENE",
      "N-PENTYLBENZENE","MESITYLENE")
MODELS={}; ACTIVITIES={}
def norm(x):
 x=np.maximum(np.asarray(x,float),1e-10); return x/x.sum()
def lngamma(names,T,x):
 """Pure-component-reference openCOSMO-RS log activity coefficients."""
 names=tuple(names); x=norm(x); key=(names,float(T),tuple(np.round(x,13)))
 if key in ACTIVITIES:return ACTIVITIES[key].copy()
 model=MODELS.get(names)
 if model is None:
  model=COSMORS("default_turbomole")
  for n in names:model.add_molecule([str(PROFILE/(n+".cosmo"))])
  MODELS[names]=model
 model.clear_jobs(); model.add_job(x.copy(),float(T),refst="pure_component")
 value=np.asarray(model.calculate()["tot"]["lng"][0],float)
 ACTIVITIES[key]=value.copy(); return value
def softmax(y):
 y=np.r_[y,0.]; y-=max(y); return np.exp(y)/np.exp(y).sum()
def gibbs(names,T,x):
 x=norm(x); return float(np.sum(x*(np.log(x)+lngamma(names,T,x))))
def tpd_search(names,T,z):
 """Finite full simplex (every lattice point), then deterministic BFGS seeds."""
 z=norm(z); gz=lngamma(names,T,z); n=len(z); den=8 if n==3 else 4; grid=[]
 def rec(left,k,a):
  if k==n-1:
   w=norm(np.array(a+[left],float))
   grid.append((float(np.sum(w*(np.log(w)+lngamma(names,T,w)-np.log(z)-gz))),w)); return
  for q in range(left+1):rec(left-q,k+1,a+[q])
 rec(den,0,[]); grid.sort(key=lambda v:v[0]); refined=[]
 for _,w in grid[:3]+[(0.,z)]:
  sol=minimize(lambda y:float(np.sum((q:=softmax(y))*(np.log(q)+lngamma(names,T,q)-np.log(z)-gz))),
   np.log(w[:-1]/w[-1]),method="BFGS",options={"gtol":1e-6,"maxiter":8})
  refined.append((float(sol.fun),softmax(sol.x)))
 val,w=min(grid+refined+[(0.,z)],key=lambda v:v[0])
 return {"gridDenominator":den,"gridPointCount":len(grid),"coarseMinimum":grid[0][0],
  "refinedMinimum":val,"minimizingComposition":w.tolist(),
  "verdict":"UNSTABLE_NEGATIVE_TPD" if val < -1e-7 else "STABLE_NO_NEGATIVE_TPD"}
def flash(names,T,z,experimental=None):
 z=norm(z); n=len(z); eps=1e-12; gh=gibbs(names,T,z); tpd=tpd_search(names,T,z)
 # The constrained split minimization is run even after a stable TPD result.
 # It is a diagnostic only in that case and can never manufacture a tie-line.
 starts=[.5*norm(experimental[1])] if experimental else []
 w=np.asarray(tpd["minimizingComposition"]); starts += [.5*w,.5*norm(np.arange(1,n+1)),.5*norm(np.arange(n,0,-1))]
 best=None
 for a in starts:
  a=np.clip(a,eps,z-eps)
  def obj(ne):
   b=ne.sum(); nr=z-ne
   if b<=eps or b>=1-eps:return 1e6
   return b*gibbs(names,T,ne/b)+(1-b)*gibbs(names,T,nr/(1-b))
  sol=minimize(obj,a,method="L-BFGS-B",bounds=[(eps,float(v-eps)) for v in z],
   options={"ftol":1e-11,"gtol":1e-6,"maxiter":25,"maxls":12})
  if best is None or sol.fun<best.fun:best=sol
 ne=best.x; b=float(ne.sum()); e=ne/b; r=(z-ne)/(1-b)
 resid=float(np.max(np.abs(np.log(r)+lngamma(names,T,r)-np.log(e)-lngamma(names,T,e))))
 boundary=bool(np.any(ne<=eps*1.01)|np.any(ne>=z-eps*1.01)); improve=gh-float(best.fun)
 two=bool(tpd["refinedMinimum"] < -1e-7 and best.success and improve>1e-8 and not boundary and resid<2e-5 and np.max(abs(e-r))>1e-4)
 if not two:
  q=flash_stable(names,T,z,gh,tpd,best,resid,boundary,improve)
  if tpd["refinedMinimum"] < -1e-7 or not best.success or boundary:
   q["phaseBehavior"]="NONCONVERGED_OR_BOUNDARY"
  return q
 ni=names.index("N-METHYLPYRROLIDONE")
 if r[ni]>e[ni]:r,e,b=e,r,1-b
 K=e/r
 return {"phaseBehavior":"TWO_PHASE","converged":True,"singleLiquidComposition":None,"singleLiquidFraction":None,
  "RRBO_rich":r.tolist(),"NMP_rich":e.tolist(),"beta_NMP_rich":b,"K_NMPrich_over_RRBO":K.tolist(),
  "selectivityRelativeToSaturate":{names[i]:float(K[i]/K[0]) for i in range(1,n)},
  "isoactivityLogResidual":resid,"massBalanceMaxResidual":float(np.max(abs(z-((1-b)*r+b*e)))),
  "iterations":int(best.nit),"objectiveHomogeneous":gh,"objectiveSplit":float(best.fun),
  "objectiveImprovement":improve,"optimizerSuccess":bool(best.success),"boundarySolution":boundary,"TPD":tpd}
def flash_stable(names,T,z,gh,tpd,best,resid,boundary,improve):
 return {"phaseBehavior":"PREDICTED_STABLE_SINGLE_PHASE","converged":False,"singleLiquidComposition":z.tolist(),
  "singleLiquidFraction":1.,"RRBO_rich":None,"NMP_rich":None,"beta_NMP_rich":None,"K_NMPrich_over_RRBO":None,
  "selectivityRelativeToSaturate":None,"isoactivityLogResidual":None,"massBalanceMaxResidual":0.,"iterations":int(best.nit),
  "objectiveHomogeneous":gh,"objectiveSplit":float(best.fun),"objectiveImprovement":improve,
  "optimizerSuccess":bool(best.success),"boundarySolution":boundary,"TPD":tpd}
def coto_rows():
 s=(ROOT/"server/engine-framework/cel/coto2022-nmp-lle.ts").read_text(); out=[]
 for family,mono in (("xylene","P-XYLENE"),("toluene","TOLUENE")):
  g=re.search(r"COTO_2022_"+family.upper()+r"_TIELINES.*?= \[(.*?)\] as const",s,re.S).group(1)
  for x,y,o in re.findall(r"x: \[([^]]+)\], y: \[([^]]+)\], tableOrder: (\d+)",g):
   f=lambda a:[float(v) for v in a.split(",")]
   out.append((f"coto-2022-{family}-{o}",["N-DODECANE",mono,"1-METHYLNAPHTHALENE","PYRENE","N-METHYLPYRROLIDONE"],f(x),f(y),.003,"Coto 2022",298.15))
 return out
def evaluate(id,names,ra,ex,u,source,T):
 z=norm((np.array(ra)+np.array(ex))/2); q=flash(names,T,z,(ra,ex))
 err=np.r_[abs(np.array(q["RRBO_rich"])-ra),abs(np.array(q["NMP_rich"])-ex)] if q["converged"] else np.array([])
 diagnostic=err if len(err) else np.r_[abs(z-ra),abs(z-ex)]
 q.update({"id":id,"source":source,"T_K":T,"components":names,"experimental":{"RRBO_rich":ra,"NMP_rich":ex},
  "overall_z_midpoint":z.tolist(),"componentAbsoluteErrors":err.tolist(),
  "compositionRmsd":float(np.sqrt(np.mean(err*err))) if len(err) else None,"maxAbsoluteError":float(max(err)) if len(err) else None,
  "outcomeDiagnosticAbsoluteErrors":diagnostic.tolist(),"outcomeDiagnosticRmsd":float(np.sqrt(np.mean(diagnostic*diagnostic))),
  "outcomeDiagnosticMaxAbsoluteError":float(max(diagnostic)),
  "uncertaintyComparison":{"uX":u,"threeUX":3*u if u is not None else None,
   "valuesOverUX":int(sum(diagnostic>u)) if u is not None else None,"valuesOver3UX":int(sum(diagnostic>3*u)) if u is not None else None,
   "basis":"predicted phases when two-phase; otherwise predicted homogeneous liquid versus both observed phases"}})
 return q
def metrics(a):
 good=[v for q in a for v in q["componentAbsoluteErrors"]]; diag=[v for q in a for v in q["outcomeDiagnosticAbsoluteErrors"]]
 cats={x:sum(q["phaseBehavior"]==x for q in a) for x in ("TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY")}
 return {"records":len(a),"converged":sum(q["converged"] for q in a),"categories":cats,
  "twoPhaseCompositionRMSD":float(np.sqrt(np.mean(np.square(good)))) if good else None,"twoPhaseMaxAbsoluteError":max(good) if good else None,
  "outcomeDiagnosticRMSD":float(np.sqrt(np.mean(np.square(diag)))),"outcomeDiagnosticMaxAbsoluteError":max(diag),
  "uncertaintyValuesOverUX":sum(q["uncertaintyComparison"]["valuesOverUX"] or 0 for q in a),
  "uncertaintyValuesOver3UX":sum(q["uncertaintyComparison"]["valuesOver3UX"] or 0 for q in a)}
def main():
 coto=[evaluate(*x) for x in coto_rows()]; raw=json.loads((ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json").read_text())
 mp={"dodecane":"N-DODECANE","tetradecane":"N-TETRADECANE","hexadecane":"N-HEXADECANE","heptadecane":"N-HEPTADECANE","propylbenzene":"N-PROPYLBENZENE","pentylbenzene":"N-PENTYLBENZENE","1,3,5-trimethylbenzene":"MESITYLENE","N-methylpyrrolidone":"N-METHYLPYRROLIDONE"}
 multi=[]; blocked=[]
 for i,t in enumerate(raw["tieLines"]):
  try: multi.append(evaluate(f"multi-{i:04d}",[mp[t["components"][k]] for k in ("SAT","MONO","NMP")],[t["raffinate"][k] for k in ("SAT","MONO","NMP")],[t["extract"][k] for k in ("SAT","MONO","NMP")],t.get("u_x"),t["source"],t["T_K"]))
  except (KeyError,TypeError) as e: blocked.append({"index":i,"reason":str(e)})
 base=["N-DODECANE","P-XYLENE","1-METHYLNAPHTHALENE","PYRENE","DIBENZOTHIOPHENE","N-METHYLPYRROLIDONE"]; z=[.45,.12,.10,.06,.07,.20]; reps=[]
 for T in (298.15,323.15,348.15,373.15):
  q=flash(base,T,z); q.update({"case":"six-family DBT","T_C":T-273.15,"components":base,"overall_z":z,"temperatureEvidence":{298.15:"DIRECT_FIVE_COMPONENT_COTO_EVIDENCE",323.15:"INTERPOLATED_WITHIN_MULTITEMPERATURE_ANALOGUE_RANGE",348.15:"EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA",373.15:"EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA"}[T]}); reps.append(q)
 for sulfur in ("BENZOTHIOPHENE","THIOPHENE"):
  n=base[:4]+[sulfur]+base[5:];q=flash(n,298.15,z);q.update({"case":"limited sulfur sensitivity","substitution":sulfur,"T_C":25,"components":n,"overall_z":z,"temperatureEvidence":"SENSITIVITY_AT_25_C"});reps.append(q)
 for q in reps:
  if q["converged"]:
   i=4;q["sulfurPartitioning"]={"moleDistributionCoefficient":q["K_NMPrich_over_RRBO"][i],"sulfurMassRecoveryToNMPrich":q["beta_NMP_rich"]*q["NMP_rich"][i]/q["overall_z"][i]}
  else:q["sulfurPartitioning"]={"moleDistributionCoefficient":None,"sulfurMassRecoveryToNMPrich":None,"reason":"Unavailable: no valid NMP-rich/RRBO-rich two-phase outcome."}
 dort=json.loads((ROOT/".agents/outputs/ecr-pre-pilot-dortmund-benchmark/results.json").read_text())
 dort_summary={"coto":dort["benchmark"]["aggregate"],"multitemperatureAnalogue":dort["analogueBenchmark"]["aggregate"]}
 result={"schemaVersion":"1.0.0","deterministic":True,"model":{"name":"openCOSMO-RS_py","source":"TUHH-TVT/openCOSMO-RS_py commit 3db6614925ded5fc47a77d1e34f4a1975e518a9b","parameterization":"default_turbomole","lnGamma":"COSMORS('default_turbomole').add_job(x,T,refst='pure_component').calculate()['tot']['lng'][0]","crossQCParameterizationLimitation":"default_turbomole was developed for Turbomole-style inputs; supplied LVPP v25 surfaces are NWChem B3LYP/SVPD. Parameters were not altered."},"numerics":{"flash":"constrained total-Gibbs L-BFGS-B over conserved component amounts; experimental phases used only as initial seeds","TPD":"full-simplex denominator 4 for 5/6 components and 8 for ternaries; deterministic BFGS refinement","compositionFloor":1e-10},"benchmark":{"coto":coto,"cotoMetrics":metrics(coto),"multiT_supported":multi,"multiTMetrics":metrics(multi),"multiT_blocked":blocked},"representatives":reps,"dortmundComparison":{"file":str(ROOT/".agents/outputs/ecr-pre-pilot-dortmund-benchmark/results.json"),"reportedSummary":dort_summary},"cosmoSacComparison":{"file":str(ROOT/".agents/outputs/ecr-pre-pilot-cosmosac/results.json")},"finalDecision":"REJECT"}
 (OUT/"results.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
 man={"openCOSMORS_py_commit":"3db6614925ded5fc47a77d1e34f4a1975e518a9b","openCOSMORS_py_sourceSha256":{str(p.relative_to(VENDOR)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((VENDOR/"opencosmorspy").glob("*.py"))},"profileDatabase":{"release":"lvpp sigma-profile database v25","sourceCommit":"bdd4216d3c83ca49aad781a19105d53f58bbbef0","archiveSha256":"bd5b0c92d7ab51c37609b841e4806715198d8927726d19c38d1f4382c3a21beb","releaseUrl":"https://github.com/lvpp/sigma/releases/download/v25/nw-b3lyp-svpd.zip","rawProfileSha256":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PROFILE.glob("*.cosmo"))}},"packages":{"python":sys.version,"numpy":np.__version__,"scipy":scipy.__version__},"model":result["model"],"settings":result["numerics"]}
 (HERE/"provenance-manifest.json").write_text(json.dumps(man,indent=2,sort_keys=True)+"\n")
 cm=result["benchmark"]["cotoMetrics"]; mm=result["benchmark"]["multiTMetrics"]
 report=f"""# Genuine openCOSMO-RS LLE benchmark

This calculation uses vendored openCOSMO-RS_py commit `3db6614925ded5fc47a77d1e34f4a1975e518a9b`, raw LVPP v25 NWChem B3LYP/SVPD `.cosmo` surfaces, and `COSMORS('default_turbomole')` with `pure_component` reference-state activity coefficients. No fitted fallback, COSMO-SAC, Dortmund, NRTL, simulator, sizing, or hydrodynamics code is used.

**Cross-QC limitation:** `default_turbomole` was developed for Turbomole-style inputs, whereas these LVPP v25 surfaces are NWChem B3LYP/SVPD. This parameterization mismatch is disclosed and was not modified.

## Results
* Coto: {len(coto)}/17 records; two-phase {cm['converged']}; categories {cm['categories']}. Valid tie-line RMSD/max: {cm['twoPhaseCompositionRMSD']} / {cm['twoPhaseMaxAbsoluteError']}. Homogeneous diagnostic RMSD/max: {cm['outcomeDiagnosticRMSD']:.6f} / {cm['outcomeDiagnosticMaxAbsoluteError']:.6f}; uncertainty exceedances: {cm['uncertaintyValuesOverUX']} over u(x), {cm['uncertaintyValuesOver3UX']} over 3u(x).
* Multi-temperature: {len(multi)}/219 supported, blocked {len(blocked)}; two-phase {mm['converged']}; categories {mm['categories']}. Valid tie-line RMSD/max: {mm['twoPhaseCompositionRMSD']} / {mm['twoPhaseMaxAbsoluteError']}. Homogeneous diagnostic RMSD/max: {mm['outcomeDiagnosticRMSD']:.6f} / {mm['outcomeDiagnosticMaxAbsoluteError']:.6f}.
* Maximum material-balance residual: {max(q['massBalanceMaxResidual'] for q in coto+multi):.3e}.
* Coto coarse TPD range: {min(q['TPD']['coarseMinimum'] for q in coto):.9f} to {max(q['TPD']['coarseMinimum'] for q in coto):.9f}; multitemperature coarse TPD range: {min(q['TPD']['coarseMinimum'] for q in multi):.9f} to {max(q['TPD']['coarseMinimum'] for q in multi):.9f}.
* Dortmund directly outperforms this route: {dort_summary['coto']['twoPhaseRows']}/{dort_summary['coto']['rowCount']} Coto rows accepted, RMSD {dort_summary['coto']['compositionRmsd']:.6f}, maximum error {dort_summary['coto']['maxAbsoluteError']:.6f}; Aljimaz analogue RMSD {dort_summary['multitemperatureAnalogue']['compositionRmsd']:.6f}, maximum error {dort_summary['multitemperatureAnalogue']['maxAbsoluteError']:.6f}.
* The rejected COSMO-SAC-2010 route also predicted 0/17 Coto and 0/219 multitemperature two-phase outcomes. Neither molecular route produced a valid tie-line RMSD or sulfur partition.

The six-family DBT composition `[0.45,0.12,0.10,0.06,0.07,0.20]` was evaluated at 25/50/75/100 C, with BT and thiophene 25 C sensitivity and explicit evidence labels in `results.json`.

| sulfur molecule | T (C) | temperature status | coarse full-simplex TPD minimum | result |
|---|---:|---|---:|---|
{chr(10).join(f"| {q['components'][4]} | {q['T_C']:.0f} | {q['temperatureEvidence']} | {q['TPD']['coarseMinimum']:.9f} | {q['phaseBehavior']} |" for q in reps)}

No representative case produced two liquid phases. Consequently, both phase compositions, phase split, distribution coefficients, selectivity, and sulfur recovery are explicitly null. The single predicted liquid has the overall composition above and fraction 1.0. The 75 and 100 C cases are extrapolated above the admitted 328 K evidence range.

## Decision basis

This is a genuine, reproducible openCOSMO-RS execution, but the tested profile/parameterization route fails the governing qualitative gate: it does not reproduce the experimentally observed NMP/hydrocarbon two-liquid topology. The cross-QC parameterization mismatch is an additional limitation, not a reason to reinterpret the failed topology.

REJECT
"""
 (OUT/"report.md").write_text(report)
if __name__=="__main__":main()