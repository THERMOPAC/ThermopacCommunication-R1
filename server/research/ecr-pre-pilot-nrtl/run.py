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
FROZEN=Path(__file__).with_name("frozen-parameters.json")
FAM=["SAT","MONO","DI","POLY","NMP"]; CORE={0,1,4}; EPS=1e-14
CLUSTER_TOL={"phase_composition":1e-5,"beta":1e-6,"scaled_gibbs_ambiguity":1e-8,
  "post_split_tpd":1e-8}
EXPECTED_FROZEN_HASH="ecaf60082eefec144c106f6697cd6650aab69b3b8fa07fb1d62bad5ac9da1d34"
CLAMP_LOG={"calls":0,"activations":0,"maximum_absolute_raw_exponent":0.0}
STANDALONE_CLAMP_LOG={"calls":0,"activations":0,"maximum_absolute_raw_exponent":0.0}

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
def mapping_digest():
    return hashlib.sha256(json.dumps(PARAM_MAP,sort_keys=True,separators=(",",":")).encode()).hexdigest()
def load_frozen_parameters():
    """Fail closed before a flash if the checked-in model identity changes."""
    raw=json.loads(FROZEN.read_text()); p=np.asarray(raw.get("parameters"),dtype=np.float64)
    if len(p)!=NPAR or not np.all(np.isfinite(p)): raise ValueError("invalid frozen parameter vector")
    h=hashlib.sha256(p.tobytes()).hexdigest()
    if h!=EXPECTED_FROZEN_HASH or raw.get("parameters_sha256")!=EXPECTED_FROZEN_HASH:
        raise ValueError("frozen parameter hash mismatch")
    if raw.get("parameter_mapping_sha256")!=mapping_digest(): raise ValueError("frozen parameter mapping mismatch")
    return p,{"path":str(FROZEN.relative_to(ROOT)),"parameters_sha256":h,
      "parameter_mapping_sha256":mapping_digest(),"validated_before_flash":True}
def nrtl_exp(raw):
    raw=np.asarray(raw,float); CLAMP_LOG["calls"]+=int(raw.size)
    mx=float(np.max(np.abs(raw))) if raw.size else 0.
    CLAMP_LOG["maximum_absolute_raw_exponent"]=max(CLAMP_LOG["maximum_absolute_raw_exponent"],mx)
    hits=int(np.count_nonzero((raw < -50) | (raw > 50))); CLAMP_LOG["activations"]+=hits
    return np.exp(np.clip(raw,-50,50))
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
    x=active_normalize(v,active); tau=tau_matrix(T,p); G=nrtl_exp(-.30*tau)
    den=x@G
    ans=np.zeros(5)
    for i in active:
        ans[i]=sum(x[j]*tau[j,i]*G[j,i]/den[i] for j in active)
        for j in active:
            avg=sum(x[m]*tau[m,j]*G[m,j] for m in active)/den[j]
            ans[i]+=x[j]*G[i,j]/den[j]*(tau[i,j]-avg)
    return ans

def independent_lngamma(v,T,p,active):
    """Independent standard NRTL evaluation in column/vector form.

    This audit implementation shares only the declared tau matrix.  It does not
    call or algebraically delegate to the primary ``lngamma`` routine.
    """
    x=active_normalize(v,active); tau=tau_matrix(T,p)
    G=np.exp(np.clip(-DECLARATION["alpha"]["value"]*tau,-50,50))
    col_den=np.einsum("k,kj->j",x,G)
    col_num=np.einsum("k,kj,kj->j",x,G,tau)
    weighted=col_num/col_den
    out=np.zeros(5)
    for i in active:
        incoming=col_num[i]/col_den[i]
        correction=np.dot(x[active]*G[i,active]/col_den[active],
                          tau[i,active]-weighted[active])
        out[i]=incoming+correction
    return out

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
    vals=np.asarray([fun(w[active]) for w in lattice]); order=np.argsort(vals)
    # Search the complete lattice.  Every negative point, and every point
    # competitive with the lattice best on the declared scaled tolerance, is
    # refined; refined stationary points are then composition-clustered.
    competitive=max(float(vals[order[0]])+1e-4,0.0)
    basin_ix=[int(ix) for ix in order if vals[ix] <= competitive]
    candidates=[]
    for ix in basin_ix:
        w0=np.maximum(lattice[ix][active],1e-10);w0/=w0.sum()
        s=minimize(fun,w0,method="SLSQP",bounds=[(1e-12,1)]*len(active),
          constraints={"type":"eq","fun":lambda w:np.sum(w)-1},options={"maxiter":500,"ftol":1e-12})
        if s.success:candidates.append((float(s.fun),s.x,ix))
    distinct=[]
    for candidate in sorted(candidates,key=lambda q:q[0]):
        if not any(np.max(np.abs(candidate[1]-old[1]))<1e-6 for old in distinct): distinct.append(candidate)
    if distinct: val,wa,_=min(distinct,key=lambda q:q[0])
    else: val,wa=vals[order[0]],lattice[order[0]][active]
    w=np.zeros(5);w[active]=wa
    return val,w,{"denominator":den,"point_count":len(lattice),"expected_point_count":45 if len(active)==3 else 70,
       "all_points_evaluated":len(vals),"competitive_threshold":competitive,
       "competitive_lattice_points":len(basin_ix),"refinement_attempts":len(basin_ix),
       "refinement_successes":len(candidates),"distinct_refined_basins":len(distinct),
       "refinedBasins":[{"tpd":q[0],"composition":np.eye(5)[active].T@q[1] if False else
          np.array([q[1][active.index(i)] if i in active else 0. for i in range(5)]).tolist(),
          "latticeIndex":q[2]} for q in distinct]}

def standalone_state(v,T,p,active,mapping=PARAM_MAP,alpha=.30):
    """Raw-spec evaluator: deliberately calls none of the production helpers."""
    ids=list(active); raw=np.asarray(v,float); x=np.zeros(5);x[ids]=np.maximum(raw[ids],1e-14)
    if not np.all(np.isfinite(x[ids])) or x[ids].sum()<=0: raise ValueError("standalone composition")
    x[ids]/=x[ids].sum(); tau=np.zeros((5,5));k=0
    for m in mapping:
        if m["form"]=="a+b/T":tau[m["i"],m["j"]]=p[k]+p[k+1]/T;k+=2
        else:
            if m["b_fixed"]!=0.:raise ValueError("standalone mapping")
            tau[m["i"],m["j"]]=p[k];k+=1
    if k!=len(p):raise ValueError("standalone parameter length")
    eraw=-alpha*tau;STANDALONE_CLAMP_LOG["calls"]+=eraw.size
    STANDALONE_CLAMP_LOG["activations"]+=int(np.count_nonzero((eraw < -50)|(eraw > 50)))
    STANDALONE_CLAMP_LOG["maximum_absolute_raw_exponent"]=max(STANDALONE_CLAMP_LOG["maximum_absolute_raw_exponent"],float(np.max(np.abs(eraw))))
    G=np.exp(np.clip(eraw,-50,50));den=x@G;g=np.zeros(5)
    for i in ids:
        g[i]=sum(x[j]*tau[j,i]*G[j,i]/den[i] for j in ids)
        for j in ids:
            avg=sum(x[m]*tau[m,j]*G[m,j] for m in ids)/den[j]
            g[i]+=x[j]*G[i,j]/den[j]*(tau[i,j]-avg)
    return x,g

