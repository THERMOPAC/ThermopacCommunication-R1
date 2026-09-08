"""True local-block Lobatto assembly for isolated finite-film research."""
from __future__ import annotations
import numpy as np
from scipy.sparse import csc_matrix
from scipy.sparse.linalg import lsqr
from solver import boundary, conductances, gradient, FilmDomainError
from bernstein_profile_v5 import BernsteinHermiteProfile, audit_bernstein
import hashlib


class LocalLobattoSystem:
    def __init__(self, bc, bd, gc, gd, ac, ad, nodes):
        self.bc, self.bd = boundary(bc), boundary(bd)
        self.gc, self.gd = conductances(gc), conductances(gd)
        self.ac, self.ad, self.m = ac, ad, int(nodes)
        self.h = 1/(self.m-1); self.scale = float(max(self.gc.max(), self.gd.max()))
        self.dc, self.dd = int(np.argmax(self.bc)), int(np.argmax(self.bd))
        self.jc = [i for i in range(7) if i != self.dc]
        self.jd = [i for i in range(7) if i != self.dd]
        self.instrumentation = {"fullResidualCalls":0, "endpointFieldCalls":0,
            "intervalCalls":0, "localColumnCalls":0, "fluxColumnCalls":0}

    @property
    def dimension(self): return 12*(self.m-1)+7

    def full(self, q, dependent, independent):
        x=np.empty(7); x[independent]=q; x[dependent]=1-q.sum()
        if not np.all(np.isfinite(x)) or np.any(x < 0):
            raise FilmDomainError("V10_TRIAL_OUTSIDE_CLOSED_SIMPLEX")
        return x

    def pack_initial(self, ic, id_, flux=None, profile_c=None, profile_d=None):
        mesh=np.linspace(0,1,self.m)
        c=(self.bc[None,:]*(1-mesh[:,None])+boundary(ic)[None,:]*mesh[:,None]
           if profile_c is None else np.asarray(profile_c(mesh)))
        d=(boundary(id_)[None,:]*(1-mesh[:,None])+self.bd[None,:]*mesh[:,None]
           if profile_d is None else np.asarray(profile_d(mesh)))
        c[0],d[-1]=self.bc,self.bd
        p=np.zeros(7) if flux is None else np.asarray(flux)/self.scale
        return np.r_[c[1:,self.jc].ravel(),d[:-1,self.jd].ravel(),p]

    def unpack(self,u):
        c=[self.bc.copy()]; d=[]; k=0
        for _ in range(self.m-1):
            c.append(self.full(u[k:k+6],self.dc,self.jc)); k+=6
        for _ in range(self.m-1):
            d.append(self.full(u[k:k+6],self.dd,self.jd)); k+=6
        d.append(self.bd.copy())
        return np.asarray(c),np.asarray(d),u[k:k+7]*self.scale

    def field(self,x,flux,g,adapter):
        self.instrumentation["endpointFieldCalls"]+=1
        return gradient(x,flux,g,adapter)

    def interval(self,x0,x1,f0,f1,flux,g,adapter):
        self.instrumentation["intervalCalls"]+=1
        xm=.5*(x0+x1)-self.h*(f1-f0)/8
        if np.any(xm < 0): raise FilmDomainError("V10_LOBATTO_MIDPOINT_NEGATIVE")
        fm=self.field(xm,flux,g,adapter)
        return x1-x0-self.h*(f0+4*fm+f1)/6

    def chemistry(self,xc,xd):
        if np.any(xc <= 0) or np.any(xd <= 0):
            raise FilmDomainError("V10_INTERFACE_LOG_REQUIRES_POSITIVE")
        return np.log(xc)+self.ac.excess(xc)-np.log(xd)-self.ad.excess(xd)

    def base(self,u):
        self.instrumentation["fullResidualCalls"]+=1
        c,d,flux=self.unpack(u)
        fc=np.asarray([self.field(x,flux,self.gc,self.ac) for x in c])
        fd=np.asarray([self.field(x,flux,self.gd,self.ad) for x in d])
        rc=np.asarray([self.interval(c[k],c[k+1],fc[k],fc[k+1],flux,self.gc,self.ac)
                       for k in range(self.m-1)])
        rd=np.asarray([self.interval(d[k],d[k+1],fd[k],fd[k+1],flux,self.gd,self.ad)
                       for k in range(self.m-1)])
        raw=np.r_[rc[:,self.jc].ravel(),rd[:,self.jd].ravel(),
                  self.chemistry(c[-1],d[0])]
        scaled=raw.copy(); scaled[-7:]/=10
        return {"c":c,"d":d,"flux":flux,"fc":fc,"fd":fd,"rc":rc,"rd":rd,
                "raw":raw,"scaled":scaled}

    def local_column(self,u,base,col,step):
        """Evaluate one changed node field and only its adjacent intervals."""
        self.instrumentation["localColumnCalls"]+=1
        trial=u.copy(); trial[col]+=step
        c,d,flux=self.unpack(trial)
        derivative=np.zeros(self.dimension)
        split=6*(self.m-1)
        if col < split:
            node=col//6+1; profile=c; old=base["c"]; fields=base["fc"]
            g,adapter,independent,offset=self.gc,self.ac,self.jc,0
        else:
            node=(col-split)//6; profile=d; old=base["d"]; fields=base["fd"]
            g,adapter,independent,offset=self.gd,self.ad,self.jd,split
        changed=self.field(profile[node],flux,g,adapter)
        for k in (node-1,node):
            if 0 <= k < self.m-1:
                f0=changed if k==node else fields[k]
                f1=changed if k+1==node else fields[k+1]
                defect=self.interval(profile[k],profile[k+1],f0,f1,flux,g,adapter)
                old_defect=(base["rc"] if offset==0 else base["rd"])[k]
                rows=slice(offset+6*k,offset+6*(k+1))
                derivative[rows]=(defect[independent]-old_defect[independent])/step
        interface=(offset==0 and node==self.m-1) or (offset!=0 and node==0)
        if interface:
            chem=self.chemistry(c[-1],d[0])/10
            derivative[-7:]=(chem-base["scaled"][-7:])/step
        return derivative

    def jacobian(self,u,base=None):
        base=self.base(u) if base is None else base
        columns=[]; state=12*(self.m-1)
        for col in range(self.dimension):
            step=2e-7*max(1,abs(u[col]))
            if col < state:
                for _ in range(40):
                    try: column=self.local_column(u,base,col,step); break
                    except FilmDomainError:
                        step=-abs(step)
                        try: column=self.local_column(u,base,col,step); break
                        except FilmDomainError: step=abs(step)/2
                else: raise FilmDomainError("V10_NO_LOCAL_FD_SIMPLEX_MARGIN")
            else:
                self.instrumentation["fluxColumnCalls"]+=1
                trial=u.copy(); trial[col]+=step
                column=(self.base(trial)["scaled"]-base["scaled"])/step
            columns.append(column)
        return csc_matrix(np.column_stack(columns))

    def dense_reference_jacobian(self,u):
        base=self.base(u)["scaled"]; columns=[]
        for col in range(len(u)):
            h=2e-7*max(1,abs(u[col])); trial=u.copy(); trial[col]+=h
            columns.append((self.base(trial)["scaled"]-base)/h)
        return np.column_stack(columns)


