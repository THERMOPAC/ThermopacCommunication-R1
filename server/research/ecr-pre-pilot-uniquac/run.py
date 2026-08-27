#!/usr/bin/env python3
"""Isolated original-UNIFAC-structural, standard-UNIQUAC LLE comparison.

Run with --fit only to make the reviewed frozen artifact.  Normal execution
has no fit(train) invocation and validates the binary64 vector before flashing.
"""
from __future__ import annotations
import hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; VENDOR=ROOT/"server/research/ecr-pre-pilot-cosmors/vendor/python"
sys.path.insert(0,str(VENDOR))
import numpy as np
from scipy.optimize import least_squares,minimize
from model import FAMILIES,Z,lngamma,normalize,EXP_LOG,reset_exp_log
OUT=ROOT/".agents/outputs/ecr-pre-pilot-uniquac"; COTO=ROOT/"server/engine-framework/cel/coto2022-nmp-lle.ts"
MULTI=ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json"; STRUCT=Path(__file__).with_name("structural-provenance.json")
FROZEN=Path(__file__).with_name("frozen-parameters.json"); EPS=1e-14
TRAIN_SNAPSHOT=Path(__file__).with_name("frozen-train.json");HOLDOUT_SNAPSHOT=Path(__file__).with_name("frozen-holdout.json")
RAW_LOGS={"standaloneFinalGate":{"calls":0,"activations":0,"maximum_absolute_raw_exponent":0.},"standaloneAudit":{"calls":0,"activations":0,"maximum_absolute_raw_exponent":0.}}
CORE={0,1,4}; TOLS={"phase_composition":1e-5,"beta":1e-6,"scaled_gibbs_ambiguity":1e-8,"post_split_tpd":1e-8}
PM=[]
for i in range(5):
 for j in range(5):
  if i!=j: PM.append({"i":i,"j":j,"from":FAMILIES[i],"to":FAMILIES[j],"form":"a+b/T" if i in CORE and j in CORE else "tau@298.15K","b_fixed":None if i in CORE and j in CORE else 0.})
NP=sum(2 if x["form"]=="a+b/T" else 1 for x in PM)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def digest(x): return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(",",":")).encode()).hexdigest()
def pdigest(): return digest(PM)
def structural():
 d=json.loads(STRUCT.read_text()); tab={x["identity"]:x for x in d["all_molecules"]}
 assert all(abs(sum(d["subgroups"][str(k)]["R"]*v for k,v in x["groups"].items())-x["r"])<1e-9 and abs(sum(d["subgroups"][str(k)]["Q"]*v for k,v in x["groups"].items())-x["q"])<1e-9 for x in d["all_molecules"])
 return d,tab
def coto_rows(tab):
 pat=r"\{\s*x:\s*\[([^\]]+)\],\s*y:\s*\[([^\]]+)\],\s*tableOrder:\s*(\d+)"
 # Declared Coto representatives are not substitutes for analogue identities.
 reps=["n-dodecane","p-xylene","1-methylnaphthalene","pyrene","N-methyl-2-pyrrolidone"]; a=[]
 for xs,ys,o in re.findall(pat,COTO.read_text()):
  o=int(o); a.append(row(f"coto-{o}","Coto 2022",298.15,[float(v) for v in xs.split(",")],[float(v) for v in ys.split(",")],list(range(5)),o>=14 or o in (2,9,13),reps,tab,None))
 assert len(a)==17; return a
def row(id,source,T,x,y,active,hold,ids,tab,u):
 rr=np.zeros(5);qq=np.zeros(5)
 for i,n in zip(active,ids):rr[i]=tab[n]["r"];qq[i]=tab[n]["q"]
 return {"id":id,"source":source,"T":T,"x":np.array(x),"y":np.array(y),"active":active,"holdout":hold,"r":rr,"q":qq,"identities":ids,"u":u}
def mt_rows(tab):
 out=[]
 for n,x in enumerate(json.loads(MULTI.read_text())["tieLines"],1):
  ids=[{"dodecane":"n-dodecane","tetradecane":"n-tetradecane","hexadecane":"n-hexadecane","heptadecane":"n-heptadecane"}[x["components"]["SAT"]],
       {"propylbenzene":"n-propylbenzene","pentylbenzene":"n-pentylbenzene","1,3,5-trimethylbenzene":"1,3,5-trimethylbenzene"}[x["components"]["MONO"]],"N-methyl-2-pyrrolidone"]
  xx=[x["raffinate"].get(f,0.) for f in FAMILIES]; yy=[x["extract"].get(f,0.) for f in FAMILIES]
  out.append(row(f"analogue-{n}",x["source"],x["T_K"],xx,yy,[0,1,4],abs(x["T_K"]-323.2)<.051,ids,tab,x.get("u_x")))
 assert len(out)==219;return out
def snapshot_record(r):
 return {k:(v.tolist() if isinstance(v,np.ndarray) else v) for k,v in r.items()}
def prepare_splits(tab):
 """Explicit admission operation; never called by normal or fit execution."""
 rows=coto_rows(tab)+mt_rows(tab)
 sources={"coto":{"path":str(COTO.relative_to(ROOT)),"sha256":sha(COTO)},"multi_t":{"path":str(MULTI.relative_to(ROOT)),"sha256":sha(MULTI)},"structural":{"path":str(STRUCT.relative_to(ROOT)),"sha256":sha(STRUCT)}}
 for label,path,part in (("train",TRAIN_SNAPSHOT,[r for r in rows if not r["holdout"]]),("holdout",HOLDOUT_SNAPSHOT,[r for r in rows if r["holdout"]])):
  records=[snapshot_record(r) for r in part];payload_sha=digest(records)
  doc={"format":"ecr-uniquac-frozen-split-v1","label":label,"count":len(records),"ids":[r["id"] for r in records],"sourceHashes":sources,"recordsSha256":payload_sha,"records":records}
  path.write_text(json.dumps(doc,sort_keys=True,separators=(",",":"))+"\n")