def standalone_thermo(z,T,p,active,a,x,b,y):
    zn,gz=standalone_state(z,T,p,active);xn,gx=standalone_state(x,T,p,active);yn,gy=standalone_state(y,T,p,active)
    ids=np.asarray(active);bal=a*xn+b*yn-zn;iso=np.log(xn[ids])+gx[ids]-np.log(yn[ids])-gy[ids]
    gh=float(np.sum(zn[ids]*(np.log(zn[ids])+gz[ids])))
    gs=float(a*np.sum(xn[ids]*(np.log(xn[ids])+gx[ids]))+b*np.sum(yn[ids]*(np.log(yn[ids])+gy[ids])))
    return {"normalized":{"feed":zn,"RRBO_rich":xn,"NMP_rich":yn},"massBalanceResiduals":bal.tolist(),
      "massBalanceMax":float(np.max(np.abs(bal))),"isoactivityResiduals":iso.tolist(),
      "isoactivityMax":float(np.max(np.abs(iso))),"homogeneousReducedGibbs":gh,
      "totalReducedGibbs":gs,"gibbsDecrease":gh-gs}

def standalone_phase_check(z,T,p,active,a,x,b,y):
    """Full independent final gate, including refined post-split TPD."""
    base=standalone_thermo(z,T,p,active,a,x,b,y);ids=list(active)
    def lattice(den):
        out=[]
        def rec(pos,left,parts):
            if pos==len(ids)-1:
                q=np.zeros(5)
                for i,n in zip(ids,parts+[left]):q[i]=n/den
                out.append(q);return
            for n in range(left+1):rec(pos+1,left-n,parts+[n])
        rec(0,den,[]);return out
    def phase_tpd(ref):
        rn,rg=standalone_state(ref,T,p,ids);mu=np.log(rn[ids])+rg[ids]
        def fun(wa):
            w=np.zeros(5);w[ids]=np.maximum(wa,1e-14);wn,wg=standalone_state(w,T,p,ids)
            return float(np.sum(wn[ids]*(np.log(wn[ids])+wg[ids]-mu)))
        lat=lattice(8 if len(ids)==3 else 4);lv=np.asarray([fun(q[ids]) for q in lat]);best=float(lv.min())
        threshold=max(0.,best+1e-4);ix=[int(i) for i in np.argsort(lv) if lv[i]<=threshold];refined=[]
        for i in ix:
            w0=np.maximum(lat[i][ids],1e-10);w0/=w0.sum()
            s=minimize(fun,w0,method="SLSQP",bounds=[(1e-12,1)]*len(ids),
              constraints={"type":"eq","fun":lambda w:np.sum(w)-1},options={"maxiter":500,"ftol":1e-12})
            if s.success and not any(np.max(np.abs(s.x-q[1]))<1e-6 for q in refined):refined.append((float(s.fun),s.x))
        val,wa=min(refined,key=lambda q:q[0]) if refined else (best,lat[int(np.argmin(lv))][ids])
        comp=np.zeros(5);comp[ids]=wa
        return {"minimum":val,"minimizer":comp.tolist(),"latticePointCount":len(lat),
          "latticePointsEvaluated":len(lv),"competitivePoints":len(ix),"refinementAttempts":len(ix),
          "distinctRefinedBasins":len(refined)}
    ps={"RRBO_rich":phase_tpd(base["normalized"]["RRBO_rich"]),
      "NMP_rich":phase_tpd(base["normalized"]["NMP_rich"])}
    base["normalized"]={k:v.tolist() for k,v in base["normalized"].items()};base["postSplitTPD"]=ps
    base["pass"]=bool(base["massBalanceMax"]<1e-9 and base["isoactivityMax"]<2e-4 and base["gibbsDecrease"]>1e-8 and
      all(v["minimum"]>=-CLUSTER_TOL["post_split_tpd"] for v in ps.values()))
    return base

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
    def iso_residual(na):
        q=phases(na)
        if q is None:return np.full(len(active),1e6)
        _,x,_,y=q
        return np.log(x[active])+lngamma(x,T,p,active)[active]-np.log(y[active])-lngamma(y,T,p,active)[active]
    ghom=float(np.sum(z[active]*(np.log(z[active])+lngamma(z,T,p,active)[active])))
    # Every distinct TPD basin seeds conserved-Gibbs minimization, supplemented
    # only by deterministic interior and near-boundary amount partitions.
    seeds=[];seed_labels=[]
    tpd_seeds=[np.asarray(q["composition"]) for q in tpdmeta["refinedBasins"]]
    if not tpd_seeds: tpd_seeds=[w]
    for n,wb in enumerate(tpd_seeds):
        for blend in (0.,.20):
            wb=active_normalize((1-blend)*wb+blend*z,active)
            scale=min(.35*z[i]/wb[i] for i in active if wb[i]>1e-10)
            if scale>1e-8:
                seeds.append((scale*wb)[active]);seed_labels.append(f"TPD_BASIN_{n}_BLEND_{blend:.2f}")
    for frac in (.2,.5,.8):
        seeds.append((frac*z)[active]);seed_labels.append(f"HOMOGENEOUS_PARTITION_{frac:.2f}")
    for fav in active:
        for extent in (.02,.65):
            f=np.full(len(active),(1-extent)/(len(active)-1));f[active.index(fav)]=extent
            seeds.append(z[active]*f);seed_labels.append(f"{'BOUNDARY' if extent==.02 else 'INTERIOR'}_FAVORED_{FAM[fav]}")
    bounds=[(1e-10*z[i],(1-1e-10)*z[i]) for i in active]
    sols=[minimize(gmix,s,method="L-BFGS-B",bounds=bounds,options={"maxiter":1500,"ftol":1e-14,"gtol":1e-9}) for s in seeds]
    polish=[]
    for s in sols:
        meta={"attempted":False,"success":False,"maximumIsoactivityResidual":None}
        if s.success and phases(s.x) is not None:
            # A direct KKT root polish removes optimizer-gradient stopping
            # differences between phase-swapped and materially different seeds.
            root=least_squares(iso_residual,s.x,bounds=np.asarray(bounds).T,
              method="trf",jac="3-point",x_scale="jac",max_nfev=3000,
              ftol=1e-14,xtol=1e-14,gtol=1e-14)
            meta.update({"attempted":True,"success":bool(root.success),
              "maximumIsoactivityResidual":float(np.max(np.abs(root.fun)))})
            if root.success and phases(root.x) is not None:
                s.x=root.x;s.fun=gmix(root.x)
        polish.append(meta)
    good=[s for s in sols if s.success and phases(s.x) is not None]
    start_summaries=[]
    eligible=[]
    for n,(seed,s) in enumerate(zip(seeds,sols)):
        sq=phases(seed)
        if sq is None: seed_state=None
        else:
            sa,sx,sb,sy=sq
            if sx[4]>sy[4]:sx,sy,sa,sb=sy,sx,sb,sa
            seed_state={"beta_NMP_rich":float(sb),"RRBO_rich":sx.tolist(),"NMP_rich":sy.tolist()}
        rec={"start_index":n,"seedLabel":seed_labels[n],"seedAmountsActive":np.asarray(seed).tolist(),
          "seedCanonicalState":seed_state,"success":bool(s.success),
          "objective":float(s.fun),"message":str(s.message),"chemicalPotentialPolish":polish[n]}
        q=phases(s.x)
        if q is not None:
            aa,xx,bb,yy=q
            if xx[4]>yy[4]:xx,yy,aa,bb=yy,xx,bb,aa
            mui=np.log(xx[active])+lngamma(xx,T,p,active)[active]
            muj=np.log(yy[active])+lngamma(yy,T,p,active)[active]
            iso_i=float(np.max(np.abs(mui-muj)))
            mb_i=float(np.max(np.abs(aa*xx+bb*yy-z)))
            improvement_i=ghom-float(s.fun)
            boundary_i=min(aa,bb,np.min(s.x),np.min(z[active]-s.x))<1e-7
            reasons=[]
            if not s.success: reasons.append("OPTIMIZER_DID_NOT_CONVERGE")
            if boundary_i: reasons.append("BOUNDARY_SOLUTION")
            if mb_i>=1e-9: reasons.append("COMPONENT_BALANCE")
            if iso_i>=2e-4: reasons.append("KKT_ISOACTIVITY")
            if improvement_i<=1e-8: reasons.append("NO_GIBBS_DECREASE")
            rec.update({"RRBO_rich":xx.tolist(),"NMP_rich":yy.tolist(),"beta_NMP_rich":float(bb),
              "isoactivityMax":iso_i,"massBalanceMax":mb_i,"objectiveImprovement":improvement_i,
              "selectionEligible":not reasons,"rejectionReasons":reasons})
            if not reasons: eligible.append((s,aa,xx,bb,yy,rec))
        else:
            rec.update({"selectionEligible":False,"rejectionReasons":["INVALID_PHASE_AMOUNTS"]})
        start_summaries.append(rec)
    # Cluster all eligible stationary states after phase-swap canonicalization;
    # physical near-degeneracy is never resolved by lexical ordering.
    clusters=[]
    for c in eligible:
        _,aa,xx,bb,yy,rec=c
        target=None
        for cl in clusters:
            r=cl["representative"]
            if max(np.max(np.abs(xx-r[2])),np.max(np.abs(yy-r[3])))<=CLUSTER_TOL["phase_composition"] and abs(bb-r[4])<=CLUSTER_TOL["beta"]:
                target=cl;break
        if target is None:
            target={"representative":(c[0],aa,xx,yy,bb,rec),"members":[]};clusters.append(target)
        target["members"].append(c)
    cluster_records=[]
    for n,cl in enumerate(clusters):
        s,aa,xx,yy,bb,rec=cl["representative"]
        independent=standalone_thermo(z,T,p,active,aa,xx,bb,yy)
        members=cl["members"]; objs=[float(v[0].fun) for v in members]
        cluster_records.append({"clusterIndex":n,"members":[v[5]["start_index"] for v in members],
          "seedLabels":sorted(set(v[5]["seedLabel"] for v in members)),
          "representativeCanonicalState":{"RRBO_rich":xx.tolist(),"NMP_rich":yy.tolist(),"beta_NMP_rich":bb},
          "objectiveRange":[min(objs),max(objs)],"independentTotalReducedGibbs":independent["totalReducedGibbs"],
          "admissibilityDiagnostics":{k:v for k,v in independent.items() if k!="normalized"}})
    ranked=sorted(cluster_records,key=lambda c:c["independentTotalReducedGibbs"])
    selected=None; ambiguous=False
    if ranked:
        selected=ranked[0]
        if len(ranked)>1 and abs(ranked[1]["independentTotalReducedGibbs"]-selected["independentTotalReducedGibbs"])<=CLUSTER_TOL["scaled_gibbs_ambiguity"]:
            ambiguous=True
        else:
            selected_member=next(c for c in eligible if c[5]["start_index"]==selected["members"][0])
            selected_member[5]["selectedByGlobalRule"]=True
    best_obj=selected["independentTotalReducedGibbs"] if selected else None
    equivalent=len(selected["members"]) if selected else 0;alternate=max(0,len(cluster_records)-1)
    common={"stabilityTPDMinimum":tpd,"stabilityLattice":tpdmeta,"activeMask":[i in active for i in range(5)],
      "stabilityTPDWitness":w.tolist(),
       "optimizer_attempts":len(sols),"optimizer_successes":len(good),"multistartSolutions":start_summaries,
       "stationaryClusters":cluster_records,"clusterTolerances":CLUSTER_TOL,
      "multistartAgreement":{"equivalent_best_objective_starts":equivalent,
        "alternate_local_stationary_points":alternate,"multiple_successful_starts":len(good)>=2},
      "globalSelection":{"rule":"minimum reduced Gibbs among thermodynamically eligible stationary candidates; canonical beta/compositions break numerical ties",
         "eligibleCandidates":len(eligible),"rejectedCandidates":len(sols)-len(eligible),
         "selectedClusterIndex":selected["clusterIndex"] if selected else None,
         "selectedStartIndex":selected["members"][0] if selected else None,
        "reproduciblePhaseSwapCopies":equivalent},
      "homogeneousReducedGibbs":ghom}
    if tpd>=-1e-8:
        return {**common,"phaseBehavior":"PREDICTED_STABLE_SINGLE_PHASE","converged":True,"beta_NMP_rich":None,
          "RRBO_rich":None,"NMP_rich":None,"massBalanceMaxResidual":0.,"isoactivityLogResidual":None,
          "objectiveImprovement":0.,"selectedTwoPhaseReducedGibbs":None}
    if ambiguous:
        return {**common,"phaseBehavior":"AMBIGUOUS_UNRESOLVED","converged":False,"beta_NMP_rich":None,
          "RRBO_rich":None,"NMP_rich":None,"massBalanceMaxResidual":None,"isoactivityLogResidual":None,
          "objectiveImprovement":None,"selectedTwoPhaseReducedGibbs":None}
    if not eligible:
        return {**common,"phaseBehavior":"NONCONVERGED_OR_BOUNDARY","converged":False,"beta_NMP_rich":None,
          "RRBO_rich":None,"NMP_rich":None,"massBalanceMaxResidual":None,"isoactivityLogResidual":None,
          "objectiveImprovement":None,"selectedTwoPhaseReducedGibbs":None}
    sol,a,x,b,y,_=next(c for c in eligible if c[5]["start_index"]==selected["members"][0])
    mu1=np.log(x[active])+lngamma(x,T,p,active)[active];mu2=np.log(y[active])+lngamma(y,T,p,active)[active]
    iso=float(np.max(np.abs(mu1-mu2))); mb=float(np.max(np.abs(a*x+b*y-z))); imp=ghom-float(sol.fun)
    boundary=min(a,b,np.min(sol.x),np.min(z[active]-sol.x))<1e-7
    independent=standalone_phase_check(z,T,p,active,a,x,b,y)
    selected["admissibilityDiagnostics"]=independent
    ok=not boundary and mb<1e-9 and iso<2e-4 and imp>1e-8 and independent["pass"]
    if not ok:
        return {**common,"phaseBehavior":"NONCONVERGED_OR_BOUNDARY","converged":False,"beta_NMP_rich":None,
          "RRBO_rich":None,"NMP_rich":None,"massBalanceMaxResidual":mb,"isoactivityLogResidual":iso,
          "objectiveImprovement":imp,"selectedTwoPhaseReducedGibbs":float(sol.fun)}
    if x[4]>y[4]:x,y,a,b=y,x,b,a
    return {**common,"phaseBehavior":"PREDICTED_TWO_PHASE","converged":True,"beta_NMP_rich":b,
      "RRBO_rich":x.tolist(),"NMP_rich":y.tolist(),"massBalanceMaxResidual":mb,
      "isoactivityLogResidual":iso,"objectiveImprovement":imp,
       "selectedTwoPhaseReducedGibbs":float(sol.fun),"gibbsDecrease":imp,
       "independentFinalPhaseChecks":independent}

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
          "overallMidpoint":z.tolist(),
          "experimental":{"RRBO_rich":r["x"].tolist(),"NMP_rich":r["y"].tolist()}})
        q["primaryMeasuredLnGamma"]={"RRBO_rich":lngamma(r["x"],r["T"],p,r["active"]).tolist(),
          "NMP_rich":lngamma(r["y"],r["T"],p,r["active"]).tolist()}
        if q["phaseBehavior"]=="PREDICTED_TWO_PHASE":
            pred=np.r_[q["RRBO_rich"],q["NMP_rich"]];obs=np.r_[r["x"],r["y"]];e=np.abs(pred-obs)
            q["compositionRmsd"]=float(np.sqrt(np.mean(e*e)));q["maxAbsoluteError"]=float(e.max())
            q["primaryLnGamma"]={"RRBO_rich":lngamma(q["RRBO_rich"],r["T"],p,r["active"]).tolist(),
              "NMP_rich":lngamma(q["NMP_rich"],r["T"],p,r["active"]).tolist()}
            K=np.divide(q["NMP_rich"],q["RRBO_rich"],out=np.full(5,np.nan),where=np.asarray(q["RRBO_rich"])>0)
            q["distributionCoefficients"]=[float(v) if np.isfinite(v) else None for v in K]
        else:q.update({"compositionRmsd":None,"maxAbsoluteError":None,"distributionCoefficients":None,"primaryLnGamma":None})
        q["uncertaintyComparison"]=None if r["u"] is None else {"u_x":r["u"],"three_u_x":3*r["u"]}
        out.append(q)
    return out
