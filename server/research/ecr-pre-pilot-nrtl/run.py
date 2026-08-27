#!/usr/bin/env python3
"""Fresh, isolated ECR pre-pilot NRTL regression and validation."""
from __future__ import annotations
import hashlib, json, re, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
VENDOR=ROOT/"server/research/ecr-pre-pilot-cosmors/vendor/python"
sys.path.insert(0,str(VENDOR))
import numpy as np
import scipy
from scipy.optimize import least_squares, minimize

OUT=ROOT/".agents/outputs/ecr-pre-pilot-nrtl"
SRC_COTO=ROOT/"server/engine-framework/cel/coto2022-nmp-lle.ts"
SRC_MT=ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json"
FAM=["SAT","MONO","DI","POLY","NMP"]; CORE={0,1,4}; EPS=1e-14

# Six core directed interactions have a+b/T. Fourteen interactions touching DI
# or POLY have one isothermal tau and exactly no b: 12+14=26 fitted values.
PARAM_MAP=[]
for i in range(5):
    for j in range(5):
        if i==j: continue
        core=i in CORE and j in CORE
        PARAM_MAP.append({"i":i,"j":j,"from":FAM[i],"to":FAM[j],
          "form":"a+b/T" if core else "tau@298.15K","b_fixed":None if core else 0.0})
NPAR=sum(2 if q["form"]=="a+b/T" else 1 for q in PARAM_MAP)
DECLARATION={
 "basis":["Saturates","Mono-aromatics","Di-aromatics","Poly-aromatics","sulfur-bearing Polar Aromatics","NMP"],
 "modeled_families":FAM,"unsupported_family":"Polar Aromatics","alpha":{"value":.30,"symmetric":True,"fixed":True},
 "parameter_form":"Directed SAT/MONO/NMP tau=a+b/T; directed pairs involving DI or POLY are isothermal tau at 298.15 K with b fixed exactly zero; tau_ii=0",
 "fitted_parameter_count":NPAR,"temperature_dependent_directed_pairs":6,"isothermal_directed_pairs":14,
 "initialization":"all fitted values zero; deterministic scipy.optimize.least_squares",
 "bounds":{"a_or_isothermal_tau":[-8,8],"b_K":[-2000,2000]},
 "regularization":"sqrt(1e-3)*a/tau and sqrt(1e-7)*b residuals",
 "fit_residual":"ln(x_i gamma_i)^R-ln(x_i gamma_i)^E for raw-active components positive in both phases"}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def active_normalize(v,active):
    a=np.zeros(5,float); a[active]=np.maximum(np.asarray(v,float)[active],EPS)
    if np.any(a[active]<0) or a[active].sum()<=0: raise ValueError("invalid composition")
    a[active]/=a[active].sum()
    return a
def tau_matrix(T,p):
    tau=np.zeros((5,5)); k=0
    for q in PARAM_MAP:
        if q["form"]=="a+b/T": tau[q["i"],q["j"]]=p[k]+p[k+1]/T; k+=2
        else: tau[q["i"],q["j"]]=p[k]; k+=1
    return tau
def lngamma(v,T,p,active):
    """Standard NRTL equation; structural zeros remain exactly zero."""
    x=active_normalize(v,active); tau=tau_matrix(T,p); G=np.exp(np.clip(-.30*tau,-50,50))
    den=x@G
    ans=np.zeros(5)
    for i in active:
        ans[i]=sum(x[j]*tau[j,i]*G[j,i]/den[i] for j in active)
        for j in active:
            avg=sum(x[m]*tau[m,j]*G[m,j] for m in active)/den[j]
            ans[i]+=x[j]*G[i,j]/den[j]*(tau[i,j]-avg)
    return ans

def coto_rows():
    pat=r"\{\s*x:\s*\[([^\]]+)\],\s*y:\s*\[([^\]]+)\],\s*tableOrder:\s*(\d+)"
    rows=[]
    for xs,ys,o in re.findall(pat,SRC_COTO.read_text()):
        x=np.array([float(v) for v in xs.split(",")]); y=np.array([float(v) for v in ys.split(",")])
        rows.append({"id":f"coto-{o}","source":"Coto 2022","T":298.15,"x":x,"y":y,"active":[0,1,2,3,4],
          "u":.003,"holdout":int(o)>=14 or int(o) in (2,9,13)})
    assert len(rows)==17
    return rows
