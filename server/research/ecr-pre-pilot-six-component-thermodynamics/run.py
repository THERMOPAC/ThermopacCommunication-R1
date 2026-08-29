#!/usr/bin/env python3
"""Fail-closed qualification for the complete ECR pre-pilot thermodynamic basis."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-six-component-thermodynamics"
COSMOSAC_OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac"
LICENSE_EVIDENCE = HERE / "license-evidence.json"

NIST_COSMOSAC_COMMIT = "1b82456be38026719b16cad4076109bef3fcb309"
THERMOSAC_REVIEWED_COMMIT = "d20f5f4acdbf295a15a7500056fb20cb06ae2e23"
PINNED_INPUT_SHA256 = {
    "server/research/ecr-pre-pilot-cosmosac/run.py": "049a18474732c5e30efb442a390fade82d26fdcaff85f76983a9feb79c7505de",
    "server/research/ecr-pre-pilot-cosmosac/verify.py": "53a8f1ddc0d19cdc8a4256876250f5eb6fdf8b4816393c4b06f961335bbaa0b0",
    "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json": "df65017ef1c8cb0ee33ca5e88111b5295c183e6d12badd4d3c85020f80173b59",
    ".agents/outputs/ecr-pre-pilot-cosmosac/results.json": "efce43eee40cac52c837696e6f918958f2659b1ca88ae4db27ac4e4442acd869",
    ".agents/outputs/ecr-pre-pilot-cosmosac/report.md": "2a6b8c65ffff77caefdcce5e7342d9eb3d55f067af4444a462e8f9315c6ddce2",
    "server/engine-framework/cel/coto2022-nmp-lle.ts": "8253433f5624934b7f9135f223090e8b9e2c5b1cbfaee06c951a3d87b839ea42",
    "server/engine-framework/cel/data/multi-t-nmp-lle.json": "72d16b9544cebb3f5d55def342684fd3414707e9e84b27c558b6a7e6f6409c28",
    "server/research/ecr-pre-pilot-cosmosac/vendor/python/cCOSMO.cpython-312-x86_64-linux-gnu.so": "a90b34a97bfc9b3fe06ac247a3feae7263f83aa1a29b4d79fea758bec587ce61",
    "server/research/ecr-pre-pilot-pa-anchor/evidence.ts": "bc94349623ff967062907c1e8b46609b1f49f02958b90883bcc73dfc75d2be36",
}
PINNED_PROFILE_HASH_MAP_SHA256 = "82aa80150f05bdfe17ae2c64df1af02d74dbbd1c4c215881cdfead6156f441c1"

TEMPERATURES_K = [298.15, 313.15, 323.15, 333.15, 348.15]
COMPONENTS = [
    {
        "family": "SAT",
        "name": "n-dodecane",
        "cas": "112-40-3",
        "inchiKey": "SNRUBQQJIBEYMU-UHFFFAOYSA-N",
    },
    {
        "family": "MONO",
        "name": "n-propylbenzene",
        "cas": "103-65-1",
        "inchiKey": "ODLMAHJVESYWTB-UHFFFAOYSA-N",
    },
    {
        "family": "DI",
        "name": "1-methylnaphthalene",
        "cas": "90-12-0",
        "inchiKey": "QPUYECUOLPXSFR-UHFFFAOYSA-N",
    },
    {
        "family": "POLY",
        "name": "pyrene",
        "cas": "129-00-0",
        "inchiKey": "BBEAQIROQSPTKN-UHFFFAOYSA-N",
    },
    {
        "family": "PA",
        "name": "4,4'-Bis(alpha,alpha-dimethylbenzyl)diphenylamine",
        "cas": "10081-67-1",
        "pubchemCid": 82343,
        "formula": "C30H31N",
        "molecularWeightGmol": 405.58,
        "canonicalSmiles": "CC(C)(C1=CC=CC=C1)C2=CC=C(C=C2)NC3=CC=C(C=C3)C(C)(C)C4=CC=CC=C4",
        "inchi": "InChI=1S/C30H31N/c1-29(2,23-11-7-5-8-12-23)25-15-19-27(20-16-25)31-28-21-17-26(18-22-28)30(3,4)24-13-9-6-10-14-24/h5-22,31H,1-4H3",
        "inchiKey": "UJAWGGOCYUPCPS-UHFFFAOYSA-N",
        "formalCharge": 0,
        "spinMultiplicity": 1,
        "identityStatus": "IDENTITY_ADMITTED_THERMODYNAMICS_BLOCKED",
        "conformerTreatment": "NOT_FROZEN",
    },
    {
        "family": "NMP",
        "name": "N-methyl-2-pyrrolidone",
        "cas": "872-50-4",
        "inchiKey": "SECXISVLQFMRJM-UHFFFAOYSA-N",
    },
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be a JSON object")
    return value


def load_upstream() -> tuple[dict[str, Any], dict[str, Any], dict[str, str]]:
    results_path = COSMOSAC_OUT / "results.json"
    report_path = COSMOSAC_OUT / "report.md"
    manifest_path = ROOT / "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json"
    for path in (results_path, report_path, manifest_path):
        if not path.is_file():
            raise RuntimeError(f"required upstream evidence is missing: {path}")

    results = require_mapping(
        json.loads(results_path.read_text(encoding="utf-8")),
        "COSMO-SAC results",
    )
    manifest = require_mapping(
        json.loads(manifest_path.read_text(encoding="utf-8")),
        "COSMO-SAC provenance manifest",
    )
    if manifest.get("NIST_COSMOSAC_source_commit") != NIST_COSMOSAC_COMMIT:
        raise RuntimeError("unreviewed NIST COSMO-SAC source commit")
    if manifest.get("ThermoSAC_profile_source_commit") != THERMOSAC_REVIEWED_COMMIT:
        raise RuntimeError("unreviewed ThermoSAC profile-source commit")

    pinned_inputs: dict[str, str] = {}
    for relative_path, expected in PINNED_INPUT_SHA256.items():
        path = ROOT / relative_path
        actual = sha256(path)
        if actual != expected:
            raise RuntimeError(
                f"pinned input changed without review: {relative_path}: {actual} != {expected}"
            )
        pinned_inputs[relative_path] = actual

    profile_hashes = require_mapping(
        manifest.get("sigmaProfileSha256"),
        "upstream sigma-profile hashes",
    )
    profile_map_digest = hashlib.sha256(
        json.dumps(profile_hashes, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    if profile_map_digest != PINNED_PROFILE_HASH_MAP_SHA256:
        raise RuntimeError("restricted benchmark profile inventory changed without review")

    integrity = {
        "resultsSha256": sha256(results_path),
        "reportSha256": sha256(report_path),
        "manifestSha256": sha256(manifest_path),
        "pinnedInputSha256": pinned_inputs,
        "sigmaProfileHashMapCanonicalSha256": profile_map_digest,
    }
    return results, manifest, integrity


def null_six_component_outputs() -> dict[str, Any]:
    return {
        "phaseBehavior": None,
        "rrboRichComposition": None,
        "nmpRichComposition": None,
        "nmpRichPhaseFraction": None,
        "distributionCoefficients": {family: None for family in ("SAT", "MONO", "DI", "POLY", "PA", "NMP")},
        "satLoss": None,
        "monoExtraction": None,
        "diExtraction": None,
        "polyExtraction": None,
        "paExtraction": None,
        "totalAromaticExtraction": None,
        "nmpCarryover": None,
        "nmpFreeRrboRecovery": None,
        "massBalanceMaxResidual": None,
        "gibbsEnergyReduction": None,
        "chemicalPotentialMaxResidual": None,
    }


def main() -> None:
    upstream, upstream_manifest, upstream_integrity = load_upstream()
    license_evidence = require_mapping(
        json.loads(LICENSE_EVIDENCE.read_text(encoding="utf-8")),
        "license evidence",
    )
    coto = require_mapping(upstream["benchmark"]["cotoMetrics"], "Coto metrics")
    multi = require_mapping(upstream["benchmark"]["multiTMetrics"], "multi-temperature metrics")

    coto_records = int(coto["records"])
    multi_records = int(multi["records"])
    coto_two_phase = int(coto["categories"]["TWO_PHASE"])
    multi_two_phase = int(multi["categories"]["TWO_PHASE"])
    observed_two_phase = coto_records + multi_records
    predicted_two_phase = coto_two_phase + multi_two_phase
    topology_recall = predicted_two_phase / observed_two_phase if observed_two_phase else None
    topology_pass = bool(observed_two_phase and predicted_two_phase == observed_two_phase)

    if upstream["finalDecision"] != "REJECT":
        raise RuntimeError("upstream COSMO-SAC benchmark no longer has the reviewed REJECT decision")
    if coto_records != 17 or multi_records != 219:
        raise RuntimeError(
            f"unexpected benchmark coverage: Coto={coto_records}, multi-temperature={multi_records}"
        )
    if topology_pass:
        raise RuntimeError("qualification runner is stale: the topology gate now passes")

    profile_hashes = require_mapping(
        upstream_manifest.get("sigmaProfileSha256"),
        "upstream sigma-profile hashes",
    )
    profile_identity_keys = {Path(filename).stem for filename in profile_hashes}
    pa_identity_key = next(
        component["inchiKey"] for component in COMPONENTS if component["family"] == "PA"
    )
    pa_profile_present = pa_identity_key in profile_identity_keys
    if pa_profile_present:
        raise RuntimeError("unexpected exact PA profile in the restricted benchmark profile set")

    blockers = [
        {
            "code": "NON_PA_PHASE_TOPOLOGY_NOT_REPRODUCED",
            "detail": (
                "The NIST COSMO-SAC-2010 candidate predicted no two-liquid split for "
                f"{observed_two_phase}/{observed_two_phase} experimentally two-phase records."
            ),
        },
        {
            "code": "OPEN_SOURCE_PROFILE_GENERATION_ROUTE_NOT_QUALIFIED",
            "detail": (
                "No legally admitted open-source molecular surface/profile route has been "
                "shown compatible with the selected NIST COSMO-SAC parameterization for all six representatives."
            ),
        },
        {
            "code": "EXACT_PA_SIGMA_PROFILE_UNAVAILABLE",
            "detail": (
                "The exact PA identity is admitted, but no compatible, legally admitted sigma profile "
                "for CAS 10081-67-1 is present."
            ),
        },
    ]

    result = {
        "schemaVersion": "1.0.0",
        "researchOnly": True,
        "calibrationStatus": "CALIBRATION_REQUIRED",
        "releaseEligible": False,
        "mission": {
            "system": "SAT+MONO+DI+POLY+PA+NMP",
            "components": COMPONENTS,
            "temperaturesK": TEMPERATURES_K,
            "primaryStage1TemperatureK": 323.15,
            "primaryObjective": "SIMULTANEOUS_SIX_COMPONENT_THERMODYNAMIC_CLOSURE",
            "paDirectedUniquacTermsArePrimaryObjective": False,
        },
        "softwareQualification": {
            "nistCosmoSac": {
                "status": "FROZEN_HISTORICAL_EXECUTABLE_EVIDENCE_NOT_ADMITTED_FOR_PROJECT_CALCULATIONS",
                "sourceCommit": upstream_manifest["NIST_COSMOSAC_source_commit"],
                "model": upstream["model"],
                "compositionDependentActivityCoefficients": "HISTORICALLY_EXECUTED",
                "gibbsMixingEnergy": "HISTORICALLY_EXECUTED",
                "multicomponentTpdAndFlash": "HISTORICALLY_EXECUTED_RESEARCH_IMPLEMENTATION",
                "softwareLicenseAssessment": license_evidence["nistCosmoSacSoftware"],
            },
            "thermoSac": {
                "status": "NOT_ADMITTED",
                "reason": "No software license is declared in the reviewed repository or package metadata.",
                "licenseAssessment": license_evidence["thermoSacSoftware"],
                "requiredForCurrentGate": False,
            },
        },
        "profileQualification": {
            "nistBundledUdVtProfiles": {
                "status": "NOT_ADMITTED_FOR_PROJECT_CALCULATIONS",
                "commercialUseAdmitted": False,
                "redistributionAdmitted": False,
                "licenseAssessment": license_evidence["nistBundledProfiles"],
            },
            "selectedOpenSourceGenerationRoute": None,
            "selectedRouteStatus": "NOT_QUALIFIED",
            "exactPaProfilePresent": pa_profile_present,
            "generatedProfiles": [],
        },
        "nonPaBenchmarkGate": {
            "status": "FAIL",
            "requiredObservedTopology": "TWO_LIQUID_PHASES",
            "coto": {
                "records": coto_records,
                "predictedTwoPhase": coto_two_phase,
                "predictedStableSinglePhase": int(coto["categories"]["PREDICTED_STABLE_SINGLE_PHASE"]),
            },
            "multiTemperature": {
                "records": multi_records,
                "predictedTwoPhase": multi_two_phase,
                "predictedStableSinglePhase": int(
                    multi["categories"]["PREDICTED_STABLE_SINGLE_PHASE"]
                ),
            },
            "combinedTopologyRecall": topology_recall,
            "acceptanceGatePassed": False,
        },
        "sixComponentCalculation": {
            "status": "NOT_CALCULABLE",
            "execution": "NOT_EXECUTED_AFTER_MANDATORY_NON_PA_GATE_FAILURE",
            "outputs": null_six_component_outputs(),
        },
        "runtimeRepresentation": {
            "status": "NOT_EXECUTED",
            "uniquacMatrixAudit": "NOT_EXECUTED_AFTER_MANDATORY_GATE_FAILURE",
            "fittedInteractions": [],
            "paDirectedInteractionCount": 0,
        },
        "sulfur": {
            "status": "NOT_CALCULABLE",
            "independentOfPa": True,
        },
        "blockers": blockers,
        "upstreamEvidence": {
            "directory": ".agents/outputs/ecr-pre-pilot-cosmosac",
            "integrity": upstream_integrity,
        },
        "licenseEvidence": {
            "path": "server/research/ecr-pre-pilot-six-component-thermodynamics/license-evidence.json",
            "sha256": sha256(LICENSE_EVIDENCE),
        },
        "productionImpact": {
            "stage1Changed": False,
            "runtimeChanged": False,
            "positivePaGateChanged": False,
            "sulfurStatusChanged": False,
            "releaseEligibilityChanged": False,
        },
        "decision": "STOPPED_NON_PA_TOPOLOGY_GATE_FAILED",
    }

    OUT.mkdir(parents=True, exist_ok=True)
    results_path = OUT / "results.json"
    report_path = OUT / "report.md"
    results_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    report = f"""# Six-component thermodynamics qualification

