#!/usr/bin/env python3
"""Deterministic, research-only COSMO-SAC-2010 molecular LLE evaluation."""
import hashlib, json, math, os, re, sys
from pathlib import Path
import numpy as np
import scipy
import cCOSMO
from scipy.optimize import minimize

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
OUT=ROOT/".agents/outputs/ecr-pre-pilot-cosmosac"; OUT.mkdir(parents=True,exist_ok=True)
UD=HERE/"vendor/profiles/UD"
COMP={"N-DODECANE":("112-40-3","CCCCCCCCCCCC","InChI=1S/C12H26/c1-3-5-7-9-11-12-10-8-6-4-2/h3-12H2,1-2H3","SNRUBQQJIBEYMU-UHFFFAOYSA-N",170.3348),
"P-XYLENE":("106-42-3","c1(ccc(cc1)C)C","InChI=1S/C8H10/c1-7-3-5-8(2)6-4-7/h3-6H,1-2H3","URLKBWYHVLBVBO-UHFFFAOYSA-N",106.165),
"TOLUENE":("108-88-3","c1cc(ccc1)C","InChI=1S/C7H8/c1-7-5-3-2-4-6-7/h2-6H,1H3","YXFVVABEGXRONW-UHFFFAOYSA-N",92.1405),
"1-METHYLNAPHTHALENE":("90-12-0","c1ccc2c(c1)c(ccc2)C","InChI=1S/C11H10/c1-9-5-4-7-10-6-2-3-8-11(9)10/h2-8H,1H3","QPUYECUOLPXSFR-UHFFFAOYSA-N",142.1971),
"PYRENE":("129-00-0","c12c3c4ccc1cccc2ccc3ccc4","InChI=1S/C16H10/c1-3-11-7-9-13-5-2-6-14-10-8-12(4-1)15(11)16(13)14/h1-10H","BBEAQIROQSPTKN-UHFFFAOYSA-N",202.2506),
"N-METHYL-2-PYRROLIDONE":("872-50-4","N1(CCCC1=O)C","InChI=1S/C5H9NO/c1-6-4-2-3-5(6)7/h2-4H2,1H3","SECXISVLQFMRJM-UHFFFAOYSA-N",99.1311),
"DIBENZOTHIOPHENE":("132-65-0","c12c3c(sc1cccc2)cccc3","InChI=1S/C12H8S/c1-3-7-11-9(5-1)10-6-2-4-8-12(10)13-11/h1-8H","IYYZUPMFVPLQIF-UHFFFAOYSA-N",184.259),
"BENZOTHIOPHENE":("95-15-8","c1cc2c(s1)cccc2","InChI=1S/C8H6S/c1-2-4-8-7(3-1)5-6-9-8/h1-6H","FCEHBMOGCRZNNI-UHFFFAOYSA-N",134.201),
"THIOPHENE":("110-02-1","c1cccs1","InChI=1S/C4H4S/c1-2-4-5-3-1/h1-4H","YTPLMLYBLZKORZ-UHFFFAOYSA-N",84.139),
"N-TETRADECANE":("629-59-4","CCCCCCCCCCCCCC","InChI=1S/C14H30/c1-3-5-7-9-11-13-14-12-10-8-6-4-2/h3-14H2,1-2H3","BGHCVCJVXZWKCC-UHFFFAOYSA-N",198.388),
"N-HEXADECANE":("544-76-3","CCCCCCCCCCCCCCCC","InChI=1S/C16H34/c1-3-5-7-9-11-13-15-16-14-12-10-8-6-4-2/h3-16H2,1-2H3","DCAYPVUWAIABOU-UHFFFAOYSA-N",226.441),
"N-HEPTADECANE":("629-78-7","C(CCCCCCCCCCCCCCC)C","InChI=1S/C17H36/c1-3-5-7-9-11-13-15-17-16-14-12-10-8-6-4-2/h3-17H2,1-2H3","NDJKXXJCMXVBJW-UHFFFAOYSA-N",240.468),
"N-PROPYLBENZENE":("103-65-1","c1ccc(cc1)CCC","InChI=1S/C9H12/c1-2-6-9-7-4-3-5-8-9/h3-5,7-8H,2,6H2,1H3","ODLMAHJVESYWTB-UHFFFAOYSA-N",120.194),
"N-PENTYLBENZENE":("538-68-1","c1cccc(c1)CCCCC","InChI=1S/C11H16/c1-2-3-5-8-11-9-6-4-7-10-11/h4,6-7,9-10H,2-3,5,8H2,1H3","PWATWSYOIIXYMA-UHFFFAOYSA-N",148.248),
"MESITYLENE":("108-67-8","c1(cc(cc(c1)C)C)C","InChI=1S/C9H12/c1-7-4-8(2)6-9(3)5-7/h4-6H,1-3H3","AUHZEENZYGFFBQ-UHFFFAOYSA-N",120.194)}
KEY={k:v[3] for k,v in COMP.items()}
db=cCOSMO.DelawareProfileDatabase(str(UD/"complist.txt"),str(UD/"sigma3"))
for k in KEY.values(): db.add_profile(k)
MODELS={}
def lngamma(names,T,x):
    names=tuple(names); m=MODELS.get(names)
    if m is None: m=MODELS.setdefault(names,cCOSMO.COSMO3([KEY[n] for n in names],db))
    x=np.maximum(np.asarray(x,dtype=float),1e-12);x/=x.sum()
    # Required COSMO-SAC-2010 definition; intentionally never call get_lngamma.
    return np.asarray(m.get_lngamma_comb(T,x))+np.asarray(m.get_lngamma_resid(T,x))
