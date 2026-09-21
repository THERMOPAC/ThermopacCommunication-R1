#!/usr/bin/env python3
"""Offline conditional laminar momentum/terminal-slip benchmark. No app/DB access."""
from pathlib import Path
import hashlib
import json
import time
import numpy as np
import scipy
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import factorized
from scipy.interpolate import RectBivariateSpline, make_interp_spline
from scipy.integrate import cumulative_trapezoid
from scipy.optimize import brentq

ROOT = Path(__file__).resolve().parent
PREFIX = "kuhni-spatial-benchmark"
Q = 3.821794230 / 3600
MU, RHO, DRHO, G = .0598, 869., 146., 9.80665
A, B, H = .022, .350, .968  # z=0 is upper face, top-local z=+2 mm
SIZES = np.array([1.455, 1.55, 1.65, 1.75, 1.85, 1.95, 2.05, 2.15, 2.25, 2.339])


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def profile(r, slots):
    """Declared sin² inlet, not an inferred short-aperture Poiseuille law."""
    out = np.zeros_like(r)
    for lo, hi in slots:
        t = (r - lo) / (hi - lo)
        out += np.where((t > 0) & (t < 1), np.sin(np.pi*np.clip(t, 0, 1))**2, 0)
    return out


def boundary_psi(r, slots, outlet=False, derivative=0):
    """Analytic prescribed streamfunctions and radial derivatives, including solid plate."""
    r = np.asarray(r)
    if outlet:
        k = (B*B-A*A)/np.log(B/A)
        def primitive(x):
            return B*B*x*x/2-x**4/4-k*(x*x*np.log(B/x)/2+x*x/4)
        c = Q/(2*np.pi*(primitive(B)-primitive(A)))
        u = c*(B*B-r*r-k*np.log(B/r))
        if derivative == 0: return c*(primitive(r)-primitive(A))
        if derivative == 1: return r*u
        return u+c*r*(-2*r+k/r)
    c = 2*Q/sum(np.pi*(hi*hi-lo*lo) for lo,hi in slots)
    ans = np.zeros_like(r,dtype=float)
    for lo,hi in slots:
        k = 2*np.pi/(hi-lo)
        x = np.clip(r,lo,hi)
        if derivative == 0:
            ans += c*((x*x-lo*lo)/4-.5*(x*np.sin(k*(x-lo))/k+(np.cos(k*(x-lo))-1)/k**2))
        else:
            inside = (r>lo)&(r<hi)
            u = c*.5*(1-np.cos(k*(r-lo)))
            ans += np.where(inside,r*u if derivative==1 else u+r*c*.5*k*np.sin(k*(r-lo)),0)
    return ans


class ClampedField:
    """Analytic boundary lift + tensor cubic residual with exact zero normal derivatives."""
    def __init__(self,r,z,psi,slots):
        self.slots = slots
        # Boundary cardinal cubic: one at the inlet node, zero at other z nodes,
        # clamped derivative at both ends. It decays rapidly away from the inlet
        # and is exactly in the same axial spline space as the residual.
        cardinal=np.zeros(len(z));cardinal[0]=1
        self.cardinal=make_interp_spline(z,cardinal,k=3,bc_type="clamped")
        cardinal=np.zeros(len(z));cardinal[-1]=1
        self.top_cardinal=make_interp_spline(z,cardinal,k=3,bc_type="clamped")
        chi = self.blend(z,0)
        base=self.base(r,0)
        lift = base[:,None]+(boundary_psi(r,slots)-base)[:,None]*chi+(boundary_psi(r,slots,True)-base)[:,None]*self.top_cardinal(z)
        residual = psi-lift
        residual[[0,-1],:] = 0
        residual[:,[0,-1]] = 0
        cr = make_interp_spline(r,residual,k=3,bc_type="clamped",axis=0)
        cz = make_interp_spline(z,cr.c.T,k=3,bc_type="clamped",axis=0)
        self.residual = RectBivariateSpline._from_tck((cr.t,cz.t,cz.c.T.ravel(),3,3))

    def blend(self,z,derivative):
        return self.cardinal(z,nu=derivative)

    def base(self,r,derivative):
        t=(np.asarray(r)-A)/(B-A)
        if derivative==0: return Q/(2*np.pi)*(3*t*t-2*t**3)
        if derivative==1: return Q/(2*np.pi)*(6*t-6*t*t)/(B-A)
        return Q/(2*np.pi)*(6-12*t)/(B-A)**2

    def ev(self,r,z,dx=0,dy=0):
        r,z = np.broadcast_arrays(r,z)
        f = self.blend(z,dy)
        ft = self.top_cardinal(z,nu=dy)
        p0,p1 = boundary_psi(r,self.slots,derivative=dx),boundary_psi(r,self.slots,True,dx)
        base=self.base(r,dx)
        lift = (base if dy==0 else 0)+(p0-base)*f+(p1-base)*ft
        return self.residual.ev(r,z,dx=dx,dy=dy)+lift


