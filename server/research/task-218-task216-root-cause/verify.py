#!/usr/bin/env python3
import hashlib,json,csv,math,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];H=Path(__file__).parent;O=ROOT/".agents/outputs/task-218-task216-root-cause"
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def clr(x):
 l=[math.log(v) for v in x];m=sum(l)/len(l);return [v-m for v in l]
def dist(a,b):return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
def close(a,b,t=1e-11):return abs(a-b)<=t*max(1,abs(a),abs(b))
def summ(a):
 a=sorted(a);return {"minimum":a[0],"median":statistics.median(a),"maximum":a[-1],"count":len(a)}
def main():
 r=json.loads((O/"results.json").read_text());m=json.loads((O/"provenance-manifest.json").read_text())
 assert len(r["cases"])==57 and r["coverage"]["localArtifactControls"]==14 and r["coverage"]["unresolvedNegativeControls"]==39
 assert max(abs(x["activeTPDmin"]-x["frozenTPDmin"]) for x in r["cases"])<1e-10
 assert r["algebra"]["verifiedMaximumAbsoluteError"]<1e-10 and set(r["endpointConditionedCorrelationClustering"]["silhouetteByK"])==set("23456")
 assert all(len(x["ablations"])==18 for x in r["cases"]) # 9 OAT+3 blocks+3 pairs+3 classes
 # Recompute exact component sums, amendment sign flip, distributions and ablations.
 for x in r["cases"]:
  assert close(sum(x["terms"]["complete"]),x["activeTPDmin"])
  assert all(close(i+n+q,c) for i,n,q,c in zip(x["terms"]["ideal"],x["terms"]["native"],x["terms"]["residual"],x["terms"]["complete"]))
  assert close(x["activeTPDmin"]-x["nativeTPDAtActiveW"],x["amendmentEffectAtSameZW"])
 assert sum(x["activeTPDmin"]<0<=x["nativeTPDAtActiveW"] for x in r["cases"])==r["conclusions"]["activeSignFlippedByAmendmentCount"]==57
 assert sum(x["nativeIndependent"]["genuine"] for x in r["cases"])==r["nativeIndependentAggregate"]["genuineBasinCount"]==0
 expected=[]
 for name in sorted(r["cases"][0]["ablations"]):
  d=[x["ablations"][name]-x["activeTPDmin"] for x in r["cases"]]
  expected.append((name,statistics.median(d),min(d),max(d),sum(v>0 for v in d)))
 got={x["ablation"]:x for x in r["rankedAblationSummary"]}
 assert len(got)==18
 for name,med,lo,hi,pos in expected:
  assert close(got[name]["medianDeltaTPD"],med) and close(got[name]["minimumDeltaTPD"],lo) and close(got[name]["maximumDeltaTPD"],hi) and got[name]["positiveDeltaCount"]==pos
 # Independently recompute CLR(w*) basin spread and paired R/E coincidence.
 W=[clr(x["wStar"]) for x in r["cases"]];cent=[sum(x[j] for x in W)/57 for j in range(6)]
 pairs=[dist(W[i],W[j]) for i in range(57) for j in range(i)]
 by={}
 for i,x in enumerate(r["cases"]):by.setdefault((x["NT"],x["stage"]),[]).append(i)
 re=[dist(W[v[0]],W[v[1]]) for v in by.values() if len(v)==2 and r["cases"][v[0]]["phase"]!=r["cases"][v[1]]["phase"]]
 for key,val in (("pairwiseClrDistance",summ(pairs)),("centroidClrDistance",summ([dist(x,cent) for x in W])),("pairedRaffinateExtractClrDistance",summ(re))):
  assert all(close(r["basinIdentityAnalysis"][key][q],val[q]) for q in ("minimum","median","maximum")) and r["basinIdentityAnalysis"][key]["count"]==val["count"]
 assert r["basinIdentityAnalysis"]["decision"]=="ONE_SYSTEMATIC_MONO_RICH_BASIN_FAMILY"
 rows=list(csv.DictReader((O/"root-cause-table.csv").open()));assert len(rows)==57
 assert all("single-MONO-rich-basin-family" in x["root-cause class"] and "endpoint-correlation-class-" in x["root-cause class"] for x in rows)
 text=(O/"report.md").read_text()
 assert all(s in text for s in ("## A. Proven root causes","## B. Strongly supported but not proven contributors","## C. Factors ruled out by the evidence","## D. Remaining uncertainty","## E. Smallest scientifically defensible candidate-model changes","MONO_NMP_block","A_MONO_NMP_ref","SAT_NMP_block","No candidate was fitted"))
 pins={"task216ResultsSha256":ROOT/".agents/outputs/task-216-mono-rich-global-stability/results.json","task216ProtocolSha256":ROOT/"server/research/task-216-mono-rich-global-stability/protocol.json","task216RunnerSha256":ROOT/"server/research/task-216-mono-rich-global-stability/run.py","task216ProvenanceSha256":ROOT/".agents/outputs/task-216-mono-rich-global-stability/provenance-manifest.json","amendmentModelSha256":ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py","baseCosmoSacSourceSha256":ROOT/"server/research/ecr-pre-pilot-cosmosac/run.py","baseCosmoSacProvenanceSha256":ROOT/"server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json"}
 assert all(r["pinnedInputs"][k]==sha(v) for k,v in pins.items())
 for k,p in {"protocolSha256":H/"protocol.json","runnerSha256":H/"run.py","resultsSha256":O/"results.json","tableSha256":O/"root-cause-table.csv","reportSha256":O/"report.md"}.items():assert m[k]==sha(p),k
 assert r["governance"]["candidateParametersFit"] is False and r["governance"]["productionModelModified"] is False
 print("PASS task-218-task216-root-cause")
if __name__=="__main__":main()