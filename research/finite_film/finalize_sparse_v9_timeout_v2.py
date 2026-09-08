"""Corrected terminal assessment; preserves the first assessment unchanged."""
import hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
RAW=ROOT/"research-results/finite-film-cell1-sparse-v9-terminal.json"
OLD=ROOT/"research-results/finite-film-cell1-sparse-v9-timeout-assessment.json"
OUT=ROOT/"research-results/finite-film-cell1-sparse-v9-timeout-assessment-v2.json"
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
raw=json.loads(RAW.read_text()); start=raw["independentStarts"][0]
report={"schemaVersion":"SPARSE_V9_TERMINAL_TIMEOUT_ASSESSMENT_V2",
 "rawEvidenceSha256":sha(RAW),"preservedFirstAssessmentSha256":sha(OLD),
 "executedSourceSnapshots":raw["executedSourceSnapshots"],
 "completedArchivedStart":{"elapsedSeconds":start["elapsedSeconds"],
  "status":start["status"],"numericalAccepted":start["numericalAccepted"],
  "continuousScaledConstitutiveDefect":start["continuousAudit"]["maximumScaledConstitutiveDefect"],
  "dispersedScaledConstitutiveDefect":start["dispersedAudit"]["maximumScaledConstitutiveDefect"]},
 "interruptedStage":"second, independently oriented start during local sparse Jacobian assembly",
 "completedIndependentStarts":1,"completedRefinements":0,
 "outcome":"NO_QUALIFIED_SPARSE_V9_CANDIDATE_EXECUTION_TIMEOUT",
 "candidateHash":None,"physicalAcceptance":False,
 "interpretation":"Numerical execution hold only; not process infeasibility.",
 "productionJobsRun":[],"columnContinuationRun":False,"rawEvidenceModified":False}
OUT.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({"outcome":report["outcome"],"completedStarts":1}))