#!/usr/bin/env python3
"""Build the fail-closed 236-record COSMO-SAC benchmark evidence artifact."""

import hashlib
import json
import math
import os
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get(
    "COSMOSAC_236_BENCHMARK_OUT_DIR",
    ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-236-benchmark",
)).resolve()

COTO_DATA = ROOT / "server/engine-framework/cel/coto2022-nmp-lle.ts"
MULTI_DATA = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
COTO_PDF = ROOT / "attached_assets/Extraction_of_aromatic_and_polyaromatic_compounds_with_NMP_1786368615037.pdf"
THERMOML = {
    "fahim2005": ROOT / "attached_assets/thermoml_fahim2005.json",
    "fandary2006": ROOT / "attached_assets/thermoml_fandary2006.json",
    "aljimaz2006": ROOT / "attached_assets/thermoml_aljimaz2006.json",
}
PROFILE_PROVENANCE = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json"
PROFILE_VERIFICATION = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profile-verification.json"
PROFILES = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles"
BASELINE_RUNNER = ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py"
BASELINE_PROVENANCE = ROOT / "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json"
CCOSMO_BINARY = ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python/cCOSMO.cpython-312-x86_64-linux-gnu.so"

EXPECTED_SOURCE_HASHES = {
    "server/engine-framework/cel/coto2022-nmp-lle.ts": "8253433f5624934b7f9135f223090e8b9e2c5b1cbfaee06c951a3d87b839ea42",
    "server/engine-framework/cel/data/multi-t-nmp-lle.json": "72d16b9544cebb3f5d55def342684fd3414707e9e84b27c558b6a7e6f6409c28",
    "attached_assets/thermoml_fahim2005.json": "e06ec9f8d268a4ef524f7e5311d5e0e1c37e6cdd7f440ed12ea72993458a5b1a",
    "attached_assets/thermoml_fandary2006.json": "bdd7fec71d42860d8fe25ed2f3f3f7b972d35049d1355b18374559da41e01d56",
    "attached_assets/thermoml_aljimaz2006.json": "382fae7291fd553ddcf97dba06743a36120aa074bd056ec6d7b5cecfbffa953e",
    "attached_assets/Extraction_of_aromatic_and_polyaromatic_compounds_with_NMP_1786368615037.pdf": "857ec55577b7081e8aee19a796dba341e73b0822bbbcf6af60707f78e39c94ce",
}
EXPECTED_MODEL_HASHES = {
    "baselineRunnerSha256": "aa42f6617ee115db248e6bb473d7f07ac9f72d4214ea1faf670e17ae8e37524d",
    "baselineProvenanceSha256": "3f7664dbcc532dd87c8633f7c76dd3a1c65560b8997dc4a6c4f7ab82cb768c23",
    "cCOSMOBinarySha256": "a90b34a97bfc9b3fe06ac247a3feae7263f83aa1a29b4d79fea758bec587ce61",
    "profileProvenanceSha256": "c3a6f2c3c0277ce81c02e7fd8d900e5864ac6891a0c34934e631a14aa9093012",
    "profileVerificationSha256": "d07ea132252d1a56549629c630b658dcc4d9538e44ca6767f6b9b1fbdb15a0e9",
}
PROFILE_REPRESENTATIVES = {
    "SAT": {"name": "n-dodecane", "InChIKey": "SNRUBQQJIBEYMU-UHFFFAOYSA-N"},
    "MONO": {"name": "n-propylbenzene", "InChIKey": "ODLMAHJVESYWTB-UHFFFAOYSA-N"},
    "DI": {"name": "1-methylnaphthalene", "InChIKey": "QPUYECUOLPXSFR-UHFFFAOYSA-N"},
    "POLY": {"name": "pyrene", "InChIKey": "BBEAQIROQSPTKN-UHFFFAOYSA-N"},
    "NMP": {"name": "N-methyl-2-pyrrolidone", "InChIKey": "SECXISVLQFMRJM-UHFFFAOYSA-N"},
}
NULL_FLASH_FIELDS = (
    "predictedPhaseCount",
    "tpdMinimum",
    "gibbsReduction",
    "solverConverged",
    "predictedRrboRichComposition",
    "predictedNmpRichComposition",
    "predictedNmpRichPhaseFraction",
    "equilibriumClosure",
    "materialBalanceClosure",
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha(value):
    packed = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(packed.encode()).hexdigest()


def relative(path):
    return str(path.relative_to(ROOT))


def validate_frozen_basis():
    paths = {
        relative(COTO_DATA): COTO_DATA,
        relative(MULTI_DATA): MULTI_DATA,
        relative(COTO_PDF): COTO_PDF,
        **{relative(path): path for path in THERMOML.values()},
    }
    actual_sources = {name: sha256(path) for name, path in paths.items()}
    if actual_sources != EXPECTED_SOURCE_HASHES:
        raise RuntimeError("benchmark source hash mismatch")

    actual_model = {
        "baselineRunnerSha256": sha256(BASELINE_RUNNER),
        "baselineProvenanceSha256": sha256(BASELINE_PROVENANCE),
        "cCOSMOBinarySha256": sha256(CCOSMO_BINARY),
        "profileProvenanceSha256": sha256(PROFILE_PROVENANCE),
        "profileVerificationSha256": sha256(PROFILE_VERIFICATION),
    }
    if actual_model != EXPECTED_MODEL_HASHES:
        raise RuntimeError("corrected profile or pinned COSMO-SAC model basis changed")

    profile_provenance = json.loads(PROFILE_PROVENANCE.read_text())
    profile_verification = json.loads(PROFILE_VERIFICATION.read_text())
    baseline_provenance = json.loads(BASELINE_PROVENANCE.read_text())
    if profile_provenance.get("profileSemanticsGate") != "PASSED":
        raise RuntimeError("corrected profile semantics gate is not passed")
    if profile_verification.get("decision") != "PROFILE_SEMANTICS_GATE_PASSED":
        raise RuntimeError("corrected profile verification decision changed")
    if profile_verification.get("allComponentsPassed") is not True:
        raise RuntimeError("not all corrected profiles passed")
    if baseline_provenance.get("modelVariant", {}).get("name") != "COSMO-SAC-2010":
        raise RuntimeError("pinned model variant changed")
    if baseline_provenance.get("NIST_COSMOSAC_source_commit") != "1b82456be38026719b16cad4076109bef3fcb309":
        raise RuntimeError("pinned NIST COSMO-SAC source commit changed")
    for family, profile_hash in profile_provenance["profileSha256ByFamily"].items():
        key = profile_provenance["componentIdentityKeys"][family]
        if sha256(PROFILES / "sigma3" / f"{key}.sigma") != profile_hash:
            raise RuntimeError(f"corrected profile hash mismatch for {family}")
    return actual_sources, actual_model, profile_provenance, profile_verification, baseline_provenance


def thermoml_audit(source, path):
    data = json.loads(path.read_text())
    composition_blocks = 0
    phase_labels = set()

    def walk(node):
        nonlocal composition_blocks
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "CompositionAtPhaseEquilibrium":
                    composition_blocks += 1
                if key in {"ePhase", "eVarPhase", "ePropPhase", "eConstraintPhase"} and isinstance(value, str):
                    phase_labels.add(value)
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(data)
    text = path.read_text().lower()
    markers = {
        "overallComposition": text.count("overall composition"),
        "feedComposition": text.count("feed composition"),
        "phaseFraction": text.count("phase fraction"),
    }
    if composition_blocks == 0:
        raise RuntimeError(f"no phase-equilibrium composition records found in {source}")
    if any(markers.values()):
        raise RuntimeError(f"unexpected overall-composition or phase-fraction marker in {source}")
    return {
        "source": source,
        "path": relative(path),
        "sha256": sha256(path),
        "compositionAtPhaseEquilibriumBlockCount": composition_blocks,
        "phaseLabels": sorted(phase_labels),
        "explicitOverallOrSplitMarkers": markers,
        "conclusion": "CONJUGATE_PHASE_COMPOSITIONS_ONLY_NO_OVERALL_COMPOSITION_OR_PHASE_FRACTION",
    }


def coto_rows():
    text = COTO_DATA.read_text()
    pattern = re.compile(
        r"\{\s*x:\s*\[([^\]]+)\],\s*y:\s*\[([^\]]+)\],\s*"
        r"tableOrder:\s*(\d+),?\s*nominalR:\s*([0-9.]+)\s*\}"
    )
    rows = []
    for x_text, y_text, order_text, ratio_text in pattern.findall(text):
        values = lambda raw: [float(value.strip()) for value in raw.split(",")]
        table_order = int(order_text)
        rows.append({
            "tableOrder": table_order,
            "family": "xylene" if table_order <= 13 else "toluene",
            "raffinate": values(x_text),
            "extract": values(y_text),
            "nominalR": float(ratio_text),
        })
    rows.sort(key=lambda row: row["tableOrder"])
    if len(rows) != 17 or [row["tableOrder"] for row in rows] != list(range(1, 18)):
        raise RuntimeError("Coto controlled tie-line extraction did not produce Table 3 rows 1-17")
    return rows


def validate_phase(phase, components):
    values = [phase[family] for family in components]
    if not all(isinstance(value, (int, float)) and math.isfinite(value) and value >= 0 for value in values):
        raise RuntimeError("invalid measured phase composition")
    if abs(sum(values) - 1.0) > 1e-8:
        raise RuntimeError("measured phase composition does not sum to one")
    return values


def unavailable_record(base):
    pinned = {
        "recordId": base["recordId"],
        "source": base["source"],
        "temperatureK": base["temperatureK"],
        "componentFamilies": base["componentFamilies"],
        "reportedComponents": base["reportedComponents"],
        "experimentalPhases": base["experimentalPhases"],
        "uncertainty": base["uncertainty"],
        "overallCompositionEvidence": base["overallCompositionEvidence"],
    }
    flash = {"status": "INPUT_NOT_AVAILABLE"}
    flash.update({field: None for field in NULL_FLASH_FIELDS})
    return {
        **base,
        "experimentalPhaseCount": 2,
        "experimentalTopology": "TWO_LIQUID_PHASES",
        "profileAssignment": [
            {"family": family, **PROFILE_REPRESENTATIVES[family]}
            for family in base["componentFamilies"]
        ],
        "pinnedReportedInputSha256": canonical_sha(pinned),
        "flashDiagnostics": flash,
        "tieLineErrors": {
            "status": "NOT_CALCULABLE_NO_ACCEPTED_TWO_PHASE_FLASH",
            "rmsdMoleFraction": None,
            "maximumAbsoluteDeviationMoleFraction": None,
            "componentAbsoluteErrors": None,
        },
    }


def build_coto_records(citation):
    component_families = ["SAT", "MONO", "DI", "POLY", "NMP"]
    records = []
    for row in coto_rows():
        mono_name = "1,4-xylene" if row["family"] == "xylene" else "toluene"
        names = {
            "SAT": "n-dodecane",
            "MONO": mono_name,
            "DI": "1-methylnaphthalene",
            "POLY": "pyrene",
            "NMP": "N-methyl-2-pyrrolidone",
        }
        records.append(unavailable_record({
            "recordId": f"COTO-T3-{row['tableOrder']:02d}",
            "datasetGroup": "COTO_17",
            "source": {
                "key": "coto2022",
                "citation": citation,
                "controlledTable": "Table 3",
                "reportedRow": row["tableOrder"],
                "family": row["family"],
            },
            "temperatureK": 298.15,
            "componentFamilies": component_families,
            "reportedComponents": [{"family": family, "identity": names[family]} for family in component_families],
            "experimentalPhases": {
                "raffinate": {"composition": row["raffinate"]},
                "extract": {"composition": row["extract"]},
            },
            "uncertainty": {
                "quantity": "mole fraction",
                "type": "reported standard uncertainty",
                "value": 0.003,
            },
            "excludedProvenanceOnlyInputs": {
                "nominalNmpToSyntheticCrudeMolarRatio": row["nominalR"],
                "calculationUse": "PROHIBITED_NONCLOSING_WITH_REPORTED_PHASES",
            },
            "overallCompositionEvidence": {
                "status": "INPUT_NOT_AVAILABLE",
                "value": None,
                "phaseFraction": None,
                "reasonCode": "COTO_NOMINAL_FEED_AND_RATIO_EXCLUDED_NONCLOSING",
                "reason": "Table 3 reports conjugate phase compositions. Table 2 feed-family labels plus nominal r fail the governed material-balance closure for 12 of 17 records and are excluded from calculations.",
                "forbiddenSubstitutes": ["TIE_LINE_MIDPOINT", "NOMINAL_FEED_PLUS_R", "FITTED_LEVER_RULE_SPLIT"],
            },
        }))
    return records


def build_multi_records(data):
    records = []
    source_index = Counter()
    citations = data["citation"]
    for index, row in enumerate(data["tieLines"], 1):
        if any(key in row for key in ("overallComposition", "overall", "feed", "phaseFraction", "beta")):
            raise RuntimeError(f"unexpected overall-composition field in multi-temperature row {index}")
        source = row["source"]
        source_index[source] += 1
        components = ["SAT", "MONO", "NMP"]
        raffinate = validate_phase(row["raffinate"], components)
        extract = validate_phase(row["extract"], components)
        reported = [
            {"family": family, "identity": row["components"][family]}
            for family in components
        ]
        records.append(unavailable_record({
            "recordId": f"MULTI-T-{index:03d}",
            "datasetGroup": "MULTI_T_219",
            "source": {
                "key": source,
                "citation": citations[source],
                "controlledRecordIndex": index,
                "sourceRecordIndex": source_index[source],
            },
            "temperatureK": row["T_K"],
            "componentFamilies": components,
            "reportedComponents": reported,
            "experimentalPhases": {
                "raffinate": {"composition": raffinate},
                "extract": {"composition": extract},
            },
            "uncertainty": {
                "quantity": "mole fraction",
                "type": "controlled transformed source value",
                "value": row["u_x"],
            },
            "overallCompositionEvidence": {
                "status": "INPUT_NOT_AVAILABLE",
                "value": None,
                "phaseFraction": None,
                "reasonCode": "THERMOML_CONJUGATE_PHASES_NO_OVERALL_OR_PHASE_FRACTION",
                "reason": "ThermoML reports temperature and equilibrium compositions in liquid mixtures 1 and 2, but no experimental overall composition or phase fraction.",
                "forbiddenSubstitutes": ["TIE_LINE_MIDPOINT", "ASSUMED_PHASE_FRACTION", "FITTED_LEVER_RULE_SPLIT"],
            },
        }))
    if len(records) != 219:
        raise RuntimeError("multi-temperature source did not contain exactly 219 records")
    return records


def aggregate(records, key, label):
    selected = records if key is None else [record for record in records if record["datasetGroup"] == key]
    return {
        "label": label,
        "status": "NOT_CALCULABLE",
        "experimentalBiphasicRecordCount": len(selected),
        "flashEligibleRecordCount": 0,
        "inputNotAvailableRecordCount": len(selected),
        "flashExecutedRecordCount": 0,
        "predictedTwoPhaseCountAmongEvaluated": 0,
        "evaluatedExperimentalPositiveCount": 0,
        "topologyRecall": None,
        "recallReason": "No record has the reported experimental overall composition required to define a feed state for TPD and Gibbs minimization.",
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source_hashes, model_hashes, profile_provenance, profile_verification, baseline = validate_frozen_basis()
    multi = json.loads(MULTI_DATA.read_text())
    coto_citation = re.search(r"export const COTO_2022_CITATION\s*=\s*'([^']+)'", COTO_DATA.read_text()).group(1)
    coto = build_coto_records(coto_citation)
    multi_records = build_multi_records(multi)
    records = coto + multi_records
    if len(records) != 236 or len({record["recordId"] for record in records}) != 236:
        raise RuntimeError("benchmark inventory must contain 236 unique records")

    audits = [thermoml_audit(source, path) for source, path in THERMOML.items()]
    source_counts = Counter(record["source"]["key"] for record in records)
    temperature_counts = Counter(str(record["temperatureK"]) for record in records)
    result = {
        "schemaVersion": "1.0.0",
        "benchmarkId": "COSMOSAC_236_REPORTED_OVERALL_DIAGNOSTIC",
        "benchmarkStatus": "INPUT_NOT_AVAILABLE",
        "deterministic": True,
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
        "scope": {
            "recordCount": 236,
            "cotoRecordCount": 17,
            "multiTemperatureRecordCount": 219,
            "experimentalTopology": "TWO_LIQUID_PHASES",
            "activeFamilies": ["SAT", "MONO", "DI", "POLY", "NMP"],
            "polarAromaticsIncluded": False,
        },
        "inputPolicy": {
            "requiredForFlash": ["reported temperature", "reported experimental overall composition"],
            "rule": "Never synthesize an overall composition from a tie-line midpoint, nominal feed/ratio, assumed phase fraction, fitted lever rule, or measured phase endpoint.",
            "conditionalTieLineErrorRule": "Calculate predicted-versus-measured tie-line errors only after an accepted two-phase flash at the reported overall composition.",
        },
        "sourceEvidence": {
            "sha256": source_hashes,
            "thermoMlAvailabilityAudit": audits,
            "controlledDatasetSourceCounts": dict(sorted(source_counts.items())),
            "temperatureRecordCounts": dict(sorted(temperature_counts.items(), key=lambda item: float(item[0]))),
        },
        "correctedProfileBasis": {
            "profileSemanticsGate": profile_provenance["profileSemanticsGate"],
            "verificationDecision": profile_verification["decision"],
            "allComponentsPassed": profile_verification["allComponentsPassed"],
            "profileSha256ByFamily": profile_provenance["profileSha256ByFamily"],
            "componentIdentityKeys": profile_provenance["componentIdentityKeys"],
            "restrictedProfileInputsUsed": profile_verification["restrictedProfileInputsUsed"],
            "parametersChangedForBenchmark": False,
        },
        "modelContract": {
            "name": baseline["modelVariant"]["name"],
            "NISTCosmoSacSourceCommit": baseline["NIST_COSMOSAC_source_commit"],
            "lnGamma": baseline["modelVariant"]["lnGamma"],
            "excludedVariant": baseline["modelVariant"]["excluded"],
            "pinnedNumericalSettings": baseline["settings"],
            "basisSha256": model_hashes,
            "modelExecuted": False,
            "solverInvocationCount": 0,
            "reasonNotExecuted": "INPUT_NOT_AVAILABLE",
        },
        "topologyRecall": {
            "overall236": aggregate(records, None, "All 236 records"),
            "coto17": aggregate(records, "COTO_17", "Coto 17 records"),
            "multiTemperature219": aggregate(records, "MULTI_T_219", "Multi-temperature 219 records"),
        },
        "records": records,
        "admission": {
            "PAprediction": "NOT_PERFORMED_OUT_OF_SCOPE",
            "UNIQUACregression": "NOT_PERFORMED_OUT_OF_SCOPE",
            "theoreticalStages": "NOT_PERFORMED_OUT_OF_SCOPE",
            "hydrodynamics": "NOT_PERFORMED_OUT_OF_SCOPE",
            "sizing": "NOT_PERFORMED_OUT_OF_SCOPE",
        },
        "finalDecision": "INPUT_NOT_AVAILABLE",
    }
    results_path = OUT / "results.json"
    results_path.write_text(json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False) + "\n")

    source_rows = "\n".join(
        f"| {name} | {count} |"
        for name, count in sorted(source_counts.items())
    )
    profile_rows = "\n".join(
        f"| {family} | `{profile_hash}` |"
        for family, profile_hash in sorted(profile_provenance["profileSha256ByFamily"].items())
    )
    report = f"""# 236-record COSMO-SAC reported-overall-composition benchmark

## Verdict

`INPUT_NOT_AVAILABLE`

All 236 experimentally biphasic records were inventoried. None reports the
experimental overall composition or phase fraction required to define the
feed state for TPD minimization and constrained total-Gibbs minimization.
No midpoint, nominal-feed reconstruction, assumed split, or fitted lever-rule
composition was substituted.

This is an input-admissibility result, not a failed COSMO-SAC topology result.
The corrected profiles and pinned COSMO-SAC contract were verified and frozen,
but the model was invoked zero times.

## Topology recall

| Scope | Experimental two-phase records | Flash eligible | Input unavailable | Topology recall |
| --- | ---: | ---: | ---: | --- |
| Overall | 236 | 0 | 236 | `NOT_CALCULABLE` |
| Coto | 17 | 0 | 17 | `NOT_CALCULABLE` |
| Multi-temperature ThermoML-derived | 219 | 0 | 219 | `NOT_CALCULABLE` |

The recall values are null in the machine-readable result. They are not zero:
there were no evaluable experimental positives and therefore no valid recall
denominator.

## Source inventory

| Source | Records |
| --- | ---: |
{source_rows}

The 17 Coto Table 3 records report two phase compositions at 298.15 K.
Nominal feed-family labels and NMP/SC ratios are provenance annotations only:
their governed reconstruction fails closure for 12 of 17 rows and is excluded.

The 219 controlled ThermoML-derived records report temperatures and conjugate
phase compositions. The raw ThermoML files identify those measurements as
composition at phase equilibrium in liquid mixtures 1 and 2; they contain no
reported overall-composition or phase-fraction field.

## Requested per-record diagnostics

Every record in `results.json` preserves source identity, temperature, component
identity, both measured phase compositions, and available mole-fraction
uncertainty. The following requested flash outputs are present but null:

- predicted phase count;
- TPD minimum;
- Gibbs reduction;
- solver convergence;
- predicted phase compositions and phase fraction;
- equilibrium and material-balance closure;
- RMSD, maximum absolute deviation, and component tie-line errors.

Their status is `INPUT_NOT_AVAILABLE` or
`NOT_CALCULABLE_NO_ACCEPTED_TWO_PHASE_FLASH`. This prevents missing input from
being misreported as predicted single phase, nonconvergence, or zero topology
recall.

## Corrected profile and model freeze

| Family | Corrected profile SHA-256 |
| --- | --- |
{profile_rows}

Profile semantics decision: `PROFILE_SEMANTICS_GATE_PASSED`.
Model contract: NIST COSMO-SAC-2010 at source commit
`{baseline['NIST_COSMOSAC_source_commit']}`, using
`{baseline['modelVariant']['lnGamma']}`. No COSMO-SAC parameter or numerical
threshold was fitted or changed.

## Governance

This artifact is research-only, `CALIBRATION_REQUIRED`,
non-pilot-validated, and non-release-eligible. Sulfur remains
`NOT_CALCULABLE`. PA prediction, UNIQUAC regression, theoretical stages,
hydrodynamics, mass transfer, diameter, height, and sizing were not performed.

`INPUT_NOT_AVAILABLE`
"""
    report_path = OUT / "report.md"
    report_path.write_text(report)

    manifest = {
        "schemaVersion": "1.0.0",
        "benchmarkId": result["benchmarkId"],
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
        "runnerSha256": sha256(HERE / "run.py"),
        "sourceSha256": source_hashes,
        "modelBasisSha256": model_hashes,
        "profileSha256ByFamily": profile_provenance["profileSha256ByFamily"],
        "profileSemantics": profile_verification["profileSemantics"],
        "modelVariant": baseline["modelVariant"],
        "numericalSettingsFrozenButNotExecuted": baseline["settings"],
        "solverInvocationCount": 0,
        "recordInputSha256": {
            record["recordId"]: record["pinnedReportedInputSha256"]
            for record in records
        },
        "resultsSha256": sha256(results_path),
        "reportSha256": sha256(report_path),
        "finalDecision": "INPUT_NOT_AVAILABLE",
    }
    (OUT / "provenance-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )


if __name__ == "__main__":
    main()