#!/usr/bin/env python3
"""Fail-closed capability audit for the published GFN2-xTB/CPCM-X route."""

from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cpcmx-pa-audit"

RELEASE = "v1.1.0"
COMMIT = "e7f894c76d41ee1f703cf6f03e931cbcf046bc7f"
RAW_BASE = f"https://raw.githubusercontent.com/grimme-lab/CPCM-X/{COMMIT}"
MODEL_LABEL = "GFN2-xTB + ddCOSMO/CPCM-X published parameterization"

SOURCE_FILES = {
    "README.md": "c1bccfc3203c57702361e1a86c2349856ba9a1f2c5a7ad3391f4090b93af0bdd",
    "app/main.f90": "a5af7274ee5d9542deea16adb1f8a8a518be5f6d8ae061e50de0552a48c84b86",
    "src/cpcmx/crs.f90": "dd0564981dd05f9d4cdfae6d50e6ee12cd55e856b3b689b8e95ac6e4bfb3de3e",
    "src/cpcmx/sac.f90": "606bafa6527a1eca52a58f5f3726a9e5b264806310ef2a3a5f19585396200de3",
    "src/cpcmx/internaldb.f90": "bfc0d1997240f2d03b7cfec11b2f1b2864a86be0f591a2a8f809e40d3ad85279",
}

REPRESENTATIVES = (
    ("SAT", "n-dodecane"),
    ("MONO", "n-propylbenzene"),
    ("DI", "1-methylnaphthalene"),
    ("POLY", "pyrene"),
    ("PA", "4,4'-Bis(alpha,alpha-dimethylbenzyl)diphenylamine", "10081-67-1"),
    ("NMP", "N-methyl-2-pyrrolidone"),
)


def fetch_pinned_sources() -> dict[str, str]:
    sources: dict[str, str] = {}
    for relative_path, expected_sha256 in SOURCE_FILES.items():
        url = f"{RAW_BASE}/{relative_path}"
        with urllib.request.urlopen(url, timeout=30) as response:
            payload = response.read()
        actual_sha256 = hashlib.sha256(payload).hexdigest()
        if actual_sha256 != expected_sha256:
            raise RuntimeError(
                f"pinned source hash mismatch for {relative_path}: "
                f"{actual_sha256} != {expected_sha256}"
            )
        sources[relative_path] = payload.decode("utf-8")
    return sources


def require(source: str, pattern: str, description: str) -> dict[str, str]:
    match = re.search(pattern, source, flags=re.MULTILINE | re.DOTALL)
    if not match:
        raise RuntimeError(f"pinned-source evidence missing: {description}")
    evidence = " ".join(match.group(0).split())
    return {"description": description, "matchedSourceText": evidence}


