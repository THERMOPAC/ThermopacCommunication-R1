"""Independent, standard Abrams--Prausnitz UNIQUAC implementation."""
from __future__ import annotations
import math

FAMILIES = ("SAT", "MONO", "DI", "POLY", "NMP")
Z = 10.0
EPS = 1.e-14
EXP_LOG = {"calls": 0, "activations": 0, "maximum_absolute_raw_exponent": 0.0}

def reset_exp_log():
    EXP_LOG.update(calls=0, activations=0, maximum_absolute_raw_exponent=0.0)

def normalize(v, active):
    x = [0.] * 5
    for i in active:
        if not math.isfinite(v[i]) or v[i] < 0: raise ValueError("invalid composition")
        x[i] = max(float(v[i]), EPS)
    s = sum(x)
    if s <= 0: raise ValueError("zero composition")
    return [q / s for q in x]

def lngamma(v, T, p, active, r, q, mapping):
    """ln gamma for tau_ij=exp[-(a_ij+b_ij/T)] (or fixed a at 298.15 K).

    ``r`` and ``q`` deliberately are row molecular values, never family
    representative values.  The residual follows the column-index convention
    sum_j theta_j tau_ji.
    """
    if T <= 0: raise ValueError("temperature must be positive")
    x = normalize(v, active); tau = [[1. if i == j else 0. for j in range(5)] for i in range(5)]
    k = 0
    for m in mapping:
        e = -(p[k] + (p[k+1] / T if m["form"] == "a+b/T" else 0.)); k += 2 if m["form"] == "a+b/T" else 1
        EXP_LOG["calls"] += 1
        EXP_LOG["maximum_absolute_raw_exponent"] = max(EXP_LOG["maximum_absolute_raw_exponent"], abs(e))
        if abs(e) > 50:
            EXP_LOG["activations"] += 1
            raise OverflowError("UNIQUAC exponent clamp would activate")
        tau[m["i"]][m["j"]] = math.exp(e)
    sr=sum(x[i]*r[i] for i in active); sq=sum(x[i]*q[i] for i in active)
    phi=[0.]*5; theta=[0.]*5; ell=[Z/2*(r[i]-q[i])-(r[i]-1) for i in range(5)]
    for i in active: phi[i]=x[i]*r[i]/sr; theta[i]=x[i]*q[i]/sq
    xl=sum(x[i]*ell[i] for i in active); out=[0.]*5
    for i in active:
        comb=math.log(phi[i]/x[i])+Z/2*q[i]*math.log(theta[i]/phi[i])+ell[i]-phi[i]/x[i]*xl
        ci=sum(theta[j]*tau[j][i] for j in active)
        corr=sum(theta[j]*tau[i][j]/sum(theta[n]*tau[n][j] for n in active) for j in active)
        out[i]=comb+q[i]*(1-math.log(ci)-corr)
    return out