def solve(nr, nz, slots, inertia=False):
    r, z = np.linspace(A, B, nr), np.linspace(0, H, nz)
    dr, dz = r[1]-r[0], z[1]-z[0]
    # Integrate on a fine auxiliary radial grid; identical physical BC on all grids.
    rf = np.linspace(A, B, 20001)
    inlet = profile(rf, slots)
    inlet *= Q / np.trapz(2*np.pi*rf*inlet, rf)
    # Fully developed annular Stokes flow at ideal entire-plane withdrawal.
    outlet = B*B-rf*rf-(B*B-A*A)*np.log(B/rf)/np.log(B/A)
    outlet *= Q / np.trapz(2*np.pi*rf*outlet, rf)
    psi0 = boundary_psi(r,slots)
    psi1 = boundary_psi(r,slots,True)
    total = Q/(2*np.pi)
    fixed = np.zeros((nr, nz), dtype=bool)
    values = np.zeros((nr, nz))
    # Clamped psi: walls no penetration + first-order normal derivative=0.
    fixed[:2, :] = fixed[-2:, :] = True
    values[-2:, :] = total
    fixed[:, :2] = fixed[:, -2:] = True
    values[:, :2] = psi0[:, None]
    values[:, -2:] = psi1[:, None]
    values[0, :] = 0
    values[-1, :] = total
    ii, jj, vv, weights = [], [], [], []
    k = 0
    for i in range(1, nr-1):
        for j in range(1, nz-1):
            for x, y, v in [(i-1,j,1/dr**2+1/(2*r[i]*dr)),
                            (i+1,j,1/dr**2-1/(2*r[i]*dr)),
                            (i,j-1,1/dz**2),(i,j+1,1/dz**2),
                            (i,j,-2/dr**2-2/dz**2)]:
                ii.append(k); jj.append(x*nz+y); vv.append(v)
            weights.append(dr*dz/r[i])
            k += 1
    L = coo_matrix((vv, (ii,jj)), shape=(k,nr*nz)).tocsr()
    # Minimize integral (E psi)^2/r dr dz; Euler equation is E(E psi)=0.
    free = np.flatnonzero(~fixed.ravel())
    lf = L[:, free]
    W = diags(weights)
    mat = (lf.T @ W @ lf).tocsc()
    rhs = -lf.T @ (np.array(weights)*(L @ values.ravel()))
    invert = factorized(mat)
    x = invert(rhs)
    linear_residual = float(np.linalg.norm(mat@x-rhs)/np.linalg.norm(rhs))
    iteration_log = []
    def inertial_rhs(candidate):
        psn = values.ravel().copy()
        psn[free] = candidate
        pn = psn.reshape(nr,nz)
        q = np.zeros_like(pn)
        q[1:-1,1:-1] = (L@psn).reshape(nr-2,nz-2)
        qr,qz = np.gradient(q,dr,dz,edge_order=2)
        pr,pz = np.gradient(pn,dr,dz,edge_order=2)
        rv = r[:,None]
        vr,vz = -pz/rv,pr/rv
        f = (vr*qr+vz*qz-2*vr*q/rv)/(MU/RHO)
        return (f*dr*dz/rv).ravel()[free]
    if inertia:
        # Steady laminar vorticity transport: E(Eψ) =
        # (ur ∂r(Eψ)+uz ∂z(Eψ)−2ur(Eψ)/r)/ν.
        for iteration in range(160):
            load = inertial_rhs(x)
            target = invert(rhs+load)
            change = float(np.linalg.norm(target-x)/np.linalg.norm(x))
            x = .65*x+.35*target
            iteration_log.append(change)
            if change < 2e-9: break
        if iteration_log[-1] >= 2e-9:
            raise RuntimeError(f"Steady inertial solve did not converge: {iteration_log[-1]}")
    ps = values.ravel().copy()
    ps[free] = x
    psi = ps.reshape(nr,nz)
    spl = ClampedField(r,z,psi,slots)
    rr, zz = np.meshgrid(r[2:-2],z[2:-2],indexing="ij")
    rr, zz = rr.ravel(), zz.ravel()
    ur = -spl.ev(rr,zz,dy=1)/rr
    uz = spl.ev(rr,zz,dx=1)/rr
    # Independent numerical divergence of spline velocities, away from boundaries.
    eps = min(dr,dz)*1e-3
    def vel(rv,zv):
        return -spl.ev(rv,zv,dy=1)/rv, spl.ev(rv,zv,dx=1)/rv
    upr = vel(rr+eps,zz)[0]; umr = vel(rr-eps,zz)[0]
    upz = vel(rr,zz+eps)[1]; umz = vel(rr,zz-eps)[1]
    div = ((rr+eps)*upr-(rr-eps)*umr)/(2*eps*rr)+(upz-umz)/(2*eps)
    # Quantify neglected inertia relative to viscous term in solved field.
    urr = -spl.ev(rr,zz,dx=1,dy=1)/rr-ur/rr
    urz = -spl.ev(rr,zz,dy=2)/rr
    uzr = spl.ev(rr,zz,dx=2)/rr-uz/rr
    uzz = spl.ev(rr,zz,dx=1,dy=1)/rr
    acc = np.sqrt((ur*urr+uz*urz)**2+(ur*uzr+uz*uzz)**2)
    # Cylindrical vector Laplacian, independently differenced spline velocity.
    e = min(dr,dz)*.15
    rp,rm = vel(rr+e,zz),vel(rr-e,zz)
    zp,zm = vel(rr,zz+e),vel(rr,zz-e)
    lapr = (rp[0]-2*ur+rm[0]+zp[0]-2*ur+zm[0])/e**2+(rp[0]-rm[0])/(2*e*rr)-ur/rr**2
    lapz = (rp[1]-2*uz+rm[1]+zp[1]-2*uz+zm[1])/e**2+(rp[1]-rm[1])/(2*e*rr)
    visc = MU*np.sqrt(lapr**2+lapz**2)
    zones = {}
    for label,mask in [("all",np.ones(len(rr),dtype=bool)),("first_50mm",zz<.05),
                       ("calming",zz<.198),("quiet", (zz>=.298)&(zz<.898))]:
        zones[label] = dict(inertia_to_viscous_L2=float(np.sqrt(np.sum(rr[mask]*(RHO*acc[mask])**2)/np.sum(rr[mask]*visc[mask]**2))),
                           inertia_max_N_m3=float(np.max(RHO*acc[mask])),
                           viscous_max_N_m3=float(np.max(visc[mask])))
    # Curl momentum residual uses discrete variational equation; not NS validation.
    diag = {
        "nr":nr,"nz":nz,"dr_m":dr,"dz_m":dz,
        "model":"steady_laminar_inertial" if inertia else "Stokes",
        "linear_relative_residual":linear_residual,
        "nonlinear_iterations":len(iteration_log),
        "nonlinear_relative_update":iteration_log[-1] if iteration_log else None,
        "nonlinear_curl_momentum_residual":float(np.linalg.norm(mat@x-rhs-inertial_rhs(x))/max(np.linalg.norm(inertial_rhs(x)),1e-30)) if inertia else None,
        "max_divergence_per_s":float(np.max(np.abs(div))),
        "max_divergence_scaled_by_U_over_dr":float(np.max(np.abs(div))*dr/(Q/(np.pi*(B*B-A*A)))),
        "section_flux_relative_error":float(np.max(np.abs(2*np.pi*(psi[-1,:]-psi[0,:])/Q-1))),
        "ur_minmax_m_s":[float(ur.min()),float(ur.max())],
        "uz_minmax_m_s":[float(uz.min()),float(uz.max())],
        "max_inertial_force_N_m3":float(RHO*acc.max()),
        "inertia_vs_viscosity_by_zone":zones,
        "inlet_peak_m_s":float(inlet.max()),
        "inlet_momentum_N":float(RHO*np.trapz(2*np.pi*rf*inlet**2,rf)),
        "uniform_actual_net_opening_momentum_N":float(RHO*Q*Q/sum(np.pi*(hi*hi-lo*lo) for lo,hi in slots)),
        "dissipation_functional_W":float(2*np.pi*MU*np.sum(np.array(weights)*(L@ps)**2)),
    }
    rb = np.linspace(A,B,4001)
    zb = np.linspace(0,H,1001)
    solid = np.ones(len(rb),dtype=bool)
    for lo,hi in slots: solid &= ~((rb>lo)&(rb<hi))
    bottom = vel(rb,np.zeros_like(rb))
    top = vel(rb,np.full_like(rb,H))
    diag["boundary_residuals_m_s"] = {
        "bottom_radial":float(np.max(np.abs(bottom[0]))),
        "bottom_axial_prescribed":float(np.max(np.abs(bottom[1]-boundary_psi(rb,slots,derivative=1)/rb))),
        "solid_plate_axial":float(np.max(np.abs(bottom[1][solid]))),
        "outlet_radial":float(np.max(np.abs(top[0]))),
        "outlet_axial_prescribed":float(np.max(np.abs(top[1]-boundary_psi(rb,slots,True,1)/rb))),
        "shaft_both_components":float(np.max(np.abs(vel(np.full_like(zb,A),zb)))),
        "shell_both_components":float(np.max(np.abs(vel(np.full_like(zb,B),zb)))),
    }
    diag["launch_plane_max_radial_m_s"] = float(np.max(np.abs(vel(rb,np.full_like(rb,.00005))[0])))
    assert max(diag["boundary_residuals_m_s"].values()) < 1e-12
    return spl, diag, (r,z,psi), (rf,inlet)