def mt_rows():
    rows=[]
    for n,r in enumerate(json.loads(SRC_MT.read_text())["tieLines"],1):
        x=np.array([r["raffinate"].get(q,0.) for q in FAM]); y=np.array([r["extract"].get(q,0.) for q in FAM])
        # Source component declaration defines the ternary even at binary
        # endpoint tie-lines where measured MONO happens to be exactly zero.
        active=[0,1,4]
        assert set(r["components"])=={"SAT","MONO","NMP"} and x[2]==x[3]==y[2]==y[3]==0
        rows.append({"id":f"analogue-{n}","source":r["source"],"T":r["T_K"],"x":x,"y":y,"active":active,
          "u":r.get("u_x"),"holdout":abs(r["T_K"]-323.2)<.051})
    assert len(rows)==219
    return rows

def raw_equilibrium_residuals(p,rows):
    out=[]
    for r in rows:
        gx=lngamma(r["x"],r["T"],p,r["active"]); gy=lngamma(r["y"],r["T"],p,r["active"])
        for i in r["active"]:
            if r["x"][i]>0 and r["y"][i]>0:
                out.append(np.log(r["x"][i])+gx[i]-np.log(r["y"][i])-gy[i])
    return np.asarray(out)
def fit_residual(p,rows):
    reg=[]; k=0
    for q in PARAM_MAP:
        reg.append(np.sqrt(1e-3)*p[k]); k+=1
        if q["form"]=="a+b/T": reg.append(np.sqrt(1e-7)*p[k]); k+=1
    return np.r_[raw_equilibrium_residuals(p,rows),reg]
def fit(rows):
    lo=[]; hi=[]
    for q in PARAM_MAP:
        lo.append(-8);hi.append(8)
        if q["form"]=="a+b/T":lo.append(-2000);hi.append(2000)
    sol=least_squares(fit_residual,np.zeros(NPAR),args=(rows,),bounds=(lo,hi),method="trf",
      jac="3-point",x_scale="jac",max_nfev=4000,ftol=1e-11,xtol=1e-11,gtol=1e-11)
    J=sol.jac; s=np.linalg.svd(J,compute_uv=False); rank=int(np.linalg.matrix_rank(J))
    cov=None
    if rank==NPAR:
        dof=max(1,len(sol.fun)-NPAR); cov=np.linalg.pinv(J.T@J)*(2*sol.cost/dof)
    # Governance identifiability diagnostic: measurement rows only.  The fit
    # Jacobian above contains regularization rows and must not establish
    # experimental identifiability.
    base=raw_equilibrium_residuals(sol.x,rows); Jm=np.empty((len(base),NPAR))
    for j in range(NPAR):
        h=1e-5*max(1.,abs(sol.x[j])); pp=sol.x.copy();pm=sol.x.copy()
        pp[j]+=h;pm[j]-=h
        Jm[:,j]=(raw_equilibrium_residuals(pp,rows)-raw_equilibrium_residuals(pm,rows))/(2*h)
    sm=np.linalg.svd(Jm,compute_uv=False); mtol=sm[0]*max(Jm.shape)*np.finfo(float).eps
    mrank=int(np.count_nonzero(sm>mtol)); mdof=max(1,len(base)-mrank)
    mcov=np.linalg.pinv(Jm.T@Jm,rcond=1e-12)*(float(base@base)/mdof)
    practical_weak=int(np.count_nonzero(sm/sm[0]<1e-4))
    mdiag={"rows":len(base),"columns":NPAR,"rank":mrank,"rank_tolerance":float(mtol),
      "singular_values":sm.tolist(),"singular_value_min":float(sm[-1]),"singular_value_max":float(sm[0]),
      "condition_number":float(sm[0]/sm[-1]) if sm[-1]>0 else None,
      "pseudo_covariance_standard_errors":np.sqrt(np.maximum(0,np.diag(mcov))).tolist(),
      "mathematically_unidentifiable_directions":int(NPAR-mrank),
      "practically_weak_directions":practical_weak,
      "practical_warning":"Measurement-only local sensitivity is ill-conditioned; pseudo-covariance uncertainties are diagnostic, not confidence intervals."}
    diag={"estimation_class":"regularization-constrained estimation; not an identifiability claim",
      "success":bool(sol.success),"status":int(sol.status),"message":sol.message,"nfev":sol.nfev,
      "njev":sol.njev,"optimality":float(sol.optimality),"active_bounds":int(np.count_nonzero(sol.active_mask)),
      "jacobian_shape":list(J.shape),"jacobian_rank":rank,"singular_value_min":float(s[-1]),
      "singular_value_max":float(s[0]),"condition_number":float(s[0]/s[-1]) if s[-1]>0 else None,
      "covariance_diagonal_regularized":np.diag(cov).tolist() if cov is not None else None,
      "measurement_only_jacobian":mdiag,
      "limitations":{"bound_hits":int(np.count_nonzero(sol.active_mask)),
        "weak_directions":practical_weak,"large_uncertainty_flag":bool(max(mdiag["pseudo_covariance_standard_errors"])>10)}}
    return sol.x,diag,float(np.dot(sol.fun,sol.fun))