## Decision

`{result["decision"]}`

The required system is **SAT + MONO + DI + POLY + PA + NMP**. The primary objective is
simultaneous six-component thermodynamic closure; fitting ten PA-directed UNIQUAC terms is
not a substitute for that closure.

## Executable qualification

- NIST COSMO-SAC implementation: **FROZEN HISTORICAL EXECUTABLE EVIDENCE**
- Composition-dependent activity coefficients: **HISTORICALLY EXECUTED**
- Gibbs mixing energy: **HISTORICALLY EXECUTED**
- Research multicomponent TPD and constrained Gibbs flash: **HISTORICALLY EXECUTED**
- Restricted profiles executed during this verification: **NO**
- NIST UD/VT profile admission for project calculations: **NOT ADMITTED**
- ThermoSAC admission: **NOT ADMITTED** because no declared software license was found
- Exact PA sigma profile: **UNAVAILABLE**
- Qualified open-source six-profile generation route: **UNAVAILABLE**

## Mandatory non-PA topology gate

| evidence set | experimentally two-phase records | predicted two-phase | predicted stable single phase |
|---|---:|---:|---:|
| Coto | {coto_records} | {coto_two_phase} | {coto["categories"]["PREDICTED_STABLE_SINGLE_PHASE"]} |
| Multi-temperature | {multi_records} | {multi_two_phase} | {multi["categories"]["PREDICTED_STABLE_SINGLE_PHASE"]} |

