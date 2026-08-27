#!/usr/bin/env python3
"""Deterministic representation diagnosis; this is analysis, not a simulator model."""
from pathlib import Path
import json, hashlib, math, re, statistics

HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]
OUT=ROOT/".agents/outputs/ecr-pre-pilot-representation-diagnosis"
DATA=ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json"
COTO=ROOT/"server/engine-framework/cel/coto2022-nmp-lle.ts"
STRUCT=ROOT/"server/research/ecr-pre-pilot-uniquac/structural-provenance.json"
NRTL=ROOT/".agents/outputs/ecr-pre-pilot-nrtl/results.json"
UNI=ROOT/".agents/outputs/ecr-pre-pilot-uniquac/results.json"
NSOL=ROOT/".agents/outputs/ecr-pre-pilot-nrtl/solver-isolation.json"
USOL=ROOT/".agents/outputs/ecr-pre-pilot-uniquac/solver-isolation.json"
CONTROLLED=ROOT/".agents/outputs/ecr-pre-pilot-representation-diagnosis/controlled-uniquac.json"
CONTROLLED_SCRIPT=HERE/"controlled_uniquac.py"
UNI_RUN=ROOT/"server/research/ecr-pre-pilot-uniquac/run.py"
UNI_MODEL=ROOT/"server/research/ecr-pre-pilot-uniquac/model.py"
CONTROLLED_CASES=OUT/"controlled-uniquac-cases"
OUT.mkdir(parents=True,exist_ok=True)

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def rng(a): return [min(a),max(a)]
raw=json.loads(DATA.read_text()); rows=raw["tieLines"]
struct={x["identity"]:x for x in json.loads(STRUCT.read_text())["all_molecules"]}
aliases={"dodecane":"n-dodecane","tetradecane":"n-tetradecane","hexadecane":"n-hexadecane",
 "heptadecane":"n-heptadecane","propylbenzene":"n-propylbenzene","pentylbenzene":"n-pentylbenzene",
 "N-methylpyrrolidone":"N-methyl-2-pyrrolidone"}
cn={"dodecane":12,"tetradecane":14,"hexadecane":16,"heptadecane":17,
 "propylbenzene":9,"pentylbenzene":11,"1,3,5-trimethylbenzene":9}
branched={"propylbenzene":0,"pentylbenzene":0,"1,3,5-trimethylbenzene":1}

systems={}
for i,r in enumerate(rows,1):
 s=(r["components"]["SAT"],r["components"]["MONO"]); systems.setdefault(s,[]).append((i,r))
inventory=[]
for s,rr in sorted(systems.items()):
 inventory.append({"sat":s[0],"mono":s[1],"rows":len(rr),"temperatures_K":sorted(set(x["T_K"] for _,x in rr)),
  "ranges":{f"{ph}_{c}":rng([x[ph][c] for _,x in rr]) for ph in ("raffinate","extract") for c in ("SAT","MONO","NMP")}})

# Molecular-system graph: molecule nodes connected when co-observed in one ternary system.
nodes=sorted(set(sum(([s[0],s[1],"N-methylpyrrolidone"] for s in systems),[])))
edges=sorted({tuple(sorted((a,b))) for s in systems for a,b in
 ((s[0],s[1]),(s[0],"N-methylpyrrolidone"),(s[1],"N-methylpyrrolidone"))})
adj={n:set() for n in nodes}
for a,b in edges: adj[a].add(b);adj[b].add(a)
seen=set(); comps=[]
for n in nodes:
 if n not in seen:
  q=[n];seen.add(n);cc=[]
  while q:
   z=q.pop();cc.append(z)
   for v in adj[z]:
    if v not in seen:seen.add(v);q.append(v)
  comps.append(sorted(cc))

def solve(A,b):
 n=len(b)
 for k in range(n):
  p=max(range(k,n),key=lambda i:abs(A[i][k]));A[k],A[p]=A[p],A[k];b[k],b[p]=b[p],b[k]
  d=A[k][k]
  if abs(d)<1e-14: continue
  for j in range(k,n):A[k][j]/=d
  b[k]/=d
  for i in range(n):
   if i==k:continue
   f=A[i][k]
   for j in range(k,n):A[i][j]-=f*A[k][j]
   b[i]-=f*b[k]
 return b