def solve_sparse_v10(system,u,max_iterations=18,tolerance=1e-8):
    history=[]
    for iteration in range(max_iterations):
        base=system.base(u); norm=float(np.max(np.abs(base["raw"])))
        history.append({"iteration":iteration,"maximumPhysicalResidual":norm})
        if norm <= tolerance: break
        jac=system.jacobian(u,base)
        linear=lsqr(jac,-base["scaled"],atol=1e-12,btol=1e-12,
                    iter_lim=4*system.dimension)
        step=linear[0]
        history[-1]["lsqr"]={"istop":int(linear[1]),"iterations":int(linear[2]),
                             "residualNorm":float(linear[3]),
                             "normalEquationResidualNorm":float(linear[4])}
        merit=float(base["scaled"]@base["scaled"]); alpha=1
        for halves in range(60):
            try:
                candidate=system.base(u+alpha*step)
                if candidate["scaled"]@candidate["scaled"] < merit*(1-1e-4*alpha):
                    u=u+alpha*step; break
            except FilmDomainError: pass
            alpha/=2
        else: return {"status":"LINE_SEARCH_STALLED","history":history}
    final=system.base(u); c,d,flux=final["c"],final["d"],final["flux"]
    mesh=np.linspace(0,1,system.m)
    pc=BernsteinHermiteProfile(mesh,c,final["fc"],left=system.bc)
    pd=BernsteinHermiteProfile(mesh,d,final["fd"],right=system.bd)
    ac=audit_bernstein(pc,flux,system.gc,system.ac)
    ad=audit_bernstein(pd,flux,system.gd,system.ad)
    jac=system.jacobian(u,final); singular=np.linalg.svd(jac.toarray(),compute_uv=False)
    rank_tol=float(singular[0]*1e-10); rank=int(np.sum(singular>rank_tol))
    iso=float(np.max(np.abs(final["raw"][-7:])))
    accepted=(history[-1]["maximumPhysicalResidual"]<=tolerance and iso<=1e-7 and
              ac["status"]==ad["status"]=="NUMERICAL_PROFILE_CHECKS_PASSED" and
              rank==system.dimension and max(ac["maximumNormalizationDefect"],
              ad["maximumNormalizationDefect"])<=1e-12)
    return {"status":"CONVERGED" if history[-1]["maximumPhysicalResidual"]<=tolerance
            else "ITERATION_BUDGET","u":u,"flux":flux,
            "interfaceContinuous":c[-1],"interfaceDispersed":d[0],
            "continuousProfile":pc,"dispersedProfile":pd,
            "continuousAudit":ac,"dispersedAudit":ad,
            "maximumIsoactivityResidual":iso,"reducedJacobian":{"dimension":system.dimension,
            "rank":rank,"fullRank":rank==system.dimension,"singularValues":singular,
            "declaredRankTolerance":rank_tol},"instrumentation":system.instrumentation,
            "history":history,"numericalAccepted":bool(accepted)}