def slip(dmm):
    d = dmm/1000
    return brentq(lambda v: 3*np.pi*MU*d*v*(1+.15*(RHO*v*d/MU)**.687)
                  - np.pi*d**3/6*DRHO*G, 1e-12,.1)


def first_event(ra,za,rn,zn,radius,slots):
    """Earliest intersection along the accepted step segment; contact wins exact ties."""
    dr,dz = rn-ra,zn-za
    tau = np.ones_like(ra)
    kind = np.zeros(len(ra),dtype=int)
    def offer(t,valid,code):
        valid = valid & (t>=0) & (t<=1) & ((t<tau)|(kind==0))
        tau[valid],kind[valid] = t[valid],code
    def crossing(start,delta,target):
        return np.divide(target-start,delta,out=np.full_like(start,np.inf),where=delta!=0)
    clear_slots = [(lo+radius,hi-radius) for lo,hi in slots]
    def clear(rv):
        ok = np.zeros(len(rv),dtype=bool)
        for lo,hi in clear_slots: ok |= (rv>lo)&(rv<hi)
        return ok
    # Physical contact surfaces first, ensuring priority at a corner/tie.
    for wall,direction in [(A+radius,-1),(B-radius,1)]:
        t=crossing(ra,dr,wall)
        offer(t,dr*direction>0,3)
    t=crossing(za,dz,radius)
    with np.errstate(invalid="ignore"):
        rc=ra+t*dr
    offer(t,(dz<0)&~clear(rc),3)
    # Lateral slot lips, including steps which finish back above the plate.
    for lo,hi in clear_slots:
        for edge,direction in [(lo,-1),(hi,1)]:
            t=crossing(ra,dr,edge)
            with np.errstate(invalid="ignore"):
                zc=za+t*dz
            offer(t,(dr*direction>0)&(zc>=0)&(zc<=radius),3)
    t=crossing(za,dz,0)
    with np.errstate(invalid="ignore"):
        rc=ra+t*dr
    offer(t,(dz<0)&clear(rc),1)
    t=crossing(za,dz,H)
    offer(t,dz>0,2)
    return ra+tau*dr,za+tau*dz,kind