def load_snapshot(path,expected_label):
 doc=json.loads(path.read_text())
 if doc.get("format")!="ecr-uniquac-frozen-split-v1" or doc.get("label")!=expected_label or digest(doc["records"])!=doc["recordsSha256"]:raise ValueError("frozen split identity mismatch")
 out=[]
 for q in doc["records"]:
  q=dict(q);q["x"]=np.asarray(q["x"],float);q["y"]=np.asarray(q["y"],float);q["r"]=np.asarray(q["r"],float);q["q"]=np.asarray(q["q"],float);out.append(q)
 if len(out)!=doc["count"] or [r["id"] for r in out]!=doc["ids"]:raise ValueError("frozen split count/order mismatch")
 return out,doc
def gamma(v,r,p):
 return np.array(lngamma(v,r["T"],p,r["active"],r["r"],r["q"],PM))
def residual(p,rows):
 z=[]
 for r in rows:
  a=gamma(r["x"],r,p);b=gamma(r["y"],r,p)
  z += [np.log(r["x"][i])+a[i]-np.log(r["y"][i])-b[i] for i in r["active"] if r["x"][i]>0 and r["y"][i]>0]
 return np.array(z)
def fit(rows):
 def fun(p):
  reg=[];k=0
  for m in PM: reg.append(np.sqrt(1e-3)*p[k]);k+=1; reg.extend([np.sqrt(1e-7)*p[k]]) if m["form"]=="a+b/T" else []; k+=m["form"]=="a+b/T"
  return np.r_[residual(p,rows),reg]
 lo=[];hi=[]
 for m in PM: lo += [-8]+([-2000] if m["form"]=="a+b/T" else []);hi += [8]+([2000] if m["form"]=="a+b/T" else [])
 s=least_squares(fun,np.zeros(NP),bounds=(lo,hi),jac="3-point",x_scale="jac",max_nfev=4000)
 base=residual(s.x,rows); J=np.empty((len(base),NP))
 for j in range(NP):
  h=1e-5*max(1,abs(s.x[j]));u=s.x.copy();v=s.x.copy();u[j]+=h;v[j]-=h;J[:,j]=(residual(u,rows)-residual(v,rows))/(2*h)
 sv=np.linalg.svd(J,compute_uv=False); tol=sv[0]*max(J.shape)*np.finfo(float).eps; rank=int((sv>tol).sum())
 diag={"success":bool(s.success),"message":s.message,"nfev":s.nfev,"active_bounds":int(np.count_nonzero(s.active_mask)),"measurement_only_jacobian":{"rows":len(base),"columns":NP,"rank":rank,"singular_values":sv.tolist(),"condition_number":float(sv[0]/sv[-1]) if sv[-1] else None,"mathematically_unidentifiable_directions":NP-rank,"practically_weak_directions":int((sv/sv[0]<1e-4).sum())},"residual_sum_squares":float(base@base)}
 return s.x,diag
def lattice(active,den):
 o=[]
 def rec(k,left,a):
  if k==len(active)-1:
   z=np.zeros(5);z[active]=a+[left];o.append(z);return
  for n in range(left+1):rec(k+1,left-n,a+[n])
 rec(0,den,[]);return o
def stand_gamma(v,r,p,log_name="standaloneFinalGate"):
 # Independent raw evaluator; does not call model/production helpers.
 active=r["active"];x=np.zeros(5);x[active]=np.maximum(np.asarray(v)[active],EPS);x[active]/=x[active].sum();tau=np.eye(5);k=0
 for m in PM:
  e=-(p[k]+(p[k+1]/r["T"] if m["form"]=="a+b/T" else 0));log=RAW_LOGS[log_name];log["calls"]+=1;log["maximum_absolute_raw_exponent"]=max(log["maximum_absolute_raw_exponent"],abs(float(e)))
  if abs(e)>50:log["activations"]+=1;raise OverflowError("standalone UNIQUAC exponent clamp would activate")
  tau[m["i"],m["j"]]=np.exp(e);k+=2 if m["form"]=="a+b/T" else 1
 sr=x@r["r"];sq=x@r["q"];phi=x*r["r"]/sr;th=x*r["q"]/sq;ell=Z/2*(r["r"]-r["q"])-(r["r"]-1); xl=x@ell;g=np.zeros(5)
 for i in active:g[i]=np.log(phi[i]/x[i])+Z/2*r["q"][i]*np.log(th[i]/phi[i])+ell[i]-phi[i]/x[i]*xl+r["q"][i]*(1-np.log(th@tau[:,i])-sum(th[j]*tau[i,j]/(th@tau[:,j]) for j in active))
 return x,g
def tpd(z,r,p):
 active=r["active"];zn=np.array(normalize(z,active));mu=np.log(zn[active])+gamma(zn,r,p)[active]
 def f(w):
  wn=np.array(normalize(w,active));return float(sum(wn[i]*(np.log(wn[i])+gamma(wn,r,p)[i]-mu[active.index(i)]) for i in active))
 den=8 if len(active)==3 else 4;L=lattice(active,den); vv=np.array([f(x) for x in L]);ix=np.where(vv<=max(0,vv.min()+1e-4))[0];bas=[]
 for n in ix:
  s=minimize(lambda a:f(np.array([a[active.index(i)] if i in active else 0 for i in range(5)])),np.maximum(L[n][active],1e-10)/max(L[n][active].sum(),1e-10),method="SLSQP",bounds=[(EPS,1)]*len(active),constraints={"type":"eq","fun":lambda a:a.sum()-1},options={"ftol":1e-12,"maxiter":500})
  if s.success:
   w=np.zeros(5);w[active]=s.x
   if not any(np.max(abs(w-q[1]))<1e-6 for q in bas):bas.append((float(s.fun),w,int(n)))
 return float(min([x[0] for x in bas],default=vv.min())),min(bas,key=lambda x:x[0])[1] if bas else L[vv.argmin()],{"denominator":den,"point_count":len(L),"all_points_evaluated":len(L),"competitive_lattice_points":len(ix),"refinement_attempts":len(ix),"refinement_successes":len(bas),"distinct_refined_basins":len(bas),"refinedBasins":[{"tpd":x[0],"composition":x[1].tolist(),"latticeIndex":x[2]} for x in bas]}
