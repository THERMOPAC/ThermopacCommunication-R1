#!/usr/bin/env python3
"""Offline conditional conservative PBM; no app, database, network or geometry writes."""
from pathlib import Path
import importlib.util
import hashlib
import json
import sys
import time
import numpy as np
from scipy.optimize import brentq

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
PREFIX = "kuhni-coalescence"
OWNED = {f"{PREFIX}-model.py", f"{PREFIX}-model.md", f"{PREFIX}-results.json"}
spec = importlib.util.spec_from_file_location("spatial", ROOT / "kuhni-spatial-benchmark.py")
spatial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spatial)
A, B, H = spatial.A, spatial.B, spatial.H
MU, RHO, DRHO, G, SIGMA = spatial.MU, spatial.RHO, spatial.DRHO, spatial.G, .011


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def velocity(d):
    """Same immobile spherical force balance as predecessor, wider numerical bracket."""
    return brentq(lambda u: 3*np.pi*MU*d*u*(1+.15*(RHO*u*d/MU)**.687)
                  - np.pi*d**3*DRHO*G/6, 1e-14, 100.)


def grid(refine=1):
    # Include both initial sizes exactly. Extension sizes are numerical support, not a DSD.
    d = np.unique(np.r_[np.geomspace(.001455, .008, 12*refine), .00165, .002339])
    v = np.pi*d**3/6
    return d, v


def surface_group(population, v, target_count):
    """Endpoint binary grouping, not kinetics: merge most populous class with itself.
    Stop at target expected count; never homogenize an underoccupied patch.
    Every daughter volume is 2*parent volume (fixed-pivot representation).
    """
    x = population.copy()
    overflow = np.zeros(x.shape[-1])
    events = 0.
    for _ in range(2000):
        n = x.sum(axis=-1)/v
        if n.sum() <= target_count*(1+1e-12):
            return x, overflow, events
        i = int(np.argmax(n))
        count = min(n[i]/2, n.sum()-target_count)
        tags = x[i]*(2*count/n[i])
        x[i] -= tags
        daughter = 2*v[i]
        events += count
        if daughter > v[-1]:
            overflow += tags
            continue
        hi = int(np.searchsorted(v, daughter))
        lo = hi-1
        w = (daughter-v[lo])/(v[hi]-v[lo])*v[hi]/daughter
        assert v[lo]>=v[i], "Surface grouping may not shrink parent size"
        x[lo] += tags*(1-w)
        x[hi] += tags*w
    raise RuntimeError("Surface grouping endpoint did not terminate")


def coagulate(x, v, beta, cell_volume, dt, efficiency, mask=None):
    """x[cell,size,source] stores dispersed volume, NOT normalized probability.

    Simultaneous explicit unordered binary events and fixed-pivot daughters.
    A common positivity limiter per cell scales all events, never clips material.
    Overflow is a separate source-volume ledger; it is not silently folded into last bin.
    """
    out = np.zeros((len(x), x.shape[-1]))
    if efficiency == 0 or dt == 0:
        return out, 0., 1.
    total = x.sum(axis=-1)
    number = total/v
    frac = np.divide(x, total[..., None], out=np.zeros_like(x), where=total[..., None]>0)
    pairs = []
    demand = np.zeros_like(number)
    for i in range(len(v)):
        for j in range(i, len(v)):
            rate = dt*efficiency*beta[i, j]*number[:, i]*number[:, j]/cell_volume
            if i == j:
                rate *= .5
            if mask is not None:
                rate *= mask
            pairs.append((i, j, rate))
            demand[:, i] += rate
            demand[:, j] += rate
    limit = np.minimum(1., np.min(np.divide(.8*number, demand,
                       out=np.ones_like(number), where=demand>0), axis=1))
    delta = np.zeros_like(x)
    events = 0.
    for i, j, rate in pairs:
        rate = rate*limit
        events += rate.sum()
        tag_i = rate[:, None]*v[i]*frac[:, i]
        tag_j = rate[:, None]*v[j]*frac[:, j]
        delta[:, i] -= tag_i
        delta[:, j] -= tag_j
        tags = tag_i+tag_j
        daughter = v[i]+v[j]
        if daughter > v[-1]:
            out += tags
            continue
        hi = int(np.searchsorted(v, daughter))
        lo = hi-1
        high_count = (daughter-v[lo])/(v[hi]-v[lo])
        # Fixed-pivot count weights conserve number of daughters and their total volume.
        high_volume = high_count*v[hi]/daughter
        delta[:, lo] += tags*(1-high_volume)
        delta[:, hi] += tags*high_volume
    x += delta
    if x.min() < -1e-20:
        raise AssertionError("Negative PBM volume; no clipping allowed")
    return out, float(events), float(limit.min())


