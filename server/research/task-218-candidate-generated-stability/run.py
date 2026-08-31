#!/usr/bin/env python3
"""Standalone candidate-owned cascade and exact Task216 qualification harness."""
from __future__ import annotations
import hashlib, importlib.util, json, math, os, sys
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]; HERE = Path(__file__).resolve().parent
OUT = ROOT/".agents/outputs/task-218-candidate-generated-stability"; CACHE = OUT/".phase-cache"
JOB = Path("/tmp/job170.json")
CAND = ROOT/".agents/outputs/task-218-root-cause-candidate/results.json"
WORKER = ROOT/"server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py"
COUNTER = ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"
T216 = ROOT/"server/research/task-216-mono-rich-global-stability"

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canonical(v): return json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=False)
def digest(v): return hashlib.sha256(canonical(v).encode()).hexdigest()
def load(path,name):
    s=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(s)
    sys.modules[name]=m; s.loader.exec_module(m); return m
def paths():
    return {
      "candidateProtocolSha256":ROOT/"server/research/task-218-root-cause-candidate/protocol.json","candidateResultsSha256":CAND,"candidateProvenanceSha256":ROOT/".agents/outputs/task-218-root-cause-candidate/provenance-manifest.json",
      "rootCauseProtocolSha256":ROOT/"server/research/task-218-task216-root-cause/protocol.json","rootCauseRunnerSha256":ROOT/"server/research/task-218-task216-root-cause/run.py","rootCauseResultsSha256":ROOT/".agents/outputs/task-218-task216-root-cause/results.json","rootCauseProvenanceSha256":ROOT/".agents/outputs/task-218-task216-root-cause/provenance-manifest.json",
      "task216ProtocolSha256":T216/"protocol.json","task216RunnerSha256":T216/"run.py","task216ResultsSha256":ROOT/".agents/outputs/task-216-mono-rich-global-stability/results.json","task216ProvenanceSha256":ROOT/".agents/outputs/task-216-mono-rich-global-stability/provenance-manifest.json",
      "task206ProtocolSha256":ROOT/"server/research/task-206-stability-constrained-amendment/protocol.json","task206RunnerSha256":ROOT/"server/research/task-206-stability-constrained-amendment/run.py","task206ResultsSha256":ROOT/".agents/outputs/task-206-stability-constrained-amendment/results.json","task206ProvenanceSha256":ROOT/".agents/outputs/task-206-stability-constrained-amendment/provenance-manifest.json",
      "task213ProtocolSha256":ROOT/"server/research/task-213-mono-rich-qualification/protocol.json","task213RunnerSha256":ROOT/"server/research/task-213-mono-rich-qualification/run.py","task213ResultsSha256":ROOT/".agents/outputs/task-213-mono-rich-qualification/results.json","task213ProvenanceSha256":ROOT/".agents/outputs/task-213-mono-rich-qualification/provenance-manifest.json",
      "amendmentModelSha256":ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py","amendmentProtocolSha256":ROOT/"server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json",
      "countercurrentRunnerSha256":COUNTER/"run.py","countercurrentProtocolSha256":COUNTER/"protocol.json","productionWorkerSha256":WORKER,
      "evidenceSha256":ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json","jobExportSha256":JOB}
def main():
    protocol=json.loads((HERE/"protocol.json").read_text()); pins=protocol["pinnedInputs"]
    for k,p in paths().items():
        if not p.is_file() or sha(p)!=pins[k]: raise RuntimeError("PIN_MISMATCH:"+k)
    source=json.loads(JOB.read_text()); worker=load(WORKER,"t218_worker"); audit=load(T216/"run.py","t218_audit")
    if worker.digest(source["input_snapshot"])!=pins["jobInputCanonicalSha256"] or worker.digest(source["result_snapshot"])!=pins["jobResultCanonicalSha256"]: raise RuntimeError("JOB_CANONICAL_HASH_MISMATCH")
    candidate=json.loads(CAND.read_text())
    if candidate["candidateModelSha256"]!=protocol["candidateModelSha256"]: raise RuntimeError("CANDIDATE_MODEL_MISMATCH")
    params=worker.np.asarray(candidate["orderedParameterVector"],float)
    snapshot,s,stage1hash=worker.stage1_from_request(source["input_snapshot"])
    mw=worker.np.asarray([worker.model.base.COMP[n][4] for n in worker.FAMILIES],float)
    feed_mass=worker.np.asarray([s[k] for k in ("saturatesWt","monoAromaticsWt","diAromaticsWt","polyAromaticsWt","polarAromaticsWt","nmpInFeedWt")],float)
    feed=feed_mass/mw; solvent=worker.np.asarray([0,0,0,0,0,100*float(s["solventOilRatio"])],float)/mw
    allm=feed+solvent; amend=json.loads(paths()["amendmentProtocolSha256"].read_text())
    flash=worker.model.flash(worker.FAMILIES,float(s["operatingTemperatureC"])+273.15,allm/allm.sum(),params,amend)
    flash_record={k:worker.plain(flash[k]) for k in ("accepted","optimizerSuccess","equilibriumPolishSuccess","equilibriumPolishResidual","raffinate","extract","betaExtract","minimumTpd","gibbsReduction","isoactivityLogResidual","materialBalanceMaxResidual","maximumCompositionSeparation","postSplitTpd")}
    flash_record["stage1ImmutableSha256"]=stage1hash; flash_hash=digest({"candidateModelSha256":protocol["candidateModelSha256"],"flash":flash_record})
    seed={"raffinate":worker.np.asarray(flash["raffinate"]),"extract":worker.np.asarray(flash["extract"]),"beta":float(flash["betaExtract"]),"mw":mw}
    counter=json.loads((COUNTER/"protocol.json").read_text()); previous=None; trials=[]; raw=[]
    CACHE.mkdir(parents=True,exist_ok=True)
    for nt in range(1,11):
        cascade_binding={"candidateModelSha256":protocol["candidateModelSha256"],"candidateFlashHash":flash_hash,"countercurrentProtocolSha256":pins["countercurrentProtocolSha256"],"countercurrentRunnerSha256":pins["countercurrentRunnerSha256"],"stageCount":nt,"previousTrialHash":trials[-1]["trialHash"] if previous is not None else None}
        cp=CACHE/f"cascade-{nt:02d}.json"; core=None
        if cp.is_file():
            cached=json.loads(cp.read_text())
            if cached.get("cacheBinding")==cascade_binding: core=cached["trial"]
        if core is None:
            # A branch is an independently solved immutable start.  Persist its
            # completed scipy result so a wall-clock interruption between the
            # two starts never forces an accepted branch to be recomputed.
            original_solve_branch=worker.cc.solve_branch
            def resumable_branch(residual,start,stage_count,total,bounds,jacobian_pattern,closure_limit,branch):
                branch_binding={**cascade_binding,"branch":branch}
                bp=CACHE/f"cascade-{nt:02d}-{branch}.json"
                if bp.is_file():
                    saved=json.loads(bp.read_text())
                    if saved.get("cacheBinding")==branch_binding:
                        value=saved["solution"]
                        evidence=saved["evidence"]
                        return SimpleNamespace(
                            x=worker.np.asarray(value["x"],float),
                            fun=worker.np.asarray(value["fun"],float),
                            success=bool(evidence["solverSuccess"]),
                            status=1 if evidence["solverSuccess"] else 0,
                            terminationStatus=evidence["terminationStatus"],
                            message=evidence["terminationMessage"],
                            nfev=int(evidence["functionEvaluations"]),
                            njev=int(evidence["jacobianEvaluations"]),
                            cost=float(evidence["cost"]),
                            optimality=(
                                float(evidence["optimality"])
                                if evidence["optimality"] is not None
                                else math.nan
                            ),
                        ),evidence
                solution,evidence=original_solve_branch(residual,start,stage_count,total,bounds,jacobian_pattern,closure_limit,branch)
                bp.write_text(json.dumps({"cacheBinding":branch_binding,"solution":{"x":worker.plain(solution.x),"fun":worker.plain(solution.fun)},"evidence":worker.plain(evidence)},sort_keys=True)+"\n")
                return solution,evidence
            worker.cc.solve_branch=resumable_branch
            try:
                trial=worker.cc.solve_cascade(nt,float(s["operatingTemperatureC"])+273.15,feed,solvent,params,counter,seed,previous)
            finally:
                worker.cc.solve_branch=original_solve_branch
            streams=trial.pop("_streamSolution"); trial.pop("_raffinateProduct")
            stream_record={"raffinateComponentMoles":worker.plain(streams[0]),"extractComponentMoles":worker.plain(streams[1])}
            core={"stageCount":nt,"trial":worker.plain(trial),"generatedStreams":stream_record}
            core["trialHash"]=digest({"candidateModelSha256":protocol["candidateModelSha256"],"candidateFlashHash":flash_hash,**core})
            cp.write_text(json.dumps({"cacheBinding":cascade_binding,"trial":core},sort_keys=True)+"\n")
        streams=(worker.np.asarray(core["generatedStreams"]["raffinateComponentMoles"],float),worker.np.asarray(core["generatedStreams"]["extractComponentMoles"],float))
        trials.append(core); raw.append(streams)
        if core["trial"]["residualClosureStatus"]=="CLOSED": previous=streams
        print(f"TASK218_CASCADE_PROGRESS {nt} 10",file=sys.stderr,flush=True)
    execution_hash=digest({"candidateModelSha256":protocol["candidateModelSha256"],"candidateFlashHash":flash_hash,"trials":trials})
    endpoints=[]
    for core,streams in zip(trials,raw):
        for stage in range(core["stageCount"]):
            for phase,array in (("raffinate",streams[0]),("extract",streams[1])):
                comp=(array[stage]/array[stage].sum()).tolist()
                identity={"trialStageCount":core["stageCount"],"stageFromFeedEnd":stage+1,"phase":phase}
                payload={"candidateModelSha256":protocol["candidateModelSha256"],"cascadeExecutionHash":execution_hash,"trialHash":core["trialHash"],**identity,"composition":comp}
                endpoints.append({**identity,"composition":comp,"trialHash":core["trialHash"],"endpointHash":digest(payload)})
    matrix_hash=digest({"candidateModelSha256":protocol["candidateModelSha256"],"cascadeExecutionHash":execution_hash,"orderedEndpoints":endpoints})
    phases=[]
    task216_protocol=json.loads((T216/"protocol.json").read_text())
    shard_value=os.environ.get("TASK218_AUDIT_SHARD")
    shard_index=shard_count=None
    if shard_value:
        shard_index,shard_count=(int(value) for value in shard_value.split("/",1))
        if not (0 <= shard_index < shard_count):
            raise ValueError("TASK218_AUDIT_SHARD_INVALID")
    for i,ep in enumerate(endpoints,1):
        if shard_count is not None and (i-1) % shard_count != shard_index:
            continue
        binding={"candidateModelSha256":protocol["candidateModelSha256"],"cascadeExecutionHash":execution_hash,"endpointMatrixHash":matrix_hash,"endpointHash":ep["endpointHash"],"task216ProtocolSha256":pins["task216ProtocolSha256"],"task216RunnerSha256":pins["task216RunnerSha256"]}
        cp=CACHE/(f"{i:03d}-{ep['endpointHash']}.json"); row=None
        if cp.is_file():
            cached=json.loads(cp.read_text())
            if cached.get("cacheBinding")==binding: row=cached["phase"]
        if row is None:
            row=audit.qualify_phase(worker.cc,worker.cc.model.tpd_search,worker.FAMILIES,float(s["operatingTemperatureC"])+273.15,ep["composition"],params,task216_protocol,counter,{k:ep[k] for k in ("trialStageCount","stageFromFeedEnd","phase")})
            row["modelIdentity"]="COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL / TASK218_RESEARCH_CANDIDATE"
            row["modelSha256"]=protocol["candidateModelSha256"]; row["endpointHash"]=ep["endpointHash"]
            cp.write_text(json.dumps({"cacheBinding":binding,"phase":row},sort_keys=True)+"\n")
        phases.append(row); print(f"TASK218_TPD_PROGRESS {i} {len(endpoints)}",file=sys.stderr,flush=True)
    if shard_count is not None:
        print(
            f"TASK218_TPD_SHARD_COMPLETE {shard_index} {shard_count} {len(phases)}",
            file=sys.stderr,
            flush=True,
        )
        return
    audit_hash=digest({"candidateModelSha256":protocol["candidateModelSha256"],"cascadeExecutionHash":execution_hash,"endpointMatrixHash":matrix_hash,"task216ProtocolSha256":pins["task216ProtocolSha256"],"task216RunnerSha256":pins["task216RunnerSha256"],"phases":phases})
    neg=[p for p in phases if p["minimum"]<protocol["postSplitTpdThreshold"] or p["productionHelper"]["minimum"]<protocol["postSplitTpdThreshold"]]
    genuine=[p for p in phases if p["fullyReproducedNegative"]]
    cascade_blockers=[]
    for t in trials:
        tr=t["trial"]; ms=tr["multistartEvidence"]
        if ms["primary"]["residualClosureStatus"]!="CLOSED": cascade_blockers.append("COUPLED_SOLVER_CLOSURE_FAILED")
        if ms["secondary"]["residualClosureStatus"]!="CLOSED": cascade_blockers.append("MULTISTART_SECONDARY_CLOSURE_FAILED")
        if not ms["branchReproduced"]: cascade_blockers.append("MULTISTART_BRANCH_REPRODUCTION_FAILED")
        if not tr["accepted"]: cascade_blockers.append("CANDIDATE_CASCADE_LOCAL_OR_GLOBAL_STABILITY_FAILED")
    blockers=list(candidate["blockers"])
    if not flash["accepted"]: blockers.append("CANDIDATE_STAGE1_TWO_LIQUID_SEED_NOT_ACCEPTED")
    blockers += cascade_blockers
    if neg: blockers.append("POST_SPLIT_TPD_STABILITY_FAILED")
    blockers=list(dict.fromkeys(blockers))
    gates={"candidateValidationPassed":all(v["status"]=="PASS" for v in candidate["frozenValidation"].values()),"tieLinePassed":candidate["carriedTopologyAndTieLineGates"]["tieLineStatus"]=="PASS","topologyPassed":candidate["carriedTopologyAndTieLineGates"]["topologyStatus"]=="PASS","directEvidenceAvailable":candidate["directMatchingSixComponentEvidenceAvailable"],"flashAccepted":bool(flash["accepted"]),"allPrimaryClosed":all(t["trial"]["multistartEvidence"]["primary"]["residualClosureStatus"]=="CLOSED" for t in trials),"allSecondaryClosed":all(t["trial"]["multistartEvidence"]["secondary"]["residualClosureStatus"]=="CLOSED" for t in trials),"allBranchesReproduced":all(t["trial"]["multistartEvidence"]["branchReproduced"] for t in trials),"allCascadeStagesAccepted":all(t["trial"]["accepted"] for t in trials),"allGlobalTpdPassed":not neg}
    qualification_hash=digest({"candidateModelSha256":protocol["candidateModelSha256"],"candidateFlashHash":flash_hash,"cascadeExecutionHash":execution_hash,"endpointMatrixHash":matrix_hash,"auditHash":audit_hash,"gates":gates,"blockers":blockers})
    historical={"disposition":"DIAGNOSTIC_ONLY_HISTORICAL","task216":{"protocolSha256":pins["task216ProtocolSha256"],"runnerSha256":pins["task216RunnerSha256"],"resultsSha256":pins["task216ResultsSha256"],"provenanceSha256":pins["task216ProvenanceSha256"],"phaseCount":len(json.loads(paths()["task216ResultsSha256"].read_text())["phases"])},"task206":{"protocolSha256":pins["task206ProtocolSha256"],"runnerSha256":pins["task206RunnerSha256"],"resultsSha256":pins["task206ResultsSha256"],"provenanceSha256":pins["task206ProvenanceSha256"]}}
    result={"schemaVersion":"1.0.0","analysis":protocol["analysis"],**protocol["governance"],"candidateModelSha256":protocol["candidateModelSha256"],"candidateParameterVector":params.tolist(),"candidateParameterSha256":digest(params.tolist()),"candidateStage1Flash":flash_record,"candidateFlashHash":flash_hash,"cascadeTrials":trials,"cascadeExecutionHash":execution_hash,"endpointMatrix":endpoints,"endpointMatrixHash":matrix_hash,"phases":phases,"auditHash":audit_hash,"coverage":{"expected":110,"returned":len(phases),"negativeOrUnresolved":len(neg),"fullyReproducedNegative":len(genuine),"classifications":dict(Counter(p["classification"] for p in phases))},"gates":gates,"blockers":blockers,"qualified":not blockers and all(gates.values()),"status":"QUALIFIED" if not blockers and all(gates.values()) else "BLOCKED_FAIL_CLOSED","qualificationHash":qualification_hash,"historicalComparisons":historical,"pinnedInputs":pins}
    OUT.mkdir(parents=True,exist_ok=True); rp=OUT/"results.json"; rp.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n")
    report=["# Task 218 candidate-generated stability qualification","",f"Status: `{result['status']}`; qualified: `{result['qualified']}`.",f"Candidate: `{protocol['candidateModelSha256']}`",f"Cascade execution: `{execution_hash}`",f"Endpoint matrix ({len(endpoints)}): `{matrix_hash}`",f"Task216 audit: `{audit_hash}`",f"Final qualification: `{qualification_hash}`","",f"Negative or unresolved endpoints: {len(neg)}; fully reproduced negative endpoints: {len(genuine)}.","","## Gates",*[f"- {k}: `{v}`" for k,v in gates.items()],"","## Blockers",*([f"- `{x}`" for x in blockers] or ["- none"])]
    (OUT/"report.md").write_text("\n".join(report)+"\n")
    manifest={"protocolSha256":sha(HERE/"protocol.json"),"runnerSha256":sha(HERE/"run.py"),"verifierSha256":sha(HERE/"verify.py"),"resultsSha256":sha(rp),"reportSha256":sha(OUT/"report.md"),"candidateModelSha256":protocol["candidateModelSha256"],"candidateFlashHash":flash_hash,"cascadeExecutionHash":execution_hash,"endpointMatrixHash":matrix_hash,"auditHash":audit_hash,"qualificationHash":qualification_hash,"pinnedInputs":pins,"cacheDisposition":"EXCLUDED_EPHEMERAL_RESUMABLE"}
    (OUT/"provenance-manifest.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
    print(json.dumps({"status":result["status"],"coverage":len(phases),"blockers":blockers,"hashes":{"candidate":protocol["candidateModelSha256"],"cascade":execution_hash,"matrix":matrix_hash,"audit":audit_hash,"qualification":qualification_hash}},sort_keys=True))
if __name__=="__main__": main()