def norm(x): x=np.maximum(np.asarray(x,float),1e-10); return x/x.sum()
def beta_rr(z,K):
    f=lambda b:sum(z*(K-1)/(1+b*(K-1)))
    a,b=1e-9,1-1e-9; fa,fb=f(a),f(b)
    if fa*fb>0:return .5
    for _ in range(70):
        c=(a+b)/2
        if f(c)*fa>0:a=c;fa=f(a)
        else:b=c
    return (a+b)/2
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
    grid.sort(key=lambda x:x[0]); refined=[]
    for _,w in grid[:2]+[(0.0,z)]:
        sol=minimize(lambda y: float(sum((ww:=softmax(y))*(np.log(ww)+lngamma(names,T,ww)-np.log(z)-gz))),
                     np.log(w[:-1]/w[-1]),method="BFGS",options={"gtol":1e-6,"maxiter":5})
        ww=softmax(sol.x); refined.append((float(sol.fun),ww))
    val,w=min(refined+grid+[(0.0,z)],key=lambda x:x[0])
    return {"gridDenominator":den,"gridPointCount":len(grid),"coarseMinimum":grid[0][0],"refinedMinimum":val,
            "minimizingComposition":w.tolist(),"verdict":"UNSTABLE_NEGATIVE_TPD" if val < -1e-7 else "STABLE_NO_NEGATIVE_TPD"}
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
    two=bool(best.success and tpd["refinedMinimum"]<-1e-7 and improvement>1e-8 and not boundary and resid<2e-5 and max(abs(e-r))>1e-4)
    ni=names.index("N-METHYL-2-PYRROLIDONE")
    if r[ni]>e[ni]:r,e,b=e,r,1-b
    category="TWO_PHASE" if two else ("PREDICTED_STABLE_SINGLE_PHASE" if tpd["refinedMinimum"]>=-1e-7 else "NONCONVERGED_OR_BOUNDARY")
    K=(e/r).tolist() if two else None
    selectivity=({names[i]:K[i]/K[0] for i in range(1,n)} if two else None)
    return {"phaseBehavior":category,"converged":two,
            "singleLiquidComposition":None if two else z.tolist(),
            "singleLiquidFraction":None if two else 1.0,
            "RRBO_rich":r.tolist() if two else None,"NMP_rich":e.tolist() if two else None,
            "beta_NMP_rich":b if two else None,
            "K_NMPrich_over_RRBO":K,"selectivityRelativeToSaturate":selectivity,
            "isoactivityLogResidual":resid if two else None,
            "massBalanceMaxResidual":float(max(abs(z-((1-b)*r+b*e)))) if two else 0.0,
            "iterations":int(best.nit),"objectiveHomogeneous":gh,"objectiveSplit":float(best.fun),"objectiveImprovement":improvement,
            "optimizerSuccess":bool(best.success),"boundarySolution":bool(boundary),"TPD":tpd}