def ridge(X,y,lam=1e-7):
 p=len(X[0]);A=[[0.0]*p for _ in range(p)];b=[0.0]*p
 for x,t in zip(X,y):
  for i in range(p):
   b[i]+=x[i]*t
   for j in range(p):A[i][j]+=x[i]*x[j]
 for i in range(p):A[i][i]+=lam
 return solve(A,b)

sysnames=sorted(systems); temps=sorted(set(r["T_K"] for r in rows))
def base(r):
 t=(r["T_K"]-308)/20; m=r["raffinate"]["MONO"];n=r["raffinate"]["NMP"]
 return [1,t,m,n,m*m,n*n,m*n]
def feat(r,c,kind):
 s=(r["components"]["SAT"],r["components"]["MONO"]); z=base(r)
 if kind=="A": extra=[]
 elif kind=="B":
  rs=struct[aliases.get(s[0],s[0])];ra=struct[aliases.get(s[1],s[1])]
  extra=[rs["r"]/12,rs["q"]/10,ra["r"]/7,ra["q"]/6]
 elif kind=="C":
  extra=[1.0 if s==q else 0.0 for q in sysnames]+[(r["T_K"]-308)/20*(1.0 if s==q else 0.0) for q in sysnames]
 else:
  extra=[cn[s[0]]/17,cn[s[1]]/11,branched[s[1]],cn[s[0]]*cn[s[1]]/187,
         (r["T_K"]-308)*cn[s[0]]/340,(r["T_K"]-308)*cn[s[1]]/220]
 # Separate coefficients for each equilibrium constraint (SAT, MONO, NMP).
 one=[1.0 if c==q else 0.0 for q in ("SAT","MONO","NMP")]
 return sum(([v*w for v in z+extra] for w in one),[])
def fit_predict(train,test,kind):
 X=[];y=[]
 for r in train:
  for c in ("SAT","MONO","NMP"):
   if r["raffinate"][c]>0 and r["extract"][c]>0:
    X.append(feat(r,c,kind));y.append(math.log(r["extract"][c]/r["raffinate"][c]))
 p=ridge(X,y)
 errs=[]; logr=[]
 for r in test:
  kval={}
  for c in ("SAT","MONO","NMP"):
   pred=sum(a*b for a,b in zip(feat(r,c,kind),p));kval[c]=math.exp(max(-12,min(12,pred)))
   if r["raffinate"][c]>0 and r["extract"][c]>0:logr.append(pred-math.log(r["extract"][c]/r["raffinate"][c]))
  den=sum(r["raffinate"][c]*kval[c] for c in kval)
  yh={c:r["raffinate"][c]*kval[c]/den for c in kval}
  errs.append(math.sqrt(sum((yh[c]-r["extract"][c])**2 for c in yh)/3))
 return {"rows":len(test),"tie_line_extract_rmsd":math.sqrt(sum(x*x for x in errs)/len(errs)),
         "mean_row_rmsd":statistics.mean(errs),"log_K_residual_rms":math.sqrt(sum(x*x for x in logr)/len(logr))}

tests={}
for kind in ("A","B","C","D"):
 tests[kind]={"fit_all":fit_predict(rows,rows,kind)}
 # Honest temperature extrapolation/interpolation: each observed temperature is excluded.
 tests[kind]["leave_one_temperature"]={str(t):fit_predict([r for r in rows if r["T_K"]!=t],
   [r for r in rows if r["T_K"]==t],kind) for t in temps}
 # Whole-system prediction only meaningful for representations able to map an unseen identity.
 if kind in ("A","B","D"):
  tests[kind]["leave_one_system"]={f"{s[0]} + {s[1]}":fit_predict(
   [r for r in rows if (r["components"]["SAT"],r["components"]["MONO"])!=s],
   [r for r in rows if (r["components"]["SAT"],r["components"]["MONO"])==s],kind) for s in sysnames}

