#!/usr/bin/env python3
"""Independent verification of the delivered amendment artifacts."""
import hashlib
import importlib.util
import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
RUNNER = HERE / "run.py"
MODEL = HERE / "model.py"
PROTOCOL = HERE / "protocol.json"
SNAPSHOT = HERE / "stage1-qualification-snapshot.json"

spec = importlib.util.spec_from_file_location("amended_model", MODEL)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
import numpy as np

delivered_results = (OUT / "results.json").read_bytes()
delivered_report = (OUT / "report.md").read_bytes()
result = json.loads(delivered_results)
manifest = json.loads((OUT / "provenance-manifest.json").read_text())
p = json.loads(PROTOCOL.read_text())

assert result["model"]["identity"] == "COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL"
assert result["researchOnly"] and result["calibrationRequired"]
assert not result["pilotValidated"] and not result["releaseEligible"]
assert result["sulfurPrediction"] == "NOT_CALCULABLE"
assert result["paTransferStatus"] == "PROVISIONAL_NO_DIRECT_PA_LLE_EVIDENCE"

params = np.array([result["model"]["parameters"][name] for name in m.PARAMETER_NAMES])
rng = np.random.default_rng(199)
for temperature in (298.15, 323.15, 348.15):
    for _ in range(12):
        x = rng.dirichlet(np.ones(6))
        analytic = m.residual_lngamma(x, temperature, params)
        # Independent partial-molar finite difference on n*g(n/sum(n)).
        n = x.copy()
        base_total = n.sum() * m.residual_g_over_rt(n / n.sum(), temperature, params)
        numeric = []
        h = 1e-6
        for i in range(6):
            shifted = n.copy(); shifted[i] += h
            total = shifted.sum() * m.residual_g_over_rt(shifted / shifted.sum(), temperature, params)
            numeric.append((total - base_total) / h)
        assert max(abs(analytic - numeric)) < 2e-5
        # Gibbs-Duhem at fixed T: sum(x_i d ln gamma_i)=0.
        direction = rng.normal(size=6); direction -= direction.mean()
        direction *= 1e-7 / max(abs(direction))
        plus = m.residual_lngamma(x + direction, temperature, params)
        minus = m.residual_lngamma(x - direction, temperature, params)
        assert abs(float(np.dot(x, plus - minus))) < 2e-10

flash = result["stage1Prediction"]["flash"]
g = p["numericalAcceptance"]
assert flash["accepted"]
assert flash["minimumTpd"] < g["negativeTpdThreshold"]
assert flash["gibbsReduction"] > g["minimumGibbsReduction"]
assert flash["isoactivityLogResidual"] <= g["maximumIsoactivityLogResidual"]
assert flash["materialBalanceMaxResidual"] <= g["maximumMaterialBalanceResidual"]
assert flash["postSplitTpd"]["raffinate"] >= g["postSplitTpdThreshold"]
assert flash["postSplitTpd"]["extract"] >= g["postSplitTpdThreshold"]
assert all(v > 0 for v in flash["raffinate"] + flash["extract"])
assert flash["phaseDirection"]["raffinateSatRicher"]
assert flash["phaseDirection"]["extractNmpRicher"]
assert all(v > 1 for v in flash["phaseDirection"]["aromaticSelectivityOverSat"].values())
assert len(flash["K"]) == 6 and all(math.isfinite(v) and v > 0 for v in flash["K"])
assert flash["tpd"]["gridDenominator"] == 4
assert flash["tpd"]["gridPointCount"] == 126
assert flash["tpd"]["allRefinementsAccepted"]

