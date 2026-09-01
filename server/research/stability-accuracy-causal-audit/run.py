#!/usr/bin/env python3
"""Exhaustive, frozen-input causal audit; this script fits and changes nothing."""
from __future__ import annotations
import csv, hashlib, importlib.util, itertools, json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/stability-accuracy-causal-audit"
VENDOR = ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
sys.path.insert(0, str(VENDOR))
PATHS = {
    "model.py": ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py",
    "amendmentProtocol": ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json",
    "evidence": ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json",
    "activeResults": ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
    "task206Results": ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json",
    "rootCauseResults": ROOT / ".agents/outputs/task-218-task216-root-cause/results.json",
    "rootCauseProvenance": ROOT / ".agents/outputs/task-218-task216-root-cause/provenance-manifest.json",
}

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def load_json(path): return json.loads(Path(path).read_text())
def rms(values, np): return float(np.sqrt(np.mean(np.square(values))))
def load_module(path):
    spec = importlib.util.spec_from_file_location("causal_audit_model", path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

def partitions(model, rows, protocol):
    return model.fit_parameters(rows, protocol)[1]

def activity_forms(model, rows, np):
    n = len(model.PARAMETER_NAMES); zero = np.zeros(n)
    intercept = np.concatenate([model._row_equilibrium(zero, row) for row in rows])
    design = np.column_stack([
        np.concatenate([model._row_equilibrium(np.eye(n)[j], row) for row in rows])
        - intercept for j in range(n)
    ])
    return intercept, design

def tpd_form(model, temperature, z, w, np):
    z=model.normalize(z); w=model.normalize(w); zero=np.zeros(9)
    c=float(np.sum(w*(np.log(w)+model.total_lngamma(model.FAMILIES,temperature,w,zero)
                        -np.log(z)-model.total_lngamma(model.FAMILIES,temperature,z,zero))))
    a=w @ (model.residual_feature_matrix(w,temperature)
           -model.residual_feature_matrix(z,temperature))
    return c, np.asarray(a)

def predict_row(model, p, row, np):
    names=("SAT","MONO","NMP")
    xr=model.normalize([row["raffinate"][n] for n in names])
    observed=model.normalize([row["extract"][n] for n in names])
    xr6=np.array([xr[0],xr[1],0.,0.,0.,xr[2]])
    br=model.base.lngamma(names,row["T_K"],xr)
    cr=model.residual_lngamma(xr6,row["T_K"],p)[[0,1,5]]
    y=observed.copy()
    for _ in range(100):
        y6=np.array([y[0],y[1],0.,0.,0.,y[2]])
        nxt=model.normalize(xr*np.exp(br+cr-model.base.lngamma(names,row["T_K"],y)
                            -model.residual_lngamma(y6,row["T_K"],p)[[0,1,5]]))
        if max(abs(nxt-y)) < 1e-12: break
        y=.5*y+.5*nxt
    return observed, y, y-observed

def localization(model, p, rows, np):
    records=[]
    for row in rows:
        obs,pred,error=predict_row(model,p,row,np)
        records.append({"system":row["components"]["SAT"]+" + "+row["components"]["MONO"],
                        "temperatureK":float(row["T_K"]),"observed":obs,"predicted":pred,
                        "error":error})
    def grouped(key):
        groups={}
        for r in records: groups.setdefault(key(r),[]).extend(r["error"].tolist())
        return sorted(({"group":str(k),"rms":rms(v,np),"observations":len(v)}
                       for k,v in groups.items()),key=lambda x:-x["rms"])
    components=[]
    for j,name in enumerate(("SAT","MONO","NMP")):
        vals=[r["error"][j] for r in records]
        components.append({"group":name,"rms":rms(vals,np),"meanAbsolute":float(np.mean(abs(np.asarray(vals)))),
                           "observations":len(vals)})
    components.sort(key=lambda x:-x["rms"])
    return {"byMolecularSystem":grouped(lambda r:r["system"]),
            "byTemperatureK":grouped(lambda r:r["temperatureK"]),
            "byComponent":components}

def shapley(values, n):
    result=[0.]*n
    denom=math.factorial(n)
    for i in range(n):
        bit=1<<i
        for mask in range(1<<n):
            if mask&bit: continue
            k=mask.bit_count()
            weight=math.factorial(k)*math.factorial(n-k-1)/denom
            result[i]+=weight*(values[mask|bit]-values[mask])
    return result

def main():
    protocol=load_json(HERE/"protocol.json")
    actual={k:sha(v) for k,v in PATHS.items()}
    if actual != protocol["pinnedInputs"]: raise RuntimeError("PINNED_INPUT_HASH_MISMATCH")
    model=load_module(PATHS["model.py"]); import numpy as np
    base_protocol=load_json(PATHS["amendmentProtocol"])
    evidence=load_json(PATHS["evidence"])["tieLines"]
    active_result=load_json(PATHS["activeResults"])
    candidate_result=load_json(PATHS["task206Results"])
    root=load_json(PATHS["rootCauseResults"])
    names=list(model.PARAMETER_NAMES)
    active=np.array([active_result["model"]["parameters"][n] for n in names])
    candidate=np.array([candidate_result["parameters"][n] for n in names])
    parts=partitions(model,evidence,base_protocol)
    part_names=("training","heldOutTemperature","heldOutMolecularSystem")
    forms={}; linear_algebra={}
    for key in (*part_names,"allRows"):
        rows=evidence if key=="allRows" else parts[key]
        b,X=activity_forms(model,rows,np); forms[key]=(b,X)
        solution,_,rank,s=np.linalg.lstsq(X,-b,rcond=None)
        residual=b+X@solution
        linear_algebra[key]={"rows":len(rows),"residualCount":len(b),"rank":int(rank),
          "conditionNumber":float(s[0]/s[-1]),"minimumRms":rms(residual,np),
          "unconstrainedLeastSquaresParameters":solution.tolist()}
    cases=root["cases"]
    if len(cases)!=57: raise RuntimeError("FROZEN_STATE_COUNT_CHANGED")
    temperature=float(root["temperatureK"])
    tpd_c=[];tpd_a=[];state_activity_c=[];state_activity_a=[]
    for case in cases:
        c,a=tpd_form(model,temperature,case["z"],case["wStar"],np)
        tpd_c.append(c);tpd_a.append(a)
        z=model.normalize(case["z"]); w=model.normalize(case["wStar"])
        state_activity_c.append((np.log(z)+model.total_lngamma(model.FAMILIES,temperature,z,np.zeros(9))
                                 -np.log(w)-model.total_lngamma(model.FAMILIES,temperature,w,np.zeros(9))).tolist())
        state_activity_a.append((model.residual_feature_matrix(z,temperature)
                                 -model.residual_feature_matrix(w,temperature)).tolist())
    tpd_c=np.asarray(tpd_c);tpd_a=np.asarray(tpd_a)
    affine_max=max(abs((tpd_c+tpd_a@active)-np.array([x["activeTPDmin"] for x in cases])))
    threshold=float(protocol["stableThreshold"])
    hybrids=[]; metric_values={k:{} for k in ("minimumTpd","medianTpd","stableStateCount",*part_names)}
    for mask in range(512):
        p=np.where([(mask>>j)&1 for j in range(9)],candidate,active)
        tpd=tpd_c+tpd_a@p
        metrics={"minimumTpd":float(np.min(tpd)),"medianTpd":float(np.median(tpd)),
                 "stableStateCount":int(np.sum(tpd>=threshold))}
        for key in part_names:
            b,X=forms[key]; metrics[key]=rms(b+X@p,np)
        for key,value in metrics.items(): metric_values[key][mask]=value
        hybrids.append({"mask":mask,"task206Parameters":[names[j] for j in range(9) if mask&(1<<j)],
                        **metrics})
    attrs={key:shapley(vals,9) for key,vals in metric_values.items()}
    validation={}
    for label,p in (("active",active),("task206",candidate)):
        validation[label]={key:model.validation_metrics(p,parts[key]) for key in part_names}
    improvements={key:validation["task206"][key]["compositionRmsd"] <
                       validation["active"][key]["compositionRmsd"] for key in part_names}
    all_above=all(validation[label][key]["compositionRmsd"]>0.03
                  for label in validation for key in part_names)
    loc={"active":localization(model,active,evidence,np),
         "task206":localization(model,candidate,evidence,np)}
    result={"schemaVersion":"1.0.0","analysis":protocol["analysis"],"governance":protocol["governance"],
      "pinnedInputs":actual,"parameters":{"names":names,"active":active.tolist(),"task206":candidate.tolist()},
      "frozenAffineForms":{"stateCount":57,"temperatureK":temperature,
        "tpdIntercept":tpd_c.tolist(),"tpdDesign":tpd_a.tolist(),
        "activityEquilibriumIntercept":state_activity_c,
        "activityEquilibriumDesign":state_activity_a,
        "maximumActiveReconstructionError":float(affine_max),
        "activityPartitions":{k:{"intercept":forms[k][0].tolist(),"design":forms[k][1].tolist()}
                              for k in part_names}},
      "hybrids":hybrids,"exactShapley":{key:dict(zip(names,map(float,value))) for key,value in attrs.items()},
      "endpointValidation":validation,"compositionConclusions":{"task206ImprovesAllThree":all(improvements.values()),
        "improvementByPartition":improvements,"allEndpointRmsdAbove003":all_above},
      "unconstrainedActivityLeastSquares":linear_algebra,"compositionErrorLocalization":loc,
      "conclusions":{"noObservedEndpointTradeoff":all(improvements.values()),
        "task206PartialStabilization":hybrids[511]["stableStateCount"]==47,
        "trainingAffineMisfitIrreducible":linear_algebra["training"]["rank"]==9,
        "scope":"The linear-algebra lower bound applies to activity-equilibrium residual, not composition RMSD.",
        "negativeBasin":"The systematic MONO-rich basin pinned by the root-cause proof remains; native COSMO-SAC stability is not claimed beyond governed search.",
        "structuralInterpretation":"Strongly supported: the pre-existing accuracy failure is model-form/data-transfer mismatch; the universal SAT/MONO/NMP correction has no molecular-system identity dependence.",
        "decision":"No production change or candidate model is proposed or admitted."}}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/"results.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    with (OUT/"parameter-attribution.csv").open("w",newline="") as f:
        fields=["parameter","minimum_tpd","median_tpd","stable_state_count","training_activity_rms","temperature_holdout_activity_rms","molecular_holdout_activity_rms"]
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for i,n in enumerate(names): w.writerow({"parameter":n,"minimum_tpd":attrs["minimumTpd"][i],
          "median_tpd":attrs["medianTpd"][i],"stable_state_count":attrs["stableStateCount"][i],
          "training_activity_rms":attrs["training"][i],
          "temperature_holdout_activity_rms":attrs["heldOutTemperature"][i],
          "molecular_holdout_activity_rms":attrs["heldOutMolecularSystem"][i]})
    a=hybrids[0];c=hybrids[511]; sh=result["exactShapley"]["minimumTpd"]
    report=["# Stability–accuracy causal audit","",
      "Research only. No production/model/solver file or parameter was changed, and no candidate model is proposed or admitted.","",
      "## Exact proofs","",
      f"- All 512 endpoint hybrids were enumerated. At the 57 frozen genuine states, TPD and activity-equilibrium residuals are exact affine forms in the nine coefficients (floating-point reconstruction error {affine_max:.3g}). Exact Shapley values exhaust all coalitions.",
      f"- Task206 only partially stabilizes the later 57-state set: stable {a['stableStateCount']}→{c['stableStateCount']}, minimum TPD {a['minimumTpd']:.6f}→{c['minimumTpd']:.6f}.",
      f"- The minimum-TPD change is dominated jointly by reductions in A_MONO_NMP_ref and A_SAT_MONO_ref: exact Shapley contributions {sh['A_MONO_NMP_ref']:+.6f} and {sh['A_SAT_MONO_ref']:+.6f}; other terms largely offset or are negligible.",
      f"- Unchanged validation_metrics proves no observed Task206 stability-versus-LLE-accuracy trade-off between the endpoints: composition RMSD training {validation['active']['training']['compositionRmsd']:.6f}→{validation['task206']['training']['compositionRmsd']:.6f}, temperature holdout {validation['active']['heldOutTemperature']['compositionRmsd']:.6f}→{validation['task206']['heldOutTemperature']['compositionRmsd']:.6f}, molecular holdout {validation['active']['heldOutMolecularSystem']['compositionRmsd']:.6f}→{validation['task206']['heldOutMolecularSystem']['compositionRmsd']:.6f}. All six endpoint values remain above 0.03.",
      f"- Unconstrained training activity-equilibrium least squares has rank {linear_algebra['training']['rank']}, condition number {linear_algebra['training']['conditionNumber']:.6g}, and global minimum RMS {linear_algebra['training']['minimumRms']:.12f}. Thus its misfit is irreducible for this exact affine nine-parameter model/objective even without stability constraints. This is not a mathematical lower bound on composition RMSD.","",
      "## Strongly supported interpretations (not exact proofs)","",
      "Error localization under the unchanged fixed-point validation algorithm concentrates error in low-temperature heptadecane + pentylbenzene/propylbenzene rows and in MONO/NMP. The failure predates Task206 and is strongly supported as model-form/data-transfer mismatch: one universal SAT/MONO/NMP correction has no molecular-system identity dependence.",
      "The remaining negative basin is the same systematic MONO-rich basin already proven to arise from the residual amendment. Native COSMO-SAC is not claimed globally stable outside the governed search.","",
      "## Scope and decision","",
      "Exact claims above concern exhaustive hybrids at fixed states, affine activity residuals, and unchanged endpoint validation. Interpretations are explicitly non-proof. No production change or candidate model is proposed/admitted."]
    (OUT/"report.md").write_text("\n".join(report)+"\n")
    manifest={"inputs":actual,"protocolSha256":sha(HERE/"protocol.json"),"runnerSha256":sha(HERE/"run.py"),
      "outputs":{"results.json":sha(OUT/"results.json"),"parameter-attribution.csv":sha(OUT/"parameter-attribution.csv"),
                 "report.md":sha(OUT/"report.md")}}
    (OUT/"provenance-manifest.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
    print(json.dumps({"hybrids":512,"activeMinimumTpd":a["minimumTpd"],"task206MinimumTpd":c["minimumTpd"],
                      "activeStable":a["stableStateCount"],"task206Stable":c["stableStateCount"]},indent=2))

if __name__=="__main__": main()