def event_regression_checks():
    cases = [
        ("lip_before_return",.11,.0005,.17,-.001,[(.1,.12),(.125,.2)],3,.119,.000275),
        ("return_before_wall",.34,.0005,.36,-.01,[(A,B)],1,.34095238095238095,0.),
        ("plate_before_return",.125,.003,.125,-.003,[(.1,.12),(.13,.15)],3,.125,.001),
        ("outlet_before_wall",.34,H-.001,.36,H+.009,[(A,B)],2,.342,H),
    ]
    rows = []
    for name,ra,za,rn,zn,slots,code,er,ez in cases:
        r,z,k = first_event(*[np.array([v]) for v in [ra,za,rn,zn]],.001,slots)
        error = max(abs(r[0]-er),abs(z[0]-ez))
        assert k[0]==code and error<1e-12, name
        rows.append(dict(case=name,expected=code,actual=int(k[0]),location_error_m=float(error)))
    return rows


def track(spl, slots, n, dt, horizon, save_paths=False):
    # Deterministic midpoint radial quadrature; volume flux, NOT equal tag numbers.
    r0 = A+(np.arange(n)+.5)*(B-A)/n
    z0 = .00005
    uz0 = spl.ev(r0,np.full(n,z0),dx=1)/r0
    opening = np.zeros(n,dtype=bool)
    for lo,hi in slots:
        opening |= (r0>lo)&(r0<hi)
    rows, paths, cohorts = [], [], []
    for dmm in SIZES:
        vt = slip(dmm)
        radius = dmm/2000
        clear_slots = [(lo+radius,hi-radius) for lo,hi in slots]
        clear = np.zeros(n,dtype=bool)
        for lo,hi in clear_slots: clear |= (r0>lo)&(r0<hi)
        w = 2*np.pi*r0*(B-A)/n*np.maximum(uz0-vt,0)*opening*clear
        take = w>0
        r,z,w = r0[take].copy(),np.full(take.sum(),z0),w[take]
        raw = float(w.sum())
        if raw <= 0:
            raise ValueError(f"d={dmm} mm has zero launched flux; conditional probabilities are undefined")
        w /= raw
        cohorts.append(dict(d=dmm,vt=vt,r=r,w=w,raw=raw))
    counts=np.array([len(c["r"]) for c in cohorts])
    offsets=np.r_[0,np.cumsum(counts)]
    r=np.concatenate([c["r"] for c in cohorts])
    z=np.full(len(r),z0)
    allw=np.concatenate([c["w"] for c in cohorts])
    vt_all=np.repeat([c["vt"] for c in cohorts],counts)
    radius_all=np.repeat(SIZES/2000,counts)
    state=np.zeros(len(r),dtype=int)
    ever=np.zeros(len(r),dtype=bool)
    up=np.zeros(len(r),dtype=int);down=up.copy()
    samples=[offsets[k]+np.unique(np.linspace(0,counts[k]-1,min(12,counts[k])).astype(int)) for k in range(len(cohorts))]
    histories=[[] for c in cohorts]
    def vel(rv,zv,vt):
        rv=np.clip(rv,A+1e-10,B-1e-10);zv=np.clip(zv,0,H)
        return -spl.ev(rv,zv,dy=1)/rv,spl.ev(rv,zv,dx=1)/rv-vt
    for step in range(int(round(horizon/dt))):
        active=np.flatnonzero(state==0)
        if not len(active):break
        ra,za=r[active],z[active]
        vr,vz=vel(ra,za,vt_all[active])
        vm,wm=vel(ra+.5*dt*vr,za+.5*dt*vz,vt_all[active])
        rn,zn,event=first_event(ra,za,ra+dt*vm,za+dt*wm,radius_all[active],slots)
        state[active]=event
        up[active]+=(za<.298)&(zn>=.298)
        down[active]+=(za>=.298)&(zn<.298)
        ever[active]|=zn>=.298
        r[active],z[active]=np.clip(rn,A,B),np.clip(zn,0,H)
        if save_paths and step % max(1,int(5/dt))==0:
            for sample,hist in zip(samples,histories):
                hist.append(np.column_stack((r[sample],z[sample])).tolist())
    for k,c in enumerate(cohorts):
        sl=slice(offsets[k],offsets[k+1])
        w,st,zz,ev,uc,dc=allw[sl],state[sl],z[sl],ever[sl],up[sl],down[sl]
        ret,out,contact=[float(w[st==v].sum()) for v in [1,2,3]]
        mobile=float(w[st==0].sum())
        dmm,vt,raw=c["d"],c["vt"],c["raw"]
        row = dict(d_mm=float(dmm),vt_m_s=vt,launch_flux_m3_s_per_uniform_local_alpha=raw,
                   tag_count=int(counts[k]),P_return=ret,P_transmit=out,P_retained=mobile+contact,
                   retained_mobile=mobile,retained_contact=contact,
                   retained_mobile_quiet=float(w[(st==0)&(zz>=.298)].sum()),
                   ever_enter_quiet=float(w[ev].sum()),
                   quiet_upcross_volume_events=float(w@uc),quiet_downcross_volume_events=float(w@dc),
                   quiet_balance_residual=float(w@(uc-dc)-out-w[(st==0)&(zz>=.298)].sum()-w[(st==3)&(zz>=.298)].sum()),
                   conservation_error=abs(ret+out+contact+mobile-1),
                   return_after_quiet=float(w[(st==1)&ev].sum()))
        rows.append(row)
        if save_paths: paths.append(dict(d_mm=float(dmm),points=histories[k]))
    return dict(radial_launch_bins=n,dt_s=dt,horizon_s=horizon,rows=rows),paths