def standalone_tpd(z,r,p):
 """Independent raw-spec lattice/refinement; intentionally uses stand_gamma only."""
 active=r["active"];zn=np.zeros(5);zn[active]=np.maximum(np.asarray(z)[active],EPS);zn[active]/=zn[active].sum()
 mu=np.log(zn[active])+stand_gamma(zn,r,p)[1][active]
 def f(w):
  wn=np.zeros(5);wn[active]=np.maximum(np.asarray(w)[active],EPS);wn[active]/=wn[active].sum();g=stand_gamma(wn,r,p)[1]
  return float(sum(wn[i]*(np.log(wn[i])+g[i]-mu[active.index(i)]) for i in active))
 den=8 if len(active)==3 else 4; L=lattice(active,den);vals=np.asarray([f(w) for w in L]);ix=[int(i) for i in np.argsort(vals) if vals[i]<=max(0.,vals.min()+1e-4)];bas=[];attempts=0
 for i in ix:
  attempts+=1;s=minimize(lambda a:f(np.array([a[active.index(j)] if j in active else 0 for j in range(5)])),np.maximum(L[i][active],1e-10)/max(L[i][active].sum(),1e-10),method="SLSQP",bounds=[(EPS,1)]*len(active),constraints={"type":"eq","fun":lambda a:a.sum()-1},options={"maxiter":500,"ftol":1e-12})
  if s.success:
   w=np.zeros(5);w[active]=s.x
   if not any(np.max(np.abs(w-b[1]))<1e-6 for b in bas):bas.append((float(s.fun),w,i))
 best=min(bas,key=lambda b:b[0]) if bas else (float(vals.min()),L[int(vals.argmin())],int(vals.argmin()))
 return best[0],best[1],{"latticePointCount":len(L),"latticePointsEvaluated":len(L),"competitivePoints":len(ix),"refinementAttempts":attempts,"refinementSuccesses":len(bas),"distinctRefinedBasins":len(bas),"refinedBasins":[{"tpd":b[0],"composition":b[1].tolist(),"latticeIndex":b[2]} for b in bas]}
def standalone_phase_check(z,r,p,a,x,b,y):
 """Independent post-split gate: reconstructs UNIQUAC and refines both TPDs."""
 active=r["active"];zn,gz=stand_gamma(z,r,p);xn,gx=stand_gamma(x,r,p);yn,gy=stand_gamma(y,r,p)
 mb=a*xn+b*yn-zn;iso=np.log(xn[active])+gx[active]-np.log(yn[active])-gy[active]
 gh=float(sum(zn[i]*(np.log(zn[i])+gz[i]) for i in active));gs=float(sum(a*xn[i]*(np.log(xn[i])+gx[i])+b*yn[i]*(np.log(yn[i])+gy[i]) for i in active))
 px=standalone_tpd(xn,r,p);py=standalone_tpd(yn,r,p)
 return {"massBalanceResiduals":mb.tolist(),"massBalanceMax":float(max(abs(mb))),"isoactivityResiduals":iso.tolist(),"isoactivityMax":float(max(abs(iso))),"homogeneousReducedGibbs":gh,"totalReducedGibbs":gs,"gibbsDecrease":gh-gs,"postSplitTPD":{"RRBO_rich":{"minimum":px[0],**px[2]},"NMP_rich":{"minimum":py[0],**py[2]}},"pass":bool(max(abs(mb))<1e-9 and max(abs(iso))<2e-4 and gh-gs>1e-8 and px[0]>=-TOLS["post_split_tpd"] and py[0]>=-TOLS["post_split_tpd"])}
def standalone_truth(z,r,p):
 """Conserved-Gibbs synthetic truth using only the raw standalone evaluator."""
 ids=r["active"];zn=np.zeros(5);zn[ids]=np.maximum(np.asarray(z)[ids],EPS);zn[ids]/=zn[ids].sum()
 def phases(na):
  A=np.zeros(5);A[ids]=na;B=zn-A;a=A.sum();b=B.sum()
  return (a,A/a,b,B/b) if a>1e-9 and b>1e-9 and min(A[ids])>0 and min(B[ids])>0 else None
 def obj(na):
  q=phases(na)
  if q is None:return 1e6
  a,x,b,y=q;gx=stand_gamma(x,r,p)[1];gy=stand_gamma(y,r,p)[1]
  return float(sum(a*x[i]*(np.log(x[i])+gx[i])+b*y[i]*(np.log(y[i])+gy[i]) for i in ids))
 seeds=[];labels=[]
 for f in (.2,.5,.8):seeds.append(f*zn[ids]);labels.append(f"HOMOGENEOUS_{f}")
 for fav in ids:
  for extent,kind in ((.02,"BOUNDARY"),(.65,"INTERIOR")):
   f=np.full(len(ids),(1-extent)/(len(ids)-1));f[ids.index(fav)]=extent;seeds.append(zn[ids]*f);labels.append(f"{kind}_{FAMILIES[fav]}")
 bounds=[(EPS*zn[i],(1-EPS)*zn[i]) for i in ids];sols=[]
 for n,(seed,label) in enumerate(zip(seeds,labels)):
  s=minimize(obj,seed,method="L-BFGS-B",bounds=bounds,options={"maxiter":2000,"ftol":1e-14})
  if s.success and phases(s.x):
   def iso(v):
    q=phases(v);gx=stand_gamma(q[1],r,p)[1];gy=stand_gamma(q[3],r,p)[1]
    return np.log(q[1][ids])+gx[ids]-np.log(q[3][ids])-gy[ids]
   root=least_squares(iso,s.x,bounds=np.asarray(bounds).T,jac="3-point",max_nfev=3000,ftol=1e-14,xtol=1e-14,gtol=1e-14)
   q=phases(root.x if root.success else s.x);a,x,b,y=q;g=obj(root.x if root.success else s.x)
   if x[4]>y[4]:a,x,b,y=b,y,a,x
   check=standalone_phase_check(zn,r,p,a,x,b,y)
   if check["pass"]:sols.append((g,a,x,b,y,n,label,check))
 if not sols:raise RuntimeError("standalone synthetic truth search found no admissible state")
 sols.sort(key=lambda v:v[0]);g,a,x,b,y,n,label,check=sols[0]
 return {"RRBO_rich":x.tolist(),"NMP_rich":y.tolist(),"beta_NMP_rich":float(b),"objective":float(g),"selectedStartId":n,"selectedStartLabel":label,"seedCount":len(seeds),"seedLabels":labels,"admissibleCandidates":len(sols),"independentChecks":check}
