#!/usr/bin/env python3
"""Independent invariant verifier for the 236-record fail-closed benchmark."""

import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-236-benchmark"
RUNNER = HERE / "run.py"
RESULTS = OUT / "results.json"
REPORT = OUT / "report.md"
MANIFEST = OUT / "provenance-manifest.json"
COTO = ROOT / "server/engine-framework/cel/coto2022-nmp-lle.ts"
MULTI = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
PROFILE_PROVENANCE = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json"
PROFILES = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles"
BASELINE_RUNNER = ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py"
BASELINE_PROVENANCE = ROOT / "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json"
CCOSMO_BINARY = ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python/cCOSMO.cpython-312-x86_64-linux-gnu.so"
NULL_FLASH_FIELDS = {
    "predictedPhaseCount",
    "tpdMinimum",
    "gibbsReduction",
    "solverConverged",
    "predictedRrboRichComposition",
    "predictedNmpRichComposition",
    "predictedNmpRichPhaseFraction",
    "equilibriumClosure",
    "materialBalanceClosure",
}
EXPECTED_SOURCE_HASHES = {
    "server/engine-framework/cel/coto2022-nmp-lle.ts": "8253433f5624934b7f9135f223090e8b9e2c5b1cbfaee06c951a3d87b839ea42",
    "server/engine-framework/cel/data/multi-t-nmp-lle.json": "72d16b9544cebb3f5d55def342684fd3414707e9e84b27c558b6a7e6f6409c28",
    "attached_assets/thermoml_fahim2005.json": "e06ec9f8d268a4ef524f7e5311d5e0e1c37e6cdd7f440ed12ea72993458a5b1a",
    "attached_assets/thermoml_fandary2006.json": "bdd7fec71d42860d8fe25ed2f3f3f7b972d35049d1355b18374559da41e01d56",
    "attached_assets/thermoml_aljimaz2006.json": "382fae7291fd553ddcf97dba06743a36120aa074bd056ec6d7b5cecfbffa953e",
    "attached_assets/Extraction_of_aromatic_and_polyaromatic_compounds_with_NMP_1786368615037.pdf": "857ec55577b7081e8aee19a796dba341e73b0822bbbcf6af60707f78e39c94ce",
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha(value):
    packed = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(packed.encode()).hexdigest()


result = json.loads(RESULTS.read_text())
manifest = json.loads(MANIFEST.read_text())
multi = json.loads(MULTI.read_text())
profile_provenance = json.loads(PROFILE_PROVENANCE.read_text())
baseline = json.loads(BASELINE_PROVENANCE.read_text())
records = result["records"]

assert result["schemaVersion"] == "1.0.0"
assert result["benchmarkStatus"] == result["finalDecision"] == "INPUT_NOT_AVAILABLE"
assert result["deterministic"] is True
assert result["researchOnly"] is True and result["calibrationRequired"] is True
assert result["pilotValidated"] is False and result["releaseEligible"] is False
assert result["sulfurPrediction"] == "NOT_CALCULABLE"
assert result["scope"] == {
    "recordCount": 236,
    "cotoRecordCount": 17,
    "multiTemperatureRecordCount": 219,
    "experimentalTopology": "TWO_LIQUID_PHASES",
    "activeFamilies": ["SAT", "MONO", "DI", "POLY", "NMP"],
    "polarAromaticsIncluded": False,
}

assert len(multi["tieLines"]) == 219
coto_matches = re.findall(
    r"\{\s*x:\s*\[([^\]]+)\],\s*y:\s*\[([^\]]+)\],\s*"
    r"tableOrder:\s*(\d+),?\s*nominalR:\s*([0-9.]+)\s*\}",
    COTO.read_text(),
)
assert len(coto_matches) == 17
assert sorted(int(match[2]) for match in coto_matches) == list(range(1, 18))
assert len(records) == 236 and len({record["recordId"] for record in records}) == 236
assert Counter(record["datasetGroup"] for record in records) == {
    "COTO_17": 17,
    "MULTI_T_219": 219,
}
assert Counter(record["source"]["key"] for record in records) == {
    "coto2022": 17,
    "fahim2005": 106,
    "fandary2006": 78,
    "aljimaz2006": 35,
}

for record in records:
    assert record["experimentalPhaseCount"] == 2
    assert record["experimentalTopology"] == "TWO_LIQUID_PHASES"
    assert "PA" not in record["componentFamilies"]
    assert record["overallCompositionEvidence"]["status"] == "INPUT_NOT_AVAILABLE"
    assert record["overallCompositionEvidence"]["value"] is None
    assert record["overallCompositionEvidence"]["phaseFraction"] is None
    assert record["overallCompositionEvidence"]["forbiddenSubstitutes"]
    assert record["flashDiagnostics"]["status"] == "INPUT_NOT_AVAILABLE"
    assert set(record["flashDiagnostics"]) == NULL_FLASH_FIELDS | {"status"}
    assert all(record["flashDiagnostics"][field] is None for field in NULL_FLASH_FIELDS)
    errors = record["tieLineErrors"]
    assert errors == {
        "status": "NOT_CALCULABLE_NO_ACCEPTED_TWO_PHASE_FLASH",
        "rmsdMoleFraction": None,
        "maximumAbsoluteDeviationMoleFraction": None,
        "componentAbsoluteErrors": None,
    }
    n = len(record["componentFamilies"])
    assert n in {3, 5}
    for phase in record["experimentalPhases"].values():
        composition = phase["composition"]
        assert len(composition) == n
        assert all(math.isfinite(value) and value >= 0 for value in composition)
        assert abs(sum(composition) - 1.0) < 1e-8
    assert math.isfinite(record["temperatureK"]) and record["temperatureK"] > 0
    assert math.isfinite(record["uncertainty"]["value"]) and record["uncertainty"]["value"] >= 0
    pinned = {
        "recordId": record["recordId"],
        "source": record["source"],
        "temperatureK": record["temperatureK"],
        "componentFamilies": record["componentFamilies"],
        "reportedComponents": record["reportedComponents"],
        "experimentalPhases": record["experimentalPhases"],
        "uncertainty": record["uncertainty"],
        "overallCompositionEvidence": record["overallCompositionEvidence"],
    }
    assert record["pinnedReportedInputSha256"] == canonical_sha(pinned)

# Compare every emitted Coto measurement directly with the controlled source.
coto_source = []
for x_text, y_text, order_text, ratio_text in coto_matches:
    values = lambda raw: [float(value.strip()) for value in raw.split(",")]
    coto_source.append({
        "tableOrder": int(order_text),
        "raffinate": values(x_text),
        "extract": values(y_text),
        "nominalR": float(ratio_text),
    })
coto_source.sort(key=lambda row: row["tableOrder"])
for record, source in zip(records[:17], coto_source):
    table_order = source["tableOrder"]
    mono_name = "1,4-xylene" if table_order <= 13 else "toluene"
    assert record["recordId"] == f"COTO-T3-{table_order:02d}"
    assert record["source"]["reportedRow"] == table_order
    assert record["source"]["family"] == ("xylene" if table_order <= 13 else "toluene")
    assert record["temperatureK"] == 298.15
    assert record["componentFamilies"] == ["SAT", "MONO", "DI", "POLY", "NMP"]
    assert record["reportedComponents"] == [
        {"family": "SAT", "identity": "n-dodecane"},
        {"family": "MONO", "identity": mono_name},
        {"family": "DI", "identity": "1-methylnaphthalene"},
        {"family": "POLY", "identity": "pyrene"},
        {"family": "NMP", "identity": "N-methyl-2-pyrrolidone"},
    ]
    assert record["experimentalPhases"]["raffinate"]["composition"] == source["raffinate"]
    assert record["experimentalPhases"]["extract"]["composition"] == source["extract"]
    assert record["uncertainty"]["value"] == 0.003
    assert record["excludedProvenanceOnlyInputs"] == {
        "nominalNmpToSyntheticCrudeMolarRatio": source["nominalR"],
        "calculationUse": "PROHIBITED_NONCLOSING_WITH_REPORTED_PHASES",
    }

# Compare every emitted multi-temperature measurement directly with its source row.
source_indexes = Counter()
for controlled_index, (record, source) in enumerate(zip(records[17:], multi["tieLines"]), 1):
    source_indexes[source["source"]] += 1
    components = ["SAT", "MONO", "NMP"]
    assert record["recordId"] == f"MULTI-T-{controlled_index:03d}"
    assert record["source"]["key"] == source["source"]
    assert record["source"]["controlledRecordIndex"] == controlled_index
    assert record["source"]["sourceRecordIndex"] == source_indexes[source["source"]]
    assert record["source"]["citation"] == multi["citation"][source["source"]]
    assert record["temperatureK"] == source["T_K"]
    assert record["componentFamilies"] == components
    assert record["reportedComponents"] == [
        {"family": family, "identity": source["components"][family]}
        for family in components
    ]
    assert record["experimentalPhases"]["raffinate"]["composition"] == [
        source["raffinate"][family] for family in components
    ]
    assert record["experimentalPhases"]["extract"]["composition"] == [
        source["extract"][family] for family in components
    ]
    assert record["uncertainty"]["value"] == source["u_x"]

aggregates = result["topologyRecall"]
for name, expected_count in (
    ("overall236", 236),
    ("coto17", 17),
    ("multiTemperature219", 219),
):
    aggregate = aggregates[name]
    assert aggregate["status"] == "NOT_CALCULABLE"
    assert aggregate["experimentalBiphasicRecordCount"] == expected_count
    assert aggregate["flashEligibleRecordCount"] == 0
    assert aggregate["inputNotAvailableRecordCount"] == expected_count
    assert aggregate["flashExecutedRecordCount"] == 0
    assert aggregate["predictedTwoPhaseCountAmongEvaluated"] == 0
    assert aggregate["evaluatedExperimentalPositiveCount"] == 0
    assert aggregate["topologyRecall"] is None

assert result["modelContract"]["modelExecuted"] is False
assert result["modelContract"]["solverInvocationCount"] == 0
assert result["modelContract"]["reasonNotExecuted"] == "INPUT_NOT_AVAILABLE"
assert result["modelContract"]["name"] == "COSMO-SAC-2010"
assert result["modelContract"]["NISTCosmoSacSourceCommit"] == "1b82456be38026719b16cad4076109bef3fcb309"
assert result["modelContract"]["pinnedNumericalSettings"] == baseline["settings"]
assert result["correctedProfileBasis"]["parametersChangedForBenchmark"] is False
assert result["correctedProfileBasis"]["profileSemanticsGate"] == "PASSED"
assert result["correctedProfileBasis"]["verificationDecision"] == "PROFILE_SEMANTICS_GATE_PASSED"
assert result["correctedProfileBasis"]["restrictedProfileInputsUsed"] is False

for family, expected_hash in profile_provenance["profileSha256ByFamily"].items():
    key = profile_provenance["componentIdentityKeys"][family]
    actual_hash = sha256(PROFILES / "sigma3" / f"{key}.sigma")
    assert result["correctedProfileBasis"]["profileSha256ByFamily"][family] == expected_hash == actual_hash

assert manifest["runnerSha256"] == sha256(RUNNER)
assert manifest["resultsSha256"] == sha256(RESULTS)
assert manifest["reportSha256"] == sha256(REPORT)
assert manifest["solverInvocationCount"] == 0
assert manifest["recordInputSha256"] == {
    record["recordId"]: record["pinnedReportedInputSha256"]
    for record in records
}
assert manifest["modelBasisSha256"]["baselineRunnerSha256"] == sha256(BASELINE_RUNNER)
assert manifest["modelBasisSha256"]["baselineProvenanceSha256"] == sha256(BASELINE_PROVENANCE)
assert manifest["modelBasisSha256"]["cCOSMOBinarySha256"] == sha256(CCOSMO_BINARY)
assert manifest["modelBasisSha256"]["profileProvenanceSha256"] == sha256(PROFILE_PROVENANCE)
assert manifest["sourceSha256"] == EXPECTED_SOURCE_HASHES
for path, expected_hash in EXPECTED_SOURCE_HASHES.items():
    assert sha256(ROOT / path) == expected_hash

for audit in result["sourceEvidence"]["thermoMlAvailabilityAudit"]:
    assert audit["compositionAtPhaseEquilibriumBlockCount"] > 0
    assert audit["conclusion"] == "CONJUGATE_PHASE_COMPOSITIONS_ONLY_NO_OVERALL_COMPOSITION_OR_PHASE_FRACTION"
    assert set(audit["explicitOverallOrSplitMarkers"].values()) == {0}
    raw_path = ROOT / audit["path"]
    raw = json.loads(raw_path.read_text())
    phase_labels = set()
    composition_blocks = 0

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "CompositionAtPhaseEquilibrium":
                    direct_counts[0] += 1
                if key in {"ePhase", "eVarPhase", "ePropPhase", "eConstraintPhase"} and isinstance(value, str):
                    phase_labels.add(value)
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    direct_counts = [composition_blocks]
    walk(raw)
    lower = raw_path.read_text().lower()
    assert direct_counts[0] == audit["compositionAtPhaseEquilibriumBlockCount"]
    assert sorted(phase_labels) == audit["phaseLabels"]
    assert lower.count("overall composition") == 0
    assert lower.count("feed composition") == 0
    assert lower.count("phase fraction") == 0

report = REPORT.read_text()
assert report.rstrip().endswith("`INPUT_NOT_AVAILABLE`")
assert "`NOT_CALCULABLE`" in report
assert "0%" not in report and "0.0%" not in report
assert "model was invoked zero times" in report
assert all(value == "NOT_PERFORMED_OUT_OF_SCOPE" for value in result["admission"].values())

# Only after validating the checked-in artifact, regenerate twice in disposable
# directories and prove both reproductions exactly match it.
checked_in_hashes = tuple(sha256(path) for path in (RESULTS, REPORT, MANIFEST))
with tempfile.TemporaryDirectory(prefix="cosmosac-236-verify-") as temp:
    generated_hashes = []
    for name in ("first", "second"):
        generated = Path(temp) / name
        environment = os.environ.copy()
        environment["COSMOSAC_236_BENCHMARK_OUT_DIR"] = str(generated)
        subprocess.run([sys.executable, str(RUNNER)], cwd=ROOT, env=environment, check=True)
        generated_hashes.append(tuple(
            sha256(generated / filename)
            for filename in ("results.json", "report.md", "provenance-manifest.json")
        ))
    assert generated_hashes[0] == generated_hashes[1], "benchmark regeneration is not deterministic"
    assert generated_hashes[0] == checked_in_hashes, "checked-in artifact differs from isolated regeneration"

print("verified", RESULTS)