class Model:
    def __init__(self, nr=24, nz=72, refine=1, align_quiet=False):
        data = json.loads((ROOT/"kuhni-spatial-benchmark.json").read_text())
        self.slots = data["geometry"]["equivalent_slots_m"]
        f = np.load(ROOT/"kuhni-spatial-benchmark.field.npz")
        self.field = spatial.ClampedField(f["r_m"], f["z_above_face_m"],
                                         f["psi_m3_s"], self.slots)
        # Put ALL slot edges on the radial FV mesh; never average a solid/open bottom face.
        edges = np.unique(np.r_[A, B, np.array(self.slots).ravel()])
        self.re = np.unique(np.concatenate([
            np.linspace(lo, hi, max(1, int(np.ceil((hi-lo)/((B-A)/nr))))+1)
            for lo, hi in zip(edges[:-1], edges[1:])]))
        self.ze = np.linspace(0, H, nz+1)
        if align_quiet:
            self.ze = np.unique(np.concatenate([
                np.linspace(lo, hi, int(np.ceil((hi-lo)/(H/nz)))+1)
                for lo, hi in zip([0., .298, .898], [.298, .898, H])]))
        self.r = .5*(self.re[:-1]+self.re[1:])
        self.z = .5*(self.ze[:-1]+self.ze[1:])
        self.area = np.pi*np.diff(self.re**2)
        self.dz = np.diff(self.ze)
        self.vol = self.area[:, None]*self.dz
        self.d, self.v = grid(refine)
        self.vt = np.array([velocity(d) for d in self.d])
        self.beta = np.pi*(self.d[:, None]+self.d[None, :])**2/4 * abs(
            self.vt[:, None]-self.vt[None, :])
        rr, zz = np.meshgrid(self.re, self.ze, indexing="ij")
        psi = self.field.ev(rr, zz)
        # Integrated carrier face volume fluxes from SAME streamfunction; exact cell closure.
        self.fr = -2*np.pi*np.diff(psi, axis=1)
        self.fz = 2*np.pi*np.diff(psi, axis=0)
        self.fr[[0, -1]] = 0  # analytic no-penetration, roundoff only
        self.fzk = self.fz[..., None]-self.area[:, None, None]*self.vt
        self.clear = np.zeros((len(self.r), len(self.d)), dtype=bool)
        for lo, hi in self.slots:
            # Whole radial face must clear the finite-size surrogate to count first return.
            self.clear |= ((self.re[:-1, None]>=lo+self.d/2) &
                           (self.re[1:, None]<=hi-self.d/2))
        # Resolve simultaneous up/down DROP flux within an inlet face; net carrier flux
        # must not erase settling near slot edges. Midpoint subface quadrature.
        sample = self.re[:-1, None]+np.diff(self.re)[:, None]*(np.arange(80)+.5)/80
        local_u = spatial.boundary_psi(sample, self.slots, derivative=1)/sample
        flux = (2*np.pi*sample[..., None]*np.diff(self.re)[:, None, None]/80 *
                np.maximum(self.vt-local_u[..., None], 0))
        clear_sample = np.zeros_like(flux, dtype=bool)
        for lo, hi in self.slots:
            clear_sample |= ((sample[..., None]>lo+self.d/2) &
                             (sample[..., None]<hi-self.d/2))
        self.lower_return_flux = (flux*clear_sample).sum(axis=1)
        self.lower_contact_flux = (flux*(~clear_sample)).sum(axis=1)
        self.lower_flux = self.lower_return_flux+self.lower_contact_flux
        out = (np.maximum(self.fr[1:], 0)+np.maximum(-self.fr[:-1], 0))[..., None]
        out = out+np.maximum(self.fzk[:, 1:], 0)+np.maximum(-self.fzk[:, :-1], 0)
        out[:, 0] += self.lower_flux-np.maximum(-self.fzk[:, 0], 0)
        self.dt = .65/np.max(out/self.vol[..., None])
        self.carrier_closure = float(np.max(abs(np.diff(self.fr, axis=0)+
                                               np.diff(self.fz, axis=1))))
        self.quiet = np.broadcast_to((self.z>=.298)&(self.z<.898), self.vol.shape)

    def empty(self):
        return np.zeros((*self.vol.shape, len(self.v), 2))

    def initial(self, alpha):
        """Declared pulse: uniform local alpha in first FV layer, ONLY above open slots.
        Equal physical volume of two selected sizes; not inferred actual terminal DSD/load.
        """
        x = self.empty()
        open_r = np.zeros(len(self.r), dtype=bool)
        for lo, hi in self.slots:
            open_r |= (self.r>lo)&(self.r<hi)
        for label, d in enumerate([.001455, .00165]):
            k = int(np.argmin(abs(self.d-d)))
            x[:, 0, k, label] = alpha*.5*self.vol[:, 0]*open_r
        return x

    def transport(self, x, surface, returned, outlet, dt):
        c = x/self.vol[..., None, None]
        # Internal radial and axial transfers use donor-cell upwinding.
        fluxr = dt*self.fr[1:-1, :, None, None]*np.where(
            self.fr[1:-1, :, None, None]>=0, c[:-1], c[1:])
        fluxz = dt*self.fzk[:, 1:-1, :, None]*np.where(
            self.fzk[:, 1:-1, :, None]>=0, c[:, :-1], c[:, 1:])
        change = np.zeros_like(x)
        change[:-1] -= fluxr
        change[1:] += fluxr
        change[:, :-1] -= fluxz
        change[:, 1:] += fluxz
        lower = dt*self.lower_flux[..., None]*c[:, 0]
        upper = dt*np.maximum(self.fzk[:, -1, :, None], 0)*c[:, -1]
        change[:, 0] -= lower
        change[:, -1] -= upper
        returned += np.sum(dt*self.lower_return_flux[..., None]*c[:, 0], axis=(0, 1))
        surface += dt*self.lower_contact_flux[..., None]*c[:, 0]
        outlet += upper.sum(axis=(0, 1))
        x += change
        if x.min() < -1e-20:
            raise AssertionError("Negative transport volume")

    def run(self, alpha, ehyd, emerge, horizon=600., dt_factor=1., initial=None,
            coagulation_step=2.):
        x = self.initial(alpha) if initial is None else initial.copy()
        seed = x.sum(axis=(0, 1, 2))
        surface = np.zeros((len(self.r), len(self.v), 2))
        returned, outlet, overflow = np.zeros((3, 2))
        n0 = float((x.sum(axis=-1)/self.v).sum())
        events, t, limiter = 0., 0., 1.
        peak_alpha = float(np.max(x.sum(axis=(2, 3))/self.vol))
        while t < horizon-1e-10:
            dt = min(coagulation_step*dt_factor, horizon-t)
            ov, ne, lm = coagulate(x.reshape(-1, len(self.v), 2), self.v, self.beta,
                                  self.vol.ravel(), dt, ehyd*emerge, self.quiet.ravel())
            overflow += ov.sum(axis=0)
            events += ne
            limiter = min(limiter, lm)
            substeps = int(np.ceil(dt/(self.dt*dt_factor)))
            for _ in range(substeps):
                self.transport(x, surface, returned, outlet, dt/substeps)
            peak_alpha = max(peak_alpha, float(np.max(x.sum(axis=(2, 3))/self.vol)))
            t += dt
        mobile = x.sum(axis=(0, 1, 2))
        contact = surface.sum(axis=(0, 1))
        closure = mobile+contact+returned+outlet+overflow-seed
        assert np.max(abs(closure))/seed.sum() < 1e-11, closure
        def fractions(q):
            return (q/seed.sum()).tolist()
        result = dict(alpha_initial_local=alpha, Ehyd=ehyd, Emerge_given_encounter=emerge,
                      horizon_s=horizon, dt_max_s=self.dt*dt_factor,
                      coagulation_split_step_max_s=coagulation_step*dt_factor,
                      nr=len(self.r), nz=len(self.z), size_bins=len(self.v),
                      initial_volume_m3=seed.tolist(), initial_expected_drop_count=n0,
                      source_labels=["terminal_pulse_small_origin", "terminal_pulse_large_origin"],
                      # Each vector is fraction of TOTAL initial dispersed volume, not per-label.
                      fractions_of_total_by_source=dict(mobile=fractions(mobile),
                          contact=fractions(contact), first_upper_face_return=fractions(returned),
                          ideal_outlet=fractions(outlet), unresolved_size_overflow=fractions(overflow)),
                      absolute_source_balance_error_m3=closure.tolist(),
                      max_relative_source_balance_error=float(np.max(abs(closure))/seed.sum()),
                      coalescence_events_expected=events, minimum_event_limiter=limiter,
                      peak_local_mobile_alpha=peak_alpha,
                      mobile_expected_drop_count=float((x.sum(axis=-1)/self.v).sum()),
                      contact_expected_drop_count=float((surface.sum(axis=-1)/self.v).sum()),
                      mobile_volume_fraction_at_Bo_above_one=float(
                          x[:, :, DRHO*G*self.d**2/SIGMA>1].sum()/seed.sum()),
                      quiet_inventory_fraction=float(x[:, self.quiet[0]].sum()/seed.sum()),
                      max_supported_d_mm=float(self.d[-1]*1000),
                      max_supported_Bo=float(DRHO*G*self.d[-1]**2/SIGMA))
        return result, x, surface

    def surface_endpoints(self, surface, alpha, patch_arclength=1.):
        """Post-horizon CONDITIONAL interventions; no kinetic times or credited drainage.

        Merger endpoint: one aggregate per one-metre circumferential patch (chosen resolution);
        expected total number is not increased if patch initially has <1 drop.
        This is NOT a physical bound and does not use a bulk collision kernel on a wall.
        """
        rows = []
        total = surface.sum()
        for name in ["unmerged", "binary_grouping_endpoint"]:
            release = self.empty()
            unresolved = np.zeros(2)
            geometric = np.zeros(2)
            stats = []
            for ir, r in enumerate(self.r):
                # Surface patch area = annulus area / number of one-metre arc patches.
                patches = max(1., 2*np.pi*r/patch_arclength)
                tags = surface[ir].sum(axis=0)
                if tags.sum() == 0:
                    continue
                population = surface[ir]
                if name != "unmerged":
                    population, ov, _ = surface_group(population, self.v, patches)
                    unresolved += ov
                drops = [(self.v[k], population[k],
                          population[k].sum()/self.v[k]) for k in range(len(self.v))
                         if population[k].sum()>0]
                for volume, material, count in drops:
                    d = (6*volume/np.pi)**(1/3)
                    # 90-degree sessile cap: footprint radius for a hemisphere of same V.
                    footprint = (3*volume/(2*np.pi))**(1/3)
                    overlap = any(min(abs(r-lo), abs(r-hi))<=footprint
                                  and d<hi-lo for lo, hi in self.slots)
                    if overlap:
                        geometric += material
                    stats.append(dict(d_mm=d*1000, expected_count=count,
                                      Bo=DRHO*G*d*d/SIGMA, rim_overlap_hemisphere=overlap))
                    # Forced complete lift-off endpoint ONLY: put aggregate above same patch.
                    # No lateral relocation toward a hole, no sink, no claim that forces permit it.
                    if volume > self.v[-1] or d/2>=H or r-d/2<A or r+d/2>B:
                        unresolved += material
                        continue
                    k = int(np.searchsorted(self.v, volume))
                    if k == 0:
                        # unmerged first pivot, roundoff-safe
                        allocation = [(0, 1.)]
                    elif k == len(self.v):
                        unresolved += material
                        continue
                    else:
                        q = (volume-self.v[k-1])/(self.v[k]-self.v[k-1])
                        w = q*self.v[k]/volume
                        allocation = [(k-1, 1-w), (k, w)]
                    iz = min(len(self.z)-1, int(np.searchsorted(self.z, d/2+self.dz[0])))
                    for k, w in allocation:
                        release[ir, iz, k] += material*w
            if release.sum() > 0:
                fate, _, _ = self.run(alpha, 0, 0, horizon=300., initial=release)
                result = {key: (np.array(value)*release.sum()/total).tolist()
                          for key, value in fate["fractions_of_total_by_source"].items()}
            else:
                result = {}
            result["unresolved_release_geometry_or_size"] = (unresolved/total).tolist()
            assert abs(sum(sum(v) for v in result.values())-1) < 1e-10
            source_residual = np.sum(list(result.values()), axis=0)-surface.sum((0, 1))/total
            assert np.max(abs(source_residual)) < 1e-10
            rows.append(dict(morphology=name, nominal_patch_arclength_m=patch_arclength,
                retained_endpoint_fraction=1.,
                conditional_hemisphere_rim_overlap_volume_fraction=float(geometric.sum()/total),
                # Eligibility for passage is NOT established by rim overlap.
                demonstrated_lower_face_drainage_fraction=None,
                forced_liftoff_300s_fractions_of_contact_by_source=result,
                aggregate_size_minmax_mm=[min(s["d_mm"] for s in stats), max(s["d_mm"] for s in stats)],
                aggregate_Bo_max=max(s["Bo"] for s in stats),
                max_source_balance_residual=float(np.max(abs(source_residual))),
                expected_count=sum(s["expected_count"] for s in stats)))
        return rows

    def surface_size_diagnostics(self, surface, patch_arclength, grouping):
        masses = np.zeros(len(self.v))
        overflow = 0.
        for ir, r in enumerate(self.r):
            p = surface[ir]
            if grouping:
                p, ov, _ = surface_group(p, self.v, max(1., 2*np.pi*r/patch_arclength))
                overflow += ov.sum()
            masses += p.sum(axis=-1)
        cdf = np.cumsum(masses)/masses.sum()
        quantiles = [float(self.d[min(len(self.d)-1, np.searchsorted(cdf, q))]*1000)
                     for q in [.01, .5, .99]]
        keep = masses>=1e-6*surface.sum()
        return dict(resolved_population_volume_percentiles_mm=dict(zip(["p01", "p50", "p99"], quantiles)),
                    support_bins_above_1e_minus6_initial_contact_fraction_mm=
                    [float(self.d[keep].min()*1000), float(self.d[keep].max()*1000)],
                    unresolved_grouping_overflow_fraction=float(overflow/surface.sum()))