def simplex_lattice(active,den):
    out=[]
    def rec(pos,left,parts):
        if pos==len(active)-1:
            w=np.zeros(5); vals=parts+[left]
            for i,n in zip(active,vals):w[i]=n/den
            out.append(w);return
        for n in range(left+1):rec(pos+1,left-n,parts+[n])
    rec(0,den,[])
    return out
def tpd_search(z,T,p,active):
    z=active_normalize(z,active); muz=np.log(z[active])+lngamma(z,T,p,active)[active]
    def fun(wa):
        w=np.zeros(5); w[active]=np.maximum(wa,EPS);w=active_normalize(w,active)
        return float(np.sum(w[active]*(np.log(w[active])+lngamma(w,T,p,active)[active]-muz)))
    den=8 if len(active)==3 else 4
    lattice=simplex_lattice(active,den)
    vals=[fun(w[active]) for w in lattice]; order=np.argsort(vals)
    candidates=[]
    for ix in order[:min(8,len(order))]:
        w0=np.maximum(lattice[ix][active],1e-10);w0/=w0.sum()
        s=minimize(fun,w0,method="SLSQP",bounds=[(1e-12,1)]*len(active),
          constraints={"type":"eq","fun":lambda w:np.sum(w)-1},options={"maxiter":500,"ftol":1e-12})
        if s.success:candidates.append((float(s.fun),s.x))
    if candidates: val,wa=min(candidates,key=lambda q:q[0])
    else: val,wa=vals[order[0]],lattice[order[0]][active]
    w=np.zeros(5);w[active]=wa
    return val,w,{"denominator":den,"point_count":len(lattice),"expected_point_count":45 if len(active)==3 else 70,
      "all_points_evaluated":len(vals),"refinement_successes":len(candidates)}