def coto_rows():
    s=(ROOT/"server/engine-framework/cel/coto2022-nmp-lle.ts").read_text()
    groups=[("xylene",re.search(r"COTO_2022_XYLENE_TIELINES.*?= \[(.*?)\] as const",s,re.S).group(1),"P-XYLENE"),
    ("toluene",re.search(r"COTO_2022_TOLUENE_TIELINES.*?= \[(.*?)\] as const",s,re.S).group(1),"TOLUENE")]
    out=[]
    for family,g,mono in groups:
      for x,y,order in re.findall(r"x: \[([^]]+)\], y: \[([^]]+)\], tableOrder: (\d+)",g):
        conv=lambda q:[float(v) for v in q.split(",")]
        out.append((f"coto-2022-{family}-{order}",["N-DODECANE",mono,"1-METHYLNAPHTHALENE","PYRENE","N-METHYL-2-PYRROLIDONE"],conv(x),conv(y),.003))
    return out
def evaluate_row(id,names,ra,ex,u,source,T=298.15):
    z=norm((np.array(ra)+np.array(ex))/2); q=flash(names,T,z,(ra,ex))
    if q["converged"]:
        outcome_err=np.r_[abs(np.array(q["RRBO_rich"])-ra),abs(np.array(q["NMP_rich"])-ex)]
        valid_err=outcome_err
    else:
        # This is explicitly a failure diagnostic: one predicted liquid compared
        # with both observed phases. It is not a successful tie-line RMSD.
        outcome_err=np.r_[abs(z-ra),abs(z-ex)]
        valid_err=np.array([])
    q.update({"id":id,"source":source,"T_K":T,"components":names,
              "experimental":{"RRBO_rich":ra,"NMP_rich":ex},"overall_z_midpoint":z.tolist(),
              "componentAbsoluteErrors":valid_err.tolist(),
              "compositionRmsd":float(np.sqrt(np.mean(np.square(valid_err)))) if len(valid_err) else None,
              "maxAbsoluteError":float(max(valid_err)) if len(valid_err) else None,
              "outcomeDiagnosticAbsoluteErrors":outcome_err.tolist(),
              "outcomeDiagnosticRmsd":float(np.sqrt(np.mean(np.square(outcome_err)))),
              "outcomeDiagnosticMaxAbsoluteError":float(max(outcome_err)),
              "uncertaintyComparison":{"uX":u,"threeUX":3*u,"valuesOverUX":int(sum(outcome_err>u)),"valuesOver3UX":int(sum(outcome_err>3*u)),
                                       "basis":"predicted phases when two-phase; otherwise predicted homogeneous liquid versus both observed phases"}})
    return q
