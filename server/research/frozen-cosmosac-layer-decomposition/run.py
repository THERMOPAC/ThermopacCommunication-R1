#!/usr/bin/env python3
"""Research-only identical-state comparison; fits and changes nothing."""
from __future__ import annotations
import hashlib, importlib.util, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/frozen-cosmosac-layer-decomposition"
VENDOR = ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
sys.path.insert(0, str(VENDOR))
PATHS = {
    "model": ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py",
    "amendmentProtocol": ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json",
    "activeResults": ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
    "task206Results": ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json",
    "rootCauseResults": ROOT / ".agents/outputs/task-218-task216-root-cause/results.json",
    "rootCauseProvenance": ROOT / ".agents/outputs/task-218-task216-root-cause/provenance-manifest.json",
    "nativeSource": ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py",
    "nativeProvenance": ROOT / "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json",
}

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def load_json(path): return json.loads(Path(path).read_text())
def load_module(path):
    spec = importlib.util.spec_from_file_location("frozen_layer_model", path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
def clr(x, np):
    x = np.maximum(np.asarray(x, float), 1e-12); x /= x.sum()
    lx = np.log(x); return lx - lx.mean()
def summary(values, np):
    a = np.asarray(values, float)
    return {"minimum": float(a.min()), "median": float(np.median(a)),
            "maximum": float(a.max()), "count": int(len(a))}

def stationarity(model, names, temperature, z, parameters, w, protocol, np):
    w = model.normalize(w); z = model.normalize(z)
    y = np.log(w[:-1] / w[-1])
    def objective(logits):
        q = model.base.softmax(logits)
        return float(np.sum(q * (np.log(q) + model.total_lngamma(names, temperature, q, parameters)
                                 - np.log(z) - model.total_lngamma(names, temperature, z, parameters))))
    steps = (1e-4, 5e-5, 2.5e-5)
    gradients = []
    for h in steps:
        g = np.asarray([(objective(y+h*np.eye(len(y))[i])-objective(y-h*np.eye(len(y))[i]))/(2*h)
                        for i in range(len(y))])
        gradients.append(g)
    selected = gradients[-1]
    limit = protocol["diagnosticAcceptance"]["stationarityInfinityNorm"]
    boundary = np.where(w <= protocol["diagnosticAcceptance"]["boundaryMoleFraction"])[0].tolist()
    return {"coordinate": "independent log mole-fraction ratios ln(x_i/x_6)",
            "stepSizes": list(steps), "gradients": [g.tolist() for g in gradients],
            "gradientInfinityNorm": float(np.max(np.abs(selected))),
            "boundaryComponents": boundary,
            "classification": "INTERIOR_LOG_RATIO_KKT" if not boundary else "NEAR_BOUNDARY_LOG_RATIO_DIAGNOSTIC",
            "passes": bool(np.max(np.abs(selected)) <= limit)}

def evaluate(model, label, parameters, case, temperature, amendment_protocol, protocol, np):
    z = model.normalize(case["z"])
    search = model.tpd_search(model.FAMILIES, temperature, z, parameters, amendment_protocol,
                              include_local_seeds=True, refine_best_global_and_local=False)
    w = model.normalize(search["minimizingComposition"])
    mu_z = np.log(z) + model.total_lngamma(model.FAMILIES, temperature, z, parameters)
    mu_w = np.log(w) + model.total_lngamma(model.FAMILIES, temperature, w, parameters)
    delta = mu_w - mu_z
    return {
        "model": label, "minimumTpd": float(search["minimum"]), "verdict": search["verdict"],
        "minimizingComposition": w.tolist(), "clrDistanceFromReference": float(np.linalg.norm(clr(w,np)-clr(z,np))),
        "chemicalPotential": {"reference": mu_z.tolist(), "minimum": mu_w.tolist(),
                              "difference": delta.tolist(), "weightedDrivingForce": (w*delta).tolist()},
        "stationarity": stationarity(model, model.FAMILIES, temperature, z, parameters, w, protocol, np),
        "referenceTangentStability": model.tangent_stability(model.FAMILIES, temperature, z, parameters, amendment_protocol),
        "minimumTangentStability": model.tangent_stability(model.FAMILIES, temperature, w, parameters, amendment_protocol),
        "search": search
    }

def main():
    protocol = load_json(HERE/"protocol.json")
    actual = {name: sha(path) for name,path in PATHS.items()}
    if actual != protocol["pinnedInputs"]: raise RuntimeError("PINNED_INPUT_HASH_MISMATCH")
    model = load_module(PATHS["model"]); import numpy as np
    if list(model.FAMILIES) != protocol["componentOrder"]: raise RuntimeError("COMPONENT_ORDER_MISMATCH")
    if list(model.PARAMETER_NAMES) != protocol["parameterOrder"]: raise RuntimeError("PARAMETER_ORDER_MISMATCH")
    amendment_protocol = load_json(PATHS["amendmentProtocol"])
    active_result, task206_result, root = (load_json(PATHS[k]) for k in ("activeResults","task206Results","rootCauseResults"))
    cases = root["cases"]
    if len(cases) != protocol["frozenStateCount"]: raise RuntimeError("FROZEN_STATE_COUNT_MISMATCH")
    vectors = {
        "nativeCosmoSac": np.zeros(9),
        "currentResidualAmendment": np.asarray([active_result["model"]["parameters"][n] for n in model.PARAMETER_NAMES]),
        "task206ResidualAmendment": np.asarray([task206_result["parameters"][n] for n in model.PARAMETER_NAMES]),
    }
    temperature = float(root["temperatureK"]); records=[]
    for index,case in enumerate(cases,1):
        evaluations = {label:evaluate(model,label,p,case,temperature,amendment_protocol,protocol,np)
                       for label,p in vectors.items()}
        labels=list(evaluations)
        distances={f"{labels[i]}__{labels[j]}":float(np.linalg.norm(
            clr(evaluations[labels[i]]["minimizingComposition"],np)-
            clr(evaluations[labels[j]]["minimizingComposition"],np)))
            for i in range(len(labels)) for j in range(i)}
        records.append({"id":index,"NT":case["NT"],"stage":case["stage"],"phase":case["phase"],
                        "temperatureK":temperature,"referenceComposition":case["z"],
                        "originalCurrentMinimum":case["wStar"],"evaluations":evaluations,
                        "crossModelMinimumClrDistances":distances})
        print(f"FROZEN_LAYER_PROGRESS {index}/57", file=sys.stderr)
    aggregates={}
    for label in vectors:
        vals=[r["evaluations"][label]["minimumTpd"] for r in records]
        aggregates[label]={"tpd":summary(vals,np),"negativeCount":sum(v < amendment_protocol["numericalAcceptance"]["negativeTpdThreshold"] for v in vals),
                           "stationarityFailureCount":sum(not r["evaluations"][label]["stationarity"]["passes"] for r in records),
                           "minimumLocalEigenvalue":summary([r["evaluations"][label]["minimumTangentStability"]["minimumEigenvalue"] for r in records],np)}
    result={"schemaVersion":"1.0.0","analysis":protocol["analysis"],"governance":protocol["governance"],
            "pinnedInputs":actual,"searchPolicy":protocol["searchPolicy"],"temperatureK":temperature,
            "parameterVectors":{k:v.tolist() for k,v in vectors.items()},"aggregates":aggregates,"cases":records,
            "decision":"Diagnostic decomposition only; no model is admitted and no predictive-design qualification is assigned."}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/"results.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    lines=["# Controlled frozen-state COSMO-SAC layer decomposition","",
           "Research only. Identical frozen compositions and unchanged deterministic TPD search were used. No flash, cascade, fit, production change, or candidate admission occurred.","","## Aggregate results"]
    for label,value in aggregates.items():
        t=value["tpd"]; lines.append(f"- {label}: TPD min/median/max {t['minimum']:.12g} / {t['median']:.12g} / {t['maximum']:.12g}; negative {value['negativeCount']}/57; stationarity failures {value['stationarityFailureCount']}/57.")
    lines += ["","## Decision",result["decision"]]
    (OUT/"report.md").write_text("\n".join(lines)+"\n")
    manifest={"inputs":actual,"protocol":sha(HERE/"protocol.json"),"runner":sha(HERE/"run.py"),
              "outputs":{"results":sha(OUT/"results.json"),"report":sha(OUT/"report.md")}}
    (OUT/"provenance-manifest.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
    print(json.dumps(aggregates,indent=2))

if __name__=="__main__": main()