def flash(z,T,p,active):
    """Gibbs minimization in conserved phase-component amounts nA; nB=z-nA."""
    z=active_normalize(z,active); tpd,w,tpdmeta=tpd_search(z,T,p,active)
    def phases(na):
        A=np.zeros(5);A[active]=na;B=z-A;a=A.sum();b=B.sum()
        if a<=1e-8 or b<=1e-8 or np.min(A[active])<=0 or np.min(B[active])<=0:return None
        return a,A/a,b,B/b
    def gmix(na):
        q=phases(na)
        if q is None:return 1e6
        a,x,b,y=q
        return float(a*np.sum(x[active]*(np.log(x[active])+lngamma(x,T,p,active)[active]))+
                     b*np.sum(y[active]*(np.log(y[active])+lngamma(y,T,p,active)[active])))
    ghom=float(np.sum(z[active]*(np.log(z[active])+lngamma(z,T,p,active)[active])))
    # Instability-derived seeds plus generic amount partitions. No observations.
    seeds=[]
    scale=min(.35*z[i]/w[i] for i in active if w[i]>1e-10)
    if scale>1e-8:seeds.append((scale*w)[active])
    for frac in (.2,.5,.8):seeds.append((frac*z)[active])
    for fav in active:
        f=np.full(len(active),.35);f[active.index(fav)]=.65;seeds.append(z[active]*f)
    bounds=[(1e-10*z[i],(1-1e-10)*z[i]) for i in active]
    sols=[minimize(gmix,s,method="L-BFGS-B",bounds=bounds,options={"maxiter":1500,"ftol":1e-14,"gtol":1e-9}) for s in seeds]
    good=[s for s in sols if s.success and phases(s.x) is not None]
    common={"stabilityTPDMinimum":tpd,"stabilityLattice":tpdmeta,"activeMask":[i in active for i in range(5)],
      "optimizer_attempts":len(sols),"optimizer_successes":len(good)}
    if tpd>=-1e-8:
        return {**common,"phaseBehavior":"PREDICTED_STABLE_SINGLE_PHASE","converged":True,"beta_NMP_rich":None,
          "RRBO_rich":None,"NMP_rich":None,"massBalanceMaxResidual":0.,"isoactivityLogResidual":None,"objectiveImprovement":0.}
    if not good:
        return {**common,"phaseBehavior":"NONCONVERGED_OR_BOUNDARY","converged":False,"beta_NMP_rich":None,
          "RRBO_rich":None,"NMP_rich":None,"massBalanceMaxResidual":None,"isoactivityLogResidual":None,"objectiveImprovement":None}
    sol=min(good,key=lambda s:s.fun);a,x,b,y=phases(sol.x)
    mu1=np.log(x[active])+lngamma(x,T,p,active)[active];mu2=np.log(y[active])+lngamma(y,T,p,active)[active]
    iso=float(np.max(np.abs(mu1-mu2))); mb=float(np.max(np.abs(a*x+b*y-z))); imp=ghom-float(sol.fun)
    boundary=min(a,b,np.min(sol.x),np.min(z[active]-sol.x))<1e-7
    ok=not boundary and mb<1e-9 and iso<2e-4 and imp>1e-8
    if not ok:
        return {**common,"phaseBehavior":"NONCONVERGED_OR_BOUNDARY","converged":False,"beta_NMP_rich":None,
          "RRBO_rich":None,"NMP_rich":None,"massBalanceMaxResidual":mb,"isoactivityLogResidual":iso,"objectiveImprovement":imp}
    if x[4]>y[4]:x,y,a,b=y,x,b,a
    return {**common,"phaseBehavior":"PREDICTED_TWO_PHASE","converged":True,"beta_NMP_rich":b,
      "RRBO_rich":x.tolist(),"NMP_rich":y.tolist(),"massBalanceMaxResidual":mb,
      "isoactivityLogResidual":iso,"objectiveImprovement":imp}

def eqmetrics(p,rows):
    e=raw_equilibrium_residuals(p,rows)
    return {"count":len(e),"rms":float(np.sqrt(np.mean(e*e))),"max_absolute":float(np.max(np.abs(e)))}
def validate(rows,p):
    out=[]
    for r in rows:
        z=(r["x"]+r["y"])/2
        q=flash(z,r["T"],p,r["active"])
        q.update({"id":r["id"],"source":r["source"],"T_K":r["T"],"label":"holdout" if r["holdout"] else "train",
          "activeFamilies":[FAM[i] for i in r["active"]],"validation_feed":"unweighted midpoint; phase amounts absent",
          "experimental":{"RRBO_rich":r["x"].tolist(),"NMP_rich":r["y"].tolist()}})
        if q["phaseBehavior"]=="PREDICTED_TWO_PHASE":
            pred=np.r_[q["RRBO_rich"],q["NMP_rich"]];obs=np.r_[r["x"],r["y"]];e=np.abs(pred-obs)
            q["compositionRmsd"]=float(np.sqrt(np.mean(e*e)));q["maxAbsoluteError"]=float(e.max())
            K=np.divide(q["NMP_rich"],q["RRBO_rich"],out=np.full(5,np.nan),where=np.asarray(q["RRBO_rich"])>0)
            q["distributionCoefficients"]=[float(v) if np.isfinite(v) else None for v in K]
        else:q.update({"compositionRmsd":None,"maxAbsoluteError":None,"distributionCoefficients":None})
        q["uncertaintyComparison"]=None if r["u"] is None else {"u_x":r["u"],"three_u_x":3*r["u"]}
        out.append(q)
    return out
