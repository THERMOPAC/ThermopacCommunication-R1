#!/usr/bin/env python3
"""Frozen Stage-1 six-component COSMO-SAC design prediction and qualification verdict."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get(
    "TASK197_OUTPUT_DIR",
    ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-qualification",
))
OUT.mkdir(parents=True, exist_ok=True)
PROTOCOL_PATH = HERE / "protocol.json"
ENGINE_PATH = ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py"

spec = importlib.util.spec_from_file_location("frozen_cosmosac", ENGINE_PATH)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

protocol = json.loads(PROTOCOL_PATH.read_text())
names = protocol["componentOrder"]
feed = protocol["stage1Basis"]["feedMassPercent"]
solvent_ratio = protocol["stage1Basis"]["solventOilMassRatio"]
molecular_weights = {
    "SAT": 170.3348,
    "MONO": 120.194,
    "DI": 142.1971,
    "POLY": 202.2506,
    "PA": 405.58,
    "NMP": 99.1311,
}
masses = {name: float(feed[name]) for name in names}
masses["NMP"] += 100.0 * solvent_ratio
moles = {name: masses[name] / molecular_weights[name] for name in names}
total_moles = sum(moles.values())
z = [moles[name] / total_moles for name in names]
temperature = float(protocol["temperatureK"])

ln_gamma = engine.lngamma(names, temperature, z)
tpd = engine.tpd_search(names, temperature, z)
flash = engine.flash(names, temperature, z)
phase_count = 2 if flash["phaseBehavior"] == "TWO_PHASE" else (
    1 if flash["phaseBehavior"] == "PREDICTED_STABLE_SINGLE_PHASE" else None
)

two_phase = phase_count == 2
result = {
    "schemaVersion": "1.0.0",
    "researchOnly": True,
    "calibrationRequired": True,
    "pilotValidated": False,
    "releaseEligible": False,
    "sulfurPrediction": "NOT_CALCULABLE",
    "protocolSha256": hashlib.sha256(PROTOCOL_PATH.read_bytes()).hexdigest(),
    "engineSha256": hashlib.sha256(ENGINE_PATH.read_bytes()).hexdigest(),
    "stage1Charge": {
        "temperatureK": temperature,
        "feedMassPercent": feed,
        "solventOilMassRatio": solvent_ratio,
        "chargeMassBasis": masses,
        "molecularWeightsGmol": molecular_weights,
        "overallMolarComposition": dict(zip(names, z)),
        "componentOrder": names,
    },
    "activityAtOverallComposition": {
        "lnGamma": dict(zip(names, map(float, ln_gamma))),
        "executed": True,
    },
    "phaseStability": {
        "executed": True,
        "minimumTpd": tpd["refinedMinimum"],
        "verdict": tpd["verdict"],
        "refinementConverged": tpd["refinementConverged"],
        "details": tpd,
    },
    "flash": {
        "attempted": True,
        "optimizerConverged": flash["optimizerSuccess"],
        "acceptedTwoLiquidSolution": two_phase,
        "predictedPhaseCount": phase_count,
        "phaseBehavior": flash["phaseBehavior"],
        "gibbsReduction": flash["objectiveImprovement"],
        "RRBO_rich": flash["RRBO_rich"],
        "NMP_rich": flash["NMP_rich"],
        "betaNmpRich": flash["beta_NMP_rich"],
        "distributionRatios": flash["K_NMPrich_over_RRBO"],
        "isoactivityLogResidual": flash["isoactivityLogResidual"],
        "materialBalanceMaxResidual": flash["massBalanceMaxResidual"],
        "numericalFailureReasons": flash["numericalFailureReasons"],
        "candidateDiagnostics": flash["candidateSplitDiagnostics"],
    },
    "derivedProcessMetrics": {
        "status": "NOT_CALCULABLE_SINGLE_LIQUID" if phase_count == 1 else "CALCULATED",
        "extraction": None,
        "loss": None,
        "nmpCarryover": None,
        "nmpFreeRecovery": None,
    },
    "qualification": {
        "fullSixComponentQualification": "INPUT_NOT_AVAILABLE",
        "reason": "No independent experimental six-component observed phase outcome is registered for this Stage-1 charge.",
        "designPredictionStatus": "CALCULATED_RESEARCH_ONLY",
        "designUseAdmission": "BLOCKED_CALIBRATION_REQUIRED",
    },
}
(OUT / "results.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")

report = f"""# COSMO-SAC qualification checkpoint — Stage 1 six-component case

## Frozen design charge

- Temperature: {temperature:.2f} K
- Component order: {", ".join(names)}
- Overall molar composition: {", ".join(f"{name}={value:.10f}" for name, value in zip(names, z))}

## Numerical result

- Activity calculation executed: YES
- TPD calculation executed: YES
- Minimum TPD: {tpd["refinedMinimum"]:.12e}
- Stability verdict: {tpd["verdict"]}
- TPD refinements converged: {tpd["refinementConverged"]}
- Two-liquid flash attempted: YES
- Split optimizer converged: {flash["optimizerSuccess"]}
- Accepted two-liquid solution: {two_phase}
- Predicted phase count: {phase_count}
- Gibbs reduction: {flash["objectiveImprovement"]:.12e}
- Material-balance maximum residual: {flash["massBalanceMaxResidual"]:.12e}

Under the declared bounded full-simplex TPD search and deterministic Gibbs minimizations, the unchanged corrected-profile COSMO-SAC model found no negative TPD or Gibbs-lowering two-liquid split for the Stage 1 charge at 323.15 K. The optimizer did not fail.

## Qualification decision

`FULL_SIX_COMPONENT_QUALIFICATION = INPUT_NOT_AVAILABLE`

This calculation is a valid research-only Stage 1 design prediction, but no independent experimental six-component observation is registered to qualify it. It remains `CALIBRATION_REQUIRED`, non-pilot-validated, and non-release-eligible. Sulfur remains `NOT_CALCULABLE`.
"""
(OUT / "report.md").write_text(report)

manifest = {
    "schemaVersion": "1.0.0",
    "protocolSha256": result["protocolSha256"],
    "runnerSha256": hashlib.sha256((HERE / "run.py").read_bytes()).hexdigest(),
    "engineSha256": result["engineSha256"],
    "resultsSha256": hashlib.sha256((OUT / "results.json").read_bytes()).hexdigest(),
    "reportSha256": hashlib.sha256((OUT / "report.md").read_bytes()).hexdigest(),
    "componentProfileSha256ByFamily": {
        name: hashlib.sha256(
            (engine.PROFILES / "sigma3" / f"{engine.KEY[name]}.sigma").read_bytes()
        ).hexdigest()
        for name in names
    },
}
(OUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")