# Independently reconstruct the full denominator-4 simplex lattice and ensure
# an actually evaluated lattice point is unstable before trusting refinement.
charge = result["stage1Authority"]["charge"]
z = np.array([charge["overallMolarComposition"][name] for name in m.FAMILIES])
temperature = charge["temperatureK"]
gz = m.total_lngamma(m.FAMILIES, temperature, z, params)
coarse_values = []
def enumerate_grid(left, dimensions, prefix):
    if dimensions == 1:
        w = m.normalize(prefix + [left])
        coarse_values.append(float(np.sum(w * (
            np.log(w) + m.total_lngamma(m.FAMILIES, temperature, w, params)
            - np.log(z) - gz
        ))))
        return
    for count in range(left + 1):
        enumerate_grid(left - count, dimensions - 1, prefix + [count])
enumerate_grid(4, 6, [])
assert len(coarse_values) == 126
assert min(coarse_values) < g["negativeTpdThreshold"]
assert abs(min(coarse_values) - flash["tpd"]["coarseMinimum"]) < 1e-9

# Independently reconstruct phase chemical potentials, material balance, and
# total reduced-Gibbs reduction from the delivered phase result.
r = np.array(flash["raffinate"]); e = np.array(flash["extract"]); beta = flash["betaExtract"]
mu_r = np.log(r) + m.total_lngamma(m.FAMILIES, temperature, r, params)
mu_e = np.log(e) + m.total_lngamma(m.FAMILIES, temperature, e, params)
assert max(abs(mu_r - mu_e)) <= g["maximumIsoactivityLogResidual"]
assert max(abs(z - ((1 - beta) * r + beta * e))) <= g["maximumMaterialBalanceResidual"]
def reduced_g(x):
    return float(np.sum(x * (np.log(x) + m.total_lngamma(m.FAMILIES, temperature, x, params))))
independent_reduction = reduced_g(z) - ((1 - beta) * reduced_g(r) + beta * reduced_g(e))
assert abs(independent_reduction - flash["gibbsReduction"]) < 1e-11
assert independent_reduction > g["minimumGibbsReduction"]

validation = result["evidence"]["validation"]
assert validation["training"]["status"] == "FAIL"
assert validation["heldOutTemperature"]["status"] == "FAIL"
assert validation["heldOutMolecularSystem"]["status"] == "FAIL"
assert result["qualification"]["quantitativeLleGate"] == "FAILED"
assert result["qualification"]["fullSixComponentModelQualification"] == "NOT_QUALIFIED"

compliance = result["stage1Prediction"]["processMetrics"]["targetCompliance"]
assert compliance["targetRaffinateSulfurPpm"]["status"] == "NOT_CALCULABLE"
assert compliance["maximumStages"]["status"] == "NOT_EVALUATED_BY_EQUILIBRIUM_FLASH"
assert set(result["stage1Prediction"]["phaseCompositions"]["KExtractOverRaffinate"]) == set(m.FAMILIES)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

assert manifest["implementation"]["runner"] == sha(RUNNER)
assert manifest["implementation"]["model"] == sha(MODEL)
assert manifest["inputs"]["protocol"] == sha(PROTOCOL)
assert manifest["inputs"]["stage1Snapshot"] == sha(SNAPSHOT)
prior_protocol = ROOT / "server/research/ecr-pre-pilot-cosmosac-qualification/protocol.json"
assert manifest["inputs"]["priorStage1Protocol"] == sha(prior_protocol)
assert manifest["outputs"]["results"] == hashlib.sha256(delivered_results).hexdigest()
assert manifest["outputs"]["report"] == hashlib.sha256(delivered_report).hexdigest()

with tempfile.TemporaryDirectory(prefix="task199-verify-") as temp:
    env = dict(os.environ)
    env["TASK199_OUTPUT_DIR"] = temp
    subprocess.run([sys.executable, str(RUNNER)], cwd=ROOT, env=env, check=True)
    assert Path(temp, "results.json").read_bytes() == delivered_results
    assert Path(temp, "report.md").read_bytes() == delivered_report
    assert json.loads(Path(temp, "provenance-manifest.json").read_text()) == manifest

print("TASK_199_COSMOSAC_NMP_LLE_AMENDMENT_VERIFIED")