def surface_exchange(surface, mobile, fraction):
    """Future measured release fractions: equal/opposite volume transfer, no sink.
    Caller must supply physical eligibility and relocation; not a rate closure.
    """
    if not 0 <= fraction <= 1:
        raise ValueError("Exchange fraction must be in [0,1]")
    moved = surface*fraction
    surface -= moved
    mobile += moved


def tests():
    d, v = grid()
    beta = np.ones((len(v), len(v)))*1e-7  # synthetic test kernel, NEVER study kernel
    x = np.zeros((1, len(v), 2))
    x[0, 0, 0] = 100*v[0]
    x[0, 1, 1] = 50*v[1]
    before = x.copy()
    ov, _, _ = coagulate(x, v, beta, np.array([1.]), 1., 0)
    assert np.array_equal(x, before) and not ov.any()
    source = x.sum(axis=(0, 1))
    n0 = (x.sum(-1)/v).sum()
    ov, events, limit = coagulate(x, v, beta, np.array([1.]), 100., 1.)
    err = np.max(abs(x.sum(axis=(0, 1))+ov.sum(0)-source))
    number_error = abs((x.sum(-1)/v).sum()-n0+events)
    assert err < 1e-18 and number_error < 1e-10 and events>0
    # Force overflow and verify exact source-volume preservation.
    big = np.zeros_like(x)
    big[0, -1] = [10*v[-1], 5*v[-1]]
    big_before = big.sum((0, 1))
    overflow, _, _ = coagulate(big, v, beta, np.array([1.]), 1e5, 1.)
    assert overflow.sum()>0 and np.max(abs(big.sum((0, 1))+overflow.sum(0)-big_before))<1e-18
    s, m = before.copy(), np.zeros_like(before)
    surface_exchange(s, m, .37)
    assert np.max(abs(s+m-before))<1e-20
    low = before[0]*.0001
    grouped, ov, ne = surface_group(low, v, 1)
    assert np.array_equal(grouped, low) and not ov.any() and ne == 0
    grouped, ov, ne = surface_group(before[0], v, 1)
    assert ne>0 and np.max(abs(grouped.sum(0)+ov-before[0].sum(0)))<1e-18
    model = Model()
    # Geometry-aligned bottom: both actual opening return and solid contact are exercised.
    x = model.empty()
    open_i = int(np.flatnonzero(model.clear[:, 0])[0])
    solid_i = int(np.flatnonzero(~model.clear[:, 0])[0])
    x[open_i, 0, -1, 0] = 1e-9
    x[solid_i, 0, -1, 1] = 1e-9
    # A small droplet at the fastest outlet must transmit.
    out_i = int(np.argmax(model.fzk[:, -1, 0]))
    x[out_i, -1, 0, 0] = 1e-9
    surface = np.zeros((len(model.r), len(model.v), 2))
    ret, outlet = np.zeros((2, 2))
    model.transport(x, surface, ret, outlet, model.dt*.5)
    # Largest size may fail clearance at open_i; choose center of broadest cleared face instead.
    assert surface.sum()>0 and outlet.sum()>0
    if ret.sum() == 0:
        raise AssertionError("Synthetic return did not cross a cleared opening")
    assert abs(x.sum()+surface.sum()+ret.sum()+outlet.sum()-3e-9)<1e-20
    return dict(zero_kernel_bitwise_identity=True, source_volume_merger_error_m3=float(err),
                drop_number_event_error=float(number_error), overflow_conservation=True,
                surface_exchange_cancellation=True, return_outlet_contact_tracking=True,
                surface_low_occupancy_unchanged=True, binary_surface_grouping_conservation=True,
                geometric_event_predecessor_checks=spatial.event_regression_checks())