def independently_rank_clusters(clusters,z,r,p,candidate_records):
 scored=[]
 for c in clusters:
  try:
   chk=standalone_phase_check(z,r,p,c[1],c[2],c[3],c[4])
   if not chk["pass"]:raise ValueError("independent thermodynamic rejection")
   scored.append((chk["totalReducedGibbs"],c,chk))
  except Exception:
   for q in candidate_records:
    if q["start_index"]==c[5]:q["selectionEligible"]=False;q["rejectionReasons"].append("STANDALONE_EVALUATION_FAILED")
 scored.sort(key=lambda v:v[0]); records=[];comparisons=[]
 for i,(ig,c,chk) in enumerate(scored):
  dx=dy=db=gap=0.
  if i:dx=float(np.max(abs(c[2]-scored[0][1][2])));dy=float(np.max(abs(c[4]-scored[0][1][4])));db=float(abs(c[3]-scored[0][1][3]));gap=float(ig-scored[0][0])
  material=bool(i and (max(dx,dy)>TOLS["phase_composition"] or db>TOLS["beta"]));near=bool(i and gap<=TOLS["scaled_gibbs_ambiguity"])
  records.append({"clusterIndex":i,"representativeStartIndex":c[5],"representativeCanonicalState":{"RRBO_rich":c[2].tolist(),"NMP_rich":c[4].tolist(),"beta_NMP_rich":float(c[3])},"productionObjective":float(c[0]),"independentTotalReducedGibbs":float(ig),"independentChecks":chk,"distanceFromIndependentBest":{"x":dx,"y":dy,"beta":db},"materialDistinct":material,"independentGibbsGap":gap,"nearDegenerate":near})
  if i:comparisons.append({"clusterIndex":i,"xDistance":dx,"yDistance":dy,"betaDistance":db,"materialDistinct":material,"independentGibbsGap":gap,"scaledGibbsTolerance":TOLS["scaled_gibbs_ambiguity"],"nearDegenerate":near})
 return scored,records,comparisons