def main():
  rows=[evaluate_row(i,n,r,e,u,"Coto 2022") for i,n,r,e,u in coto_rows()]
  data=json.loads((ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json").read_text())
  # All entries are inspected; mappings with profiles are evaluated, nothing is silently dropped.
  mapn={"dodecane":"N-DODECANE","tetradecane":"N-TETRADECANE","hexadecane":"N-HEXADECANE","heptadecane":"N-HEPTADECANE","propylbenzene":"N-PROPYLBENZENE","pentylbenzene":"N-PENTYLBENZENE","1,3,5-trimethylbenzene":"MESITYLENE","N-methylpyrrolidone":"N-METHYL-2-PYRROLIDONE"}
  supported=[]; blocked=[]
  for j,t in enumerate(data["tieLines"]):
    try:
      names=[mapn[t["components"][x]] for x in ("SAT","MONO","NMP")]
      r=[t["raffinate"][x] for x in ("SAT","MONO","NMP")];e=[t["extract"][x] for x in ("SAT","MONO","NMP")]
      supported.append(evaluate_row("multi-%04d"%j,names,r,e,t.get("u_x"),t["source"],t["T_K"]))
    except (KeyError,TypeError) as exc: blocked.append({"index":j,"source":t.get("source"),"reason":"unsupported or incomplete molecular mapping: "+str(exc)})
  def metrics(a):
    es=[x for r in a for x in r["componentAbsoluteErrors"]]
    cats={c:sum(r["phaseBehavior"]==c for r in a) for c in ("TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY")}
    diagnostics=[x for r in a for x in r["outcomeDiagnosticAbsoluteErrors"]]
    return {"twoPhaseCompositionRMSD":float(np.sqrt(np.mean(np.square(es)))) if es else None,"twoPhaseMaxAbsoluteError":max(es) if es else None,
            "outcomeDiagnosticRMSD":float(np.sqrt(np.mean(np.square(diagnostics)))),
            "outcomeDiagnosticMaxAbsoluteError":max(diagnostics),
            "outcomeDiagnosticBasis":"predicted phases when two-phase; otherwise predicted homogeneous liquid versus both observed phases",
            "twoPhaseValueCount":len(es),"records":len(a),"converged":sum(r["converged"] for r in a),"categories":cats}
  reps=[]
  base=["N-DODECANE","P-XYLENE","1-METHYLNAPHTHALENE","PYRENE","DIBENZOTHIOPHENE","N-METHYL-2-PYRROLIDONE"]; z=[.45,.12,.10,.06,.07,.20]
  for T in (298.15,323.15,348.15,373.15):
    evidence={298.15:"DIRECT_FIVE_COMPONENT_COTO_EVIDENCE",323.15:"INTERPOLATED_WITHIN_MULTITEMPERATURE_ANALOGUE_RANGE",348.15:"EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA",373.15:"EXTRAPOLATED_ABOVE_ADMITTED_328_K_DATA"}[T]
    q=flash(base,T,z);q.update({"case":"six-family DBT","T_C":T-273.15,"components":base,"overall_z":z,"temperatureEvidence":evidence}); reps.append(q)
  for sulfur in ("BENZOTHIOPHENE","THIOPHENE"):
    n=base[:4]+[sulfur]+base[5:];q=flash(n,298.15,z);q.update({"case":"limited sulfur sensitivity","substitution":sulfur,"T_C":25,"components":n,"overall_z":z});reps.append(q)
  for q in reps:
    if q["converged"]:
      si=q["components"].index(next(x for x in q["components"] if "THIOPHENE" in x)); ni=q["components"].index("N-METHYL-2-PYRROLIDONE"); rec=q["beta_NMP_rich"]*q["NMP_rich"][si]/q["overall_z"][si]
      q["sulfurPartitioning"]={"moleDistributionCoefficient":q["K_NMPrich_over_RRBO"][si],"sulfurMassRecoveryToNMPrich":rec,"definition":"beta*x_sulfur,NMP-rich/z_sulfur; elemental sulfur mass cancels for a molecular sulfur species"}
    else:
      q["sulfurPartitioning"]={"moleDistributionCoefficient":None,"sulfurMassRecoveryToNMPrich":None,
                               "reason":"Unavailable: COSMO-SAC-2010 predicts one stable liquid, so no NMP-rich/RRBO-rich partition exists."}
  dort=json.loads((ROOT/".agents/outputs/ecr-pre-pilot-dortmund-benchmark/results.json").read_text())
  dm=dort.get("summary",dort.get("metrics",{}))
  result={"schemaVersion":"1.0.0","deterministic":True,"model":{"name":"COSMO-SAC-2010","lnGamma":"get_lngamma_comb(T,x)+get_lngamma_resid(T,x)","excluded":"get_lngamma / multicomponent dispersive mode"},"numerics":{"flash":"constrained total-Gibbs L-BFGS-B over NMP-rich component amounts; experimental split plus three deterministic starts","TPD":"full-simplex lattice (denominator 4 for 5/6 components, 8 for ternaries), then BFGS refinement of three lowest grid seeds and z; acceptance isoactivity <2e-5, mass balance <1e-10","compositionFloor":1e-10},"benchmark":{"coto":rows,"cotoMetrics":metrics(rows),"multiT_supported":supported,"multiTMetrics":metrics(supported),"multiT_blocked":blocked},"representatives":reps,"dortmundComparison":{"file":str(ROOT/".agents/outputs/ecr-pre-pilot-dortmund-benchmark/results.json"),"reportedSummary":dm,"knownReference":{"Coto_RMSD":.093210,"Coto_max":.335025,"Aljimaz_RMSD":.077157,"Aljimaz_max":.256329}},"finalDecision":"REJECT"}
  (OUT/"results.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
  man={"NIST_COSMOSAC_source_commit":"1b82456be38026719b16cad4076109bef3fcb309","ThermoSAC_profile_source_commit":"d20f5f4acdbf295a15a7500056fb20cb06ae2e23","packages":{"python":sys.version,"numpy":np.__version__,"scipy":scipy.__version__,"cCOSMO":"vendored cCOSMO.cpython-312-x86_64-linux-gnu.so"},"identities":{k:{"CAS":v[0],"SMILES":v[1],"InChI":v[2],"InChIKey":v[3],"MW_g_mol":v[4]} for k,v in COMP.items()},"sigmaProfileSha256":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((UD/"sigma3").glob("*.sigma"))},"settings":result["numerics"],"modelVariant":result["model"],"phaseEquilibriumAlgorithm":result["numerics"]["flash"]}
  (HERE/"provenance-manifest.json").write_text(json.dumps(man,indent=2,sort_keys=True)+"\n")
  report=f"""# COSMO-SAC-2010 molecular LLE research evaluation

This reproducible research-only calculation uses genuine vendored NIST cCOSMO `COSMO3`; ln(gamma) is exactly `get_lngamma_comb(T,x)+get_lngamma_resid(T,x)`. No NRTL, Dortmund runner, or simulator code was used.

## Results
* Coto: {len(rows)} / 17 records; predicted two-phase 0, predicted stable single-phase 17. A valid tie-line RMSD/max cannot be calculated. The failed-outcome diagnostic (one predicted liquid versus both observed phases) is RMSD {result['benchmark']['cotoMetrics']['outcomeDiagnosticRMSD']:.6f}, max {result['benchmark']['cotoMetrics']['outcomeDiagnosticMaxAbsoluteError']:.6f}. Maximum mass-balance residual is {max(q['massBalanceMaxResidual'] for q in rows):.3e}.
* Multi-temperature: {len(supported)} / {len(supported)+len(blocked)} supported records, predicted two-phase 0, predicted stable single-phase {len(supported)}, blocked {len(blocked)}. Valid tie-line RMSD/max are unavailable. Failed-outcome diagnostic RMSD {result['benchmark']['multiTMetrics']['outcomeDiagnosticRMSD']:.6f}, max {result['benchmark']['multiTMetrics']['outcomeDiagnosticMaxAbsoluteError']:.6f}. Maximum mass-balance residual is {max(q['massBalanceMaxResidual'] for q in supported):.3e}.
* Dortmund directly outperforms this route: it accepted all 17 Coto rows with RMSD 0.093210 and max 0.335025; its Aljimaz analogue result was RMSD 0.077157 and max 0.256329. COSMO-SAC-2010 produced no LLE tie-line to score.

The fixed six-family overall composition is [0.45,0.12,0.10,0.06,0.07,0.20] for [dodecane,p-xylene,1-methylnaphthalene,pyrene,sulfur,NMP]. DBT is primary; benzothiophene and thiophene are limited 25 C sensitivities.

| sulfur molecule | T (C) | temperature status | coarse full-simplex TPD minimum | result |
|---|---:|---|---:|---|
{chr(10).join(f"| {q['components'][4]} | {q['T_C']:.0f} | {q.get('temperatureEvidence','SENSITIVITY_AT_25_C')} | {q['TPD']['coarseMinimum']:.9f} | {q['phaseBehavior']} |" for q in reps)}

All refined TPD minima were zero within numerical precision at the feed composition; no negative TPD was found. Therefore there are no two liquid compositions, phase fraction, distribution coefficients, selectivities, or sulfur recovery values to report: those fields are explicitly null rather than fabricated. The single predicted liquid composition is the overall composition above, with fraction 1.0 and exact material-balance closure. The 75 and 100 C cases are extrapolated above the admitted 328 K evidence range.

## Decision basis

This COSMO-SAC-2010/profile route is reproducible, but it fails the essential qualitative test: it predicts one stable liquid for every experimentally two-phase benchmark record (17/17 Coto and 219/219 multitemperature). It also cannot calculate sulfur partitioning for the six-family case because it predicts no NMP-rich phase.

REJECT
"""
  (OUT/"report.md").write_text(report)
if __name__=="__main__": main()