def svg(field, paths, slots, height=H, suffix=""):
    r,z,ps = field
    spl = ClampedField(r,z,ps,slots)
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="820" viewBox="0 0 1100 820">',
             '<defs><clipPath id="tracks"><rect x="600" y="80" width="430" height="680"/></clipPath></defs>',
             '<rect width="1100" height="820" fill="white"/>',
             '<text x="30" y="28" font-size="20">Conditional annular laminar field / tagged trajectories — NOT calibrated flow</text>']
    def X(v,offset):return offset+(v-A)/(B-A)*430
    def Y(v):return 760-v/height*680
    for off,title in [(60,"Velocity arrows (individually scaled ×5000)"),(600,"Selected volume-flux launch tags; color=size")]:
        parts += [f'<text x="{off}" y="58" font-size="15">{title}</text>',
                  f'<rect x="{off}" y="80" width="430" height="680" fill="none" stroke="black"/>']
        for h,label in [(.198,"calming end"),(.298,"quiet entry"),(.898,"outlet lower edge")]:
            if h>height: continue
            parts += [f'<path d="M {off} {Y(h)} h 430" stroke="#aaa" stroke-dasharray="4 4"/>',
                      f'<text x="{off+3}" y="{Y(h)-4}" font-size="10">{label}: local z={h+.002:.3f} m</text>']
        for lo,hi in slots:
            parts.append(f'<path d="M {X(lo,off)} 763 H {X(hi,off)}" stroke="#007c78" stroke-width="5"/>')
    for rv in np.linspace(A+.008,B-.008,19):
        for zv in np.linspace(min(.008,height/50),height-min(.008,height/50),33):
            u=-spl.ev(rv,zv,dy=1)/rv; w=spl.ev(rv,zv,dx=1)/rv
            x,y=X(rv,60),Y(zv)
            dx,dy=float(u*5000),float(-w*5000)
            parts.append(f'<path d="M{x:.2f},{y:.2f} l{dx:.2f},{dy:.2f}" stroke="#226b99" stroke-width="1"/>')
            parts.append(f'<circle cx="{x+dx:.2f}" cy="{y+dy:.2f}" r="1.4" fill="#226b99"/>')
    for k,p in enumerate(paths):
        arr=np.array(p["points"])
        if not arr.size: continue
        color=f'hsl({k*29},70%,42%)'
        for j in range(arr.shape[1]):
            points=" ".join(f"{X(a,600):.2f},{Y(b):.2f}" for a,b in arr[:,j,:])
            parts.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="1.1" opacity=".65" clip-path="url(#tracks)"/>')
        parts.append(f'<text x="{610+(k%5)*83}" y="{784+(k//5)*15}" fill="{color}" font-size="11">{p["d_mm"]:.3f} mm</text>')
    parts.append(f'<text x="60" y="786" font-size="12">Radius 22–350 mm; height above plate 0–{height*1000:.0f} mm</text></svg>')
    (ROOT/f"{PREFIX}{suffix}.svg").write_text("\n".join(parts))