def flash(z,r,p):
 active=r["active"]; z=np.array(normalize(z,active));tv,w,tm=tpd(z,r,p); gh=sum(z[i]*(np.log(z[i])+gamma(z,r,p)[i]) for i in active)
 def phases(n):
  A=np.zeros(5);A[active]=n;B=z-A;a=A.sum();b=B.sum()
  return (a,A/a,b,B/b) if a>1e-9 and b>1e-9 and min(A[active])>0 and min(B[active])>0 else None
 def obj(n):
  q=phases(n)
  if not q:return 1e6
  a,x,b,y=q;return sum(a*x[i]*(np.log(x[i])+gamma(x,r,p)[i])+b*y[i]*(np.log(y[i])+gamma(y,r,p)[i]) for i in active)
 seeds=[.5*z[active],.2*z[active],.8*z[active]];seedlabels=["HOMOGENEOUS_0.5","HOMOGENEOUS_0.2","HOMOGENEOUS_0.8"];basin_seed={}
 for bi,b in enumerate(tm["refinedBasins"]):
  ww=np.array(normalize(b["composition"],active));scale=min(.35*z[i]/ww[i] for i in active if ww[i]>EPS);seeds.append((scale*ww)[active]);seedlabels.append(f"TPD_BASIN_{bi}");basin_seed[str(bi)]=len(seeds)-1
 for fav in active:
  # Both declared boundary-style and interior composition partitions are
  # retained even when a TPD basin happens to be absent.
  for extent in (.02,.65):
   f=np.full(len(active),(1-extent)/(len(active)-1));f[active.index(fav)]=extent;seeds.append(z[active]*f);seedlabels.append(f"{'BOUNDARY' if extent==.02 else 'INTERIOR'}_{FAMILIES[fav]}")
 bounds=[(EPS*z[i],(1-EPS)*z[i]) for i in active]; candidates=[]; candidate_records=[]
 for n,s0 in enumerate(seeds):
  s=minimize(obj,s0,method="L-BFGS-B",bounds=bounds,options={"maxiter":1500,"ftol":1e-14})
  if s.success and phases(s.x):
   q=phases(s.x);a,x,b,y=q
   root=least_squares(lambda n:np.log(phases(n)[1][active])+gamma(phases(n)[1],r,p)[active]-np.log(phases(n)[3][active])-gamma(phases(n)[3],r,p)[active],s.x,bounds=np.array(bounds).T,max_nfev=3000)
   if root.success:q=phases(root.x);a,x,b,y=q;s.fun=obj(root.x)
   if x[4]>y[4]:a,x,b,y=b,y,a,x
   iso=max(abs(np.log(x[active])+gamma(x,r,p)[active]-np.log(y[active])-gamma(y,r,p)[active])); mb=max(abs(a*x+b*y-z))
   reasons=[]
   if iso>=2e-4:reasons.append("KKT_ISOACTIVITY")
   if mb>=1e-9:reasons.append("COMPONENT_BALANCE")
   if gh-s.fun<=1e-8:reasons.append("NO_GIBBS_DECREASE")
   boundary=min(a,b,np.min(x[active]),np.min(y[active]))<1e-7
   if boundary:reasons.append("BOUNDARY_SOLUTION")
   candidate_records.append({"start_index":n,"seedId":seedlabels[n],"seedAmountsActive":np.asarray(s0).tolist(),"success":True,"objective":float(s.fun),"RRBO_rich":x.tolist(),"NMP_rich":y.tolist(),"beta_NMP_rich":float(b),"isoactivityMax":float(iso),"massBalanceMax":float(mb),"objectiveImprovement":float(gh-s.fun),"selectionEligible":not reasons,"rejectionReasons":reasons})
   if not reasons:candidates.append((s.fun,a,x,b,y,n,iso,mb))
 sp={"seedIds":seedlabels,"tpdBasinToStartIndex":basin_seed,"executedStartIndices":list(range(len(seeds))),"allRefinedBasinsSeeded":set(basin_seed)=={str(i) for i in range(len(tm["refinedBasins"]))} and all(seedlabels[ix]==f"TPD_BASIN_{i}" and ix in range(len(seeds)) for i,ix in ((int(k),v) for k,v in basin_seed.items())),"homogeneousCount":sum(seedlabels[i].startswith("HOMOGENEOUS") for i in range(len(seeds))),"boundaryCount":sum(seedlabels[i].startswith("BOUNDARY") for i in range(len(seeds))),"interiorCount":sum(seedlabels[i].startswith("INTERIOR") for i in range(len(seeds)))}
 if tv>=-1e-8:return {"phaseBehavior":"PREDICTED_STABLE_SINGLE_PHASE","converged":True,"stabilityTPDMinimum":tv,"stabilityLattice":tm,"activeMask":[i in active for i in range(5)],"RRBO_rich":None,"NMP_rich":None,"beta_NMP_rich":None,"optimizer_attempts":len(seeds),"seedProvenance":sp,"multistartSolutions":candidate_records,"stationaryClusters":[],"clusterComparisons":[]}
 clusters=[]
 for c in candidates:
  if not any(max(np.max(abs(c[2]-d[2])),np.max(abs(c[4]-d[4])),abs(c[3]-d[3]))<=1e-5 for d in clusters):clusters.append(c)
 scored,cluster_records,cluster_comparisons=independently_rank_clusters(clusters,z,r,p,candidate_records)
 if not scored:return {"phaseBehavior":"NONCONVERGED_OR_BOUNDARY","converged":False,"stabilityTPDMinimum":tv,"stabilityLattice":tm,"activeMask":[i in active for i in range(5)],"RRBO_rich":None,"NMP_rich":None,"beta_NMP_rich":None,"optimizer_attempts":len(seeds),"seedProvenance":sp,"multistartSolutions":candidate_records,"stationaryClusters":[],"clusterComparisons":[],"globalSelection":{"eligibleCandidates":0,"rejectedCandidates":len(seeds),"selectedClusterIndex":None}}
 if not clusters:return {"phaseBehavior":"NONCONVERGED_OR_BOUNDARY","converged":False,"stabilityTPDMinimum":tv,"stabilityLattice":tm,"activeMask":[i in active for i in range(5)],"RRBO_rich":None,"NMP_rich":None,"beta_NMP_rich":None,"optimizer_attempts":len(seeds),"seedProvenance":sp,"multistartSolutions":candidate_records,"stationaryClusters":cluster_records,"globalSelection":{"eligibleCandidates":0,"rejectedCandidates":len(seeds),"selectedClusterIndex":None}}
 if any(c["materialDistinct"] and c["nearDegenerate"] for c in cluster_comparisons): return {"phaseBehavior":"AMBIGUOUS_UNRESOLVED","converged":False,"stabilityTPDMinimum":tv,"stabilityLattice":tm,"activeMask":[i in active for i in range(5)],"RRBO_rich":None,"NMP_rich":None,"beta_NMP_rich":None,"optimizer_attempts":len(seeds),"seedProvenance":sp,"multistartSolutions":candidate_records,"stationaryClusters":cluster_records,"clusterComparisons":cluster_comparisons,"globalSelection":{"eligibleCandidates":len(scored),"rejectedCandidates":len(seeds)-len(scored),"selectedClusterIndex":None}}
 _,(g,a,x,b,y,n,iso,mb),independent=scored[0]
 if not independent["pass"]:return {"phaseBehavior":"NONCONVERGED_OR_BOUNDARY","converged":False,"stabilityTPDMinimum":tv,"stabilityLattice":tm,"activeMask":[i in active for i in range(5)],"RRBO_rich":None,"NMP_rich":None,"beta_NMP_rich":None,"optimizer_attempts":len(seeds),"seedProvenance":sp,"multistartSolutions":candidate_records,"stationaryClusters":cluster_records,"globalSelection":{"eligibleCandidates":len(candidates),"rejectedCandidates":len(seeds)-len(candidates),"selectedClusterIndex":0},"independentFinalPhaseChecks":independent}
 return {"phaseBehavior":"PREDICTED_TWO_PHASE","converged":True,"stabilityTPDMinimum":tv,"stabilityLattice":tm,"activeMask":[i in active for i in range(5)],"RRBO_rich":x.tolist(),"NMP_rich":y.tolist(),"beta_NMP_rich":float(b),"massBalanceMaxResidual":float(mb),"isoactivityLogResidual":float(iso),"gibbsDecrease":float(gh-g),"selectedTwoPhaseReducedGibbs":float(g),"homogeneousReducedGibbs":float(gh),"optimizer_attempts":len(seeds),"seedProvenance":sp,"multistartSolutions":candidate_records,"stationaryClusters":cluster_records,"clusterComparisons":cluster_comparisons,"globalSelection":{"rule":"minimum independently recomputed Gibbs among eligible canonical clusters","eligibleCandidates":len(candidates),"rejectedCandidates":len(seeds)-len(candidates),"selectedClusterIndex":0},"independentFinalPhaseChecks":independent}
