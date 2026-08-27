#!/usr/bin/env python3
"""Resumable controlled UNIQUAC A/B flash comparison; does not touch frozen artifacts."""
from pathlib import Path
import sys,json,hashlib,argparse
ROOT=Path(__file__).resolve().parents[3]; U=ROOT/"server/research/ecr-pre-pilot-uniquac"
sys.path.insert(0,str(U)); import run as q
import numpy as np
from scipy.optimize import least_squares
OUT=ROOT/".agents/outputs/ecr-pre-pilot-representation-diagnosis"; CP=OUT/"controlled-uniquac-cases"; CP.mkdir(parents=True,exist_ok=True)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
CODE=sha(__file__); MULTI=ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json"; STRUCT=U/"structural-provenance.json"
sd,tab=q.structural(); rows=q.mt_rows(tab); TS=sorted({r["T"] for r in rows}); systems=sorted({tuple(r["identities"][:2]) for r in rows})
base=[{"i":i,"j":j,"from":q.FAMILIES[i],"to":q.FAMILIES[j],"form":"a+b/T","b_fixed":None} for i in (0,1,4) for j in (0,1,4) if i!=j]
CONFIG={"controlled_script_sha256":CODE,"multi_t_sha256":sha(MULTI),"coto_source_sha256":sha(ROOT/"server/engine-framework/cel/coto2022-nmp-lle.ts"),
 "structural_sha256":sha(STRUCT),"uniquac_run_sha256":sha(U/"run.py"),"uniquac_model_sha256":sha(U/"model.py"),
 "equation":"standard Abrams-Prausnitz UNIQUAC; row-specific Original-UNIFAC R/Q","optimizer":"scipy least_squares, 3-point jacobian, x_scale=jac, max_nfev=4000",
 "bounds":{"a":[-8,8],"b_K":[-2000,2000]},"regularization":{"a":1e-3,"b":1e-7},
 "flash":"imported qualified full/refined TPD, basin starts, independent final phase checks and original tolerances"}
def key(r): return tuple(r["identities"][:2])
def cases(): return [f"{m}:in-sample" for m in "AB"]+[f"{m}:T={t:g}" for m in "AB" for t in TS]
def metric(v):
 cats={x:sum(a["phaseBehavior"]==x for a in v) for x in ("PREDICTED_TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY","AMBIGUOUS_UNRESOLVED")}
 good=[a["compositionRmsd"] for a in v if a["compositionRmsd"] is not None]
 # `compositionRmsd` is root(mean squared error) over both five-component
 # phases, so retain the exact underlying component SSE for valid rows.
 accepted=[a for a in v if a["compositionRmsd"] is not None]
 sse=sum(a["compositionRmsd"]**2*10 for a in accepted)
 return {"rows":len(v),"categories":cats,"topology_recall":cats["PREDICTED_TWO_PHASE"]/len(v),
  "accepted_count":len(accepted),"accepted_component_count":10*len(accepted),"accepted_sse":sse,
  "accepted_tie_line_rmsd":float(np.sqrt(sse/(10*len(accepted)))) if accepted else None,
  "max_absolute_error":max([a["maxAbsoluteError"] or 0 for a in v])}