def main():
    start=time.time()
    event_tests = event_regression_checks()
    old={str(p.relative_to(ROOT)):digest(p) for p in ROOT.rglob("*") if p.is_file() and not p.name.startswith(PREFIX)}
    preview=ROOT/"stage5-current-269/current-preview.json"
    data=json.loads(preview.read_text())
    st=data["geometry"]["r1Model"]["approvedComponent"]["stator"]
    assert len(st["holes"])==84 and abs(st["radiusM"]-B)<1e-12
    assert abs(st["thicknessM"]-.004)<1e-12
    slots=[(A,st["centreOpeningDiameterM"]/2)]
    for row in st["rows"]:
        radius=row["radiusM"]
        width=row["count"]*st["holeDiameterM"]**2/(8*radius)
        slots.append((radius-width/2,radius+width/2))
    area=sum(np.pi*(hi*hi-lo*lo) for lo,hi in slots)
    assert abs(area-(np.pi*.112**2/4+84*np.pi*st["holeDiameterM"]**2/4-np.pi*.044**2/4))<1e-12
    runs=[]; fields=[]
    for nr,nz in [(49,145),(73,217),(97,289)]:
        print("Solving grid",nr,nz,flush=True)
        sp,diag,field,bc=solve(nr,nz,slots,inertia=True)
        tr,paths=track(sp,slots,384,.1,1200,save_paths=nr==97)
        runs.append(dict(name=f"grid-{nr}",field_checks=diag,tracking=tr))
        fields.append((sp,field))
        print([(x["d_mm"],round(x["P_return"],3),round(x["P_transmit"],3),round(x["P_retained"],3)) for x in tr["rows"]],flush=True)
    sp,field=fields[-1]
    svg(field,paths,slots)
    svg(field,paths,slots,height=.1,suffix=".near-plate")
    (ROOT/f"{PREFIX}.trajectories.json").write_text(json.dumps(
        dict(description="Selected unweighted display tracks only; ensemble probabilities are separately flux weighted.",
             sampling_s=5,z_datum="upper stator face; add 0.002 m for top-local coordinate",tracks=paths),
        separators=(",",":"))+"\n")
    for name,n,dt,t in [("time-half",384,.05,1200),("particles-double",768,.1,1200),("horizon-double",384,.1,2400)]:
        print(name,flush=True)
        tr,_=track(sp,slots,n,dt,t)
        runs.append(dict(name=name,tracking=tr))
    print("Stokes comparison",flush=True)
    stsp,stdiag,_,_=solve(97,289,slots,inertia=False)
    sttr,_=track(stsp,slots,384,.1,1200)
    runs.append(dict(name="Stokes-comparison",field_checks=stdiag,tracking=sttr))
    np.savez_compressed(ROOT/f"{PREFIX}.field.npz",r_m=field[0],z_above_face_m=field[1],psi_m3_s=field[2])
    base=runs[2]["tracking"]["rows"]
    checks={}
    for run in runs:
        checks[run["name"]]={key:float(max(abs(a[key]-b[key]) for a,b in zip(run["tracking"]["rows"],base)))
                             for key in ["P_return","P_transmit","P_retained"]}
    changed=[p for p,h in old.items() if not (ROOT/p).exists() or digest(ROOT/p)!=h]
    assert not changed, changed
    for run in runs:
        for row in run["tracking"]["rows"]:
            assert row["conservation_error"] < 1e-12
            assert abs(row["quiet_balance_residual"]) < 1e-12
            assert all(-1e-12 <= row[k] <= 1+1e-12 for k in ["P_return","P_transmit","P_retained"])
        if "field_checks" in run:
            assert run["field_checks"]["section_flux_relative_error"] < 1e-12
            assert run["field_checks"]["linear_relative_residual"] < 1e-8
            if run["field_checks"]["model"] == "steady_laminar_inertial":
                assert run["field_checks"]["nonlinear_curl_momentum_residual"] < 1e-6
    result=dict(status="CONDITIONAL BENCHMARK ONLY / actual performance HOLD",
                event_regression_checks=event_tests,
                numpy_version=np.__version__,scipy_version=scipy.__version__,runtime_s=time.time()-start,
                geometry=dict(preview_sha256=digest(preview),hole_count=84,hole_diameter_m=st["holeDiameterM"],
                              plate_thickness_m=.004,shaft_diameter_m=.044,central_opening_diameter_m=.112,
                              shell_diameter_m=.7,rotor_face_clearance_m=.087,rotor_center_local_z_m=-.105,
                              upper_face_local_z_m=.002,equivalent_slots_m=slots,net_open_area_m2=area),
                runs=runs,max_probability_difference_from_fine_baseline=checks,
                preservation=dict(count=len(old),sha256=old,changed=changed))
    (ROOT/f"{PREFIX}.json").write_text(json.dumps(result,indent=2)+"\n")
    report(result)
    print("Complete",result["runtime_s"],flush=True)