def main() -> None:
    sources = fetch_pinned_sources()
    readme = sources["README.md"]
    cli = sources["app/main.f90"]
    crs = sources["src/cpcmx/crs.f90"]
    sac = sources["src/cpcmx/sac.f90"]

    evidence = {
        "publishedXtbBasis": require(
            readme,
            r"published version of this model was built to be run with the semi-empirical.*?GFN2-xTB.*?method",
            "The published CPCM-X basis is GFN2-xTB.",
        ),
        "xtbCosmoLoading": require(
            readme,
            r"load the specified solvent from an internal database.*?solute is loaded from the ``xtb\.cosmo`` file created by xTB",
            "The documented xTB route loads xtb.cosmo as a solute in a selected solvent.",
        ),
        "documentedPurpose": require(
            cli,
            r"Calculates the solvation free energy of a compound in a solvent\.",
            "The standalone program declares a single-compound solvation-free-energy purpose.",
        ),
        "mixedSolventNotImplementedInSolventIteration": require(
            crs,
            r"For mixed solvent, mole fraction needs to be introduced in the following loop",
            "The CRS solvent iteration marks mixture mole-fraction handling as work still to be introduced.",
        ),
        "mixedSolventNotImplementedInSoluteCalculation": {
            "description": (
                "Both relevant CRS loops contain the same unimplemented mixed-solvent note."
            ),
            "occurrences": str(
                len(
                    re.findall(
                        r"For mixed solvent, mole fraction needs to be introduced in the following loop",
                        crs,
                    )
                )
            ),
        },
        "cosmoSacFixedComposition": require(
            sac,
            r"subroutine sac_2010.*?z\(1\)=0\.995_wp\s+z\(2\)=0\.005_wp",
            "The separate COSMO-SAC 2010 routine fixes one dilute binary composition.",
        ),
        "cosmoSacDisconnected": {
            "description": (
                "The only app references to COSMO-SAC 2010/2013 calls are commented out."
            ),
            "commentedCallCount": len(
                re.findall(r"^\s*!\s*Call sac_(?:2010|2013)", cli, flags=re.MULTILINE)
            ),
            "liveCallCount": len(
                re.findall(r"^\s*Call sac_(?:2010|2013)", cli, flags=re.MULTILINE)
            ),
        },
    }

    mixed_note_count = int(
        evidence["mixedSolventNotImplementedInSoluteCalculation"]["occurrences"]
    )
    if mixed_note_count != 2:
        raise RuntimeError(f"expected two mixed-solvent TODO markers, found {mixed_note_count}")
    if evidence["cosmoSacDisconnected"]["commentedCallCount"] != 2:
        raise RuntimeError("expected both COSMO-SAC app calls to remain commented")
    if evidence["cosmoSacDisconnected"]["liveCallCount"] != 0:
        raise RuntimeError("unexpected live COSMO-SAC app call found")

    blocker = (
        "CPCM-X v1.1.0 with its published xTB parameterization accepts an xTB "
        "COSMO surface for a solute and a selected pure solvent, but the released "
        "CRS implementation does not accept arbitrary mixture compositions or "
        "return composition-dependent component activity coefficients. The source "
        "explicitly marks mixed-solvent mole-fraction handling as not introduced. "
        "The separate COSMO-SAC routines are not the published CPCM-X route, are "
        "disconnected from the executable, and do not provide the requested grid."
    )

    result = {
        "schemaVersion": "1.0.0",
        "researchOnly": True,
        "model": {
            "label": MODEL_LABEL,
            "cpcmxRelease": RELEASE,
            "cpcmxCommit": COMMIT,
            "globalCpcmxParametersRefitted": False,
            "openCosmoRs24a": False,
        },
        "requestedRepresentatives": [
            {"family": item[0], "name": item[1], **({"cas": item[2]} if len(item) == 3 else {})}
            for item in REPRESENTATIVES
        ],
        "sourceIntegrity": {
            "rawBaseUrl": RAW_BASE,
            "files": [
                {
                    "path": path,
                    "sha256": digest,
                    "url": f"{RAW_BASE}/{path}",
                }
                for path, digest in SOURCE_FILES.items()
            ],
            "status": "PASS",
        },
        "capabilityAudit": {
            "status": "FAIL",
            "evidence": evidence,
            "requiredCapability": (
                "arbitrary-composition multicomponent ln(gamma_i) or chemical "
                "potentials suitable for LLE stability/flash calculations"
            ),
            "publishedCapability": (
                "single-solute solvation free energy in a selected solvent"
            ),
            "blocker": blocker,
        },
        "benchmark": {
            "status": "NOT_EXECUTED_CAPABILITY_BLOCKED",
            "availableEvidence": {
                "cotoTieLines": 17,
                "multiTemperatureTieLines": 219,
            },
            "evaluatedRecords": 0,
            "topologyRecall": None,
            "compositionRmsd": None,
            "acceptanceGatePassed": False,
        },
        "molecularGeneration": {
            "status": "NOT_EXECUTED_AFTER_PRE_BENCHMARK_CAPABILITY_FAILURE",
            "generatedProfiles": [],
        },
        "paReferenceData": {
            "status": "NOT_EXECUTED",
            "temperaturesK": [298.15, 313.15, 323.15, 333.15, 348.15],
            "binaryPairs": ["PA+SAT", "PA+MONO", "PA+DI", "PA+POLY", "PA+NMP"],
            "records": [],
        },
        "uniquacRegression": {
            "status": "NOT_EXECUTED",
            "temperatureLaw": "tau_ij(T)=exp[-(a_ij+b_ij/T)]",
            "expectedDirectedTerms": 10,
            "fittedParameters": [],
        },
        "productionImpact": {
            "stage1Changed": False,
            "runtimeChanged": False,
            "positivePaGateChanged": False,
            "sulfurStatusChanged": False,
            "releaseEligibilityChanged": False,
        },
        "decision": "STOPPED_PUBLISHED_MODEL_LACKS_MIXTURE_ACTIVITY_CAPABILITY",
        "decisionBasis": blocker,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    report = f"""# GFN2-xTB + ddCOSMO/CPCM-X PA study

## Decision

`{result["decision"]}`

No non-PA LLE benchmark, molecular profile generation, PA reference calculation,
or UNIQUAC regression was executed.

## Verified published basis

- CPCM-X release: `{RELEASE}`
- CPCM-X commit: `{COMMIT}`
- Model label: {MODEL_LABEL}
- Global CPCM-X parameters re-fitted: **no**
- openCOSMO-RS 24a claimed: **no**
- Pinned source integrity: **PASS**

The documentation does show the published xTB parameterization loading
`xtb.cosmo`. That workflow calculates a solute's solvation free energy in a
selected solvent. It does not expose the arbitrary-composition mixture
activities required for the requested NMP/hydrocarbon LLE benchmark.

## Exact blocker

{blocker}

Because the benchmark cannot be executed with the published model unchanged,
the requested fail-closed rule applies. Developing the missing mixture model
would be new thermodynamic implementation work beyond using the published
CPCM-X parameterization, even if its global constants were held fixed.

## Preserved boundaries

- No PA molecular-reference values were estimated or fabricated.
- No PA-directed UNIQUAC terms were fitted.
- No CPCM-X global parameters were changed.
- Stage 1 and production runtime behavior were not changed.
- Positive-PA results and sulfur removal remain not calculable.
"""
    (OUT / "report.md").write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()