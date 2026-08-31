#!/usr/bin/env python3
"""Independent structural, numerical-lineage, classification, and governance verifier."""
from __future__ import annotations
import importlib.util, json, math, sys
from collections import Counter
from pathlib import Path

HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]
OUT=ROOT/".agents/outputs/task-218-candidate-generated-stability"
spec=importlib.util.spec_from_file_location("t218_generated_runner_verify",HERE/"run.py")
run=importlib.util.module_from_spec(spec); sys.modules[spec.name]=run; spec.loader.exec_module(run)
def req(x,code):
    if not x: raise RuntimeError(code)
def expected_classification(row,protocol):
    t=protocol["task216Methods"]["acceptanceTolerances"]; threshold=protocol["postSplitTpdThreshold"]
    routes=[r for r in row["optimizers"] if r["success"] and r["objective"]<threshold and r["simplexKktInfinityNorm"]<=t["simplexProjectedKktInfinityNorm"] and r["logitKktInfinityNorm"]<=t["logitKktInfinityNorm"]]
    agree=len(routes)>=2 and max(r["objective"] for r in routes)-min(r["objective"] for r in routes)<=t["optimizerAgreement"]
    helper=row["productionHelper"]
    criteria={
      "directMinimumNegative":row["minimum"]<threshold,
      "productionHelperNegative":helper["minimum"]<threshold,
      "twoIndependentAcceptedOptimizerRoutesAgreeNegative":agree,
      "productionHelperObjectiveReproducedIndependently":math.isfinite(helper["minimum"]) and abs(helper["independentlyAssembledTpdAtReportedComposition"]-helper["minimum"])<=t["productionHelperObjectiveReproduction"],
      "simplexAndLogitKktAccepted":row["simplexKktInfinityNorm"]<=t["simplexProjectedKktInfinityNorm"] and row["logitKktInfinityNorm"]<=t["logitKktInfinityNorm"],
      "analyticFiniteDifferenceGradientAgreement":row["gradientAgreement"]["referenceLogitMaximumAbsoluteDifference"] is not None and row["gradientAgreement"]["referenceLogitMaximumAbsoluteDifference"]<=t["analyticFiniteDifferenceGradientMaximumAbsoluteDifference"] and row["gradientAgreement"]["minimumLogitMaximumAbsoluteDifference"] is not None and row["gradientAgreement"]["minimumLogitMaximumAbsoluteDifference"]<=t["analyticFiniteDifferenceGradientMaximumAbsoluteDifference"],
      "deterministicPerturbationLocalMinimum":all(p["plus"]>=row["minimum"]-t["localPerturbationObjectiveTolerance"] and p["minus"]>=row["minimum"]-t["localPerturbationObjectiveTolerance"] for p in row["deterministicPerturbations"]),
      "lowerGibbsWitness":any(w["feasible"] and w["gibbsDifference"]<t["lowerGibbsWitness"] for w in row["splitWitness"]),
    }
    genuine=all(criteria.values()); boundary=min(row["minimumComposition"])<=10*protocol["task216Methods"]["compositionFloor"]
    if genuine: classification="GENUINE_LOWER_GIBBS_BOUNDARY_BASIN" if boundary else "GENUINE_LOWER_GIBBS_BASIN"
    elif row["minimum"]<threshold: classification="OPTIMIZER_REFINEMENT_FAILURE"
    elif boundary: classification="BOUNDARY_ARTIFACT"
    elif helper["minimum"]>=threshold: classification="LOCAL_HESSIAN_ONLY_ARTIFACT"
    else: classification="STABLE_PHASE"
    return criteria,genuine,classification