def report(result):
    lines=["# Conditional terminal-stator spatial laminar / tagged-volume benchmark",
           "",
           "**Executable momentum-based screening benchmark, not calibrated actual flow; hydraulic/fabrication HOLD.**",
           "",
           "Run `python3 deliverables/kuhni-spatial-benchmark.py`. Installed NumPy/SciPy only; no installation, app, DB, network or workflow access. SVG generated without plotting dependencies.",
           "",
           "## Geometry and declared boundaries",
           "",
           "Read the full terminal-flow evidence report, chain report, boundary memory and actual current-preview geometry. The preview is unsaved/preliminary, not an issued drawing. Actual 84 × 46.733285782 mm holes are mapped to four equivalent annular slots: each slot preserves its row's area and center radius, NOT discrete-hole momentum or azimuthal interhole topology. Central 112 mm opening around 44 mm shaft is retained. Shell is 700 mm. The 4 mm plate has faces at top-local −2/+2 mm; model starts at the upper face. Rotor top −89 mm, lower plate face −2 mm: 87 mm clearance, rotor center −105 mm. Rotor and aperture thickness are not meshed; their unknown discharge is replaced by an explicitly conditional upper-face inlet. No plate pressure loss or rotor torque is calculated.",
           "",
           "At each slot impose a smooth sin² radial axial inflow, zero radial velocity, equal peak in every slot, normalized to carrier Q=3.821794230 m³/h. This is an analyst boundary condition, NOT a thin-aperture fully developed profile or measured flow allocation. Peak exceeds the old uniform-opening mean, so the old 2.339 mm mean-jet cutoff is not a support cutoff here. Adjacent annular-slot jets and radial/inter-slot paths are resolved; individual holes and the six angular lanes are lost. The computed inlet momentum and uniform actual-open-area momentum are both recorded to expose, not conceal, this mismatch.",
           "",
           "Shell/shaft are stationary no-slip; swirl=0. There is no rotor forcing despite inherited 30 rpm and Np=1.2; these cannot determine an inlet vector field. Distributor/support envelope top-local 200–300 mm is transparent: fresh NMP source=0, no support obstruction, no injected momentum. Continue the SAME tags into quiet z=300–900 mm, then to ideal whole-annulus withdrawal at local z=970 mm with developed annular Stokes velocity. This is NOT the actual 70 mm lateral nozzle. Free surface, level inventory and upper support are not modeled. These strong assumptions are deliberately favorable to a tractable conditional test, not a physical bound.",
           "",
           "## Momentum equations and numerical method",
           "",
           "Solve steady axisymmetric, incompressible, no-swirl laminar momentum: ρ(u·∇)u=−∇p+μ∇²u, ∇·u=0. With ur=−ψz/r and uz=ψr/r, let Eψ=ψrr−ψr/r+ψzz=q. The pressure-eliminated equation is E q=(ur qr+uz qz−2ur q/r)/ν. Start with Stokes E q=0 by minimizing 2πμ∫q²/r dr dz with clamped boundaries. Then iterate the full advective-vorticity RHS using centered differences and 0.35 under-relaxation; sparse viscous factorization is reused. Stop only at relative streamfunction update <2e−9; failure raises an explicit error. This is a nonlinear steady laminar solve, not a prescribed vortex or turbulent jet correlation. An independent Stokes comparison quantifies the cost of dropping inertia.",
           "",
           "The discrete solve fixes first interior rows as a first-order approximation to normal derivative conditions; this does not itself provide an accurate boundary derivative under arbitrary interpolation. Reconstruction therefore uses ANALYTIC inlet/outlet streamfunction lifts plus a tensor cubic residual spline with exact clamped zero normal derivatives on all four boundaries. The lifts use boundary-local clamped axial cardinal splines (one at their boundary node, zero at other axial nodes), over a cubic radial base. Thus aperture-scale analytic radial structure does not contaminate the quiet-zone derivatives through imperfect cancellation of a global lift. Analytic slot integrals make the solid-plate axial velocity identically zero and preserve exact prescribed opening velocity, including between nodes. Both wall velocity components and inlet/outlet radial velocities are tested directly at thousands of points. This corrects the rejected original unconstrained RectBivariateSpline reconstruction; original fate numbers are superseded.",
           "",
           "Pressure is eliminated by curl; recorded linear residual belongs to the initial Stokes solve, and nonlinear curl-momentum residual is normalized by the advective load. These are discrete equations, not a guarantee that every reconstructed off-grid derivative satisfies momentum exactly. No primitive-pressure or transient-stability validation is claimed. Both velocity components derive from the SAME reconstructed ψ; an independent centered divergence diagnostic is reported. Section flux follows exactly from boundary ψ. NPZ saves the solved nodal field and grids; reconstruct using ClampedField from the script, NOT a default RectBivariateSpline.",
           "",
           "RRBO μ=.0598 Pa·s, ρ=869 kg/m³. Net mean hole Re≈4.73, annulus Re≈6.88. Viscosity matters and turbulent jet constants are unjustified, but Re is NOT ≪1. Stokes alone is not an asymptotically controlled approximation at this Re. Imposed inlet peak≈13.93 mm/s corresponds to round-hole Re≈9.46 (only a comparison scale for the annular surrogate). Therefore the principal results retain convective inertia. Axisymmetric steady laminar flow is a defensible mathematical *conditional benchmark* at these small imposed Reynolds numbers, but unknown rotor-driven velocities and swirl prevent it from being an actual-flow prediction. The inlet/developed-outlet constraints drive radial spreading and weak compensating flow without prescribing a vortex amplitude. A resolved rotating-rotor/discrete-hole calculation or measurements are still needed.",
           "",
           "## Conservative population method and return meaning",
           "",
           "Dilute noninteracting tags obey dr/dt=ur, dz/dt=uz−vt(d); Schiller–Naumann force balance, isolated spherical immobile-interface droplets (NMP density 1015 kg/m³), constant size, zero unresolved dispersion/coalescence/breakup. Instantaneous terminal slip is an approximation, not resolved droplet momentum. Deterministic radial midpoint quadrature at 50 µm above upper face, in equivalent open slots only, weights each tag by 2πr Δr max(uz−vt,0). This is conditional gross *volume-flux* weighting per uniform opening-local alpha at each size, not equal-number weighting or a measured DSD. Probabilities normalize separately for each size; no absolute ppm or cross-size population is inferred.",
           "",
           "Explicit midpoint time stepping with earliest-event localization along each accepted step segment: compute all shell/shaft contact, plate-face contact, slot-lip contact, lower-return and outlet intersections; stop at the minimum fractional time, with contact priority at exact ties. Later intersections cannot overwrite an earlier event. This detects a lip encountered before the lower return even if the endpoint lies in a different slot. Four synthetic event-order/location regressions are asserted. The accepted segment approximates a curved trajectory, so time refinement remains necessary; no exact continuous-trajectory event bound is claimed. Quiet events are counted only on the actually traversed, truncated segment.",
           "",
           "First downward crossing of an equivalent slot absorbs the tag as **first return**. Landing on plate or touching walls remains separately conserved contact inventory (no drainage/remobilization closure), never removal. The lower compartment is absent; later re-entry/re-entrainment of returned tags is UNKNOWN. Upper ideal withdrawal absorbs as P_transmit. P_retained = mobile + contact at the specified finite horizon; trapping is not permanent capture. Quiet up/down crossings count tagged-volume EVENTS and cancel in the inventory identity, while unique ever-quiet and return-after-quiet are separately reported. No fresh-source tags or dissolved NMP are included.",
           "",
           "Finite-size surrogate: launch/return slot edges and shell/shaft are offset by d/2 for centroid clearance. A centroid within d/2 of the plate outside a cleared slot is retained as contact. This conservative slot-clearance rule is not exact sphere/round-hole collision geometry; deformation, lubrication and wetting are unresolved. Upper-plane transmission is a centroid crossing. Zero launched flux would make normalized conditional probabilities undefined (explicit guard), not zero; every requested size has positive launched flux here. Lower passage traversal through the 4 mm plate is NOT demonstrated: first return is an upper-face re-crossing through an eligible equivalent opening, not a resolved lower-face/active-compartment exit.",
           "",
           "## Fine-grid results (1200 s, dt=0.1 s, 384 radial launch bins)",
           "",
           "| d mm | vt mm/s | first return | ideal transmit | retained mobile | retained contact | ever quiet |",
           "|---:|---:|---:|---:|---:|---:|---:|"]
    for x in result["runs"][2]["tracking"]["rows"]:
        lines.append(f'| {x["d_mm"]:.3f} | {x["vt_m_s"]*1000:.5f} | {x["P_return"]:.6f} | {x["P_transmit"]:.6f} | {x["retained_mobile"]:.6f} | {x["retained_contact"]:.6f} | {x["ever_enter_quiet"]:.6f} |')
    lines += ["","## Verification and sensitivity","",
              "| run | max ΔP return | max ΔP transmit | max ΔP retained |",
              "|---|---:|---:|---:|"]
    for name,c in result["max_probability_difference_from_fine_baseline"].items():
        lines.append(f'| {name} | {c["P_return"]:.6g} | {c["P_transmit"]:.6g} | {c["P_retained"]:.6g} |')
    for run in result["runs"][:3]:
        d=run["field_checks"]
        lines.append(f'\n- {d["nr"]}×{d["nz"]}: initial linear residual {d["linear_relative_residual"]:.3g}; nonlinear curl-momentum residual {d["nonlinear_curl_momentum_residual"]:.3g} ({d["nonlinear_iterations"]} iterations); section flux relative error {d["section_flux_relative_error"]:.3g}; max divergence {d["max_divergence_per_s"]:.3g} s⁻¹; ur range {d["ur_minmax_m_s"]} m/s; uz range {d["uz_minmax_m_s"]} m/s.')
        lines.append(f'  Direct maximum boundary-velocity residual: {max(d["boundary_residuals_m_s"].values()):.3g} m/s. At 50 µm launch offset maximum radial velocity is {d["launch_plane_max_radial_m_s"]:.6g} m/s; this interior value is not a no-slip boundary condition.')
    st=result["runs"][-1]["field_checks"]["inertia_vs_viscosity_by_zone"]
    lines += [f'\nIndependent Stokes inertial/viscous force L2 ratios: all={st["all"]["inertia_to_viscous_L2"]:.4f}, first 50 mm={st["first_50mm"]["inertia_to_viscous_L2"]:.4f}, quiet={st["quiet"]["inertia_to_viscous_L2"]:.4f}. These compare ρ|u·∇u| with μ|vector Laplacian u| using cylindrical volume weights. They are not measured error bounds. The laminar solve retains inertia everywhere.']
    rows=[x for run in result["runs"] for x in run["tracking"]["rows"]]
    lines += [f'\nMaximum unique-volume conservation error: {max(x["conservation_error"] for x in rows):.3g}; quiet crossing balance residual: {max(abs(x["quiet_balance_residual"]) for x in rows):.3g}.',
              "",
              "These are numerical checks, not calibration. Grid changes alter a first-order boundary approximation; radial launch quadrature and finite-time fate near separatrices can remain sensitive. All raw values and launch coefficients are in JSON, including 2400 s inventory. No zero finite-time transmission is interpreted as zero eventual transmission. Do not infer irreversible removal from P_return or retained material.",
              "",
              "Observed grid, timestep and launch-quadrature differences are sensitivity tests, NOT numerical error bounds or a demonstrated convergence order. Six displayed decimals facilitate reproducibility and do not imply physical accuracy. Contact inventory is not credited as removed. Horizon sensitivity shows why finite-time retained mobile material cannot automatically be called trapped.",
              "",
              "SVG contains field arrows and selected trajectories, not all weighted tags. JSON contains full diagnostics and preservation hashes. Geometry illustration is meridional equivalent-slot geometry, not a replacement drawing.",
              "",
              "## Unresolved evidence / decision",
              "",
              "Actual opening vector/pressure fields, swirl/unsteady rotor forcing, bidirectional phase loading, inlet joint size-position distribution, finite-Re corrections, discrete-hole/slot validation, distributor holes/flow/DSD/supports, actual lateral-outlet interception, interface mobility, coalescence, wall remobilization, lower-compartment recycling and a carryover criterion remain missing. Thus this calculation demonstrates an executable spatial, conservative conditional benchmark; it cannot certify a bare top, a coalescer need, a calming length, permanent removal or actual carryover.",
              "",
              "**Partial scope only:** 4 mm thickness and 87 mm clearance are bound to actual geometry but do not enter a meshed lower-plenum/aperture momentum solution. Positive imposed upper-face inflow excludes carrier reversal at openings, although heavy tags can re-cross downwards. Equivalent rings resolve radial inter-slot flow, not azimuthal interhole flow. The upper absorbing plane is not the real nozzle. These requested physical closures are not claimed complete. A 60° wedge containing 14 actual holes with lower rotor/plenum coupling is a logical next resolved model; no invented lower-domain or distributor field is substituted here.",
              "",
              f'{result["preservation"]["count"]} preexisting deliverable files SHA-256 checked unchanged. Only newly prefixed benchmark files are written; active geometry, bottom, application and saved records untouched.']
    (ROOT/f"{PREFIX}.md").write_text("\n".join(lines)+"\n")


if __name__=="__main__":
    main()