def run_case(label):
 model,fold=label.split(":",1); per=model=="B"; n=12*(len(systems) if per else 1)
 path=CP/(label.replace(":","__").replace("=","_")+".json")
 if path.exists():
  old=json.loads(path.read_text())
  if old.get("config")==CONFIG and old.get("case")==label: print("SKIP_VALID",path);return
 if fold=="in-sample": train=test=rows
 else:
  T=float(fold[2:]);train=[r for r in rows if r["T"]!=T];test=[r for r in rows if r["T"]==T]
 oldg,olds,oldpm=q.gamma,q.stand_gamma,q.PM
 def part(r,p): return p if not per else p[12*systems.index(key(r)):12*(systems.index(key(r))+1)]
 def gam(v,r,p): q.PM=base;return oldg(v,r,part(r,p))
 def sg(v,r,p,log_name="standaloneFinalGate"): q.PM=base;return olds(v,r,part(r,p),log_name)
 q.gamma,q.stand_gamma=gam,sg
 def residual(p,rr):
  z=[]
  for r in rr:
   a=gam(r["x"],r,p);b=gam(r["y"],r,p);z += [np.log(r["x"][i])+a[i]-np.log(r["y"][i])-b[i] for i in r["active"] if r["x"][i]>0 and r["y"][i]>0]
  return np.asarray(z)
 def fun(p):
  return np.r_[residual(p,train),[v for k in range(0,n,2) for v in (np.sqrt(1e-3)*p[k],np.sqrt(1e-7)*p[k+1])]]
 s=least_squares(fun,np.zeros(n),bounds=(-np.tile([8,2000],n//2),np.tile([8,2000],n//2)),jac="3-point",x_scale="jac",max_nfev=4000)
 rr=residual(s.x,train);J=np.empty((len(rr),n))
 for j in range(n):
  h=1e-5*max(1,abs(s.x[j]));a=s.x.copy();b=s.x.copy();a[j]+=h;b[j]-=h;J[:,j]=(residual(a,train)-residual(b,train))/(2*h)
 sv=np.linalg.svd(J,compute_uv=False); diag={"success":bool(s.success),"nfev":int(s.nfev),"measurement_rss":float(rr@rr),"rank":int((sv>sv[0]*max(J.shape)*np.finfo(float).eps).sum()),"condition_number":float(sv[0]/sv[-1]),"weak_directions":int((sv/sv[0]<1e-4).sum())}
 vals=q.validate(test,s.x,label);q.gamma,q.stand_gamma,q.PM=oldg,olds,oldpm
 records=[]
 for z,r in zip(vals,test):
  if z["compositionRmsd"] is None:
   records.append({"id":r["id"],"phaseBehavior":z["phaseBehavior"],"compositionRmsd":None,"component_count":0,"squared_error_sum":None,"max_absolute_error":None,
    "solver_audit":{"seed_contract":q.seed_contract(z),"independent_final_phase_check":None}})
  else:
   e=np.r_[z["RRBO_rich"],z["NMP_rich"]]-np.r_[r["x"],r["y"]]
   records.append({"id":r["id"],"phaseBehavior":z["phaseBehavior"],"compositionRmsd":float(np.sqrt(np.mean(e*e))),"component_count":int(len(e)),"squared_error_sum":float(e@e),"component_errors":e.tolist(),"max_absolute_error":float(max(abs(e))),
    "solver_audit":{"seed_contract":q.seed_contract(z),"independent_final_phase_check":bool(z["independentFinalPhaseChecks"]["pass"])}})
 audit={"rows_with_full_TPD_refinement":len(vals),"all_seed_contracts_pass":all(q.seed_contract(x) for x in vals),
  "two_phase_count":sum(x["phaseBehavior"]=="PREDICTED_TWO_PHASE" for x in vals),
  "all_two_phase_independent_final_checks_pass":all(x.get("independentFinalPhaseChecks",{}).get("pass",False) for x in vals if x["phaseBehavior"]=="PREDICTED_TWO_PHASE"),
  "ambiguous_count":sum(x["phaseBehavior"]=="AMBIGUOUS_UNRESOLVED" for x in vals)}
 doc={"format":"controlled-uniquac-case-v2","case":label,"config":CONFIG,"representation":"family-global directed interaction mapping" if not per else "exact SAT+MONO molecular-system directed interaction mapping","parameter_count":n,"train_rows":len(train),"heldout_rows":len(test),"fit":diag,"metrics":metric(vals),"row_records":records,"solver_audit":audit}
 path.write_text(json.dumps(doc,indent=2,sort_keys=True)+"\n");print("WROTE",path)
def aggregate():
 missing=[x for x in cases() if not (CP/(x.replace(':','__').replace('=','_')+'.json')).exists()]
 if missing: raise SystemExit("MISSING "+", ".join(missing))
 docs=[json.loads((CP/(x.replace(':','__').replace('=','_')+'.json')).read_text()) for x in cases()]
 if any(x["config"]!=CONFIG for x in docs):raise SystemExit("checkpoint config/hash mismatch")
 def pooled(letter):
  ds=[d for d in docs if d["case"].startswith(letter+":T=")];rs=[r for d in ds for r in d["row_records"]]
  ac=[r for r in rs if r["squared_error_sum"] is not None];return {"rows":len(rs),"accepted_count":len(ac),"topology_recall":len(ac)/len(rs),"accepted_component_count":sum(r["component_count"] for r in ac),"accepted_sse":sum(r["squared_error_sum"] for r in ac),"accepted_tie_line_rmsd":float(np.sqrt(sum(r["squared_error_sum"] for r in ac)/sum(r["component_count"] for r in ac))),"max_absolute_error":max(r["max_absolute_error"] or 0 for r in rs)}
 ar={r["id"]:r for d in docs if d["case"].startswith("A:T=") for r in d["row_records"]};br={r["id"]:r for d in docs if d["case"].startswith("B:T=") for r in d["row_records"]}
 common=sorted(set(ar)&set(br));common=[i for i in common if ar[i]["squared_error_sum"] is not None and br[i]["squared_error_sum"] is not None]
 def cr(ms):return float(np.sqrt(sum(ms[i]["squared_error_sum"] for i in common)/sum(ms[i]["component_count"] for i in common)))
 delta=[br[i]["compositionRmsd"]-ar[i]["compositionRmsd"] for i in common]
 paired={"intersection_count":len(common),"A_rmsd":cr(ar),"B_rmsd":cr(br),"B_minus_A_row_rmsd":{"min":min(delta),"max":max(delta),"mean":sum(delta)/len(delta),"median":sorted(delta)[len(delta)//2],"B_better_count":sum(x<0 for x in delta),"A_better_count":sum(x>0 for x in delta),"tie_count":sum(x==0 for x in delta)}}
 result={"format":"controlled-uniquac-aggregate-v2","config":CONFIG,"cases":docs,"aggregate_status":"COMPLETE","pooled":{"A":pooled("A"),"B":pooled("B")},"common_support":paired,"B_leave_one_system":{"status":"NOT_CALCULABLE_AS_ACCURACY_TEST","reason":"unseen system has no fitted molecular-system interactions"}}
 (OUT/"controlled-uniquac.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n");print("WROTE aggregate")
p=argparse.ArgumentParser();p.add_argument("--list",action="store_true");p.add_argument("--case");p.add_argument("--aggregate",action="store_true");a=p.parse_args()
if a.list: print("\n".join(cases()))
elif a.case: 
 if a.case not in cases():raise SystemExit("invalid case; use --list")
 run_case(a.case)
elif a.aggregate: aggregate()
else:p.error("use --list, --case, or --aggregate")