Combined two-phase topology recall: **{topology_recall:.6f}**

The previously generated NIST COSMO-SAC-2010/restricted-profile candidate therefore fails the prerequisite
qualitative phase-topology test. This rejects the candidate basis; it does not prove that
every possible independently generated NIST-compatible profile basis must fail.

## Six-component status

The six-component calculation was not executed after the mandatory gate failure. Both
liquid compositions, phase fraction, all six distribution coefficients, SAT loss,
MONO/DI/POLY/PA extraction, total aromatic extraction, NMP carryover, NMP-free RRBO
recovery, and all equilibrium residuals remain explicitly null.

No molecular profiles were generated. No PA activities were estimated. No UNIQUAC
interactions were fitted. Sulfur remains independently `NOT_CALCULABLE`.

## Production boundary

Stage 1, the production thermodynamic runtime, positive-PA gating, sulfur status, and
release eligibility are unchanged. Results remain `CALIBRATION_REQUIRED`, research-only,
non-pilot-validated, and non-release-eligible.
"""
    report_path.write_text(report, encoding="utf-8")

    manifest = {
        "schemaVersion": "1.0.0",
        "runnerSha256": sha256(HERE / "run.py"),
        "upstreamEvidence": result["upstreamEvidence"],
        "nistCosmoSacSourceCommit": upstream_manifest["NIST_COSMOSAC_source_commit"],
        "thermoSacReviewedCommit": upstream_manifest["ThermoSAC_profile_source_commit"],
        "licenseEvidenceSha256": sha256(LICENSE_EVIDENCE),
        "componentIdentityKeys": {
            component["family"]: component["inchiKey"] for component in COMPONENTS
        },
        "decision": result["decision"],
    }
    (HERE / "provenance-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()