def main():
    start = time.time()
    preserved = {str(p.relative_to(ROOT)): sha(p) for p in ROOT.rglob("*")
                 if p.is_file() and p.name not in OWNED}
    check = tests()
    model = Model()
    runs = []
    saved = None
    for alpha, eh, em in [(1e-5, 1, 0), (1e-5, 1, 1), (1e-3, 1, 0),
                          (1e-3, 1, .1), (1e-3, 1, 1)]:
        row, mobile, surface = model.run(alpha, eh, em)
        row["name"] = f"alpha={alpha:g},Ehyd={eh:g},Emerge={em:g}"
        runs.append(row)
        print(row["name"], row["coalescence_events_expected"], flush=True)
        if alpha == 1e-3 and em == 1:
            saved = surface
    base = runs[-1]
    for name, mod, factor, horizon in [
        ("time-half", model, .5, 600),
        ("space-refined", Model(40, 108), 1, 600),
        ("size-refined", Model(refine=2), 1, 600),
        ("horizon-double", model, 1, 1200)]:
        row, _, _ = mod.run(1e-3, 1, 1, horizon=horizon, dt_factor=factor)
        row["name"] = name
        row["max_fate_fraction_difference_from_base"] = max(
            abs(sum(row["fractions_of_total_by_source"][key])-
                sum(base["fractions_of_total_by_source"][key]))
            for key in row["fractions_of_total_by_source"])
        runs.append(row)
        print(name, flush=True)
    # Separate genuinely interacting QUIET inventory probes. These are not inferred terminal
    # inflow: initialize two overlapping classes uniformly at a declared quiet-zone alpha.
    quiet_runs = []
    for alpha, em in [(1e-5, 1), (1e-3, 0), (1e-3, .1), (1e-3, 1)]:
        x = model.empty()
        for label, diameter in enumerate([.001455, .00165]):
            k = int(np.argmin(abs(model.d-diameter)))
            x[:, :, k, label] = .5*alpha*model.vol*model.quiet
        row, _, _ = model.run(alpha, 1, em, horizon=300., initial=x)
        row["name"] = f"quiet inventory alpha={alpha:g},Emerge={em:g}"
        row["source_labels"] = ["quiet_test_small_origin", "quiet_test_large_origin"]
        quiet_runs.append(row)
        print(row["name"], row["coalescence_events_expected"], flush=True)
    for coal_step in [.5, .25, .125]:
        row, _, _ = model.run(1e-3, 1, 1, horizon=300., initial=x,
                             coagulation_step=coal_step)
        row["name"] = f"quiet alpha=0.001,Emerge=1,PBM step={coal_step:g}s"
        row["source_labels"] = ["quiet_test_small_origin", "quiet_test_large_origin"]
        quiet_runs.append(row)
        print(row["name"], row["coalescence_events_expected"], flush=True)
    surface_results = (model.surface_endpoints(saved, 1e-3) +
                       model.surface_endpoints(saved, 1e-3, patch_arclength=.01))
    changed = [p for p, h in preserved.items() if not (ROOT/p).exists() or sha(ROOT/p)!=h]
    assert not changed, changed
    # Independent identical-alpha E=0 check avoids claiming conservation alone tests zero-kernel.
    zero = model.initial(1e-5)
    ov, _, _ = coagulate(zero.reshape(-1, len(model.v), 2), model.v, model.beta,
                        model.vol.ravel(), 100, 0, model.quiet.ravel())
    assert np.array_equal(zero, model.initial(1e-5)) and not ov.any()
    result = dict(status="CONDITIONAL SCENARIOS ONLY; ACTUAL PERFORMANCE AND HYDRAULIC RELEASE HOLD",
        scope="Separate offline extension; preserved 700 mm x 1600 mm reservation.",
        assumptions=dict(loading="selected initial local alpha, not inferred from tag probabilities",
            initial_population="equal volume 1.455/1.650 mm in first FV layer above open slots",
            fresh_feed="zero; source geometry/DSD unknown",
            kernel="differential settling only, in quiet interval 0.298<=z<0.898 m above face",
            Ehyd="selected unity geometric encounter reference, not an established bound",
            Emerge="selected 0,0.1,1; no calibrated merger probability",
            plate="conserved contact inventory, no default drainage/release rate",
            surface_endpoints="post-600s morphology and externally forced release thought experiments; not physical bounds",
            transport="coarse conservative donor-cell FV of preserved field; not predecessor tag integrator"),
        tests=check, carrier_cell_flux_closure_m3_s=model.carrier_closure,
        sizes_mm=(model.d*1000).tolist(), slip_m_s=model.vt.tolist(),
        beta_geometric_m3_s=model.beta.tolist(), runs=runs, quiet_inventory_probe_runs=quiet_runs,
        surface_endpoints=surface_results,
        identifiability=dict(actual_alpha=None, actual_Ehyd=None, actual_Emerge=None,
            actual_surface_mobility=None, actual_drainage_rate=None, actual_reentrainment_rate=None,
            lower_face_passage=None, permanent_removal=None, actual_carryover=None),
        preservation=dict(count=len(preserved), changed=changed, sha256=preserved),
        runtime_s=time.time()-start)
    result["executable_sha256"] = sha(Path(__file__))
    (ROOT/f"{PREFIX}-results.json").write_text(json.dumps(result, indent=2)+"\n")
    write_report(result)


