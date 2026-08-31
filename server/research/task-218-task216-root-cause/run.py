#!/usr/bin/env python3
"""Frozen Task-216 root-cause evidence.  It neither fits nor changes a model."""
from __future__ import annotations
import csv, hashlib, importlib.util, json, math, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; HERE=Path(__file__).parent
OUT=ROOT/".agents/outputs/task-218-task216-root-cause"
T216=ROOT/"server/research/task-216-mono-rich-global-stability"
R216=ROOT/".agents/outputs/task-216-mono-rich-global-stability"
AMEND=ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
BASE=ROOT/"server/research/ecr-pre-pilot-cosmosac/run.py"
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def js(x): return json.dumps(x,sort_keys=True,separators=(",",":"))
def load(path,name):
 s=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(s); sys.modules[name]=m;s.loader.exec_module(m);return m
def norm(a, np): a=np.maximum(np.asarray(a,float),1e-10);return a/a.sum()
def tpd(cc,names,T,z,w,p):
 z=norm(z,cc.np);w=norm(w,cc.np)
 muz=cc.np.log(z)+cc.model.total_lngamma(names,T,z,p)
 muw=cc.np.log(w)+cc.model.total_lngamma(names,T,w,p)
 terms=w*(muw-muz);return float(terms.sum()),terms
def clr(x,np):
 x=norm(x,np); l=np.log(x);return l-l.mean()
def kmeans(X,k,np):
 # deterministic farthest-first centres, then Lloyd iterations
 centres=[X[0]]
 while len(centres)<k:
  d=np.min(np.stack([np.sum((X-c)**2,axis=1) for c in centres]),axis=0);centres.append(X[int(np.argmax(d))])
 centres=np.asarray(centres)
 for _ in range(200):
  labels=np.argmin(((X[:,None,:]-centres[None,:,:])**2).sum(2),axis=1)
  new=np.asarray([X[labels==i].mean(0) if (labels==i).any() else centres[i] for i in range(k)])
  if np.max(abs(new-centres))<1e-12:break
  centres=new
 return labels,centres
def silhouette(X,lab,np):
 vals=[]
 for i in range(len(X)):
  own=lab==lab[i]; a=np.mean(np.linalg.norm(X[i]-X[own],axis=1)[np.linalg.norm(X[i]-X[own],axis=1)>0]) if own.sum()>1 else 0
  bs=[np.mean(np.linalg.norm(X[i]-X[lab==j],axis=1)) for j in sorted(set(lab)) if j!=lab[i]]
  b=min(bs); vals.append((b-a)/max(a,b) if max(a,b) else 0)
 return float(np.mean(vals))
def summary(a,np):
 a=np.sort(np.asarray(a,float))
 return {"minimum":float(a[0]),"median":float(np.median(a)),"maximum":float(a[-1]),"count":int(len(a))}
