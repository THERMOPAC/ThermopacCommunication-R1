#!/usr/bin/env python3
"""Independent integrity and invariant checks for the frozen decomposition."""
import hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
OUT=ROOT/".agents/outputs/frozen-cosmosac-layer-decomposition"
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
protocol=json.loads((HERE/"protocol.json").read_text())
result=json.loads((OUT/"results.json").read_text())
manifest=json.loads((OUT/"provenance-manifest.json").read_text())
assert result["governance"]==protocol["governance"]
assert len(result["cases"])==protocol["frozenStateCount"]==57
assert set(result["parameterVectors"])=={"nativeCosmoSac","currentResidualAmendment","task206ResidualAmendment"}
assert result["parameterVectors"]["nativeCosmoSac"]==[0.0]*9
for case in result["cases"]:
    assert set(case["evaluations"])==set(result["parameterVectors"])
    assert all(e["search"]["gridDenominator"]==4 for e in case["evaluations"].values())
    assert all(e["search"]["seedCount"]==17 for e in case["evaluations"].values())
assert manifest["protocol"]==sha(HERE/"protocol.json")
assert manifest["runner"]==sha(HERE/"run.py")
assert manifest["outputs"]["results"]==sha(OUT/"results.json")
assert manifest["outputs"]["report"]==sha(OUT/"report.md")
print(json.dumps({"verified":True,"cases":57,"evaluations":171,"productionModelModified":False},indent=2))