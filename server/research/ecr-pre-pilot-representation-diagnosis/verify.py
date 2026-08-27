#!/usr/bin/env python3
from pathlib import Path
import subprocess,sys,json,hashlib
H=Path(__file__).resolve().parent;R=H.parents[2];O=R/".agents/outputs/ecr-pre-pilot-representation-diagnosis"
subprocess.run([sys.executable,str(H/"run.py")],check=True)
a=(O/"results.json").read_bytes(); subprocess.run([sys.executable,str(H/"run.py")],check=True); assert a==(O/"results.json").read_bytes()
x=json.loads(a); assert x["inventory"]["analogue_rows"]==219 and x["inventory"]["coto_rows"]==17
assert json.loads((O/"audit.json").read_text())["status"]=="PASS" and (O/"report.md").stat().st_size>5000
assert len(x["inventory"]["systems"])==6 and len(x["inventory"]["graph"]["connected_components"])==1
assert len(x["inventory"]["graph"]["edges"])==13
assert x["qualified_model_evidence"]["A_NRTL_family_global"]["solver_audit"]=="PASS"
assert x["qualified_model_evidence"]["B_UNIQUAC_row_rq_family_interactions"]["solver_audit"]=="PASS"
assert x["in_locus_interpolation_benchmark"]["rows"]>100
assert x["in_locus_interpolation_benchmark"]["rmsd"]<.03
assert all(Path(R/p).exists() and hashlib.sha256(Path(R/p).read_bytes()).hexdigest()==h for p,h in x["sources"].items())
m=json.loads((O/"provenance-manifest.json").read_text())
assert all(hashlib.sha256((O/p).read_bytes()).hexdigest()==h for p,h in m["outputs"].items())
audit=json.loads((O/"audit.json").read_text())
assert audit["checks"]["graph_has_13_unique_undirected_edges"] and "not a representation lower bound" in audit["limitations"][1]
report=(O/"report.md").read_text()
assert "13 unique undirected edges" in report and "not a representation lower bound" in report
assert x["sources"]["server/engine-framework/cel/coto2022-nmp-lle.ts"]=="8253433f5624934b7f9135f223090e8b9e2c5b1cbfaee06c951a3d87b839ea42"
assert x["sources"]["server/engine-framework/cel/data/multi-t-nmp-lle.json"]=="72d16b9544cebb3f5d55def342684fd3414707e9e84b27c558b6a7e6f6409c28"
# A completed controlled comparison is mandatory: aggregate rejects missing,
# stale, or mismatched per-case checkpoints before it writes an aggregate.
ctl=H/"controlled_uniquac.py"
need=subprocess.run([sys.executable,str(ctl),"--list"],capture_output=True,text=True,check=True).stdout.splitlines()
cp=O/"controlled-uniquac-cases"
missing=[c for c in need if not (cp/(c.replace(":","__").replace("=","_")+".json")).exists()]
assert not missing, "missing controlled cases: "+", ".join(missing)
docs=[json.loads((cp/(z.replace(":","__").replace("=","_")+".json")).read_text()) for z in need]
assert all(z["format"]=="controlled-uniquac-case-v2" and z["config"]==docs[0]["config"] for z in docs)
assert all(z["solver_audit"]["all_seed_contracts_pass"] and z["solver_audit"]["all_two_phase_independent_final_checks_pass"] for z in docs)
for z in docs:
 for r in z["row_records"]:
  if r["squared_error_sum"] is not None: assert abs(r["squared_error_sum"]-sum(e*e for e in r["component_errors"]))<1e-12 and r["component_count"]==len(r["component_errors"])
subprocess.run([sys.executable,str(ctl),"--aggregate"],check=True)
c=json.loads((O/"controlled-uniquac.json").read_text());assert c["aggregate_status"]=="COMPLETE"
assert c["format"]=="controlled-uniquac-aggregate-v2" and c["config"]==docs[0]["config"]
for letter in ("A","B"):
 rs=[r for z in docs if z["case"].startswith(letter+":T=") for r in z["row_records"] if r["squared_error_sum"] is not None]
 p=c["pooled"][letter]; assert p["accepted_count"]==len(rs) and abs(p["accepted_sse"]-sum(r["squared_error_sum"] for r in rs))<1e-12
 assert abs(p["accepted_tie_line_rmsd"]-(sum(r["squared_error_sum"] for r in rs)/sum(r["component_count"] for r in rs))**.5)<1e-12
ar={r["id"]:r for z in docs if z["case"].startswith("A:T=") for r in z["row_records"] if r["squared_error_sum"] is not None}
br={r["id"]:r for z in docs if z["case"].startswith("B:T=") for r in z["row_records"] if r["squared_error_sum"] is not None}
common=sorted(set(ar)&set(br))
assert c["common_support"]["intersection_count"]==len(common)
for letter,rr in (("A",ar),("B",br)):
 rmsd=(sum(rr[i]["squared_error_sum"] for i in common)/sum(rr[i]["component_count"] for i in common))**.5
 assert abs(c["common_support"][letter+"_rmsd"]-rmsd)<1e-12
delta=[br[i]["compositionRmsd"]-ar[i]["compositionRmsd"] for i in common]
paired=c["common_support"]["B_minus_A_row_rmsd"]
assert paired["B_better_count"]==sum(v<0 for v in delta)
assert paired["A_better_count"]==sum(v>0 for v in delta)
assert paired["tie_count"]==sum(v==0 for v in delta)
assert abs(paired["mean"]-sum(delta)/len(delta))<1e-12
assert abs(paired["median"]-sorted(delta)[len(delta)//2])<1e-12
assert x["controlled_same_equation_uniquac"]["common_support"]==c["common_support"]
assert len([p for p in x["sources"] if "controlled-uniquac-cases/" in p])==20
assert "0.065212691984" in report and "0.023377757058" in report
assert "104" in report and "110" in report
assert audit["checks"]["all_20_controlled_cases_complete_and_hash_matched"]
assert audit["checks"]["controlled_pooled_metrics_recomputed"]
print("verified deterministic representation diagnosis")