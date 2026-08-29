#!/usr/bin/env python3
"""Independent fail-closed audit of the repaired NMP sigma3 semantics."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics"
GENERATED = SOURCE / "generated"
MANIFEST = GENERATED / "generation-manifest.json"
VERIFICATION = GENERATED / "profile-verification.json"
PROTOCOL = SOURCE / "generation-protocol.json"
GENERATOR = SOURCE / "generate_profiles.py"
PROFILE = GENERATED / "profiles/sigma3/SECXISVLQFMRJM-UHFFFAOYSA-N.sigma"
SURFACE = GENERATED / "surfaces/SECXISVLQFMRJM-UHFFFAOYSA-N.cosmo"
AUDIT = GENERATED / "segment-audit/NMP.csv"
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-nmp-sigma3-semantics"

NIST_COMMIT = "1b82456be38026719b16cad4076109bef3fcb309"
NIST_TO_SIGMA_SHA256 = "73cd7b526568ee921e2fcd83b5d8653fccf37878fe4690abafdcd785334ace2a"
XTB_COMMIT = "26b28010e805f7d1aeeef39813feb473e69cc4be"
CPCMX_COMMIT = "e7f894c76d41ee1f703cf6f03e931cbcf046bc7f"
SOURCE_EVIDENCE = {
    "xTB src/solv/cosmo.f90": "32b32edd43ea1eec8158192bd4676a7110bc50d55e56d36b6a2ccaf25d49aea1",
    "xTB src/xhelp.f90": "d52e2f312ebecc03baca00977fbf6c361706d7ac2e6a98d1c6ca9b8894fec3b8",
    "CPCM-X src/cpcmx/qc_calc.f90": "4b718c1c512071b07cf39e1211a756b22e20410ca430933f0e29cdd67560a46b",
    "NIST profiles/to_sigma.py": NIST_TO_SIGMA_SHA256,
}
EXPECTED_SURFACE_SHA256 = "837958143169284b19e2678ad65d6a39349a059c80057b300df3e1868d761d76"
EXPECTED_PROFILE_SHA256 = "58dcecc755994f7955aec100dfb26de62c3ad933dcfd25c11f68ddec3b1efa69"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_profile() -> tuple[dict, list[tuple[float, float]]]:
    lines = PROFILE.read_text(encoding="utf-8").splitlines()
    metadata = json.loads(lines[0][8:])
    rows = [tuple(map(float, line.split())) for line in lines[3:]]
    if len(rows) != 153:
        raise RuntimeError("NMP profile does not contain three 51-point partitions")
    expected_grid = [round(-0.025 + index * 0.001, 3) for index in range(51)] * 3
    if any(abs(row[0] - expected) > 1e-12 for row, expected in zip(rows, expected_grid)):
        raise RuntimeError("NMP profile grid is not the governed linear grid")
    return metadata, rows


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    verification = json.loads(VERIFICATION.read_text(encoding="utf-8"))
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    component = next(item for item in verification["components"] if item["family"] == "NMP")
    metadata, profile_rows = parse_profile()
    with AUDIT.open(newline="", encoding="utf-8") as handle:
        audit_rows = list(csv.DictReader(handle))

    if sha256(SURFACE) != EXPECTED_SURFACE_SHA256:
        raise RuntimeError("frozen NMP surface hash mismatch")
    if sha256(PROFILE) != EXPECTED_PROFILE_SHA256:
        raise RuntimeError("regenerated NMP profile hash mismatch")
    if manifest["profileConversion"]["decision"] != "PROFILE_SEMANTICS_GATE_PASSED":
        raise RuntimeError("six-component profile gate is not passed")
    if sha256(VERIFICATION) != manifest["profileConversion"]["profileVerificationSha256"]:
        raise RuntimeError("profile verification hash mismatch")
    if protocol["governanceStatus"]["measuredLleBenchmark236Cases"] != "NOT_EXECUTED":
        raise RuntimeError("236-case benchmark was executed before this audit")
    if len(audit_rows) != 757:
        raise RuntimeError("NMP segment audit is incomplete")
    if not all(
        abs(float(row["tm_nist_raw_sigma"]) + float(row["native_xtb_raw_sigma"])) <= 2e-15
        for row in audit_rows
    ):
        raise RuntimeError("native-xTB to TM/NIST sign conversion failed")
    if not all(
        abs(float(row["left_weight"]) + float(row["right_weight"]) - 1.0) <= 2e-15
        for row in audit_rows
    ):
        raise RuntimeError("linear bin weights do not close")
    oxygen_rows = [row for row in audit_rows if row["element"] == "O"]
    if not oxygen_rows or not all(
        row["atom_class"] == "OT"
        and float(row["nist_hsieh_averaged_sigma"]) > 0
        and row["pre_probability_partition"] == "OT"
        for row in oxygen_rows
    ):
        raise RuntimeError("NMP carbonyl oxygen is not chemically meaningful under the repaired convention")
    profile_area = sum(area for _, area in profile_rows)
    nmp_checks = {
        "independentFullProfileReconstruction": (
            component["maximumIndependentBinAreaErrorSquareAngstrom"] <= 5e-12
        ),
        "surfaceAreaClosure": abs(
            component["sourceAreaSquareAngstrom"]
            - component["profileAreaSquareAngstrom"]
        ) <= 1e-6,
        "carbonylOxygenPartition": all(
            row["atom_class"] == "OT"
            and float(row["nist_hsieh_averaged_sigma"]) > 0
            and row["pre_probability_partition"] == "OT"
            for row in oxygen_rows
        ),
        "sourceEvidenceRetained": (
            len(verification["sourceEvidenceSha256"]["retainedExcerptSha256"]) == 4
            and len(
                verification["sourceEvidenceSha256"][
                    "authenticatedUpstreamFullFileSha256"
                ]
            ) == 4
        ),
    }
    if abs(profile_area - component["sourceAreaSquareAngstrom"]) > 1e-6:
        raise RuntimeError("NMP profile area does not close")
    if metadata["averaging"] != "NIST-Hsieh":
        raise RuntimeError("NMP metadata does not state the executed averaging")
    if metadata["charge_sign_conversion"] != (
        "multiply by -1 to xTB TM convention for NIST positive-acceptor mask"
    ):
        raise RuntimeError("NMP metadata does not state the executed sign conversion")

    results = {
        "schemaVersion": "2.0.0",
        "verdict": "NMP_SIGMA3_SEMANTICS_GATE_PASSED",
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
        "restrictedProfileInputsUsed": False,
        "sourceEvidence": {
            "xTBCOSMOCommit": XTB_COMMIT,
            "cpcmXCommit": CPCMX_COMMIT,
            "nistCosmoSacCommit": NIST_COMMIT,
            "sha256": SOURCE_EVIDENCE,
            "legalBoundary": "Only permissively licensed source algorithms and project-generated surfaces were used; no restricted profile was read or transformed.",
        },
        "signConvention": {
            "input": "native xTB ddCOSMO zeta emitted by --cosmo",
            "conversion": "multiply every raw segment charge density by -1",
            "output": "xTB TM convention consumed directly by pinned NIST to_sigma.py",
            "proofChain": [
                "Pinned xTB cosmo.f90 negates zeta only for tmcosmo.",
                "Pinned xTB help names tmcosmo as the TM writing convention.",
                "Pinned CPCM-X invokes xTB --cosmo rather than --tmcosmo.",
                "Pinned NIST to_sigma.py consumes charge/area without inversion and classifies positive O/N/F as acceptor segments.",
            ],
        },
        "profileSemantics": verification["profileSemantics"],
        "nmp": {
            "surfaceSha256": sha256(SURFACE),
            "profileSha256": sha256(PROFILE),
            "segmentAuditSha256": sha256(AUDIT),
            "segmentCount": len(audit_rows),
            "oxygenSegmentCount": len(oxygen_rows),
            "oxygenPreProbabilityOtAreaSquareAngstrom": sum(
                float(row["area_square_angstrom"])
                for row in oxygen_rows
                if row["pre_probability_partition"] == "OT"
            ),
            "finalOtAreaSquareAngstrom": component[
                "finalPartitionAreaSquareAngstrom"
            ]["OT"],
            "sourceAreaSquareAngstrom": component["sourceAreaSquareAngstrom"],
            "profileAreaSquareAngstrom": profile_area,
            "checks": nmp_checks,
        },
        "sixComponentGate": {
            "decision": verification["decision"],
            "allComponentsPassed": verification["allComponentsPassed"],
            "surfaceSha256ByFamily": {
                item["family"]: item["surfaceSha256"] for item in manifest["components"]
            },
            "profileSha256ByFamily": {
                item["family"]: item["profileSha256"] for item in manifest["components"]
            },
            "generationManifestSha256": sha256(MANIFEST),
            "generationProtocolSha256": sha256(PROTOCOL),
            "generatorSha256": sha256(GENERATOR),
            "profileVerificationSha256": sha256(VERIFICATION),
        },
        "benchmarkGate": {
            "profileGatePassed": True,
            "measuredLleBenchmark236Cases": "NOT_EXECUTED",
            "eligibleForSeparateFutureExecution": True,
        },
    }
    if not all(results["nmp"]["checks"].values()):
        raise RuntimeError("NMP segment-level gate contains a failed check")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(
        json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    report = f"""# NMP sigma3 semantics repair