def root_fingerprint(row):
    """Fingerprint exact serialized interfaces, flux and Bernstein profiles."""
    def controls(value):
        return value.controls if hasattr(value,"controls") else value["bernsteinControls"]
    arrays = [row["flux"], row["interfaceContinuous"], row["interfaceDispersed"],
              controls(row["continuousProfile"]), controls(row["dispersedProfile"])]
    digest=hashlib.sha256()
    for value in arrays:
        array=np.asarray(value,dtype=np.float64)
        digest.update(str(array.shape).encode()); digest.update(array.tobytes())
    return digest.hexdigest()


def qualification_gate(levels, independent_final, *, tolerance=1e-8):
    """Require the actual final two of >=3 strictly increasing mesh levels."""
    metrics=("maximumScaledFluxDriftFromPrevious",
             "maximumInterfaceDriftFromPrevious",
             "maximumCommonCoordinateProfileDriftFromPrevious")
    increasing=(len(levels)>=3 and all(a["nodes"]<b["nodes"]
                                      for a,b in zip(levels[:-1],levels[1:])))
    final_pair=levels[-2:] if increasing else []
    pair_ok=bool(final_pair) and all(
        row["numericalAccepted"] and row["reducedJacobian"]["fullRank"] and
        row["reducedJacobian"]["rank"]==row["reducedJacobian"]["dimension"] and
        all(np.isfinite(row[key]) and row[key]<=tolerance for key in metrics)
        for row in final_pair)
    target_hash=root_fingerprint(levels[-1]) if levels else None
    independent_metrics=("maximumScaledFluxDifference","maximumInterfaceDifference",
                         "maximumCommonCoordinateProfileDifference")
    independent_ok=bool(levels and independent_final["numericalAccepted"] and
        independent_final["reducedJacobian"]["fullRank"] and
        independent_final["reducedJacobian"]["rank"]==
            independent_final["reducedJacobian"]["dimension"] and
        independent_final.get("nodes")==levels[-1]["nodes"] and
        independent_final.get("comparisonTargetRootHash")==target_hash and
        all(np.isfinite(independent_final[key]) and independent_final[key]<=tolerance
            for key in independent_metrics))
    return {"successiveQualifyingPair":
                [final_pair[0]["nodes"],final_pair[1]["nodes"]] if pair_ok else None,
            "comparisonTargetRootHash":target_hash,
            "independentFinalQualified": independent_ok,
            "qualified": bool(pair_ok and independent_ok)}