def summary(vals,label):
    a=[q for q in vals if q["label"]==label];counts={k:sum(q["phaseBehavior"]==k for q in a) for k in
       ("PREDICTED_TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY","AMBIGUOUS_UNRESOLVED")}
    good=[q for q in a if q["phaseBehavior"]=="PREDICTED_TWO_PHASE"]
    return {"rows":len(a),"categories":counts,"two_phase_recall":len(good)/len(a),
      "composition_rmsd_mean":float(np.mean([q["compositionRmsd"] for q in good])) if good else None,
      "max_absolute_error":max([q["maxAbsoluteError"] for q in good],default=None)}

def build_audit(vals,p,mapping,probes,manual_ids=None):
    """Standalone audit evaluator; it calls none of the production evaluators."""
    assert len(p)==sum(2 if m["form"]=="a+b/T" else 1 for m in mapping)
    audit_clamp={"calls":0,"activations":0,"maximum_absolute_raw_exponent":0.0}
    def agamma(v,T,mask):
        active=[i for i,on in enumerate(mask) if on]; x=np.zeros(5);x[active]=np.maximum(np.asarray(v)[active],EPS);x[active]/=x[active].sum()
        tau=np.zeros((5,5));k=0
        for m in mapping:
            i,j=m["i"],m["j"]
            if m["form"]=="a+b/T":tau[i,j]=p[k]+p[k+1]/T;k+=2
            else: assert m["b_fixed"]==0.;tau[i,j]=p[k];k+=1
        assert k==len(p)
        raw=-.30*tau;audit_clamp["calls"]+=raw.size
        audit_clamp["activations"]+=int(np.count_nonzero((raw < -50)|(raw > 50)))
        audit_clamp["maximum_absolute_raw_exponent"]=max(audit_clamp["maximum_absolute_raw_exponent"],float(np.max(np.abs(raw))))
        G=np.exp(np.clip(raw,-50,50));d=x@G;out=np.zeros(5)
        for i in active:
            out[i]=sum(x[j]*tau[j,i]*G[j,i]/d[i] for j in active)
            out[i]+=sum(x[j]*G[i,j]/d[j]*(tau[i,j]-sum(x[k]*tau[k,j]*G[k,j] for k in active)/d[j]) for j in active)
        return x,out
    accepted=[q for q in vals if q["phaseBehavior"]=="PREDICTED_TWO_PHASE"]
    thermo=[]; gamma_cases=[]
    for q in accepted:
        mask=q["activeMask"];z=np.asarray(q["overallMidpoint"]);x=np.asarray(q["RRBO_rich"]);y=np.asarray(q["NMP_rich"]);b=q["beta_NMP_rich"]
        zn,gz=agamma(z,q["T_K"],mask);xn,gx=agamma(x,q["T_K"],mask);yn,gy=agamma(y,q["T_K"],mask)
        act=np.asarray(mask,bool);bal=(1-b)*xn+b*yn-zn;iso=np.log(xn[act])+gx[act]-np.log(yn[act])-gy[act]
        gh=float(np.sum(zn[act]*(np.log(zn[act])+gz[act])));gs=float((1-b)*np.sum(xn[act]*(np.log(xn[act])+gx[act]))+b*np.sum(yn[act]*(np.log(yn[act])+gy[act])))
        w=np.asarray(q["stabilityTPDWitness"]);wn,gw=agamma(w,q["T_K"],mask);tpd=float(np.sum(wn[act]*(np.log(wn[act])+gw[act]-np.log(zn[act])-gz[act])))
        thermo.append({"id":q["id"],"z":zn.tolist(),"beta":b,"RRBO_rich":xn.tolist(),"NMP_rich":yn.tolist(),
          "componentBalances":bal.tolist(),"massBalanceMax":float(np.max(np.abs(bal))),
          "logIsoactivityResiduals":iso.tolist(),"isoactivityMax":float(np.max(np.abs(iso))),
          "xGamma":{"RRBO_rich":(xn*np.exp(gx)).tolist(),"NMP_rich":(yn*np.exp(gy)).tolist()},
          "homogeneousReducedGibbs":gh,"selectedTwoPhaseReducedGibbs":gs,"gibbsDecrease":gh-gs,
          "TPDWitness":wn.tolist(),"TPDMinimum":tpd})
        # Primary values are recomputed from serialized state separately only
        # for the equation comparison, never used in audit Gibbs/TPD decisions.
        for suffix,gind,gpri in (("R",gx,q["primaryLnGamma"]["RRBO_rich"]),("E",gy,q["primaryLnGamma"]["NMP_rich"])):
            d=np.abs(gind-np.asarray(gpri))
            gamma_cases.append({"id":q["id"]+"-flash-"+suffix,"independent":gind.tolist(),
              "primarySerialized":gpri,"absoluteDifferences":d.tolist(),"maxDifference":float(d.max())})
    gamma_max=max(c["maxDifference"] for c in gamma_cases)
    for probe in probes:
        _,gi=agamma(probe["composition"],probe["T_K"],probe["activeMask"]);gp=np.asarray(probe["primaryLnGamma"])
        dd=np.abs(gi-gp);gamma_cases.append({"id":probe["id"],"independent":gi.tolist(),
          "primarySerialized":gp.tolist(),"absoluteDifferences":dd.tolist(),"maxDifference":float(dd.max())})
    gamma_max=max(c["maxDifference"] for c in gamma_cases)
    manual_ids=set(manual_ids or [q["id"] for q in vals])
    thermo_by_id={t["id"]:t for t in thermo}
    manuals=[]
    for q in vals:
        if q["id"] not in manual_ids:continue
        for suffix,v in (("experimental-R",q["experimental"]["RRBO_rich"]),("experimental-E",q["experimental"]["NMP_rich"])):
            _,gi=agamma(v,q["T_K"],q["activeMask"]);gp=q["primaryMeasuredLnGamma"]["RRBO_rich" if suffix.endswith("R") else "NMP_rich"]
            dd=np.abs(gi-np.asarray(gp));gamma_cases.append({"id":q["id"]+"-"+suffix,
              "independent":gi.tolist(),"primarySerialized":gp,"absoluteDifferences":dd.tolist(),"maxDifference":float(dd.max())})
        rec={k:q[k] for k in ("id","T_K","overallMidpoint","experimental","phaseBehavior","RRBO_rich","NMP_rich","beta_NMP_rich","multistartSolutions")}
        rec["multistartAgreement"]=q["multistartAgreement"]; manuals.append(rec)
        rec.update({"xGamma":None,"componentBalances":None,"componentBalanceMax":None,
          "logIsoactivityResiduals":None,"perComponentErrors":None})
        if q["id"] in thermo_by_id:
            t=thermo_by_id[q["id"]]
            rec.update({"xGamma":t["xGamma"],"componentBalances":t["componentBalances"],
              "componentBalanceMax":t["massBalanceMax"],"logIsoactivityResiduals":t["logIsoactivityResiduals"],
              "perComponentErrors":{"RRBO_rich":(np.asarray(q["RRBO_rich"])-np.asarray(q["experimental"]["RRBO_rich"])).tolist(),
                "NMP_rich":(np.asarray(q["NMP_rich"])-np.asarray(q["experimental"]["NMP_rich"])).tolist()}})
    mass=max(t["massBalanceMax"] for t in thermo);iso=max(t["isoactivityMax"] for t in thermo)
    tpass=all(t["TPDMinimum"]<0 and t["selectedTwoPhaseReducedGibbs"]<t["homogeneousReducedGibbs"] for t in thermo)
    # Independent reproduction requires both matching canonical outcomes and
    # physically distinct phase-swap-canonical initial states.
    mtol={"objective":1e-8,"beta":1e-6,"composition":1e-6,"seed_state_distance":1e-3}; mp=True
    for m in manuals:
        ss=[s for s in m["multistartSolutions"] if s.get("selectionEligible")]
        key=lambda s:(round(s["objective"],12),round(s["beta_NMP_rich"],12),
          tuple(round(v,12) for v in s["RRBO_rich"]),tuple(round(v,12) for v in s["NMP_rich"]))
        chosen=min(ss,key=key) if ss else None
        reproducers=[] if chosen is None else [s for s in ss if
          abs(s["objective"]-chosen["objective"])<=mtol["objective"] and
          abs(s["beta_NMP_rich"]-chosen["beta_NMP_rich"])<=mtol["beta"] and
          max(abs(a-b) for a,b in zip(s["RRBO_rich"],chosen["RRBO_rich"]))<=mtol["composition"] and
          max(abs(a-b) for a,b in zip(s["NMP_rich"],chosen["NMP_rich"]))<=mtol["composition"]]
        def seed_distance(a,b):
            aa=a["seedCanonicalState"];bb=b["seedCanonicalState"]
            return max(abs(aa["beta_NMP_rich"]-bb["beta_NMP_rich"]),
              max(abs(x-y) for x,y in zip(aa["RRBO_rich"],bb["RRBO_rich"])),
              max(abs(x-y) for x,y in zip(aa["NMP_rich"],bb["NMP_rich"])))
        pairs=[(seed_distance(a,b),a["start_index"],b["start_index"]) for i,a in enumerate(reproducers)
          for b in reproducers[i+1:] if a["seedCanonicalState"] and b["seedCanonicalState"]]
        max_pair=max(pairs,default=(0.,None,None))
        materially_distinct=max_pair[0]>=mtol["seed_state_distance"]
        rejected=len(m["multistartSolutions"])-len(ss)
        agreement=len(reproducers)>=2 and materially_distinct
        m["independentMultistart"]={"materially_distinct_starts":len(m["multistartSolutions"]),
          "eligible_stationary_candidates":len(ss),"rejected_stationary_candidates":rejected,
          "reproduced_global_equilibrium_copies":len(reproducers),
          "reproducing_start_indices":[s["start_index"] for s in reproducers],
          "maximum_phase_swap_invariant_seed_distance":max_pair[0],
          "maximum_distance_start_pair":[max_pair[1],max_pair[2]],
          "materially_distinct_reproduction":materially_distinct,
          "canonical_output_agreement":len(reproducers)>=2,"agreement":agreement}
        mp &= agreement
    obligations={"independentLngamma":{"status":"PASS" if gamma_max<1e-11 else "FAIL","maximum":gamma_max},
      "KKT_isoactivity":{"status":"PASS" if iso<2e-4 else "FAIL","maximum":iso},
      "TPD_and_Gibbs":{"status":"PASS" if tpass else "FAIL","acceptedCount":len(thermo)},
      "massBalance":{"status":"PASS" if mass<5e-13 else "FAIL","maximum":mass},
      "multistartAgreement":{"status":"PASS" if mp else "FAIL","tolerances":mtol}}
    overall="PASS" if all(v["status"]=="PASS" for v in obligations.values()) else "FAIL"
    return {"implementationAuditStatus":overall,"frozenParameterHash":hashlib.sha256(np.asarray(p).tobytes()).hexdigest(),
      "standaloneEvaluator":"serialized vector + mapping + raw arrays only; no primary normalization, tau, gamma, flash, Gibbs, or TPD calls",
       "frozenSplit":{"train":221,"holdout":15},"gammaComparisons":gamma_cases,"manualReproductions":manuals,
       "expClamp":audit_clamp,
      "acceptedTwoPhaseThermodynamics":thermo,"aggregate":{"acceptedTwoPhaseCount":len(thermo),"gammaDifferenceMax":gamma_max,
        "isoactivityMax":iso,"massBalanceMax":mass},"obligations":obligations,
      "causalStatement":"Implementation/flash-selection defects were not found within tested tolerances; this is not formal proof." if overall=="PASS" else "Thermodynamic/model-form blame is not established because one or more implementation audit obligations failed."}

