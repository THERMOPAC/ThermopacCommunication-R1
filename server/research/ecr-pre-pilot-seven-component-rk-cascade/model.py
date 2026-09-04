#!/usr/bin/env python3
"""Immutable Task-238 native-cCOSMO plus Redlich--Kister thermodynamics."""
from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TASK238_MODEL = (
    ROOT / "server/research/task-238-nmp-oil-interaction-model/model.py"
)
TASK238_PROTOCOL = (
    ROOT / "server/research/task-238-nmp-oil-interaction-model/protocol.json"
)

# Task-238 artifact TASK-238-NMP-OIL-RK-0.2.0.  The order is the exact
# (pair, polynomial order, constant/temperature coefficient) order generated
# by task-238 model.features.  Keeping the fitted vector here makes this
# production model immutable and independent of mutable research output paths.
PARAMETERS = (
    2.8289884668435343, 1.9299543041755611, 0.43401686554773117,
    1.6955904540972073, 0.8311719099300968, -0.9830575066921077,
    0.37527246503803974, 1.3536890106170199, -0.5096387901803981,
    0.8670862564143098, 0.24043833049198426, 0.1382602877628103,
    -0.08611477920943386, -1.5326637967670228e-12, 0.30821146632592816,
    -5.3497994798691e-12, -0.12238474815852998, -8.402317386912503e-12,
    0.0038171246868604833, -1.5326637967670577e-12, 0.11920924531103434,
    -5.349799479869528e-12, -0.013581414382966138, -8.402317386912401e-12,
    0.04393362900153012, -1.5326637967671817e-12, 0.04494005164158426,
    -5.349799479869698e-12, 0.02315065880689627, -8.402317386912813e-12,
    -0.6597388829015183, -1.5326637967670605e-12, 0.023388740310128553,
    -5.349799479869054e-12, -0.5336121520311469, -8.402317386912578e-12,
    0.8871494381058964, 1.4082589367547497e-12, 2.0473551227158153,
    1.822982688280065e-13, -1.364718560001788, -5.695927713712196e-13,
    -0.21877463647534728, 1.2440486001239848e-13, -0.08234002996280011,
    4.496460587736927e-14, 0.0012233476657420503, -5.216968999448362e-14,
)
PARAMETER_SHA256 = "851fc110959f6ac5622ee94bf04fa6b4396532753f774c33d59e5741570b3c08"
TASK238_RESULTS_SHA256 = "a014064f61e37c8030af34c1893ef1c25c747ccd6750d53147b23f6dcb4955ec"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


task238 = _load("immutable_task238_equations", TASK238_MODEL)
native = _load("immutable_task238_native", task238.NATIVE_PATH)
FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class NativePlusRkModel:
    """One integrable scalar Gibbs model; native Gibbs is always retained."""

    def __init__(self, native_model, np):
        self.native_model = native_model
        self.np = np
        self.parameters = np.asarray(PARAMETERS, dtype=float)

    def wet_lngamma(self, np, temperature_k, x7):
        x = np.maximum(np.asarray(x7, dtype=float), 1e-12)
        x /= x.sum()
        native_lngamma = self.native_model.wet_lngamma(np, temperature_k, x)
        _, delta_mu = task238.correction(np, x, temperature_k, self.parameters)
        return np.asarray(native_lngamma) + delta_mu


def build_model():
    temporary, np, scipy, native_model, inherited, runtime = native.build_model()
    model = NativePlusRkModel(native_model, np)
    integrity = {
        **inherited,
        "activeThermodynamicModel":
            "NATIVE_SEVEN_COMPONENT_CCOSMO_2010_PLUS_ADDITIVE_REDLICH_KISTER",
        "nativeGibbsContributionRetained": True,
        "interactionForm":
            "sum_[pairs,k=0..2] [a+b*(Tref/T-1)]*xi*xj*(xi-xj)^k",
        "interactionPairCount": 8,
        "interactionParameterCount": 48,
        "task238ArtifactVersion": "TASK-238-NMP-OIL-RK-0.2.0",
        "task238ModelSha256": sha(TASK238_MODEL),
        "task238ProtocolSha256": sha(TASK238_PROTOCOL),
        "task238ResultsSha256": TASK238_RESULTS_SHA256,
        "task238ParameterVectorSha256": PARAMETER_SHA256,
    }
    return temporary, np, scipy, model, integrity, runtime