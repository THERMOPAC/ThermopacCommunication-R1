#!/usr/bin/env python3
"""Deterministic evidence and identifiability audit for DI/POLY temperature transfer."""
from pathlib import Path
import hashlib
import json
import math
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-heavy-aromatics-temperature"
REGISTRY = HERE / "evidence-registry.json"
COTO = ROOT / "server/engine-framework/cel/coto2022-nmp-lle.ts"
DESCRIPTORS = ROOT / "server/research/ecr-pre-pilot-descriptor-transfer/descriptor-registry.json"
PROTOCOL = ROOT / "server/research/ecr-pre-pilot-descriptor-transfer/frozen-protocol.json"
TRANSFER = ROOT / ".agents/outputs/ecr-pre-pilot-descriptor-transfer/results.json"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rank_2column(temperatures):
    rows = [[1.0, 1.0 / t] for t in temperatures]
    if not rows:
        return 0
    if len(rows) == 1:
        return 1
    determinant_found = any(
        abs(rows[i][0] * rows[j][1] - rows[j][0] * rows[i][1]) > 1e-14
        for i in range(len(rows)) for j in range(i)
    )
    return 2 if determinant_found else 1


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    registry = json.loads(REGISTRY.read_text())
    descriptors = json.loads(DESCRIPTORS.read_text())
    protocol = json.loads(PROTOCOL.read_text())
    transfer = json.loads(TRANSFER.read_text())
    coto_text = COTO.read_text()

    pattern = r"\{ x: \[([^\]]+)\], y: \[([^\]]+)\], tableOrder: (\d+)"
    coto_rows = []
    for x_text, y_text, order in re.findall(pattern, coto_text):
        x = [float(value.strip()) for value in x_text.split(",")]
        y = [float(value.strip()) for value in y_text.split(",")]
        coto_rows.append({"order": int(order), "x": x, "y": y})
    if len(coto_rows) != 17:
        raise RuntimeError("expected exactly 17 admitted Coto tie-lines")

    names = ["SAT", "MONO", "DI", "POLY", "NMP"]
    log_k = {}
    for index, name in enumerate(names):
        values = [math.log(row["y"][index] / row["x"][index]) for row in coto_rows]
        log_k[name] = {
            "count": len(values),
            "minimum": min(values),
            "maximum": max(values),
            "mean": sum(values) / len(values)
        }

    direct_heavy_sources = [
        source for source in registry["sources"]
        if source["admission"].startswith("DIRECT_")
        and any(component in source["components"] for component in ("1-methylnaphthalene", "pyrene"))
    ]
    observed_temperatures = sorted({
        temperature for source in direct_heavy_sources
        for temperature in source["temperatureCoverage_K"]
    })
    design_rank = rank_2column(observed_temperatures)

    # For tau(T)=a+b/T, any b can be offset by a at the sole observed T0.
    # The declared +/-2000 K b bound from the controlled UNIQUAC work shows
    # the unresolved extrapolation scale without selecting a slope.
    t0 = observed_temperatures[0]
    slope_bound = 2000.0
    nonidentifiability = []
    for temperature in registry["operatingTemperatures_K"]:
        magnitude = abs(slope_bound * (1.0 / temperature - 1.0 / t0))
        nonidentifiability.append({
            "temperature_K": temperature,
            "maximumAbsoluteTauDepartureFromAnchorWithinOneSlopeBound": magnitude
        })

    fit_features = protocol["fitFeatures"]
    screen_only = protocol["screenOnlyFeatures"]
    heavy_descriptors = {
        identity: descriptors["molecules"][identity]
        for identity in ("1-methylnaphthalene", "pyrene")
    }
    prior_gap = transfer["dataGaps"]["DI_POLY_temperature_transfer"]

    identifiable = len(observed_temperatures) >= 2 and design_rank == 2
    decision = "ESTABLISHED" if identifiable else "NOT_ESTABLISHED"
    result = {
        "format": "ecr-heavy-aromatics-temperature-audit-v1",
        "decision": decision,
        "governingStatus": "FAIL_CLOSED" if not identifiable else "ELIGIBLE_FOR_MODEL_QUALIFICATION",
        "question": "Can DI/POLY transfer into NMP be predicted across the 298.15-373.15 K operating range?",
        "evidenceInventory": {
            "sources": registry["sources"],
            "directHeavyAromaticTemperatureCount": len(observed_temperatures),
            "directHeavyAromaticTemperatures_K": observed_temperatures,
            "cotoTieLineCount": len(coto_rows),
            "cotoHeavyIdentities": ["1-methylnaphthalene", "pyrene"],
            "cotoLogKAt298_15K": {"definition": "ln(y_i/x_i) on measured conjugate phases", **log_k}
        },
        "identifiability": {
            "temperatureModel": "tau(T)=a+b/T",
            "designMatrixColumns": ["1", "1/T"],
            "designMatrixRank": design_rank,
            "requiredRank": 2,
            "interceptSlopeSeparatelyIdentifiable": identifiable,
            "proof": "At one temperature, a and b are confounded because a'=a-delta/T0 and b'=b+delta reproduce the same tau(T0).",
            "boundedCounterfactual": {
                "slopeBound_K": slope_bound,
                "anchorTemperature_K": t0,
                "departures": nonidentifiability,
                "interpretation": "These are unresolved ranges, not predictions or uncertainty intervals."
            }
        },
        "descriptorTransfer": {
            "heavyMoleculeDescriptors": heavy_descriptors,
            "featuresFittedByTask169": fit_features,
            "featuresScreenOnlyByTask169": screen_only,
            "heavyAromaticDefiningFeaturesWereFitted": False,
            "task169Decision": transfer["decision"],
            "task169HeavyTemperatureGap": prior_gap
        },
        "conclusions": {
            "directEvidence": "Only the 298.15 K Coto tie-lines directly contain DI/POLY with NMP.",
            "monoAromaticAnalogy": "The 293-328 K monoaromatic studies cannot determine DI/POLY temperature response.",
            "samplePreparation": "Coto heating at 50-70 C dissolved pyrene before equilibration; it is not equilibrium evidence at those temperatures.",
            "modelExtrapolation": "No DI/POLY temperature coefficient, descriptor slope, or operating-temperature partition value is identified.",
            "sulfurBoundary": "No conclusion about sulfur-species transfer follows from DI/POLY aromatic transfer."
        },
        "requiredEvidence": registry["requiredExperiment"],
        "simulatorIntegration": {
            "performed": False,
            "permitted": identifiable,
            "status": "PROHIBITED" if not identifiable else "SEPARATE_REVIEW_REQUIRED"
        },
        "sources": {
            str(path.relative_to(ROOT)): sha(path)
            for path in (REGISTRY, COTO, DESCRIPTORS, PROTOCOL, TRANSFER)
        }
    }
    OUT.joinpath("results.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report = f"""# Heavy-aromatics temperature-transfer qualification

**Decision: {decision}; governing status: {result['governingStatus']}.**

The admitted direct NMP evidence contains 17 Coto tie-lines with
1-methylnaphthalene and pyrene, all at 298.15 K. Coto's 50-70 C heating step
was sample preparation to dissolve pyrene; every reported equilibrium
experiment was performed at 298.15 K. The multitemperature NMP sources found
cover monoaromatics only.

For `tau(T)=a+b/T`, the heavy-aromatic temperature design matrix has rank
**{design_rank} of 2**. Intercept and temperature slope are therefore
structurally confounded. At 373.15 K, a slope anywhere within the existing
plus/minus 2000 K research bound can depart from the 298.15 K anchor by
**{nonidentifiability[-1]['maximumAbsoluteTauDepartureFromAnchorWithinOneSlopeBound']:.6f}**
in either direction without changing the anchor fit. This is an unresolved
range, not a prediction interval.

Task #169 does not close the gap: aromatic-ring count and condensation were
screen-only, and its transferable SAT/MONO model was rejected. DI/POLY
temperature transfer remains `FAIL_CLOSED`.

## Required evidence

- Direct conjugate-phase measurements at 298.15, 323.15, 348.15, and 373.15 K.
- At least two DI and two POLY identities to separate temperature from identity.
- Phase amounts or independently closed material balances, feed and solvent
  ratio, pressure, analytical uncertainty, and replicates.
- Preregistered temperature and unseen-identity holdouts.
- Topology recall at least 0.90 and tie-line RMSD at most 0.03, plus the existing
  stability, Gibbs, conservation, isoactivity, ambiguity, and independent
  final-phase checks.

No DI/POLY operating-temperature values, sulfur predictions, stage counts,
optimization, hydraulics, sizing, or simulator outputs are licensed by this
evidence.
"""
    OUT.joinpath("report.md").write_text(report)
    provenance = {
        "format": "ecr-heavy-aromatics-temperature-provenance-v1",
        "runSha256": sha(__file__),
        "resultSha256": sha(OUT / "results.json"),
        "reportSha256": sha(OUT / "report.md"),
        "inputs": result["sources"]
    }
    OUT.joinpath("provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "decision": decision,
        "temperatures": observed_temperatures,
        "rank": design_rank,
        "outputs": str(OUT)
    }, indent=2))


if __name__ == "__main__":
    main()