def main():
    protocol=json.loads((HERE/"protocol.json").read_text()); result=json.loads((OUT/"results.json").read_text()); manifest=json.loads((OUT/"provenance-manifest.json").read_text())
    for k,p in {"protocolSha256":HERE/"protocol.json","runnerSha256":HERE/"run.py","verifierSha256":HERE/"verify.py","resultsSha256":OUT/"results.json","reportSha256":OUT/"report.md"}.items(): req(manifest[k]==run.sha(p),"ARTIFACT_HASH_MISMATCH:"+k)
    req(protocol["pinnedInputs"]==result["pinnedInputs"]==manifest["pinnedInputs"],"PIN_SET_MISMATCH")
    for k,p in run.paths().items(): req(p.is_file() and run.sha(p)==protocol["pinnedInputs"][k],"PIN_MISMATCH:"+k)
    worker=run.load(run.WORKER,"t218_verify_worker"); source=json.loads(run.JOB.read_text())
    req(worker.digest(source["input_snapshot"])==protocol["pinnedInputs"]["jobInputCanonicalSha256"],"JOB_INPUT_CANONICAL_HASH_MISMATCH")
    req(worker.digest(source["result_snapshot"])==protocol["pinnedInputs"]["jobResultCanonicalSha256"],"JOB_RESULT_CANONICAL_HASH_MISMATCH")
    candidate=json.loads(run.CAND.read_text()); req(candidate["candidateModelSha256"]==result["candidateModelSha256"]==protocol["candidateModelSha256"],"CANDIDATE_HASH_MISMATCH")
    req(candidate["orderedParameterVector"]==result["candidateParameterVector"],"CANDIDATE_PARAMETERS_SUBSTITUTED")
    req(run.digest(result["candidateParameterVector"])==result["candidateParameterSha256"],"CANDIDATE_PARAMETER_HASH_MISMATCH")
    req(len(result["candidateParameterVector"])==9 and all(math.isfinite(x) for x in result["candidateParameterVector"]),"CANDIDATE_PARAMETER_INVALID")
    flash_hash=run.digest({"candidateModelSha256":result["candidateModelSha256"],"flash":result["candidateStage1Flash"]})
    req(flash_hash==result["candidateFlashHash"]==manifest["candidateFlashHash"],"FLASH_HASH_MISMATCH")
    trials=result["cascadeTrials"]; req([t["stageCount"] for t in trials]==list(range(1,11)),"TRIAL_ORDER_MISMATCH")
    for t in trials:
        core={k:t[k] for k in ("stageCount","trial","generatedStreams")}
        req(run.digest({"candidateModelSha256":result["candidateModelSha256"],"candidateFlashHash":flash_hash,**core})==t["trialHash"],"TRIAL_HASH_MISMATCH")
        req(len(t["generatedStreams"]["raffinateComponentMoles"])==t["stageCount"] and len(t["generatedStreams"]["extractComponentMoles"])==t["stageCount"],"TRIAL_STREAM_COVERAGE_MISMATCH")
        for stream in t["generatedStreams"]["raffinateComponentMoles"]+t["generatedStreams"]["extractComponentMoles"]:
            req(len(stream)==6 and all(math.isfinite(x) and x>0 for x in stream),"TRIAL_STREAM_INVALID")
    cascade_hash=run.digest({"candidateModelSha256":result["candidateModelSha256"],"candidateFlashHash":flash_hash,"trials":trials})
    req(cascade_hash==result["cascadeExecutionHash"]==manifest["cascadeExecutionHash"],"CASCADE_HASH_MISMATCH")
    endpoints=result["endpointMatrix"]; expected=[(nt,st,ph) for nt in range(1,11) for st in range(1,nt+1) for ph in ("raffinate","extract")]
    req(len(endpoints)==110 and [(e["trialStageCount"],e["stageFromFeedEnd"],e["phase"]) for e in endpoints]==expected,"ENDPOINT_EXACT_ORDER_OR_COUNT_MISMATCH")
    trialmap={t["stageCount"]:t for t in trials}
    for ep in endpoints:
        t=trialmap[ep["trialStageCount"]]; key="raffinateComponentMoles" if ep["phase"]=="raffinate" else "extractComponentMoles"; flow=t["generatedStreams"][key][ep["stageFromFeedEnd"]-1]; total=sum(flow); comp=[x/total for x in flow]
        req(max(abs(a-b) for a,b in zip(comp,ep["composition"]))<=2e-15 and abs(sum(ep["composition"])-1)<=2e-12,"ENDPOINT_TRIAL_DERIVATION_MISMATCH")
        payload={"candidateModelSha256":result["candidateModelSha256"],"cascadeExecutionHash":cascade_hash,"trialHash":t["trialHash"],"trialStageCount":ep["trialStageCount"],"stageFromFeedEnd":ep["stageFromFeedEnd"],"phase":ep["phase"],"composition":ep["composition"]}
        req(ep["trialHash"]==t["trialHash"] and ep["endpointHash"]==run.digest(payload),"ENDPOINT_HASH_MISMATCH")
    matrix_hash=run.digest({"candidateModelSha256":result["candidateModelSha256"],"cascadeExecutionHash":cascade_hash,"orderedEndpoints":endpoints})
    req(matrix_hash==result["endpointMatrixHash"]==manifest["endpointMatrixHash"],"MATRIX_HASH_MISMATCH")
    phases=result["phases"]; req(len(phases)==110,"PHASE_COUNT_MISMATCH")
    negatives=[]; genuine=[]
    for ep,row,key in zip(endpoints,phases,expected):
        req((row["trialStageCount"],row["stageFromFeedEnd"],row["phase"])==key and row["endpointHash"]==ep["endpointHash"],"PHASE_ENDPOINT_SUBSTITUTED_OR_REORDERED")
        req(
            max(
                abs(a-b)
                for a,b in zip(row["referenceComposition"],ep["composition"])
            ) <= 2e-15
            and abs(sum(row["referenceComposition"])-1) <= 2e-12,
            "PHASE_COMPOSITION_MISMATCH",
        )
        req(row["modelSha256"]==result["candidateModelSha256"] and row["parameterVectorSha256"]==result["candidateParameterSha256"],"PHASE_MODEL_IDENTITY_MISMATCH")
        criteria,isg,classification=expected_classification(row,protocol)
        req(criteria==row["reproductionCriteria"] and isg is row["fullyReproducedNegative"] and classification==row["classification"],"PHASE_CLASSIFICATION_MISMATCH")
        if row["minimum"]<protocol["postSplitTpdThreshold"] or row["productionHelper"]["minimum"]<protocol["postSplitTpdThreshold"]: negatives.append(row)
        if isg: genuine.append(row)
    audit_hash=run.digest({"candidateModelSha256":result["candidateModelSha256"],"cascadeExecutionHash":cascade_hash,"endpointMatrixHash":matrix_hash,"task216ProtocolSha256":protocol["pinnedInputs"]["task216ProtocolSha256"],"task216RunnerSha256":protocol["pinnedInputs"]["task216RunnerSha256"],"phases":phases})
    req(audit_hash==result["auditHash"]==manifest["auditHash"],"AUDIT_HASH_MISMATCH")
    req(result["coverage"]=={"expected":110,"returned":110,"negativeOrUnresolved":len(negatives),"fullyReproducedNegative":len(genuine),"classifications":dict(Counter(p["classification"] for p in phases))},"COVERAGE_DERIVATION_MISMATCH")
    historical=result["historicalComparisons"]; req(historical["disposition"]=="DIAGNOSTIC_ONLY_HISTORICAL" and historical["task216"]["phaseCount"]==110,"HISTORICAL_EVIDENCE_MISSING_OR_PROMOTED")
    for family in ("task216","task206"):
        for name,value in historical[family].items():
            if name.endswith("Sha256"): req(value==protocol["pinnedInputs"][family+name[0].upper()+name[1:]],"HISTORICAL_HASH_SUBSTITUTION")
    expected_blockers=list(candidate["blockers"])
    if not result["candidateStage1Flash"]["accepted"]: expected_blockers.append("CANDIDATE_STAGE1_TWO_LIQUID_SEED_NOT_ACCEPTED")
    for t in trials:
        tr=t["trial"]; ms=tr["multistartEvidence"]
        if ms["primary"]["residualClosureStatus"]!="CLOSED": expected_blockers.append("COUPLED_SOLVER_CLOSURE_FAILED")
        if ms["secondary"]["residualClosureStatus"]!="CLOSED": expected_blockers.append("MULTISTART_SECONDARY_CLOSURE_FAILED")
        if not ms["branchReproduced"]: expected_blockers.append("MULTISTART_BRANCH_REPRODUCTION_FAILED")
        if not tr["accepted"]: expected_blockers.append("CANDIDATE_CASCADE_LOCAL_OR_GLOBAL_STABILITY_FAILED")
    if negatives: expected_blockers.append("POST_SPLIT_TPD_STABILITY_FAILED")
    expected_blockers=list(dict.fromkeys(expected_blockers)); req(result["blockers"]==expected_blockers,"BLOCKER_DERIVATION_MISMATCH")
    gates=result["gates"]; req(gates["candidateValidationPassed"]==all(v["status"]=="PASS" for v in candidate["frozenValidation"].values()) and gates["tieLinePassed"]==(candidate["carriedTopologyAndTieLineGates"]["tieLineStatus"]=="PASS") and gates["topologyPassed"]==(candidate["carriedTopologyAndTieLineGates"]["topologyStatus"]=="PASS") and gates["directEvidenceAvailable"]==candidate["directMatchingSixComponentEvidenceAvailable"] and gates["flashAccepted"]==result["candidateStage1Flash"]["accepted"] and gates["allGlobalTpdPassed"]==(not negatives),"GATE_DERIVATION_MISMATCH")
    qhash=run.digest({"candidateModelSha256":result["candidateModelSha256"],"candidateFlashHash":flash_hash,"cascadeExecutionHash":cascade_hash,"endpointMatrixHash":matrix_hash,"auditHash":audit_hash,"gates":gates,"blockers":expected_blockers})
    req(qhash==result["qualificationHash"]==manifest["qualificationHash"],"QUALIFICATION_HASH_MISMATCH")
    req(result["qualified"]==(not expected_blockers and all(gates.values())) and result["status"]==("QUALIFIED" if result["qualified"] else "BLOCKED_FAIL_CLOSED"),"QUALIFICATION_DISPOSITION_MISMATCH")
    req(result["researchOnly"] is True and result["calibration"] is True and result["pilot"] is False and result["release"] is False and result["releaseEligible"] is False and result["predictiveNt"] is None and result["sulfurPrediction"]=="NOT_CALCULABLE","GOVERNANCE_MISMATCH")
    req(manifest["cacheDisposition"]=="EXCLUDED_EPHEMERAL_RESUMABLE" and not any("cache" in k.lower() for k in manifest if k!="cacheDisposition"),"CACHE_PROVENANCE_INVALID")
    print(json.dumps({"status":"PASS","candidateModelSha256":result["candidateModelSha256"],"cascadeExecutionHash":cascade_hash,"endpointMatrixHash":matrix_hash,"auditHash":audit_hash,"qualificationHash":qhash,"negativeOrUnresolved":len(negatives),"fullyReproducedNegative":len(genuine),"blockers":expected_blockers},sort_keys=True))
if __name__=="__main__": main()