# Resolved-system empirical lower bound: linear interpolation in raffinate MONO
# within each exact system-temperature locus, excluding the predicted row.
loo=[]
for s,rr in systems.items():
 for T in sorted(set(r["T_K"] for _,r in rr)):
  group=[r for _,r in rr if r["T_K"]==T]
  for j,r in enumerate(group):
   others=sorted((q for k,q in enumerate(group) if k!=j),key=lambda q:q["raffinate"]["MONO"])
   x=r["raffinate"]["MONO"]
   lo=max((q for q in others if q["raffinate"]["MONO"]<=x),key=lambda q:q["raffinate"]["MONO"],default=None)
   hi=min((q for q in others if q["raffinate"]["MONO"]>=x),key=lambda q:q["raffinate"]["MONO"],default=None)
   if lo is None or hi is None or lo is hi:continue # interpolation only, no endpoint extrapolation
   f=(x-lo["raffinate"]["MONO"])/(hi["raffinate"]["MONO"]-lo["raffinate"]["MONO"])
   yp={c:lo["extract"][c]+f*(hi["extract"][c]-lo["extract"][c]) for c in ("SAT","MONO","NMP")}
   loo.append(math.sqrt(sum((yp[c]-r["extract"][c])**2 for c in yp)/3))
lower={"method":"leave-one-row-out interpolation on each exact molecule-pair and temperature locus; endpoints excluded",
 "rows":len(loo),"rmsd":math.sqrt(sum(x*x for x in loo)/len(loo)),"mean_row_rmsd":statistics.mean(loo),
 "fraction_at_or_below_0.03":sum(x<=.03 for x in loo)/len(loo)}

def ratio_stats(filterfn=lambda r:True):
 out={}
 for c in ("SAT","MONO","NMP"):
  a=[math.log(r["extract"][c]/r["raffinate"][c]) for r in rows if filterfn(r) and r["extract"][c]>0 and r["raffinate"][c]>0]
  out[c]={"n":len(a),"mean_logK":statistics.mean(a),"sd_logK":statistics.stdev(a),"range_logK":rng(a)}
 a=[math.log((r["extract"]["MONO"]/r["raffinate"]["MONO"])/(r["extract"]["SAT"]/r["raffinate"]["SAT"]))
    for r in rows if filterfn(r) and r["extract"]["MONO"]>0 and r["raffinate"]["MONO"]>0]
 out["MONO_over_SAT_selectivity"]={"n":len(a),"mean_log_selectivity":statistics.mean(a),
  "geometric_mean_selectivity":math.exp(statistics.mean(a)),"range_log_selectivity":rng(a)}
 return out
groups={"by_sat":{x:ratio_stats(lambda r,x=x:r["components"]["SAT"]==x) for x in sorted(raw["classMap"]) if raw["classMap"][x]=="SAT"},
 "by_mono":{x:ratio_stats(lambda r,x=x:r["components"]["MONO"]==x) for x in sorted(raw["classMap"]) if raw["classMap"][x]=="MONO"},
 "by_temperature":{str(t):ratio_stats(lambda r,t=t:r["T_K"]==t) for t in temps}}

# Parse the exact 17 Coto literals.
txt=COTO.read_text(); pat=r"\{ x: \[([^\]]+)\], y: \[([^\]]+)\], tableOrder: (\d+)"
crows=[]
for a,b,o in re.findall(pat,txt):
 crows.append({"x":[float(v.strip()) for v in a.split(",")],"y":[float(v.strip()) for v in b.split(",")],"order":int(o)})
for r in crows:
 r["family"]="xylene" if r["order"]<=13 else "toluene"
cdiag={}
for fam in ("xylene","toluene"):
 rr=[r for r in crows if r["family"]==fam]; q={}
 for i,n in enumerate(("SAT","MONO","DI","POLY","NMP")):
  a=[math.log(r["y"][i]/r["x"][i]) for r in rr]
  q[n]={"mean_logK":statistics.mean(a),"sd_logK":statistics.stdev(a) if len(a)>1 else 0,"range_logK":rng(a)}
 cdiag[fam]={"rows":len(rr),"logK":q}