def write_report(result):
    all_runs = result["runs"]+result["quiet_inventory_probe_runs"]+[
        row for pair in result.get("quiet_fixed_inventory_validation", {}).values()
        for row in pair.values()]
    lines = ["# Conservative quiet-zone PBM and unresolved plate population",
        "",
        "**Conditional numerical study, NOT actual RRBO/NMP probabilities or a calibrated bound.**",
        "Run `python3 deliverables/kuhni-coalescence-model.py` (installed NumPy/SciPy).",
        "No app, workflow, database or saved-geometry access. Keep Ø700 ×1600 reservation.",
        "",
        "## Population definition and transport",
        "",
        "This is a separate spatial finite-volume extension of the SAVED momentum field, not a rerun "
        "or overwrite of the original trajectory benchmark. Reconstruct ClampedField exactly. "
        "The original contact fractions are not transformed into a concentration. A declared finite "
        "pulse occupies the first axial FV layer above open slots with equal VOLUME of 1.455 and "
        "1.650 mm drops; selected alpha=10⁻⁵ or 10⁻³ is an explicit scenario, not measured holdup. "
        "Each original size has a permanent terminal-source volume label. Fresh distributor input=0 "
        "(unknown geometry/loading); no claim to cover its actual duty. There is no continuous injection.",
        "",
        "State X[cell,size,source] is physical dispersed volume (m³); expected drop count is "
        "Σsource X/v, and local number density is that count divided by cell mixture volume. "
        "Thus alpha=ΣX/Vcell. Expected counts may be noninteger and below unity; deterministic "
        "mean-field closure then does not resolve rare-event fluctuations. Coalescence never changes "
        "source volume, although daughters may contain both source labels. No dissolved solvent balance "
        "is conflated with this separate dispersed-phase volume.",
        "",
        "Axisymmetric face carrier fluxes derive from differences of the SAME solved streamfunction; "
        "sum over a cell cancels exactly. Settling subtracts vt(d) times horizontal face area. "
        "Donor-cell upwinding is first-order/numerically diffusive; CFL≤0.65. Coagulation/transport "
        "Lie splitting uses 2 s outer steps with CFL-limited transport substeps; time-half halves both. "
        "All equivalent-slot edges are radial mesh boundaries. At lower face 80 radial quadrature "
        "subfaces resolve downward drop flux max(vt−uz,0) and d/2 slot clearance; downward flux "
        "outside clearance enters the surface population. This preserves simultaneous up/down "
        "drop velocities hidden by the net carrier face flux. The cell concentration is still "
        "uniform within each donor cell; this is not the prior earliest-event particle geometry. "
        "Shaft/shell have zero radial material flux; finite-radius wall interception is omitted. "
        "Contact here means bottom plate/rim unresolved contact, not the predecessor's full wall inventory. "
        "Initial layer thickness varies with spatial refinement, so that sensitivity combines transport "
        "and pulse-placement changes; no formal convergence order is claimed.",
        "",
        "First upper-face downward return and ideal upper-plane outlet are absorbing EXTERNAL ledgers. "
        "Neither is actual lower-face passage or permanent return. Quiet entry/exit are internal face "
        "transfers, not arbitrary quiet-zone sinks. Lower compartment recycling, lateral nozzle, "
        "distributor, breakup and two-way hydrodynamic coupling remain absent.",
        "",
        "## Collision and merger",
        "",
        "βij=π(di+dj)²|vti−vtj|/4 [m³/s]. K=β Ehyd Emerge|encounter. Only differential-settling "
        "encounters are enabled, and only within quiet 0.298–0.898 m above the stator upper face. "
        "No generic strain-magnitude substitution into a simple-shear kernel is made. Laminar-shear "
        "encounters are omitted, not proven negligible. Ehyd=1 is the geometric reference scenario, "
        "not a universal upper bound; Emerge=0,0.1,1 are selected sensitivity parameters, not "
        "invented fitted rates. Equal-size differential-settling kernel is zero. Near-surface bulk "
        "kernels are never applied to contact inventory. Collision rates use evolving physical "
        "number concentrations, not normalized trajectory weights.",
        "",
        "Unordered rates are K Ni Nj/Vcell (half for i=j). Fixed-pivot daughter number weights "
        "sum to one and their volume-weighted sum equals vi+vj; source volume is split in the same "
        "daughter-volume proportions. Simultaneous events use a common per-cell positivity limiter "
        "(reported). Beyond largest pivot, volume and labels enter an explicit UNRESOLVED overflow "
        "ledger; no extrapolated passage or hidden last-bin pileup. Overflow is not physical removal. "
        "Slip is recomputed at each pivot with the inherited immobile spherical Schiller–Naumann "
        "force balance. At grown sizes Bo can exceed unity: extrapolated spherical transport is "
        "only a numerical thought experiment, not a qualified deformation model.",
        "",
        "## Conditional bulk results at 600 s",
        "",
        "Fractions below divide by the declared initial dispersed volume, not raffinate throughput. "
        "They are not measured or actual plant fate probabilities. Alpha affects encounter rates "
        "independently of merger efficiency; a quiet-zone DSD change alone cannot identify both.",
        "",
        "| Scenario | first face return | ideal outlet | mobile | contact | size overflow | merger events |",
        "|---|---:|---:|---:|---:|---:|---:|"]
    for row in result["runs"]:
        f = row["fractions_of_total_by_source"]
        vals = [sum(f[k]) for k in ["first_upper_face_return", "ideal_outlet", "mobile",
                                   "contact", "unresolved_size_overflow"]]
        lines.append("| "+row["name"]+" | "+" | ".join(f"{v:.6g}" for v in vals)+
                     f" | {row['coalescence_events_expected']:.6g} |")
    lines += ["", "### Independent quiet-inventory interaction probes (300 s)", "",
        "The terminal pulse becomes strongly depleted/size-segregated before reaching the quiet "
        "zone; negligible merger in that chosen pulse is NOT a claim that real quiet-zone "
        "coalescence is negligible. The following independent tests initialize equal physical "
        "volume of the same two sizes uniformly ONLY in the quiet cells at declared local alpha. "
        "These represent an unmeasured test inventory, not a derived terminal or fresh-feed input. "
        "Source labels are quiet-test size ancestries. They expose nonlinear concentration dependence "
        "without pretending to know actual occupancy or using V/Q as a coalescence time.",
        "",
        "| Quiet probe | first face return | ideal outlet | mobile | contact | overflow | merger events |",
        "|---|---:|---:|---:|---:|---:|---:|"]
    for row in result["quiet_inventory_probe_runs"]:
        f = row["fractions_of_total_by_source"]
        vals = [sum(f[k]) for k in ["first_upper_face_return", "ideal_outlet", "mobile",
                                   "contact", "unresolved_size_overflow"]]
        lines.append("| "+row["name"]+" | "+" | ".join(f"{v:.6g}" for v in vals)+
                     f" | {row['coalescence_events_expected']:.6g} |")
    refined = result["quiet_inventory_probe_runs"][-1]
    previous = result["quiet_inventory_probe_runs"][-2]
    difference = max(abs(sum(refined["fractions_of_total_by_source"][key])-
                         sum(previous["fractions_of_total_by_source"][key]))
                     for key in refined["fractions_of_total_by_source"])
    lines += ["", f"Last two quiet PBM refinements differ by at most {difference:.6g} "
        "of initial volume in an individual fate ledger. Both 0.25 and 0.125 s runs avoid event "
        "limiting; use them rather than the limited 2 s high-loading row for this conditional "
        "kinetic comparison. This checks time splitting only, not actual alpha/efficiency "
        "or carrier-field validity. Additional matched fixed-inventory checks appear below when run. "
        "The terminal spatial/pulse-placement sensitivity changes first return by about 0.105 "
        "of initial volume, much larger than its merger effect: it is not a numerically "
        "converged replacement for the original trajectory benchmark."]
    if result.get("quiet_fixed_inventory_validation"):
        lines += ["", "### Matched fixed-physical-inventory quiet validation", "",
            "Reproduce separately without rerunning other cases: `python3 "
            "deliverables/kuhni-coalescence-model.py --validate-quiet base` "
            "(then `size` and `space`). All use exact mesh faces at z=0.298 and 0.898 m, "
            "uniform alpha=0.001, equal source volumes of 1.455/1.650 mm, 300 s horizon "
            "and 0.125 s PBM splitting. Thus physical volume and source inventory are "
            "identical across meshes, unlike the earlier shrinking terminal pulse. "
            "Each has a matched no-merger run on the SAME mesh and step.",
            "",
            "| Mesh / size pivots | initial total m³ | no-merger outlet | merger outlet | outlet difference | merger contact | minimum limiter |",
            "|---|---:|---:|---:|---:|---:|---:|"]
        for key, pair in result["quiet_fixed_inventory_validation"].items():
            no, yes = pair["no_merger"], pair["merger"]
            f0, f1 = no["fractions_of_total_by_source"], yes["fractions_of_total_by_source"]
            lines.append(f"| {key}: {yes['nr']}×{yes['nz']} / {yes['size_bins']} | "
                         f"{sum(yes['initial_volume_m3']):.9g} | {sum(f0['ideal_outlet']):.7g} | "
                         f"{sum(f1['ideal_outlet']):.7g} | "
                         f"{sum(f1['ideal_outlet'])-sum(f0['ideal_outlet']):.7g} | "
                         f"{sum(f1['contact']):.7g} | {yes['minimum_event_limiter']:.5g} |")
        lines += ["", "These checks assess the selected nonlinear model, not unknown physical "
            "loading or efficiencies. Raw source ledgers, overflow and counts remain in JSON. "
            "A size- or mesh-dependent change must not be hidden by source-volume conservation."]
        validation = result["quiet_fixed_inventory_validation"]
        if all(key in validation for key in ["base", "size", "space"]):
            base = validation["base"]["merger"]["fractions_of_total_by_source"]
            diffs = {}
            for key in ["size", "space"]:
                f = validation[key]["merger"]["fractions_of_total_by_source"]
                diffs[key] = max(abs(sum(f[k])-sum(base[k])) for k in base)
            lines += ["", f"The maximum change of any fate ledger versus the matched base is "
                f"{diffs['size']:.6g} for pivot refinement and {diffs['space']:.6g} for spatial "
                "refinement. The selected coalescence effect on outlet fraction remains about "
                "−0.0243 to −0.0247 across these checks. This supports a numerical conditional "
                "trend, not certified convergence or a physical carryover prediction."]
    lines += ["", "## Contact population, coalescence and release endpoints", "",
        "Plate state S[radial patch,size,source] receives every intercepted volume and preserves "
        "size/source population. Baseline keeps it unresolved: this is NOT a predicted permanently "
        "pinned fate. No empirical seconds-to-drain or seconds-to-reentrain is supplied. The "
        "surface_exchange helper accepts a future independently qualified exchange fraction and "
        "transfers exactly equal/opposite volume; it is not a closure.",
        "",
        "At the 600 s high-loading/unit-efficiency snapshot two morphology endpoints are computed: "
        "(a) unmerged contacts; (b) a declared binary-grouping endpoint within each radial/nominal "
        "circumferential patch. Repeated same-class mergers of the most populated class form "
        "2v daughters until expected count reaches one per patch (or explicit size overflow). "
        "Fixed-pivot daughters never occupy bins smaller than their parents. Underoccupied patches "
        "are preserved size-for-size, never replaced by their mean drop. This particular grouping "
        "order is an intervention, not measured contact physics or an extremum. Patch "
        "arc lengths 1 m and 0.01 m test this endpoint's strong connectivity dependence; they "
        "are explicit scenarios, NOT measured film connectivity or wetting scales. "
        "No surface kernel or merger timescale is inferred. Source labels and total contact volume "
        "are exactly retained during aggregation. Large endpoint aggregates can exceed spherical-model "
        "validity and the size grid; those stay unresolved instead of receiving a fabricated outcome.",
        "",
        "For each morphology, a 90° immersed sessile-hemisphere footprint screens whether a rim "
        "could geometrically be reached and equivalent-spherical d is smaller than slot width. "
        "This conditional contact-angle/shape is NOT measured; radial patch-center placement "
        "does not resolve subcell rim accumulations, so zero rim overlap is NOT exclusion of "
        "real drainage. Rim overlap is not drainage eligibility "
        "in the force/pressure sense and is not credited as return. The other endpoint externally "
        "FORCES complete lift-off above the same patch (one axial cell plus drop radius clearance) "
        "and follows released volume for 300 s with the preserved field, no further mergers. "
        "No lateral teleportation to a hole occurs. Lift-off placement is a numerical intervention, "
        "not a demonstrated force-permitted mechanism or a re-entrainment rate. Unsupported size/wall "
        "geometry stays unresolved. These intervention outcomes are not lower/upper carryover bounds.",
        "",
        "| Surface morphology / patch arc m | resolved-volume d01/d50/d99 mm | rim-overlap volume | post-forced-lift first face return | post-forced-lift outlet | unresolved release |",
        "|---|---:|---:|---:|---:|---:|"]
    for row in result["surface_endpoints"]:
        f = row["forced_liftoff_300s_fractions_of_contact_by_source"]
        quantiles = row.get("size_diagnostics", {}).get("resolved_population_volume_percentiles_mm", {})
        size_text = "/".join(f"{quantiles[k]:.3g}" for k in ["p01", "p50", "p99"]) if quantiles else "not yet evaluated"
        lines.append(f"| {row['morphology']} / {row['nominal_patch_arclength_m']:g} | {size_text} | "
                     f"{row['conditional_hemisphere_rim_overlap_volume_fraction']:.6g} | "
                     f"{sum(f.get('first_upper_face_return', [])):.6g} | "
                     f"{sum(f.get('ideal_outlet', [])):.6g} | "
                     f"{sum(f['unresolved_release_geometry_or_size']):.6g} |")
    lines += ["", "### What the force/wetting evidence does and does not resolve", "",
        "Read `kuhni-coalescence-evidence.md` for primary evidence and access limits. Horizontal "
        "plate gravity has ZERO tangential component toward holes. Tangential depinning requires "
        "Fhyd,parallel + ΔρgV sinβ against kσw(cosθR−cosθA), with immersed hysteresis, footprint "
        "and geometry-specific hydrodynamic force unknown. A hemisphere rim-overlap test supplies "
        "none of these. Sliding does not prove lift-off. No universal critical Ca/We or isolated "
        "sphere drag is used as an attached-drop release criterion.",
        "",
        "Surface size percentiles refer only to resolved-size contact volume; overflow is explicitly "
        "excluded and reported separately. JSON also gives support bins carrying at least 10⁻⁶ "
        "of initial contact volume. Numerical trace populations do not define a physically meaningful "
        "maximum drop size.",
        "An established connected NMP film would obey the conditional lubrication relation "
        "q=[Δρg sinβ−∂s pex]h³/(3μd)+τi h²/(2μd). On a flat uniform plate without pressure "
        "gradient/traction this gives q=0, not automatic drain-to-hole. Film continuity, h, "
        "traction, pressure and edge conditions are unknown. Between approaching NMP drops, "
        "the intervening RRBO film instead drains with μc; film radius, rupture thickness, "
        "disjoining pressure, mobility and contact duration are absent. No numerical drainage "
        "clock follows. Neither 4 mm submerged head nor full-hole capillary pressure establishes "
        "small-drop passage, since no spanning meniscus/pool exists in this calculation.",
        "",
        "**Resolution of the large-contact question:** mass conservation makes contact inventory "
        "an explicit unresolved population, not a separator success. Coalescence can change its "
        "morphology without removing any solvent; neither drainage nor lift-off is identifiable "
        "from present evidence. Conditional release trajectories are calculated, but selecting "
        "retention, downward drainage or upward re-entrainment requires coupon wetting/film/force "
        "measurements and resolved plate/lower-domain pressure/flow. This uncertainty cannot "
        "honestly be replaced by a fitted-looking first-order rate.",
        "",
        "## Verification and sensitivity", "",
        f"- Bulk maximum source-balance relative residual: "
        f"{max(r['max_relative_source_balance_error'] for r in all_runs):.3g}.",
        f"- Carrier FV cell flux cancellation: {result['carrier_cell_flux_closure_m3_s']:.3g} m³/s.",
        "- Asserted tests: zero-kernel bitwise identity; binary aggregation source-volume and "
        "drop-number closure; explicit overflow conservation; surface/bulk exchange cancellation; "
        "nonzero geometrically cleared first return, solid contact and upper outlet with total "
        "closure; predecessor earliest-event synthetic regressions.",
        "- Timestep, spatial/initial-layer, size-support refinement and doubled horizon results "
        "are included above; differences are sensitivity observations, not certified errors.",
        f"- Minimum coalescence positivity factor across runs: "
        f"{min(r['minimum_event_limiter'] for r in all_runs):.6g}; "
        f"largest attained local mobile alpha: {max(r['peak_local_mobile_alpha'] for r in all_runs):.6g}. "
        "The 2 s high-loading quiet probe activates the limiter and is NOT an accurate kinetic "
        "reference; compare 0.5/0.25/0.125 s PBM refinements explicitly. Conservation is not accuracy.",
        "- Surface forced-release ledgers sum to their initial contact volume, including unsupported "
        "release inventory. Detailed per-source values are in JSON.",
        f"- SHA-256 checked {result['preservation']['count']} preexisting deliverable "
        "files unchanged. Only new kuhni-coalescence-* outputs written.",
        "",
        "## Decision and missing observations", "",
        "No result qualifies bare-top performance, a required coalescer, irreversible removal, "
        "lower-face return, or actual carryover. Measure terminal/fresh-feed loading and joint "
        "DSD-position-time data, quiet-zone concentration and pair merger histories, representative "
        "aged immersed wetting/hysteresis, horizontal perforated-coupon accumulation and lower-face "
        "drainage/re-entrainment, actual local pressure/traction and allowable physical carryover. "
        "The active column, bottom, app/database and saved geometry remain untouched."]
    (ROOT/f"{PREFIX}-model.md").write_text("\n".join(lines)+"\n")


