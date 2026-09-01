#!/usr/bin/env python3
"""Independent structural and arithmetic checks for the causal-audit artifact."""
import csv, hashlib, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; HERE=Path(__file__).parent
OUT=ROOT/".agents/outputs/stability-accuracy-causal-audit"
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def close(a,b,t=2e-10): return abs(a-b)<=t*max(1,abs(a),abs(b))
def main():
    p=json.loads((HERE/"protocol.json").read_text()); r=json.loads((OUT/"results.json").read_text())
    m=json.loads((OUT/"provenance-manifest.json").read_text())
    paths={"model.py":ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py",
      "amendmentProtocol":ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json",
      "evidence":ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json",
      "activeResults":ROOT/".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
      "task206Results":ROOT/".agents/outputs/task-206-stability-constrained-amendment/results.json",
      "rootCauseResults":ROOT/".agents/outputs/task-218-task216-root-cause/results.json",
      "rootCauseProvenance":ROOT/".agents/outputs/task-218-task216-root-cause/provenance-manifest.json"}
    actual={k:sha(v) for k,v in paths.items()}
    assert actual==p["pinnedInputs"]==r["pinnedInputs"]==m["inputs"]
    assert len(r["hybrids"])==512 and [x["mask"] for x in r["hybrids"]]==list(range(512))
    assert all(len(x["task206Parameters"])==x["mask"].bit_count() for x in r["hybrids"])
    a,c=r["hybrids"][0],r["hybrids"][-1]
    assert (a["stableStateCount"],c["stableStateCount"])==(0,47)
    assert close(a["minimumTpd"],-.781178740345) and close(c["minimumTpd"],-.042868,2e-6)
    assert r["frozenAffineForms"]["stateCount"]==57 and r["frozenAffineForms"]["maximumActiveReconstructionError"]<1e-9
    assert len(r["frozenAffineForms"]["activityEquilibriumIntercept"])==57
    assert all(len(x)==6 for x in r["frozenAffineForms"]["activityEquilibriumIntercept"])
    assert all(len(x)==6 and all(len(y)==9 for y in x)
               for x in r["frozenAffineForms"]["activityEquilibriumDesign"])
    assert r["unconstrainedActivityLeastSquares"]["training"]["rank"]==9
    assert close(r["unconstrainedActivityLeastSquares"]["training"]["minimumRms"],.219422895586,2e-10)
    assert r["compositionConclusions"]["task206ImprovesAllThree"] and r["compositionConclusions"]["allEndpointRmsdAbove003"]
    expected={"training":(.3502450827232224,.2769292446447198),
      "heldOutTemperature":(.07856508126243697,.07037166804893295),
      "heldOutMolecularSystem":(.06944244443913729,.057212805012628466)}
    for k,(x,y) in expected.items():
        assert close(r["endpointValidation"]["active"][k]["compositionRmsd"],x)
        assert close(r["endpointValidation"]["task206"][k]["compositionRmsd"],y)
    # Efficiency, symmetry and endpoint reconstruction are independent Shapley checks.
    for metric in ("minimumTpd","medianTpd","stableStateCount","training","heldOutTemperature","heldOutMolecularSystem"):
        key={"minimumTpd":"minimumTpd","medianTpd":"medianTpd","stableStateCount":"stableStateCount",
             "training":"training","heldOutTemperature":"heldOutTemperature",
             "heldOutMolecularSystem":"heldOutMolecularSystem"}[metric]
        assert close(sum(r["exactShapley"][key].values()),c[metric]-a[metric],2e-9)
    rows=list(csv.DictReader((OUT/"parameter-attribution.csv").open()))
    assert len(rows)==9 and {x["parameter"] for x in rows}==set(r["parameters"]["names"])
    text=(OUT/"report.md").read_text()
    assert all(x in text for x in ("## Exact proofs","## Strongly supported interpretations (not exact proofs)",
      "No production change or candidate model is proposed/admitted","0.350245→0.276929",
      "0.078565→0.070372","0.069442→0.057213","stable 0→47",
      "not a mathematical lower bound on composition RMSD","Native COSMO-SAC is not claimed globally stable"))
    assert m["protocolSha256"]==sha(HERE/"protocol.json") and m["runnerSha256"]==sha(HERE/"run.py")
    for name,digest in m["outputs"].items(): assert digest==sha(OUT/name)
    assert r["governance"]["productionModelModified"] is False and r["governance"]["candidateModelProposed"] is False
    print("PASS stability-accuracy-causal-audit")
if __name__=="__main__": main()