"""Native 7C cCOSMO plus an analytic Redlich--Kister excess-Gibbs amendment."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
NATIVE_PATH = ROOT / "server/research/ecr-pre-pilot-seven-component-native/model.py"
PAIRS = ((5, 0), (5, 1), (5, 2), (5, 3), (5, 4), (5, 6), (6, 0), (6, 1))
ORDERS = (0, 1, 2)
TREF = 298.15


def load_native():
    spec = importlib.util.spec_from_file_location("task238_native", NATIVE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module.build_model()


def features(np, x, temperature_k):
    """Scalar-Gibbs and ambient gradient features for every RK coefficient."""
    x = np.asarray(x, float)
    tau = TREF / float(temperature_k) - 1.0
    scalar, gradient = [], []
    for i, j in PAIRS:
        u = x[i] - x[j]
        for k in ORDERS:
            base = x[i] * x[j] * u**k
            di = x[j]*u**k + (x[i]*x[j]*k*u**(k-1) if k else 0.0)
            dj = x[i]*u**k - (x[i]*x[j]*k*u**(k-1) if k else 0.0)
            for factor in (1.0, tau):
                scalar.append(base * factor)
                row = np.zeros(7); row[i] = di*factor; row[j] = dj*factor
                gradient.append(row)
    return np.asarray(scalar), np.asarray(gradient).T


def correction(np, x, temperature_k, parameters):
    scalar, gradient = features(np, x, temperature_k)
    g = float(scalar @ parameters)
    grad = gradient @ parameters
    return g, grad + g - float(np.asarray(x) @ grad)


def total(np, native, x, temperature_k, parameters):
    """Return true g_native + Delta_g and its chemical potentials."""
    x = np.maximum(np.asarray(x, float), 1e-12)
    x /= x.sum()
    lngamma = np.asarray(native.wet_lngamma(np, temperature_k, x), float)
    native_g = float(np.sum(x * (np.log(x) + lngamma)))
    delta_g, delta_mu = correction(np, x, temperature_k, parameters)
    return native_g + delta_g, np.log(x) + lngamma + delta_mu, delta_g