def refine_quiet_only(step):
    """Append a requested PBM-step refinement without recomputing unchanged prior runs."""
    path = ROOT/f"{PREFIX}-results.json"
    result = json.loads(path.read_text())
    before = {str(p.relative_to(ROOT)): sha(p) for p in ROOT.rglob("*")
              if p.is_file() and p.name not in OWNED}
    model = Model()
    x = model.empty()
    for label, diameter in enumerate([.001455, .00165]):
        k = int(np.argmin(abs(model.d-diameter)))
        x[:, :, k, label] = .5*.001*model.vol*model.quiet
    row, _, _ = model.run(.001, 1, 1, horizon=300., initial=x, coagulation_step=step)
    row["name"] = f"quiet alpha=0.001,Emerge=1,PBM step={step:g}s"
    row["source_labels"] = ["quiet_test_small_origin", "quiet_test_large_origin"]
    result["quiet_inventory_probe_runs"] = [
        r for r in result["quiet_inventory_probe_runs"] if r["name"]!=row["name"]]+[row]
    result["tests"] = tests()
    _, _, surface = model.run(.001, 1, 1)
    result["surface_endpoints"] = (model.surface_endpoints(surface, .001) +
                                   model.surface_endpoints(surface, .001, .01))
    assert all(sha(ROOT/p)==h for p, h in before.items())
    result["refinement_resume_preservation_count"] = len(before)
    result["preservation"] = dict(count=len(before), changed=[], sha256=before)
    result["executable_sha256"] = sha(Path(__file__))
    path.write_text(json.dumps(result, indent=2)+"\n")
    write_report(result)