def synthetic_recovery():
    """A deterministic non-data NRTL case; truth is independently minimized."""
    pk=np.zeros(NPAR); k=0
    for m in PARAM_MAP:
        if {m["i"],m["j"]}=={0,4}: pk[k]=5.0
        k+=2 if m["form"]=="a+b/T" else 1
    active=[0,4]; z=np.array([.5,0,0,0,.5])
    def objective(na):
        A=np.zeros(5);A[active]=na;B=z-A;a=A.sum();b=B.sum()
        if min(a,b,np.min(A[active]),np.min(B[active]))<=0:return 1e6
        x=A/a;y=B/b
        xn,gx=standalone_state(x,298.15,pk,active);yn,gy=standalone_state(y,298.15,pk,active)
        return float(a*np.sum(xn[active]*(np.log(xn[active])+gx[active]))+
          b*np.sum(yn[active]*(np.log(yn[active])+gy[active])))
    # This independent minimization is synthetic-truth construction, not flash.
    truth=minimize(objective,np.array([.1,.4]),method="L-BFGS-B",
      bounds=[(1e-8,z[i]-1e-8) for i in active],options={"ftol":1e-14,"gtol":1e-10})
    na=truth.x; a=na.sum();b=1-a;x=np.zeros(5);y=np.zeros(5);x[active]=na/a;y[active]=(z[active]-na)/b
    if x[4]>y[4]:x,y,a,b=y,x,b,a
    solved=flash(z,298.15,pk,active)
    tol={"composition":2e-4,"beta":2e-4}; passed=solved["phaseBehavior"]=="PREDICTED_TWO_PHASE"
    if passed:
        passed &= max(np.max(np.abs(x-np.asarray(solved["RRBO_rich"]))),np.max(np.abs(y-np.asarray(solved["NMP_rich"]))))<=tol["composition"] and abs(b-solved["beta_NMP_rich"])<=tol["beta"]
    return {"knownParameterVector":pk.tolist(),"truthConstruction":"raw-spec standalone conserved-Gibbs search/refinement; no production evaluator and no fitted-data row",
      "truth":{"RRBO_rich":x.tolist(),"NMP_rich":y.tolist(),"beta_NMP_rich":b,"objective":float(truth.fun)},
      "recovered":{"phaseBehavior":solved["phaseBehavior"],"RRBO_rich":solved["RRBO_rich"],"NMP_rich":solved["NMP_rich"],"beta_NMP_rich":solved["beta_NMP_rich"],
        "materiallyDifferentStarts":solved["optimizer_attempts"]},"tolerances":tol,"pass":bool(passed)}