## Verdict

`{results["verdict"]}`

The charge-sign bridge is now source-supported rather than inferred from desired
chemistry. Pinned xTB source shows that `--tmcosmo` negates the native ddCOSMO
`zeta` written by `--cosmo`; pinned CPCM-X invokes the native `--cosmo` route;
and pinned NIST `to_sigma.py` consumes charge/area directly under its positive
O/N/F acceptor mask. The governed conversion therefore multiplies every native
xTB segment charge density by -1 before applying NIST Hsieh averaging.

The generator now calculates, rather than relabels:

1. r_av^2 = 7.25/pi A^2 and f_decay = 3.57;
2. NHB/OH/OT atom and sign masks;
3. linear area interpolation on the -0.025 to +0.025 e/A^2 grid; and
4. post-binning P_hb = 1-exp(-sigma^2/(2*0.007^2)).

All six SAT/MONO/DI/POLY/PA/NMP profiles passed area, sign, Hsieh, binning,
P_hb, and chemical-partition checks. NMP has {len(oxygen_rows)} carbonyl-oxygen
segments assigned to OT before probability attenuation and
{results["nmp"]["finalOtAreaSquareAngstrom"]:.12f} A^2 final OT area.

No UD, VT2005, ThermoSAC, or other restricted profile was read, copied,
transformed, or retained. The basis remains research-only,
CALIBRATION_REQUIRED, non-pilot-validated, non-release-eligible, and sulfur is
NOT_CALCULABLE.

The 236-case measured-LLE benchmark was not executed.

`{results["verdict"]}`
"""
    (OUT / "report.md").write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()