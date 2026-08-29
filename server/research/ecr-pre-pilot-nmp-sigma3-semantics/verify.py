#!/usr/bin/env python3
"""Fail-closed verifier for the NMP sigma3 semantics diagnostic."""

from __future__ import annotations

import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-nmp-sigma3-semantics"
RESULTS = OUT / "results.json"
REPORT = OUT / "report.md"
AUDIT = OUT / "segment-audit.csv"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def close(actual: float, expected: float, tolerance: float) -> None:
    assert abs(actual - expected) <= tolerance, (actual, expected, tolerance)


subprocess.run([sys.executable, str(HERE / "run.py")], cwd=ROOT, check=True)
first_hashes = {path.name: sha256(path) for path in (RESULTS, REPORT, AUDIT)}
subprocess.run([sys.executable, str(HERE / "run.py")], cwd=ROOT, check=True)
second_hashes = {path.name: sha256(path) for path in (RESULTS, REPORT, AUDIT)}
assert first_hashes == second_hashes

result = json.loads(RESULTS.read_text(encoding="utf-8"))
assert result["schemaVersion"] == "1.0.0"
assert result["verdict"] == "NMP_SIGMA3_CONVERSION_DEFECT_CONFIRMED"
assert result["researchOnly"] is True
assert result["calibrationRequired"] is True
assert result["pilotValidated"] is False
assert result["releaseEligible"] is False
assert result["sulfurPrediction"] == "NOT_CALCULABLE"
assert result["frozenInputs"]["restrictedProfileInputsUsed"] is False
assert result["frozenInputs"]["nistCosmoSacCommit"] == "1b82456be38026719b16cad4076109bef3fcb309"
assert result["frozenInputs"]["nistToSigmaSha256"] == "73cd7b526568ee921e2fcd83b5d8653fccf37878fe4690abafdcd785334ace2a"

assert set(result["confirmedDefects"]) == {
    "AVERAGING_ALGORITHM_MISMATCH",
    "EMITTED_METADATA_MISSTATES_ACTUAL_AVERAGING",
    "RAW_CPCMX_SIGN_PLACES_CARBONYL_O_OUTSIDE_NIST_OT_MASK",
}
assert result["surface"]["atomCount"] == 16
assert result["surface"]["segmentCount"] == 757
close(result["surface"]["declaredAreaSquareAngstrom"], 273.5945506560466, 1.0e-12)
close(
    result["surface"]["parsedAreaSquareAngstrom"],
    result["surface"]["declaredAreaSquareAngstrom"],
    1.0e-6,
)
assert result["surface"]["maximumPrintedChargeAreaColumnError"] < 1.0e-8

nist = result["nistReferenceSemantics"]
close(nist["averaging"]["rAvSquaredSquareAngstrom"], 7.25 / 3.141592653589793, 1.0e-15)
close(nist["averaging"]["rAvAngstrom"], 1.5191269449366247, 1.0e-15)
close(nist["averaging"]["fDecay"], 3.57, 0.0)
close(nist["gridElectronPerSquareAngstrom"]["minimum"], -0.025, 0.0)
close(nist["gridElectronPerSquareAngstrom"]["maximum"], 0.025, 0.0)
close(nist["gridElectronPerSquareAngstrom"]["step"], 0.001, 0.0)

assert result["atomClassification"]["classes"]["2"] == "OT"
assert result["atomClassification"]["classes"]["7"] == "OT"
assert all(
    result["atomClassification"]["classes"][str(number)] == "NHB"
    for number in list(range(1, 17))
    if number not in {2, 7}
)

emitted_ot = result["emittedProfile"]["OT"]["areaSquareAngstrom"]
cpcmx = result["cpcmxReconstruction"]
nist_reconstruction = result["nistHsiehReconstruction"]
close(emitted_ot, 0.074911, 1.0e-12)
close(cpcmx["profile"]["OT"]["areaSquareAngstrom"], 0.07491079912918364, 1.0e-12)
close(cpcmx["otPreProbabilityAssignedAreaSquareAngstrom"], 11.055243283, 1.0e-9)
assert cpcmx["comparisonToEmitted"]["maximumAbsoluteBinAreaDifferenceSquareAngstrom"] < 1.0e-4
assert cpcmx["actualAveraging"] == {
    "rAvAngstrom": 0.30880726,
    "fDecay": 1.0,
    "source": "first value of frozen crs.param_h2o plus CPCM-X sigma_av.f90",
}
assert cpcmx["otSegmentIds"] == [
    79, 81, 82, 83, 84, 85, 86, 89, 90, 94,
    95, 97, 99, 100, 102, 103, 104, 105, 107, 109,
]

close(
    nist_reconstruction["profile"]["OT"]["areaSquareAngstrom"],
    0.10054444390379959,
    1.0e-12,
)
assert (
    nist_reconstruction["comparisonToEmitted"][
        "maximumAbsoluteBinAreaDifferenceSquareAngstrom"
    ]
    > 7.0
)
assert (
    nist_reconstruction["comparisonToEmitted"]["l1BinAreaDifferenceSquareAngstrom"]
    > 35.0
)

explanation = result["currentOtExplanation"]
assert explanation["contributingAtomNumbers"] == [2]
assert explanation["contributingElements"] == ["N"]
close(explanation["oxygenTotalAreaSquareAngstrom"], 25.968825454, 1.0e-9)
close(explanation["oxygenAreaAssignedOtBeforeProbabilitySquareAngstrom"], 0.0, 0.0)
close(
    explanation["nitrogenAreaAssignedOtBeforeProbabilitySquareAngstrom"],
    11.055243283,
    1.0e-9,
)
close(
    result["signInversionDiagnosticOnly"]["profile"]["OT"]["areaSquareAngstrom"],
    9.270791929508555,
    1.0e-11,
)
assert result["signInversionDiagnosticOnly"]["appliedToProjectProfile"] is False
assert (
    result["signInversionDiagnosticOnly"]["signConventionVerdict"]
    == "UNRESOLVED_INCOMPATIBILITY_NOT_CORRECTION_PROOF"
)
assert result["conclusion"]["broaderLleBenchmarkReady"] is False

with AUDIT.open(newline="", encoding="utf-8") as handle:
    rows = list(csv.DictReader(handle))
assert len(rows) == 757
assert [int(row["segment"]) for row in rows] == list(range(1, 758))
assert sum(row["cpcmx_pre_probability_partition"] == "OT" for row in rows) == 20
assert sum(row["nist_pre_probability_partition"] == "OT" for row in rows) == 20
assert all(
    row["nist_pre_probability_partition"] == "NHB"
    for row in rows
    if row["atom"] == "7"
)

report = REPORT.read_text(encoding="utf-8")
assert report.startswith("# NMP sigma3 semantics diagnostic")
assert report.rstrip().endswith("`NMP_SIGMA3_CONVERSION_DEFECT_CONFIRMED`")
assert "No UD, VT2005, ThermoSAC" in report
assert "No profile, generator, COSMO-SAC parameter" in report
assert "does not by itself prove that whole-surface sign inversion is the correct repair" in report

print("NMP sigma3 semantics diagnostic verified")