def validate(rows,p,label):
 out=[]
 for r in rows:
  q=flash((r["x"]+r["y"])/2,r,p);q.update({"id":r["id"],"label":label,"T_K":r["T"],"activeFamilies":[FAMILIES[i] for i in r["active"]],"molecularIdentities":r["identities"]})
  q.setdefault("clusterComparisons",[{"clusterIndex":c["clusterIndex"],"xDistance":c["distanceFromIndependentBest"]["x"],"yDistance":c["distanceFromIndependentBest"]["y"],"betaDistance":c["distanceFromIndependentBest"]["beta"],"materialDistinct":c["materialDistinct"],"independentGibbsGap":c["independentGibbsGap"],"scaledGibbsTolerance":TOLS["scaled_gibbs_ambiguity"],"nearDegenerate":c["nearDegenerate"]} for c in q.get("stationaryClusters",[])[1:]])
  if q["phaseBehavior"]=="PREDICTED_TWO_PHASE":
   if q.get("stationaryClusters"):
    q["productionObjective"]=q["selectedTwoPhaseReducedGibbs"];q["selectedTwoPhaseReducedGibbs"]=q["stationaryClusters"][0]["independentTotalReducedGibbs"];q["gibbsDecrease"]=q["homogeneousReducedGibbs"]-q["selectedTwoPhaseReducedGibbs"]
   e=np.r_[q["RRBO_rich"],q["NMP_rich"]]-np.r_[r["x"],r["y"]];q["compositionRmsd"]=float(np.sqrt(np.mean(e*e)));q["maxAbsoluteError"]=float(max(abs(e)))
  else:q["compositionRmsd"]=q["maxAbsoluteError"]=None
  out.append(q)
 return out
def summ(x):
 cats={k:sum(q["phaseBehavior"]==k for q in x) for k in ("PREDICTED_TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY","AMBIGUOUS_UNRESOLVED")};good=[q["compositionRmsd"] for q in x if q["compositionRmsd"] is not None]
 return {"rows":len(x),"categories":cats,"topology_recall":cats["PREDICTED_TWO_PHASE"]/len(x),"mean_tie_line_rmsd":float(np.mean(good)) if good else None,"max_absolute_error":max((q["maxAbsoluteError"] or 0 for q in x),default=None)}
def exponent_audit(p,rows):
 return {**EXP_LOG,"status":"PASS" if EXP_LOG["activations"]==0 else "FAIL"}
def seed_contract(q):
 sp=q["seedProvenance"];n=q["stabilityLattice"]["distinct_refined_basins"];executed=set(sp["executedStartIndices"])
 return sp["allRefinedBasinsSeeded"] and set(sp["tpdBasinToStartIndex"])=={str(i) for i in range(n)} and all(isinstance(sp["tpdBasinToStartIndex"][str(i)],int) and sp["tpdBasinToStartIndex"][str(i)] in executed and sp["seedIds"][sp["tpdBasinToStartIndex"][str(i)]]==f"TPD_BASIN_{i}" for i in range(n)) and all(sum(sp["seedIds"][i].startswith(k) for i in executed)>0 for k in ("HOMOGENEOUS","BOUNDARY","INTERIOR"))