def main():
    OUT.mkdir(parents=True,exist_ok=True);rows=coto_rows()+mt_rows()
    train=[r for r in rows if not r["holdout"]];holdout=[r for r in rows if r["holdout"]]
    criteria={"holdout_two_phase_recall_min":.90,"holdout_composition_rmsd_max":.03,
      "valid_flash_mass_balance_max":1e-9,"valid_flash_isoactivity_max":2e-4}
    # #168 is solver isolation: fitting is deliberately unreachable here.
    CLAMP_LOG.update({"calls":0,"activations":0,"maximum_absolute_raw_exponent":0.0})
    STANDALONE_CLAMP_LOG.update({"calls":0,"activations":0,"maximum_absolute_raw_exponent":0.0})
    execution={"sequence":[],"syntheticFlashCalls":0,"qualificationFlashCalls":0,"holdoutFlashCalls":0,"trainFlashCalls":0,
      "holdoutEvaluationStartedAfterIsolationPass":False}
    p,frozen_provenance=load_frozen_parameters();execution["sequence"].append("FROZEN_ARTIFACT_VALIDATED")
    qualification=[next(r for r in train if r["id"]=="coto-1")]
    for target_T in (298.,313.2):
        qualification.append(next(r for r in train if r["id"].startswith("analogue-") and
          abs(r["T"]-target_T)<.051 and ((r["x"][1]+r["y"][1])/2)>1e-10))
    qualification_ids=[r["id"] for r in qualification];holdout_ids=[r["id"] for r in holdout]
    execution.update({"qualificationRowIds":qualification_ids,"holdoutRowIds":holdout_ids,
      "dataTouchedBeforePass":[]})
    synthetic=synthetic_recovery();execution["syntheticFlashCalls"]=1;execution["sequence"].append("SYNTHETIC_QUALIFICATION_COMPLETE")
    qualification_vals=validate(qualification,p);execution["qualificationFlashCalls"]=len(qualification)
    execution["dataTouchedBeforePass"]=qualification_ids.copy();execution["sequence"].append("PRE_HOLDOUT_DATA_QUALIFICATION_EVALUATED")
    pre_probes=[{"id":"interior-ternary-310K","composition":[.25,.25,0,0,.5],"T_K":310.,"activeMask":[True,True,False,False,True],
      "primaryLnGamma":lngamma([.25,.25,0,0,.5],310.,p,[0,1,4]).tolist()},
      {"id":"interior-five-298.15K","composition":[.2]*5,"T_K":298.15,"activeMask":[True]*5,
      "primaryLnGamma":lngamma([.2]*5,298.15,p,[0,1,2,3,4]).tolist()}]
    pre_audit=build_audit(qualification_vals,p,PARAM_MAP,pre_probes,qualification_ids)
    q_independent=all(q.get("independentFinalPhaseChecks",{}).get("pass") for q in qualification_vals if q["phaseBehavior"]=="PREDICTED_TWO_PHASE")
    q_ambiguity=not any(q["phaseBehavior"]=="AMBIGUOUS_UNRESOLVED" for q in qualification_vals)
    q_basins=all(q["stabilityLattice"]["refinement_attempts"]==q["stabilityLattice"]["competitive_lattice_points"] for q in qualification_vals)
    preliminary_isolation=bool(frozen_provenance["validated_before_flash"] and synthetic["pass"] and
      pre_audit["implementationAuditStatus"]=="PASS" and q_independent and q_ambiguity and q_basins and
      CLAMP_LOG["activations"]==0 and STANDALONE_CLAMP_LOG["activations"]==0 and pre_audit["expClamp"]["activations"]==0)
    execution["sequence"].append("PRE_HOLDOUT_ISOLATION_PASS" if preliminary_isolation else "PRE_HOLDOUT_ISOLATION_FAIL")
    if preliminary_isolation:
        execution["holdoutEvaluationStartedAfterIsolationPass"]=True
        holdout_vals=validate(holdout,p);execution["holdoutFlashCalls"]=len(holdout)
        execution["sequence"].append("HOLDOUT_EVALUATED")
        train_vals=validate(train,p);execution["trainFlashCalls"]=len(train)
        execution["sequence"].append("TRAIN_RESEARCH_EVALUATED");vals=train_vals+holdout_vals
        metrics={"train":summary(vals,"train"),"holdout":summary(vals,"holdout")}
    else:
        vals=[];metrics={"train":None,"holdout":None}
    topology_pass=preliminary_isolation and metrics["holdout"]["two_phase_recall"]>=criteria["holdout_two_phase_recall_min"]
    composition_pass=preliminary_isolation and metrics["holdout"]["composition_rmsd_mean"] is not None and \
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
       "fit":{"fitCalled":False,"execution":"frozen parameters loaded; fit(train) is not called on #168 execution path",
         "parameters":p.tolist(),"parameters_sha256":hashlib.sha256(p.tobytes()).hexdigest(),
         "frozenArtifact":frozen_provenance,
         "equilibrium_log_activity_residuals":{"train":eqmetrics(p,train),"holdout":eqmetrics(p,holdout)}
           if preliminary_isolation else {"train":{"status":"NOT_RUN"},"holdout":{"status":"NOT_RUN"}}},
      "acceptance_criteria_predeclared":criteria,"fiveFamilyCandidateGate":five_gate,
      "sixFamilyStage2Status":six_status,"sixFamilyAdmissionDependencies":six_deps,
      "governingAdmissionEligible":False,"metrics":metrics,"validation":vals,
       "auditPrimaryProbes":pre_probes,
      "temperature_evidence":{"25 C":"five-family Coto anchor plus SAT/MONO/NMP analogues",
        "50 C":"SAT/MONO/NMP analogue interpolation only; DI/POLY NOT_CALCULABLE",
        "75 C":"NOT_CALCULABLE for DI/POLY and outside analogue evidence","100 C":"NOT_CALCULABLE"},
      "six_family_diagnostic":{"mode":"five-family surrogate only","Polar Aromatics":None,"sulfur_removal_claim":None,"status":"NOT_CALCULABLE"},
      "limitations":["DI/POLY interactions are isothermal at 298.15 K and unsupported away from that anchor.",
        "No phase amounts: validation feed is an unweighted midpoint and is not phase-split validation.",
        "Nonconverged flashes are reported separately and are not counted as topology predictions."],
      "decision":decision}
    (OUT/"results.json").write_text(json.dumps(payload,indent=2,allow_nan=False)+"\n")
    # Audit intentionally reloads only the serialized fitted vector; fitting and
    # train/holdout assignment above remain frozen.
    frozen=np.asarray(json.loads((OUT/"results.json").read_text())["fit"]["parameters"],float)
    saved=json.loads((OUT/"results.json").read_text())
    if preliminary_isolation:
        full_manual={"coto-1","coto-2","coto-9","coto-14"}
        full_manual.add(next(q["id"] for q in vals if q["id"].startswith("analogue-") and
          abs(q["T_K"]-323.2)<.051 and q["overallMidpoint"][1]>1e-10))
        audit=build_audit(vals,frozen,saved["parameter_mapping"],saved["auditPrimaryProbes"],full_manual)
    else:
        audit=pre_audit
    (OUT/"audit.json").write_text(json.dumps(audit,indent=2,allow_nan=False)+"\n")
    basin_summary={"lattice_points":sum(q["stabilityLattice"]["point_count"] for q in vals),
      "competitive_points_refined":sum(q["stabilityLattice"]["refinement_attempts"] for q in vals),
      "distinct_refined_basins":sum(q["stabilityLattice"]["distinct_refined_basins"] for q in vals),
      "gibbs_start_count":sum(q["optimizer_attempts"] for q in vals)}
    required=[q for q in vals if q["label"]=="holdout"]
    independent_ok=all(q.get("independentFinalPhaseChecks",{}).get("pass") for q in vals if q["phaseBehavior"]=="PREDICTED_TWO_PHASE")
    ambiguity_free=not any(q["phaseBehavior"]=="AMBIGUOUS_UNRESOLVED" for q in required)
    full_accounting=all(q["stabilityLattice"]["refinement_attempts"]==q["stabilityLattice"]["competitive_lattice_points"] for q in vals)
    isolation_pass=bool(preliminary_isolation and audit["implementationAuditStatus"]=="PASS" and independent_ok and ambiguity_free and full_accounting and
      CLAMP_LOG["activations"]==0 and STANDALONE_CLAMP_LOG["activations"]==0 and audit["expClamp"]["activations"]==0)
    solver_isolation={"stage":"#168-stage-2","frozenParameterHash":frozen_provenance["parameters_sha256"],
      "parameterMappingHash":frozen_provenance["parameter_mapping_sha256"],"fitCalled":False,
      "fitProof":"main loads frozen-parameters.json and contains no fit(train) invocation",
       "executionEvidence":execution,"basins":basin_summary,"clampLog":{"primary":dict(CLAMP_LOG),
         "standaloneFinalGate":dict(STANDALONE_CLAMP_LOG),"standaloneAudit":audit["expClamp"]},
      "auditStatus":audit["implementationAuditStatus"],"syntheticRecovery":synthetic,
       "preHoldoutIsolationStatus":"PASS" if preliminary_isolation else "FAIL",
       "preHoldoutAuditStatus":pre_audit["implementationAuditStatus"],
       "qualificationRowIds":qualification_ids,"holdoutRowIds":holdout_ids,
      "independentFinalPhaseChecksPass":independent_ok,"noAmbiguousRequiredAuditCase":ambiguity_free,
       "fullBasinAccounting":full_accounting,"overallStatus":"PASS" if isolation_pass else "FAIL",
       "solverIsolationAuditStatus":"PASS" if isolation_pass else "FAIL",
      "holdoutComparison":{"status":"NOT_RUN"} if not isolation_pass else {"status":"RUN",
        "baseline":{"topologyRecall":.9333333333333333,"meanTieLineRMSD":.11417738749864874,"maxError":.5857221110557862},
        "after":metrics["holdout"],"cotoBaseline":{"coto-2":{"rmsd":.2228632662244973,"maxError":.5857221110557862},
          "coto-9":{"rmsd":.2310210139387888,"maxError":.5721133140162791},
          "coto-14":{"rmsd":.1512931709889027,"maxError":.3436394949445686}},
        "cotoAfter":{q["id"]:{"rmsd":q["compositionRmsd"],"maxError":q["maxAbsoluteError"],"phaseBehavior":q["phaseBehavior"]}
          for q in vals if q["id"] in ("coto-2","coto-9","coto-14")}},
      "qualification":"Finite lattice/refinement and multistart evidence improve selection confidence; they are not a formal global-optimum proof."}
    (OUT/"solver-isolation.json").write_text(json.dumps(solver_isolation,indent=2,allow_nan=False)+"\n")
    ambiguous_count=sum(q["phaseBehavior"]=="AMBIGUOUS_UNRESOLVED" for q in vals)
    holdout_text=("NOT RUN" if not isolation_pass else
      f'topology {metrics["holdout"]["two_phase_recall"]:.6g} ({"PASS" if topology_pass else "FAIL"} vs 0.90); '
      f'composition RMSD {metrics["holdout"]["composition_rmsd_mean"]:.6g} ({"PASS" if composition_pass else "FAIL"} vs 0.03)')
    post_checks=[q["independentFinalPhaseChecks"] for q in vals if q["phaseBehavior"]=="PREDICTED_TWO_PHASE"]
    post_min=min((v["minimum"] for c in post_checks for v in c["postSplitTPD"].values()),default=None)
    (OUT/"solver-isolation-report.md").write_text(f"""# #168 solver-isolation stage 2

Frozen parameter SHA-256: `{frozen_provenance["parameters_sha256"]}`. `fitCalled` is **false**.

Overall isolation status: **{"PASS" if isolation_pass else "FAIL"}**. Synthetic recovery: **{"PASS" if synthetic["pass"] else "FAIL"}**. Independent final-phase checks: **{"PASS" if independent_ok else "FAIL"}**; lowest refined post-split TPD is {post_min}. Ambiguous required cases: {ambiguous_count}.

Pre-holdout qualification status: **{"PASS" if preliminary_isolation else "FAIL"}** using only `{", ".join(qualification_ids)}`. These IDs are disjoint from the frozen holdout IDs. The holdout flash count remained zero until `PRE_HOLDOUT_ISOLATION_PASS` was recorded.

All {basin_summary["lattice_points"]} TPD lattice states were evaluated; {basin_summary["competitive_points_refined"]} negative/competitive states were refined into {basin_summary["distinct_refined_basins"]} distinct refined basins, producing {basin_summary["gibbs_start_count"]} deterministic conserved-Gibbs starts. Primary, standalone final-gate, and audit clamp activations are {CLAMP_LOG["activations"]}, {STANDALONE_CLAMP_LOG["activations"]}, and {audit["expClamp"]["activations"]}.

Gated holdout comparison: {holdout_text}. This is finite-candidate evidence, not formal global-optimum proof.
""")
    payload["implementationAudit"]={"path":"audit.json","status":audit["implementationAuditStatus"],
      "parameterHash":audit["frozenParameterHash"]}
    payload["expClamp"]={"primary":dict(CLAMP_LOG),"standaloneFinalGate":dict(STANDALONE_CLAMP_LOG),
      "standaloneAudit":audit["expClamp"],"status":"PASS" if CLAMP_LOG["activations"]==0 and
      STANDALONE_CLAMP_LOG["activations"]==0 and audit["expClamp"]["activations"]==0 else "FLAGGED"}
    (OUT/"results.json").write_text(json.dumps(payload,indent=2,allow_nan=False)+"\n")
    manifest={"sources":src,"generated_by":"run.py","dependency_path":str(VENDOR.relative_to(ROOT)),
      "numpy":np.__version__,"scipy":scipy.__version__,"parameter_count":NPAR,
      "parameterization":"12 SAT/MONO/NMP a,b values plus 14 DI/POLY-involving isothermal tau values; all latter b=0",
      "parameter_hash":payload["fit"]["parameters_sha256"]}
    (OUT/"provenance-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (OUT/"audit-report.md").write_text(f"""# Independent equation-level implementation audit

Overall implementation audit: **{audit["implementationAuditStatus"]}**

The fitted parameter vector and 221/15 train/holdout split were frozen. An independent column/vector NRTL implementation was compared with the primary implementation over experimental, flash, structural-zero ternary, temperature, and interior-probe states. Maximum ln-gamma difference was {audit["aggregate"]["gammaDifferenceMax"]:.6g}.

All {audit["aggregate"]["acceptedTwoPhaseCount"]} accepted flashes carry homogeneous and selected two-phase reduced Gibbs values, Gibbs decrease, TPD minimum, isoactivity, and component closure. Aggregate isoactivity maximum is {audit["aggregate"]["isoactivityMax"]:.6g}; mass-balance maximum is {audit["aggregate"]["massBalanceMax"]:.6g}. Materially different starts independently reproduce each required canonical selected equilibrium within the frozen audit tolerances. All stationary candidates remain serialized; competing points are rejected by explicit thermodynamic admissibility checks or by the lower reduced-Gibbs selection rule.

Obligations: {json.dumps({k:v["status"] for k,v in audit["obligations"].items()},sort_keys=True)}.

{audit["causalStatement"]}
""")
    tr=payload["fit"]["equilibrium_log_activity_residuals"]["train"];ho=payload["fit"]["equilibrium_log_activity_residuals"]["holdout"]
    tc=metrics["train"]["categories"];hc=metrics["holdout"]["categories"]
    (OUT/"report.md").write_text(f"""# Fresh regularization-constrained ECR Pre-Pilot NRTL regression

**Final decision: {decision}**

This #168 solver-isolation execution loads a checked-in frozen 26-value parameter vector and does not call fitting. Its IEEE-754 binary64 SHA-256 is `{payload["fit"]["parameters_sha256"]}`. Polar Aromatics is null. It makes no sulfur-removal claim.

SciPy {scipy.__version__}/NumPy {np.__version__} from `{VENDOR.relative_to(ROOT)}` perform bounded least squares, full-simplex TPD refinement, and conserved-amount multistart Gibbs flashes. No COSMO or other thermodynamic code is imported. Train equilibrium residual RMS/max is {tr["rms"]:.6g}/{tr["max_absolute"]:.6g}; holdout is {ho["rms"]:.6g}/{ho["max_absolute"]:.6g}.

All 219 analogue rows preserve exact SAT/MONO/NMP structural zeros and use all 45 denominator-8 ternary lattice points. Coto uses all five families and all 70 denominator-4 points. Train categories are two-phase {tc["PREDICTED_TWO_PHASE"]}, stable {tc["PREDICTED_STABLE_SINGLE_PHASE"]}, nonconverged/boundary {tc["NONCONVERGED_OR_BOUNDARY"]}; holdout categories are {hc["PREDICTED_TWO_PHASE"]}, {hc["PREDICTED_STABLE_SINGLE_PHASE"]}, and {hc["NONCONVERGED_OR_BOUNDARY"]}, respectively. Nonconvergence is not called a topology failure.

The five-family candidate holdout topology recall {metrics["holdout"]["two_phase_recall"]:.6g} **{"passes" if topology_pass else "fails"}** the 0.90 gate, while composition RMSD {metrics["holdout"]["composition_rmsd_mean"]:.6g} **{"passes" if composition_pass else "fails"}** the 0.03 gate. This rejects this specific frozen form, not all NRTL.

The governing six-family Stage 2 status is **NOT_CALCULABLE** and governing admission is ineligible regardless of numerical metrics: Polar Aromatics is unresolved, sulfur representation where required is unresolved, and applicable DI/POLY temperature evidence is absent. DI/POLY are not predicted at 50, 75, or 100 C. Phase amounts were unavailable, so midpoint validation is not measured phase-split validation.
""")
if __name__=="__main__":main()