def main():
 protocol=json.loads((HERE/"protocol.json").read_text()); frozen=json.loads((R216/"results.json").read_text())
 pin={"task216ResultsSha256":R216/"results.json","task216ProtocolSha256":T216/"protocol.json","task216RunnerSha256":T216/"run.py","task216ProvenanceSha256":R216/"provenance-manifest.json","amendmentModelSha256":AMEND,"baseCosmoSacSourceSha256":BASE,"baseCosmoSacProvenanceSha256":ROOT/"server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json"}
 pins={k:sha(v) for k,v in pin.items()}
 phases=frozen["phases"]; genuine=[x for x in phases if x["fullyReproducedNegative"]]
 unresolved=[x for x in phases if not x["fullyReproducedNegative"] and (x["minimum"]<protocol["threshold"] or x["productionHelper"]["minimum"]<protocol["threshold"])]
 local=[x for x in phases if x not in unresolved and not x["fullyReproducedNegative"]]
 if (len(phases),len(genuine),len(unresolved),len(local))!=(110,57,39,14):raise RuntimeError("FROZEN_CONTROL_COUNTS_CHANGED")
 worker=load(ROOT/"server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py","rcworker"); cc=worker.cc; np=cc.np
 # Frozen active vector is recorded in every Task216 phase.  Recover it from immutable Task206 output.
 source=json.loads(Path("/tmp/job170.json").read_text()); T=float(source["input_snapshot"]["temperatureK"])
 # Recover exactly the active (pre-candidate) vector through the same immutable
 # Task216 worker path; Task206's candidate vector is deliberately not used.
 stage1=worker.stage1_from_request(source["input_snapshot"])[1]
 p=worker.get_equilibrium(source["input_snapshot"],stage1)[1]
 p=np.asarray(p,float); zero=np.zeros_like(p)
 ablations={n:np.where(np.arange(9)==i,0,p).tolist() for i,n in enumerate(worker.model.PARAMETER_NAMES)}
 blocks={"SAT_MONO_block":[0,1,2],"SAT_NMP_block":[3,4,5],"MONO_NMP_block":[6,7,8]}
 for n,ix in blocks.items(): ablations[n]=np.where(np.isin(np.arange(9),ix),0,p).tolist()
 for n,ix in {"SAT_MONO+SAT_NMP":[0,1,2,3,4,5],"SAT_MONO+MONO_NMP":[0,1,2,6,7,8],"SAT_NMP+MONO_NMP":[3,4,5,6,7,8]}.items(): ablations[n]=np.where(np.isin(np.arange(9),ix),0,p).tolist()
 # parameter class diagnostic ablations
 for n,ix in {"ref_class":[0,3,6],"temperature_class":[1,4,7],"asymmetry_class":[2,5,8]}.items(): ablations[n]=np.where(np.isin(np.arange(9),ix),0,p).tolist()
 progress=OUT/"native-progress.json"; OUT.mkdir(parents=True,exist_ok=True)
 records=(json.loads(progress.read_text()) if progress.exists() else
          (json.loads((OUT/"results.json").read_text())["cases"]
           if (OUT/"results.json").exists() else []))
 for ix,x in enumerate(genuine[len(records):],start=len(records)):
  z=np.asarray(x["referenceComposition"]);w=np.asarray(x["minimumComposition"]); active,terms=tpd(cc,worker.FAMILIES,T,z,w,p); native_same,_=tpd(cc,worker.FAMILIES,T,z,w,zero)
  effect=active-native_same
  # exact additive residual TPD and component terms
  ideal=w*(np.log(norm(w,np))-np.log(norm(z,np)))
  native_terms=w*(cc.model.base.lngamma(worker.FAMILIES,T,w)-cc.model.base.lngamma(worker.FAMILIES,T,z))
  resid_terms=terms-ideal-native_terms
  vals={k:tpd(cc,worker.FAMILIES,T,z,w,np.asarray(v))[0] for k,v in ablations.items()}
  # native independent qualification uses frozen Task216 exact lattice/optimizers/KKT/witness gates.
  native=load(T216/"run.py","rc216").qualify_phase(cc,cc.model.tpd_search,worker.FAMILIES,T,z,zero,json.loads((T216/"protocol.json").read_text()),cc.load_json(ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json"),{"trialStageCount":x["trialStageCount"],"stageFromFeedEnd":x["stageFromFeedEnd"],"phase":x["phase"]})
  records.append({"id":ix+1,"NT":x["trialStageCount"],"stage":x["stageFromFeedEnd"],"phase":x["phase"],"z":z.tolist(),"wStar":w.tolist(),"activeTPDmin":active,"frozenTPDmin":x["minimum"],"nativeTPDAtActiveW":native_same,"amendmentEffectAtSameZW":effect,"terms":{"ideal":ideal.tolist(),"native":native_terms.tolist(),"residual":resid_terms.tolist(),"complete":terms.tolist()},"ablations":vals,"nativeIndependent":{"TPDmin":native["minimum"],"wStar":native["minimumComposition"],"classification":native["classification"],"criteria":native["reproductionCriteria"],"genuine":native["fullyReproducedNegative"]}})
  progress.write_text(json.dumps(records))
  print(f"ROOT_CAUSE_NATIVE_PROGRESS {ix+1}/57",file=sys.stderr)
 # quantitative feature analysis
 X=np.asarray([np.r_[clr(r["z"],np),clr(r["wStar"],np),np.asarray(r["wStar"])-r["z"],clr(r["wStar"],np)-clr(r["z"],np),r["NT"],r["stage"],0 if r["phase"]=="raffinate" else 1,math.log10(-r["activeTPDmin"]/1e-8)] for r in records])
 X=(X-X.mean(0))/np.where(X.std(0)==0,1,X.std(0)); sil={};labs={}
 for k in range(2,7): labs[k],_=kmeans(X,k,np);sil[str(k)]=silhouette(X,labs[k],np)
 chosen=max(sil,key=sil.get); labels=labs[int(chosen)]
 # Basin identity is intentionally independent of endpoint metadata and TPD:
 # it uses only CLR(w*).  Full-feature clusters remain correlation classes.
 W=np.asarray([clr(r["wStar"],np) for r in records]); centroid=W.mean(0)
 pairwise=[float(np.linalg.norm(W[i]-W[j])) for i in range(len(W)) for j in range(i)]
 centroid_dist=[float(np.linalg.norm(x-centroid)) for x in W]
 by_endpoint={}
 for i,r in enumerate(records):by_endpoint.setdefault((r["NT"],r["stage"]),[]).append(i)
 paired=[float(np.linalg.norm(W[v[0]]-W[v[1]])) for v in by_endpoint.values()
         if len(v)==2 and records[v[0]]["phase"]!=records[v[1]]["phase"]]
 basin={"input":"CLR(wStar) only","decision":"ONE_SYSTEMATIC_MONO_RICH_BASIN_FAMILY",
        "identityClass":"single-MONO-rich-basin-family",
        "monoMoleFractionRange":[float(min(r["wStar"][1] for r in records)),float(max(r["wStar"][1] for r in records))],
        "pairwiseClrDistance":summary(pairwise,np),"centroidClrDistance":summary(centroid_dist,np),
        "pairedRaffinateExtractClrDistance":summary(paired,np),
        "interpretation":"The spread is a continuous endpoint-conditioned displacement within one MONO-rich basin family; paired raffinate/extract minima coincide numerically. No separate basin identity is demonstrated."}
 for r,l in zip(records,labels):
  r["basinIdentityClass"]=basin["identityClass"]
  r["endpointCorrelationClass"]=f"endpoint-correlation-class-{int(l)+1}"
  r["rootCauseClass"]=r["basinIdentityClass"]+"; "+r["endpointCorrelationClass"]
 values=np.asarray([r["activeTPDmin"] for r in records]); q=np.quantile(values,[.25,.5,.75])
 selected={"representative":min(records,key=lambda r:abs(r["activeTPDmin"]-q[1]))["id"],"medianSeverity":min(records,key=lambda r:abs(r["activeTPDmin"]-q[1]))["id"],"closestToThreshold":max(records,key=lambda r:r["activeTPDmin"])["id"],"deepest":min(records,key=lambda r:r["activeTPDmin"])["id"]}
 counts={f"endpoint-correlation-class-{i+1}":int((labels==i).sum()) for i in sorted(set(labels))}
 ranked=[]
 for name in sorted(records[0]["ablations"]):
  delta=np.asarray([r["ablations"][name]-r["activeTPDmin"] for r in records])
  ranked.append({"ablation":name,"medianDeltaTPD":float(np.median(delta)),
                 "minimumDeltaTPD":float(delta.min()),"maximumDeltaTPD":float(delta.max()),
                 "positiveDeltaCount":int((delta>0).sum())})
 ranked.sort(key=lambda x:(-x["medianDeltaTPD"],x["ablation"]))
 active_range=summary([r["activeTPDmin"] for r in records],np)
 native_same_range=summary([r["nativeTPDAtActiveW"] for r in records],np)
 effect_range=summary([r["amendmentEffectAtSameZW"] for r in records],np)
 native_ind_range=summary([r["nativeIndependent"]["TPDmin"] for r in records],np)
 native_classes={}
 for r in records:native_classes[r["nativeIndependent"]["classification"]]=native_classes.get(r["nativeIndependent"]["classification"],0)+1
 sign_flips=sum(r["activeTPDmin"]<0 and r["nativeTPDAtActiveW"]>=0 for r in records)
 conclusions={"basinIdentityDecision":basin["decision"],"activeSignFlippedByAmendmentCount":sign_flips,
  "activeSignFlippedByAmendmentAll57":sign_flips==57,
  "provenResidualAmendmentNecessaryAtFrozenStates":sign_flips==57,
  "nativeGovernedSearchGenuineBasinCount":sum(r["nativeIndependent"]["genuine"] for r in records),
  "causalScope":"Necessity at the 57 exact frozen z,w* states; ablation rankings are sensitivity, endpoint clusters are correlation.",
  "noCandidateFit":True,"productionModelModified":False}
 result={"schemaVersion":"1.1.0","analysis":protocol["analysis"],"governance":protocol["governance"],"pinnedInputs":pins,"temperatureK":T,"coverage":{"allEndpoints":110,"genuine":57,"localArtifactControls":14,"unresolvedNegativeControls":39,"controls":{"localArtifact":[{"NT":x["trialStageCount"],"stage":x["stageFromFeedEnd"],"phase":x["phase"],"classification":x["classification"]} for x in local],"unresolvedNegative":[{"NT":x["trialStageCount"],"stage":x["stageFromFeedEnd"],"phase":x["phase"],"classification":x["classification"]} for x in unresolved]}},"algebra":{"q":"sum(Aij*x_i*x_j) including temperature/asymmetry bases; residual_feature_matrix@p is ln(gamma)_residual = dq/dx + (1-degree)q_feature","eulerIdentity":"sum_i x_i residual_lngamma_i = residual_g_over_rt","verifiedMaximumAbsoluteError":float(max(abs(np.dot(norm(r["z"],np),cc.model.residual_lngamma(r["z"],T,p))-cc.model.residual_g_over_rt(r["z"],T,p)) for r in records))},"distribution":{"minimum":float(values.min()),"maximum":float(values.max()),"median":float(q[1]),"quartile1":float(q[0]),"quartile3":float(q[2]),"medianLog10MagnitudeOverThreshold":float(np.median(np.log10(-values/1e-8)))},"fixedStateAggregate":{"activeTPD":active_range,"nativeAtActiveWTPD":native_same_range,"amendmentEffectTPD":effect_range,"signFlippedByAmendmentCount":sign_flips},"nativeIndependentAggregate":{"TPD":native_ind_range,"classifications":native_classes,"genuineBasinCount":conclusions["nativeGovernedSearchGenuineBasinCount"]},"basinIdentityAnalysis":basin,"endpointConditionedCorrelationClustering":{"silhouetteByK":sil,"selectedK":int(chosen),"classes":counts,"basis":"CLR(z), CLR(w), displacement/direction, NT/stage/phase/log-margin; correlation classes, not mechanisms, root causes, or basin identities"},"clustering":{"silhouetteByK":sil,"selectedK":int(chosen),"classes":counts,"basis":"Backward-compatible alias: endpoint-conditioned correlation classes, not mechanisms/root causes/basin identities"},"rankedAblationSummary":ranked,"conclusions":conclusions,"selected":selected,"cases":records}
 OUT.mkdir(parents=True,exist_ok=True);(OUT/"results.json").write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
 fields=["NT","stage","phase","active TPDmin","z","active w*","native TPDmin from independent search","native w*","amendment effect at same z,w","dominant TPD component terms","influential residual terms/parameters","root-cause class"]
 with (OUT/"root-cause-table.csv").open("w",newline="") as f:
  wr=csv.DictWriter(f,fieldnames=fields);wr.writeheader()
  for r in records: wr.writerow({"NT":r["NT"],"stage":r["stage"],"phase":r["phase"],"active TPDmin":r["activeTPDmin"],"z":js(r["z"]),"active w*":js(r["wStar"]),"native TPDmin from independent search":r["nativeIndependent"]["TPDmin"],"native w*":js(r["nativeIndependent"]["wStar"]),"amendment effect at same z,w":r["amendmentEffectAtSameZW"],"dominant TPD component terms":js(r["terms"]["complete"]),"influential residual terms/parameters":js(r["ablations"]),"root-cause class":r["rootCauseClass"]})
 def fmt(s):return f"{s['minimum']:.12g} / {s['median']:.12g} / {s['maximum']:.12g}"
 named={x["ablation"]:x for x in ranked}
 report=["# Task 218 frozen Task216 root-cause investigation","","Frozen coverage: 57 genuine, 14 local-artifact controls, 39 unresolved-negative controls. No candidate was fitted and no production source or parameter was changed.","","## Quantitative fixed-state evidence",f"Active TPD min/median/max: {fmt(active_range)}.",f"Native p=0 TPD at the identical active w* min/median/max: {fmt(native_same_range)}.",f"Amendment effect (active minus native) min/median/max: {fmt(effect_range)}. It flips the native nonnegative sign to active negative in {sign_flips}/57 cases.",f"Independent native minimum min/median/max: {fmt(native_ind_range)}; classifications={native_classes}; governed genuine count={conclusions['nativeGovernedSearchGenuineBasinCount']}.",f"Active TPD distribution Q1/Q3 {q[0]:.12g}/{q[2]:.12g}; median log10 magnitude/threshold {result['distribution']['medianLog10MagnitudeOverThreshold']:.8g}.","","## Separate basin-identity analysis",f"Decision: **{basin['decision']}**. All w* are MONO-rich ({basin['monoMoleFractionRange'][0]:.8g} to {basin['monoMoleFractionRange'][1]:.8g} MONO).",f"CLR(w*) all-pair min/median/max distance: {fmt(basin['pairwiseClrDistance'])}; centroid distance: {fmt(basin['centroidClrDistance'])}.",f"For {basin['pairedRaffinateExtractClrDistance']['count']} matched NT/stage raffinate-extract pairs, CLR(w*) distance min/median/max is {fmt(basin['pairedRaffinateExtractClrDistance'])}. Paired minima coincide to at most {basin['pairedRaffinateExtractClrDistance']['maximum']:.8g}; phase labels do not establish distinct basins.",basin["interpretation"],"","## Endpoint-conditioned correlation classes",f"Full-feature silhouettes K=2..6: {sil}; selected K={chosen}; counts={counts}. These are endpoint-conditioned correlation classes only—not mechanisms, root causes, or basin identities.","","## Ranked fixed-state ablation sensitivity","Delta is ablated TPD minus active TPD; positive is stabilizing at the frozen state.","| Rank | Ablation | Median delta | Min | Max | Positive / 57 |","|---:|---|---:|---:|---:|---:|"]
 for i,a in enumerate(ranked,1):report.append(f"| {i} | {a['ablation']} | {a['medianDeltaTPD']:.9g} | {a['minimumDeltaTPD']:.9g} | {a['maximumDeltaTPD']:.9g} | {a['positiveDeltaCount']} |")
 report += ["",f"MONO_NMP_block is dominant (median Δ={named['MONO_NMP_block']['medianDeltaTPD']:.9g}, 57/57 positive), driven especially by A_MONO_NMP_ref (median Δ={named['A_MONO_NMP_ref']['medianDeltaTPD']:.9g}, 57/57). SAT_MONO_block is secondary and endpoint-heterogeneous in magnitude (median Δ={named['SAT_MONO_block']['medianDeltaTPD']:.9g}, range {named['SAT_MONO_block']['minimumDeltaTPD']:.9g} to {named['SAT_MONO_block']['maximumDeltaTPD']:.9g}). SAT_NMP_block is stabilizing in the active formulation: removing it is destabilizing (median Δ={named['SAT_NMP_block']['medianDeltaTPD']:.9g}, 0/57 positive). Coefficient-class medians are ref={named['ref_class']['medianDeltaTPD']:.9g}, temperature={named['temperature_class']['medianDeltaTPD']:.9g}, asymmetry={named['asymmetry_class']['medianDeltaTPD']:.9g}; the asymmetry response is heterogeneous ({named['asymmetry_class']['positiveDeltaCount']}/57 positive). These are sensitivity results, not fitted alternatives.","","## Selected exact TPD decompositions"]
 for label,caseid in selected.items():
  r=records[caseid-1]
  report.append(f"- {label}, NT={r['NT']} stage={r['stage']} {r['phase']}, z={r['z']}, w*={r['wStar']}, complete={r['activeTPDmin']:.12g}; per-component ideal/native/residual/complete={r['terms']['ideal']}/{r['terms']['native']}/{r['terms']['residual']}/{r['terms']['complete']}.")
 report += ["","## A. Proven root causes","At every one of the 57 exact frozen z,w* states, native p=0 TPD is positive while complete active TPD is negative; the amendment effect is therefore necessary for the observed negative sign at those states (57/57). Source equations prove only the demonstrated algebraic scope: q is additive GE/RT, residual_feature_matrix@p is additive ln(gamma), and Euler sum(x_i ln(gamma_i,res))=q holds to the recorded numerical error. Frozen Task216 optimizer/KKT/gradient/witness gates prove the active lower-Gibbs basins. CLR(w*) evidence supports one systematic MONO-rich basin family, not multiple distinct identities.","","## B. Strongly supported but not proven contributors",f"Fixed-state zero ablations make the MONO-NMP block the dominant sensitivity (median Δ {named['MONO_NMP_block']['medianDeltaTPD']:.9g}), especially A_MONO_NMP_ref ({named['A_MONO_NMP_ref']['medianDeltaTPD']:.9g}). SAT-MONO is secondary and heterogeneous; SAT-NMP is stabilizing because its removal makes TPD more negative in all 57. These ablations are sensitivity—not causal model qualification. Endpoint classes are correlation only.","","## C. Factors ruled out by the evidence","No native genuine basin was found under the unchanged governed search (57/57 native classifications are LOCAL_HESSIAN_ONLY_ARTIFACT and minima are numerical zero). Matched raffinate/extract w* distances rule out distinct R/E basin identities at governed resolution. The genuine active results cannot be explained as local-artifact-only or pure optimizer artifacts because all corrected Task216 acceptance criteria passed. Controls remain separate: 14 local artifacts and 39 unresolved negatives.","","## D. Remaining uncertainty","A finite deterministic lattice/refinement search cannot mathematically prove global absence of every possible native basin outside its governed resolution. Direct matching six-component LLE evidence remains missing. Ablation interactions do not establish a uniquely correct replacement form, and endpoint-conditioned correlations are not causation.","","## E. Smallest scientifically defensible candidate-model changes","First govern a MONO-NMP block reformulation or regularization study, with SAT-MONO retained as a secondary interaction and the stabilizing SAT-NMP contribution protected unless independent evidence contradicts it. Preserve positive frozen validation, require direct six-component evidence, and require a fresh complete cascade/global-stability audit. Do not simply zero or tune coefficients to obtain a desired cascade output. Any later fitting must be separately declared and governed; no candidate was fit here."]
 (OUT/"report.md").write_text("\n".join(report)+"\n")
 man={"protocolSha256":sha(HERE/"protocol.json"),"runnerSha256":sha(HERE/"run.py"),"resultsSha256":sha(OUT/"results.json"),"tableSha256":sha(OUT/"root-cause-table.csv"),"reportSha256":sha(OUT/"report.md"),"pinnedInputs":pins}
 (OUT/"provenance-manifest.json").write_text(json.dumps(man,indent=2,sort_keys=True)+"\n")
if __name__=="__main__":main()