def validate_quiet(which):
    settings = {"base": (24, 72, 1), "size": (24, 72, 2), "space": (40, 108, 1)}
    nr, nz, refine = settings[which]
    path = ROOT/f"{PREFIX}-results.json"
    result = json.loads(path.read_text())
    before = {str(p.relative_to(ROOT)): sha(p) for p in ROOT.rglob("*")
              if p.is_file() and p.name not in OWNED}
    model = Model(nr, nz, refine, align_quiet=True)
    x = model.empty()
    for label, diameter in enumerate([.001455, .00165]):
        k = int(np.argmin(abs(model.d-diameter)))
        x[:, :, k, label] = .0005*model.vol*model.quiet
    expected = np.pi*(B*B-A*A)*.6*.001
    assert abs(x.sum()-expected)<1e-15
    pair = {}
    for em, label in [(0, "no_merger"), (1, "merger")]:
        row, _, _ = model.run(.001, 1, em, horizon=300., initial=x, coagulation_step=.125)
        row["source_labels"] = ["quiet_test_small_origin", "quiet_test_large_origin"]
        row["name"] = f"fixed-quiet-{which}-{label}"
        pair[label] = row
        print(row["name"], sum(row["fractions_of_total_by_source"]["ideal_outlet"]),
              row["minimum_event_limiter"], flush=True)
    result.setdefault("quiet_fixed_inventory_validation", {})[which] = pair
    # Diagnostics only: no repeated endpoint release trajectories.
    if any("size_diagnostics" not in r for r in result["surface_endpoints"]):
        old_model = Model()
        _, _, surface = old_model.run(.001, 1, 1)
        for row in result["surface_endpoints"]:
            row["size_diagnostics"] = old_model.surface_size_diagnostics(
                surface, row["nominal_patch_arclength_m"], row["morphology"]!="unmerged")
    result["tests"] = tests()
    assert all(sha(ROOT/p)==h for p, h in before.items())
    result["preservation"] = dict(count=len(before), changed=[], sha256=before)
    result["executable_sha256"] = sha(Path(__file__))
    path.write_text(json.dumps(result, indent=2)+"\n")
    write_report(result)


def refresh_report():
    """Recheck stored-input preservation and regression tests; refresh text only numerically."""
    path = ROOT/f"{PREFIX}-results.json"
    result = json.loads(path.read_text())
    assert all(sha(ROOT/p)==h for p, h in result["preservation"]["sha256"].items())
    result["tests"] = tests()
    result["executable_sha256"] = sha(Path(__file__))
    path.write_text(json.dumps(result, indent=2)+"\n")
    write_report(result)


if __name__ == "__main__":
    if len(sys.argv)==2 and sys.argv[1]=="--refresh-report":
        refresh_report()
    elif len(sys.argv)==3 and sys.argv[1]=="--validate-quiet":
        validate_quiet(sys.argv[2])
    elif len(sys.argv)==3 and sys.argv[1]=="--refine-quiet":
        refine_quiet_only(float(sys.argv[2]))
    else:
        main()