#!/usr/bin/env python3
"""Qualify an unseen RRBO molecular-pair edge after adding direct NMP evidence."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OLD = ROOT / "server/research/ecr-pre-pilot-descriptor-transfer"
UQ = ROOT / "server/research/ecr-pre-pilot-uniquac"
BASELINE = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
REG = HERE / "descriptor-registry.json"
SPLIT = HERE / "frozen-holdouts.json"
PROTOCOL = HERE / "frozen-protocol.json"
AUG = HERE / "molecular-pair-augmentation.json"
FIT_START = OLD / "fit-start.json"
OLD_RESULTS = ROOT / ".agents/outputs/ecr-pre-pilot-descriptor-transfer/results.json"
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-new-analogue"
ACCH = {
    "subgroup": 13,
    "name": "ACCH",
    "R": 0.8121,
    "Q": 0.348,
    "source": "Original-UNIFAC subgroup table; ACCH is an aromatic carbon attached to an aliphatic CH",
}

sys.path[:0] = [str(UQ), str(OLD)]
spec = importlib.util.spec_from_file_location("descriptor_transfer_v1", OLD / "run.py")
dt = importlib.util.module_from_spec(spec)
assert spec.loader
sys.modules[spec.name] = dt
spec.loader.exec_module(dt)
dt.REG = REG
dt.FIT_START = FIT_START


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical_sha(value):
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


def augmented_rows(tab):
    doc = json.loads(AUG.read_text())
    rows = []
    for rid, temp, xr_sat, xr_mono, xe_sat, xe_mono in doc["rows"]:
        x = [xr_sat, xr_mono, 0.0, 0.0, 1.0 - xr_sat - xr_mono]
        y = [xe_sat, xe_mono, 0.0, 0.0, 1.0 - xe_sat - xe_mono]
        rows.append(dt.uq.row(
            rid, doc["citation"]["key"], temp, x, y, [0, 1, 4], False,
            ["n-dodecane", "sec-butylbenzene", "N-methyl-2-pyrrolidone"],
            tab, None,
        ))
    return rows


def graph_summary(rows):
    edges = sorted({tuple(r["identities"][:2]) for r in rows})
    sat = sorted({e[0] for e in edges})
    mono = sorted({e[1] for e in edges})
    return {
        "SATnodes": sat,
        "MONOnodes": mono,
        "edges": [list(e) for e in edges],
        "nodeCount": len(sat) + len(mono),
        "edgeCount": len(edges),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reg = json.loads(REG.read_text())
    split = json.loads(SPLIT.read_text())
    protocol = json.loads(PROTOCOL.read_text())
    actual = {
        "baselineTieLines": sha(BASELINE),
        "augmentation": sha(AUG),
        "descriptorRegistry": sha(REG),
        "frozenHoldouts": sha(SPLIT),
        "fitStart": sha(FIT_START),
        "qualifiedUniquacImplementation": sha(UQ / "run.py"),
    }
    if protocol["sha256Links"] != actual:
        raise RuntimeError("frozen protocol SHA-256 link mismatch")

    structural, tab = dt.uq.structural()
    tab = dict(tab)
    # Original-UNIFAC groups: 5 ACH + ACCH + CH2 + 2 CH3.
    # ACCH is a single subgroup; it must not be represented as AC + CH even
    # though those legacy constants happen to sum to the same R/Q.
    sec_groups = {"9": 5, "13": 1, "2": 1, "1": 2}
    subgroup_constants = dict(structural["subgroups"])
    subgroup_constants["13"] = ACCH
    sec_r = sum(subgroup_constants[key]["R"] * count for key, count in sec_groups.items())
    sec_q = sum(subgroup_constants[key]["Q"] * count for key, count in sec_groups.items())
    if abs(sec_r - 5.9452) > 1e-12 or abs(sec_q - 4.584) > 1e-12:
        raise RuntimeError("sec-butylbenzene Original-UNIFAC R/Q derivation mismatch")
    tab["sec-butylbenzene"] = {
        "identity": "sec-butylbenzene",
        "formula": "C10H14",
        "groups": sec_groups,
        "r": sec_r,
        "q": sec_q,
        "structuralStatus": "calculated from Original-UNIFAC subgroup constants",
    }
    baseline = dt.uq.mt_rows(tab)
    added = augmented_rows(tab)
    if len(baseline) != 219 or len(added) != 31:
        raise RuntimeError("evidence row-count mismatch")
    population = baseline + added

    unseen_ids = set(split["unseenSystem"]["ids"])
    temperature_ids = set(split["leaveTemperatureOut"]["ids"])
    holdout_ids = unseen_ids | temperature_ids
    if unseen_ids & temperature_ids:
        raise RuntimeError("holdouts must be disjoint")
    train = [r for r in population if r["id"] not in holdout_ids]
    unseen = [r for r in population if r["id"] in unseen_ids]
    temperature = [r for r in population if r["id"] in temperature_ids]
    train_ids = {r["id"] for r in train}
    held_pair = tuple(split["unseenSystem"]["identities"])
    leakage = {
        "trainHoldoutIdIntersection": sorted(train_ids & holdout_ids),
        "heldPairPresentInTraining": any(tuple(r["identities"][:2]) == held_pair for r in train),
        "heldTemperaturePresentInTraining": any(
            abs(r["T"] - split["leaveTemperatureOut"]["temperature_K"]) < 1e-12
            for r in train
        ),
    }
    if any((leakage["trainHoldoutIdIntersection"],
            leakage["heldPairPresentInTraining"],
            leakage["heldTemperaturePresentInTraining"])):
        raise RuntimeError("pre-fit leakage check failed")

    checkpoint_path = OUT / "fit-checkpoint.json"
    training_hash = canonical_sha(sorted(train_ids))
    if "--resume-fit" in sys.argv:
        checkpoint = json.loads(checkpoint_path.read_text())
        if checkpoint["inputSha256"] != actual or checkpoint["trainingIdsSha256"] != training_hash:
            raise RuntimeError("fit checkpoint does not match frozen inputs and training population")
        theta = np.asarray(checkpoint["parameters"], dtype=float)
        identifiability = checkpoint["identifiability"]
        covariance = np.asarray(checkpoint["covariance"], dtype=float)
    else:
        theta, identifiability, covariance = dt.fit(train, reg)
        checkpoint = {
            "format": "ecr-new-analogue-fit-checkpoint-v1",
            "inputSha256": actual,
            "trainingIdsSha256": training_hash,
            "parameters": theta.tolist(),
            "identifiability": identifiability,
            "covariance": covariance.tolist(),
        }
        checkpoint_path.write_text(json.dumps(checkpoint, indent=2, sort_keys=True) + "\n")
    unseen_records, unseen_metrics = dt.qualify(unseen, theta, reg, "UNTOUCHED_MOLECULAR_PAIR")
    temp_records, temp_metrics = dt.qualify(temperature, theta, reg, "LEAVE_TEMPERATURE_OUT")
    all_records = unseen_records + temp_records
    gates = {
        "topologyRecall": {
            "threshold": 0.9,
            "value": min(unseen_metrics["topologyRecall"], temp_metrics["topologyRecall"]),
            "pass": unseen_metrics["topologyRecall"] >= 0.9 and temp_metrics["topologyRecall"] >= 0.9,
        },
        "tieLineRmsd": {
            "threshold": 0.03,
            "value": max(unseen_metrics["tieLineRmsd"] or float("inf"),
                         temp_metrics["tieLineRmsd"] or float("inf")),
            "pass": bool(
                unseen_metrics["tieLineRmsd"] is not None
                and temp_metrics["tieLineRmsd"] is not None
                and unseen_metrics["tieLineRmsd"] <= 0.03
                and temp_metrics["tieLineRmsd"] <= 0.03
            ),
        },
        "thermodynamicQualification": {
            "pass": all(r["qualificationOutcome"] == "PASS" for r in all_records),
        },
    }
    passed = all(g["pass"] for g in gates.values())
    unseen_domain = dt.applicability(unseen, train, reg)
    temp_domain = dt.applicability(temperature, train, reg)
    old = json.loads(OLD_RESULTS.read_text())
    old_distance = old["applicabilityDomain"]["trueUnseenSystem"][
        "maximumNearestNormalizedDescriptorDistance"
    ]
    comparison = {
        "task169": {
            "unseenHoldout": old["holdouts"]["trueUnseenSystem"]["identities"],
            "topologyRecall": old["holdouts"]["trueUnseenSystem"]["metrics"]["topologyRecall"],
            "tieLineRmsd": old["holdouts"]["trueUnseenSystem"]["metrics"]["tieLineRmsd"],
            "rank": old["fit"]["identifiability"]["rank"],
            "parameterCount": old["fit"]["identifiability"]["parameterCount"],
            "practicallyWeakDirections": old["fit"]["identifiability"]["practicallyWeakDirections"],
            "maximumNearestNormalizedDescriptorDistance": old_distance,
        },
        "task171": {
            "unseenHoldout": list(held_pair),
            "topologyRecall": unseen_metrics["topologyRecall"],
            "tieLineRmsd": unseen_metrics["tieLineRmsd"],
            "rank": identifiability["rank"],
            "parameterCount": identifiability["parameterCount"],
            "practicallyWeakDirections": identifiability["practicallyWeakDirections"],
            "maximumNearestNormalizedDescriptorDistance":
                unseen_domain["maximumNearestNormalizedDescriptorDistance"],
        },
        "weakDirectionsReduced": (
            identifiability["practicallyWeakDirections"]
            < old["fit"]["identifiability"]["practicallyWeakDirections"]
        ),
        "extrapolationDistanceReduced": (
            unseen_domain["maximumNearestNormalizedDescriptorDistance"] < old_distance
        ),
        "comparisonCaveat": "Holdout identity changed as frozen by this task; metrics are qualification outcomes, not a paired-row intervention estimate.",
    }
    result = {
        "format": "ecr-new-analogue-qualification-v1",
        "decision": "PASS" if passed else "REJECT",
        "governingStatus": "ELIGIBLE_FOR_SEPARATE_SIMULATOR_REVIEW" if passed else "FAIL_CLOSED",
        "evidence": {
            "baselineRows": len(baseline),
            "addedRows": len(added),
            "totalRows": len(population),
            "addedSystem": ["n-dodecane", "sec-butylbenzene", "N-methyl-2-pyrrolidone"],
            "addedTemperatures_K": sorted({r["T"] for r in added}),
            "source": json.loads(AUG.read_text())["citation"],
            "inputSha256": actual,
            "structuralProvenance": {
                "identity": "sec-butylbenzene",
                "formula": "C10H14",
                "subgroups": sec_groups,
                "ACCH": ACCH,
                "derivedR": sec_r,
                "derivedQ": sec_q,
                "atomBalance": "5 ACH aromatic carbons + 1 ACCH aromatic carbon; side chain represented by ACCH + CH2 + 2 CH3 gives C10H14",
            },
        },
        "graph": {
            "before": graph_summary(baseline),
            "after": graph_summary(population),
            "selectionRationale": "Adds a direct branching contrast connected to dodecane at four temperatures; the untouched holdout is a novel graph edge whose endpoint identities occur independently in training.",
            "remainingGap": "Branching is not independently identifiable from carbon number with only one branched MONO identity; no cycloalkane edge was admitted.",
        },
        "leakageChecks": {**leakage, "status": "PASS"},
        "fit": {
            "calledOnceBeforeHoldout": True,
            "trainingRows": len(train),
            "trainingIdsSha256": training_hash,
            "parameters": theta.tolist(),
            "parameterBinary64Sha256": hashlib.sha256(
                np.asarray(theta, dtype=np.float64).tobytes()
            ).hexdigest(),
            "identifiability": identifiability,
        },
        "holdouts": {
            "untouchedMolecularPair": {
                "identities": list(held_pair),
                "rows": unseen_records,
                "metrics": unseen_metrics,
                "applicability": unseen_domain,
            },
            "leaveTemperatureOut": {
                "temperature_K": split["leaveTemperatureOut"]["temperature_K"],
                "rows": temp_records,
                "metrics": temp_metrics,
                "applicability": temp_domain,
            },
        },
        "gates": gates,
        "comparison": comparison,
        "boundaries": {
            "branching": "SCREEN_ONLY",
            "cycloalkane": "FAIL_CLOSED",
            "DI_POLY": "FAIL_CLOSED",
            "sulfur": "FAIL_CLOSED",
            "simulatorIntegrationPerformed": False,
        },
    }
    (OUT / "results.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report = (
        "# New RRBO analogue molecular-pair qualification\n\n"
        f"**Decision: {result['decision']}; governing status: {result['governingStatus']}.**\n\n"
        "Admitted 31 direct composition-resolved dodecane + sec-butylbenzene + NMP "
        "tie lines at 288.15, 298.15, 308.15, and 318.15 K from NIST ThermoML "
        "(DOI 10.1021/je050191r). The complete tetradecane + pentylbenzene edge "
        "was frozen untouched before the sole fit. Both held endpoint identities "
        "occur independently in training, but the held pair does not. "
        "Sec-butylbenzene structural R/Q uses 5 ACH + ACCH + CH2 + 2 CH3; "
        "ACCH is the single Original-UNIFAC subgroup 13.\n\n"
        "| holdout | rows | topology recall | tie-line RMSD |\n"
        "|---|---:|---:|---:|\n"
        f"| untouched molecular pair | {unseen_metrics['rows']} | "
        f"{unseen_metrics['topologyRecall']:.6f} | {unseen_metrics['tieLineRmsd']} |\n"
        f"| leave 323.2 K out | {temp_metrics['rows']} | "
        f"{temp_metrics['topologyRecall']:.6f} | {temp_metrics['tieLineRmsd']} |\n\n"
        f"Practically weak parameter directions changed from "
        f"{comparison['task169']['practicallyWeakDirections']} to "
        f"{comparison['task171']['practicallyWeakDirections']}. Maximum nearest "
        f"normalized descriptor distance changed from {old_distance} to "
        f"{unseen_domain['maximumNearestNormalizedDescriptorDistance']}.\n\n"
        "The topology, RMSD, and thermodynamic gates are unchanged. Branching remains "
        "screen-only because one branched identity cannot separate its effect from "
        "carbon number; no cycloalkane contrast was admitted. DI/POLY, sulfur, and "
        "simulator integration remain fail-closed unless all gates pass and a separate "
        "integration review is approved.\n"
    )
    (OUT / "report.md").write_text(report)
    provenance = {
        "format": "ecr-new-analogue-provenance-v1",
        "resultSha256": sha(OUT / "results.json"),
        "reportSha256": sha(OUT / "report.md"),
        "runSha256": sha(__file__),
        "inputs": actual,
    }
    (OUT / "provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "decision": result["decision"],
        "unseen": unseen_metrics,
        "temperature": temp_metrics,
        "comparison": comparison,
    }, indent=2))


if __name__ == "__main__":
    main()