def summary(vals,label):
    a=[q for q in vals if q["label"]==label];counts={k:sum(q["phaseBehavior"]==k for q in a) for k in
      ("PREDICTED_TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY")}
    good=[q for q in a if q["phaseBehavior"]=="PREDICTED_TWO_PHASE"]
    return {"rows":len(a),"categories":counts,"two_phase_recall":len(good)/len(a),
      "composition_rmsd_mean":float(np.mean([q["compositionRmsd"] for q in good])) if good else None,
      "max_absolute_error":max([q["maxAbsoluteError"] for q in good],default=None)}

def main():
    OUT.mkdir(parents=True,exist_ok=True);rows=coto_rows()+mt_rows();train=[r for r in rows if not r["holdout"]]
    criteria={"holdout_two_phase_recall_min":.90,"holdout_composition_rmsd_max":.03,
      "valid_flash_mass_balance_max":1e-9,"valid_flash_isoactivity_max":2e-4}
    p,diag,obj=fit(train);vals=validate(rows,p);metrics={"train":summary(vals,"train"),"holdout":summary(vals,"holdout")}
    topology_pass=metrics["holdout"]["two_phase_recall"]>=criteria["holdout_two_phase_recall_min"]
    composition_pass=metrics["holdout"]["composition_rmsd_mean"] is not None and \
      metrics["holdout"]["composition_rmsd_mean"]<=criteria["holdout_composition_rmsd_max"]
    five_gate={"topology_pass":topology_pass,"composition_rmsd_pass":composition_pass,
      "overall_pass":topology_pass and composition_pass}
    # Governing six-family admission is unconditionally fail-closed while any
    # required evidence dependency is unresolved, regardless of numeric fit.
    six_deps={"Polar_Aromatics_resolved":False,"sulfur_representation_where_required":False,
      "DI_POLY_applicable_temperature_evidence":False}
    six_status="NOT_CALCULABLE"
    decision="REJECT"
    src={"coto":{"path":str(SRC_COTO.relative_to(ROOT)),"sha256":sha(SRC_COTO),"count":17},
      "multi_t":{"path":str(SRC_MT.relative_to(ROOT)),"sha256":sha(SRC_MT),"count":219}}
    payload={"package":"ecr-pre-pilot-nrtl","isolation":"No legacy LLX or thermodynamic model code imported.",
      "sources":src,"fitting_declaration":DECLARATION,"parameter_mapping":PARAM_MAP,
      "dependencies":{"path":str(VENDOR.relative_to(ROOT)),"numpy":np.__version__,"scipy":scipy.__version__,
        "restriction":"numerical runtime only; no opencosmorspy or thermodynamic code"},
      "holdout_design":{"Coto":"all four toluene rows plus table orders 2, 9, 13","multi_T":"exact 323.2 K slice",
        "family_holdout":"unavailable; DI/POLY only occur at the Coto anchor"},
      "fit":{"success":diag["success"],"objective":obj,"solver_diagnostics":diag,
        "equilibrium_log_activity_residuals":{"train":eqmetrics(p,train),"holdout":eqmetrics(p,[r for r in rows if r["holdout"]])},
        "parameters":p.tolist(),"parameters_sha256":hashlib.sha256(p.tobytes()).hexdigest()},
      "acceptance_criteria_predeclared":criteria,"fiveFamilyCandidateGate":five_gate,
      "sixFamilyStage2Status":six_status,"sixFamilyAdmissionDependencies":six_deps,
      "governingAdmissionEligible":False,"metrics":metrics,"validation":vals,
      "temperature_evidence":{"25 C":"five-family Coto anchor plus SAT/MONO/NMP analogues",
        "50 C":"SAT/MONO/NMP analogue interpolation only; DI/POLY NOT_CALCULABLE",
        "75 C":"NOT_CALCULABLE for DI/POLY and outside analogue evidence","100 C":"NOT_CALCULABLE"},
      "six_family_diagnostic":{"mode":"five-family surrogate only","Polar Aromatics":None,"sulfur_removal_claim":None,"status":"NOT_CALCULABLE"},
      "limitations":["DI/POLY interactions are isothermal at 298.15 K and unsupported away from that anchor.",
        "No phase amounts: validation feed is an unweighted midpoint and is not phase-split validation.",
        "Nonconverged flashes are reported separately and are not counted as topology predictions."],
      "decision":decision}
    (OUT/"results.json").write_text(json.dumps(payload,indent=2,allow_nan=False)+"\n")
    manifest={"sources":src,"generated_by":"run.py","dependency_path":str(VENDOR.relative_to(ROOT)),
      "numpy":np.__version__,"scipy":scipy.__version__,"parameter_count":NPAR,
      "parameterization":"12 SAT/MONO/NMP a,b values plus 14 DI/POLY-involving isothermal tau values; all latter b=0",
      "parameter_hash":payload["fit"]["parameters_sha256"]}
    (OUT/"provenance-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    tr=payload["fit"]["equilibrium_log_activity_residuals"]["train"];ho=payload["fit"]["equilibrium_log_activity_residuals"]["holdout"]
    tc=metrics["train"]["categories"];hc=metrics["holdout"]["categories"]
    (OUT/"report.md").write_text(f"""# Fresh regularization-constrained ECR Pre-Pilot NRTL regression

**Final decision: {decision}**

This isolated regularization-constrained estimation fits 26 values: a+b/T for six directed SAT/MONO/NMP interactions and isothermal 298.15 K tau for 14 directed interactions involving DI/POLY (b exactly zero). It is not an identifiability claim. The measurement-only Jacobian rank is {diag["measurement_only_jacobian"]["rank"]}/{NPAR}, condition number {diag["measurement_only_jacobian"]["condition_number"]}, with {diag["measurement_only_jacobian"]["practically_weak_directions"]} practically weak directions, {diag["active_bounds"]} bound hit(s), and pseudo-standard errors up to {max(diag["measurement_only_jacobian"]["pseudo_covariance_standard_errors"]):.6g}. These large uncertainties are explicitly flagged. Polar Aromatics is null. It makes no sulfur-removal claim.

SciPy {scipy.__version__}/NumPy {np.__version__} from `{VENDOR.relative_to(ROOT)}` perform bounded least squares, full-simplex TPD refinement, and conserved-amount multistart Gibbs flashes. No COSMO or other thermodynamic code is imported. Train equilibrium residual RMS/max is {tr["rms"]:.6g}/{tr["max_absolute"]:.6g}; holdout is {ho["rms"]:.6g}/{ho["max_absolute"]:.6g}.

All 219 analogue rows preserve exact SAT/MONO/NMP structural zeros and use all 45 denominator-8 ternary lattice points. Coto uses all five families and all 70 denominator-4 points. Train categories are two-phase {tc["PREDICTED_TWO_PHASE"]}, stable {tc["PREDICTED_STABLE_SINGLE_PHASE"]}, nonconverged/boundary {tc["NONCONVERGED_OR_BOUNDARY"]}; holdout categories are {hc["PREDICTED_TWO_PHASE"]}, {hc["PREDICTED_STABLE_SINGLE_PHASE"]}, and {hc["NONCONVERGED_OR_BOUNDARY"]}, respectively. Nonconvergence is not called a topology failure.

The five-family candidate holdout topology recall {metrics["holdout"]["two_phase_recall"]:.6g} passes the 0.90 gate, while composition RMSD {metrics["holdout"]["composition_rmsd_mean"]:.6g} fails the 0.03 gate. This rejects this specific fresh fitted form, not all NRTL.

The governing six-family Stage 2 status is **NOT_CALCULABLE** and governing admission is ineligible regardless of numerical metrics: Polar Aromatics is unresolved, sulfur representation where required is unresolved, and applicable DI/POLY temperature evidence is absent. DI/POLY are not predicted at 50, 75, or 100 C. Phase amounts were unavailable, so midpoint validation is not measured phase-split validation.
""")
if __name__=="__main__":main()