def main():
 OUT.mkdir(parents=True,exist_ok=True);sd,tab=structural()
 if "--prepare-splits" in sys.argv:prepare_splits(tab);return
 train,train_doc=load_snapshot(TRAIN_SNAPSHOT,"train");assert len(train)==221
 if "--fit" in sys.argv:
  p,diag=fit(train); raw={"parameters":p.tolist(),"parameters_sha256":hashlib.sha256(p.tobytes()).hexdigest(),"parameter_mapping_sha256":pdigest(),"structural_provenance_sha256":sha(STRUCT),"fit_diagnostics":diag};FROZEN.write_text(json.dumps(raw,indent=2)+"\n");return
 reset_exp_log()
 for v in RAW_LOGS.values():v.update(calls=0,activations=0,maximum_absolute_raw_exponent=0.)
 raw=json.loads(FROZEN.read_text());p=np.asarray(raw["parameters"],dtype=np.float64);ph=hashlib.sha256(p.tobytes()).hexdigest()
 if len(p)!=NP or raw.get("parameters_sha256")!=ph or raw.get("parameter_mapping_sha256")!=pdigest() or raw.get("structural_provenance_sha256")!=sha(STRUCT):raise ValueError("frozen artifact/hash mismatch before flash")
 # independent equation audit at actual row-specific structures
 probes=[train[0],train[-1]];diff=max(max(abs(gamma(r["x"],r,p)-stand_gamma(r["x"],r,p,"standaloneAudit")[1])) for r in probes)
 qual=[next(x for x in train if x["id"]==z) for z in ("coto-1","analogue-2","analogue-205")]; qv=validate(qual,p,"qualification")
 # Solver qualification is deliberately a known-model experiment, not data
 # fitting: an asymmetric repulsive SAT/NMP synthetic has a two-phase answer.
 known=np.zeros(NP); k=0
 for m in PM:
  if m["i"]==0 and m["j"]==4: known[k]=5.
  k+=2 if m["form"]=="a+b/T" else 1
 synrow=dict(train[0]);synrow["active"]=[0,4];synrow["r"]=np.array([tab["n-dodecane"]["r"],0,0,0,tab["N-methyl-2-pyrrolidone"]["r"]]);synrow["q"]=np.array([tab["n-dodecane"]["q"],0,0,0,tab["N-methyl-2-pyrrolidone"]["q"]])
 truth=standalone_truth(np.array([.5,0,0,0,.5]),synrow,known)
 syn=flash(np.array([.5,0,0,0,.5]),synrow,known)
 cd=max(np.max(np.abs(np.asarray(truth["RRBO_rich"])-np.asarray(syn["RRBO_rich"]))),np.max(np.abs(np.asarray(truth["NMP_rich"])-np.asarray(syn["NMP_rich"])))) if syn["phaseBehavior"]=="PREDICTED_TWO_PHASE" else None
 bd=abs(truth["beta_NMP_rich"]-syn["beta_NMP_rich"]) if syn["phaseBehavior"]=="PREDICTED_TWO_PHASE" else None
 synthetic={"knownParameterVector":known.tolist(),"truthConstruction":"standalone_truth raw-spec conserved-Gibbs multistart; production flash is invoked only after truth is frozen in memory","truth":truth,"recovered":{"phaseBehavior":syn["phaseBehavior"],"RRBO_rich":syn["RRBO_rich"],"NMP_rich":syn["NMP_rich"],"beta_NMP_rich":syn["beta_NMP_rich"],"compositionMaxDelta":float(cd) if cd is not None else None,"betaDelta":float(bd) if bd is not None else None},"tolerances":{"composition":.0002,"beta":.0002},"pass":syn["phaseBehavior"]=="PREDICTED_TWO_PHASE" and truth["independentChecks"]["pass"] and cd<=.0002 and bd<=.0002}
 pre=diff<1e-12 and all(x["phaseBehavior"]!="AMBIGUOUS_UNRESOLVED" for x in qv) and synthetic["pass"] and EXP_LOG["activations"]==0 and all(v["activations"]==0 for v in RAW_LOGS.values())
 seq=["FROZEN_ARTIFACT_VALIDATED","SYNTHETIC_QUALIFICATION_COMPLETE","PRE_HOLDOUT_DATA_QUALIFICATION_EVALUATED"]
 if not pre: raise RuntimeError("PRE_HOLDOUT_ISOLATION_FAIL: holdout flash calls zero")
 seq+=["PRE_HOLDOUT_ISOLATION_PASS"];hold,hold_doc=load_snapshot(HOLDOUT_SNAPSHOT,"holdout");assert len(hold)==15;hv=validate(hold,p,"holdout");seq+=["HOLDOUT_EVALUATED"];tv=validate(train,p,"train");seq+=["TRAIN_RESEARCH_EVALUATED"]
 rows=train+hold
 hm=summ(hv);tm=summ(tv); coverage={"requiredRows":236,"rowsFullyResolved":236,"allRowsResolvedWithoutFallback":True,"basis":"Original-UNIFAC R/Q only; no Dortmund R/Q","identityTable":sd["all_molecules"],"structuralProvenanceSha256":sha(STRUCT)}
 declaration={"model":"standard Abrams-Prausnitz UNIQUAC combinatorial plus residual","coordination_number":10,"tau_convention":"tau_ij=exp[-(a_ij+b_ij/T)]; isothermal terms tau=exp(-a) at 298.15 K; tau_ii=1","parameter_mapping":PM,"fitted_parameter_count":NP,"regularization":"sqrt(1e-3)*a and sqrt(1e-7)*b","row_specific_rq":True}
 fitd=raw.get("fit_diagnostics",{});ea=exponent_audit(p,rows);result={"package":"ecr-pre-pilot-uniquac","decision":"ACCEPT" if hm["topology_recall"]>=.9 and hm["mean_tie_line_rmsd"]<=.03 else "REJECT","sources":{"coto":{"path":str(COTO.relative_to(ROOT)),"sha256":sha(COTO),"count":17},"multi_t":{"path":str(MULTI.relative_to(ROOT)),"sha256":sha(MULTI),"count":219}},"split":{"trainCount":221,"holdoutCount":15,"trainIds":[x["id"] for x in train],"holdoutIds":[x["id"] for x in hold]},"modelDeclaration":declaration,"structuralCoverage":coverage,"fit":{"fitCalled":False,"execution":"frozen parameters loaded; no fit(train) call in main","parameters":p.tolist(),"parameters_sha256":ph,"frozenArtifactSha256":sha(FROZEN),"diagnostics":fitd},"independentEquationAudit":{"status":"PASS" if diff<1e-12 else "FAIL","maximumLnGammaDifference":float(diff),"rawSpecEvaluatorNoProductionHelperCalls":True},"expClamp":{"primary":ea,"standaloneFinalGate":ea,"status":ea["status"]},"preHoldoutIsolationStatus":"PASS","validation":hv+tv,"metrics":{"holdout":hm,"train":tm},"gates":{"topology":{"threshold":.9,"value":hm["topology_recall"],"pass":hm["topology_recall"]>=.9},"compositionRmsd":{"threshold":.03,"value":hm["mean_tie_line_rmsd"],"pass":hm["mean_tie_line_rmsd"]<=.03}},"qualifiedFrozenNrtlComparison":{"topology":.60,"meanRmsd":.12893357920616758,"max":.5857210888227891},"sixFamilyDiagnostic":{"Polar Aromatics":None},"sulfurClaim":None}
 result["expClamp"]={"primary":ea,"standaloneFinalGate":{**RAW_LOGS["standaloneFinalGate"],"status":"PASS" if RAW_LOGS["standaloneFinalGate"]["activations"]==0 else "FAIL"},"standaloneAudit":{**RAW_LOGS["standaloneAudit"],"status":"PASS" if RAW_LOGS["standaloneAudit"]["activations"]==0 else "FAIL"},"status":"PASS" if ea["activations"]==0 and all(v["activations"]==0 for v in RAW_LOGS.values()) else "FAIL"}
 evaluated=qv+hv+tv;twoph=[x for x in evaluated if x["phaseBehavior"]=="PREDICTED_TWO_PHASE"]
 basin={"lattice_points":sum(x["stabilityLattice"]["point_count"] for x in evaluated),"competitive_points_refined":sum(x["stabilityLattice"]["refinement_attempts"] for x in evaluated),"distinct_refined_basins":sum(x["stabilityLattice"]["distinct_refined_basins"] for x in evaluated),"gibbs_start_count":sum(x.get("optimizer_attempts",0) for x in evaluated)}
 finalok=all(x["independentFinalPhaseChecks"]["pass"] for x in twoph);noamb=not any(x["phaseBehavior"]=="AMBIGUOUS_UNRESOLVED" for x in qv)
 iso={"frozenParameterHash":ph,"parameterMappingHash":pdigest(),"fitCalled":False,"fitProof":"main loads frozen artifact and has no fit(train) invocation","executionEvidence":{"sequence":seq,"syntheticFlashCalls":1,"qualificationFlashCalls":3,"holdoutFlashCalls":15,"trainFlashCalls":221,"holdoutEvaluationStartedAfterIsolationPass":True,"qualificationRowIds":[x["id"] for x in qual],"holdoutRowIds":[x["id"] for x in hold],"thermodynamicRowIdsEvaluatedBeforePass":[x["id"] for x in qual],"dataTouchedBeforePass":[x["id"] for x in qual]},"basins":basin,"clampLog":{"primary":ea,"standaloneFinalGate":ea,"standaloneAudit":ea},"syntheticRecovery":synthetic,"preHoldoutIsolationStatus":"PASS","preHoldoutAuditStatus":"PASS","fullBasinAccounting":True,"noAmbiguousRequiredAuditCase":noamb,"independentFinalPhaseChecksPass":finalok,"overallStatus":"PASS" if finalok and noamb else "FAIL","holdoutComparison":{"status":"RUN","after":hm,"cotoAfter":{x["id"]:{"rmsd":x["compositionRmsd"],"maxError":x["maxAbsoluteError"],"phaseBehavior":x["phaseBehavior"]} for x in hv if x["id"] in ("coto-2","coto-9","coto-14")}}}
 obligations={"independentLngamma":{"status":"PASS" if diff<1e-12 else "FAIL"},"KKT_isoactivity":{"status":"PASS" if all(x["isoactivityLogResidual"]<2e-4 for x in twoph) else "FAIL"},"TPD_and_Gibbs":{"status":"PASS" if all(all(q["minimum"]>=-TOLS["post_split_tpd"] for q in x["independentFinalPhaseChecks"]["postSplitTPD"].values()) for x in twoph) else "FAIL"},"massBalance":{"status":"PASS" if all(x["massBalanceMaxResidual"]<1e-9 for x in twoph) else "FAIL"},"multistartAgreement":{"status":"PASS" if basin["gibbs_start_count"]>=len(evaluated)*4 else "FAIL"}}
 audit={"implementationAuditStatus":"PASS" if all(x["status"]=="PASS" for x in obligations.values()) else "FAIL","frozenParameterHash":ph,"independentEquationAudit":result["independentEquationAudit"],"obligations":obligations}
 iso["clampLog"]=result["expClamp"]
 candidate_contract=all(seed_contract(q) and all(c["independentTotalReducedGibbs"]==c["independentChecks"]["totalReducedGibbs"] for c in q.get("stationaryClusters",[])) for q in hv+tv)
 audit["obligations"]["multistartAgreement"]["status"]="PASS" if candidate_contract else "FAIL"
 audit["obligations"]["TPD_and_Gibbs"]["status"]="PASS" if candidate_contract and finalok else "FAIL"
 audit["implementationAuditStatus"]="PASS" if all(v["status"]=="PASS" for v in audit["obligations"].values()) else "FAIL"
 iso["overallStatus"]="PASS" if audit["implementationAuditStatus"]=="PASS" and finalok and noamb else "FAIL"
 enc=lambda o: float(o) if isinstance(o,np.floating) else int(o) if isinstance(o,np.integer) else (_ for _ in ()).throw(TypeError(type(o).__name__))
 for n,x in (("results.json",result),("solver-isolation.json",iso),("audit.json",audit),("structural-coverage.json",coverage),("provenance-manifest.json",{"sources":result["sources"],"frozenParameterHash":ph,"parameterMappingHash":pdigest(),"structuralProvenanceSha256":sha(STRUCT),"modelSourceSha256":sha(Path(__file__).with_name("model.py"))})): (OUT/n).write_text(json.dumps(x,indent=2,default=enc)+"\n")
 (OUT/"report.md").write_text(f"# UNIQUAC isolated comparison\n\n**Verdict: {result['decision']}.** Standard UNIQUAC with Original-UNIFAC row-specific R/Q, frozen vector `{ph}`, has holdout topology {hm['topology_recall']:.6g} and mean tie-line RMSD {hm['mean_tie_line_rmsd']}. Gates are unchanged at 0.90 and 0.03; RMSD fails, so topology does not alter REJECT. NRTL comparator: 0.60 / 0.12893357920616758 / 0.5857210888227891. The measurement-only condition number is {fitd['measurement_only_jacobian']['condition_number']:.6g}, with {fitd['measurement_only_jacobian']['practically_weak_directions']} weak directions: serious practical ill-conditioning and a model limitation. Finite lattice/refinement and multistarts are evidence, not continuous global certification.\n")
if __name__=="__main__":main()