nrtl=json.loads(NRTL.read_text());uni=json.loads(UNI.read_text())
controlled=json.loads(CONTROLLED.read_text()) if CONTROLLED.exists() else None
controlled_summary=None
if controlled and controlled.get("aggregate_status")=="COMPLETE" and controlled.get("format")=="controlled-uniquac-aggregate-v2":
 controlled_summary={"A_family_global_leave_one_temperature":controlled["pooled"]["A"],
   "B_exact_system_leave_one_temperature":controlled["pooled"]["B"],
   "common_support":controlled["common_support"],
  "A_in_sample":next(d["metrics"] for d in controlled["cases"] if d["case"]=="A:in-sample"),
  "B_in_sample":next(d["metrics"] for d in controlled["cases"] if d["case"]=="B:in-sample"),
  "interpretation":"B changes only interaction indexing. It improves conditional accepted-phase compositions but is not governing because its topology/coverage is poor and its system dummies cannot predict unseen systems."}
source_files=[DATA,COTO,STRUCT,NRTL,UNI,NSOL,USOL]
if controlled_summary:
 source_files += [CONTROLLED,CONTROLLED_SCRIPT,UNI_RUN,UNI_MODEL]
 source_files += sorted(CONTROLLED_CASES.glob("*.json"))
result={"schema_version":1,"sources":{str(p.relative_to(ROOT)):sha(p) for p in source_files},
 "inventory":{"analogue_rows":len(rows),"coto_rows":len(crows),"systems":inventory,
  "family_identities":{"SAT":sorted({r["components"]["SAT"] for r in rows})+["n-dodecane (Coto)"],
   "MONO":sorted({r["components"]["MONO"] for r in rows})+["p-xylene (Coto)","toluene (Coto)"],
   "DI":["1-methylnaphthalene (Coto only, 298.15 K)"],"POLY":["pyrene (Coto only, 298.15 K)"],
   "NMP":["N-methyl-2-pyrrolidone"]},
  "graph":{"nodes":nodes,"edges":[list(x) for x in edges],"connected_components":comps,"system_count":len(systems)}},
 "observed_equilibrium_constraints":groups,"coto":cdiag,"nested_direct_constraint_tests":tests,
 "in_locus_interpolation_benchmark":lower,
 "qualified_model_evidence":{"A_NRTL_family_global":{"train_rmsd":nrtl["metrics"]["train"]["composition_rmsd_mean"],
   "holdout_rmsd":nrtl["metrics"]["holdout"]["composition_rmsd_mean"],"holdout_topology_recall":nrtl["metrics"]["holdout"]["two_phase_recall"],
   "solver_audit":json.loads(NSOL.read_text())["overallStatus"]},
  "B_UNIQUAC_row_rq_family_interactions":{"train_rmsd":uni["metrics"]["train"]["mean_tie_line_rmsd"],
   "holdout_rmsd":uni["metrics"]["holdout"]["mean_tie_line_rmsd"],"holdout_topology_recall":uni["metrics"]["holdout"]["topology_recall"],
   "condition_number":uni["fit"]["diagnostics"]["measurement_only_jacobian"]["condition_number"],
   "practically_weak_directions":uni["fit"]["diagnostics"]["measurement_only_jacobian"]["practically_weak_directions"],
   "solver_audit":json.loads(USOL.read_text())["overallStatus"]}},
 "controlled_same_equation_uniquac":controlled_summary,
 "interpretation":{"target_rmsd":0.03,"direct_tests_are_not_flash_models":True,
  "in_locus_interpolation_is_not_a_representation_lower_bound":True}}
(OUT/"results.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
extra={n:sha(OUT/n) for n in ("report.md","audit.json") if (OUT/n).exists()}
(OUT/"provenance-manifest.json").write_text(json.dumps({"generated":"deterministically; no clock or randomness",
 "inputs":result["sources"],"outputs":{"results.json":sha(OUT/"results.json"),**extra}},indent=2,sort_keys=True)+"\n")
print(json.dumps({"systems":len(systems),"rows":len(rows),"lower_bound":lower,"outputs":str(OUT)},indent=2))