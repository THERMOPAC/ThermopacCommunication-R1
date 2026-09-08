"""Superseding factual v9 interruption assessment; raw artifacts stay untouched."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
RAW=ROOT/"research-results/finite-film-cell1-sparse-v9-terminal.json"
OLD1=ROOT/"research-results/finite-film-cell1-sparse-v9-timeout-assessment.json"
OLD2=ROOT/"research-results/finite-film-cell1-sparse-v9-timeout-assessment-v2.json"
OUT=ROOT/"research-results/finite-film-cell1-sparse-v9-main-review-interruption.json"
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
raw=json.loads(RAW.read_text())
report={"schemaVersion":"SPARSE_V9_MAIN_REVIEW_INTERRUPTION_ASSESSMENT",
 "evidenceInputHashes":{"rawV9":sha(RAW),"priorAssessment":sha(OLD1),
                        "priorAssessmentV2":sha(OLD2)},
 "executedSourceSnapshots":raw.get("executedSourceSnapshots"),
 "interruption":{"signal":"SIGINT","pid":5147,
  "actor":"MAIN","reason":"MAIN_REVIEW_GATE_INTERRUPTION",
  "budgetExhaustionClaimRetracted":True},
 "completedIndependentStarts":len(raw.get("independentStarts",[])),
 "completedRefinements":len(raw.get("refinements",[])),
 "outcome":"V9_NUMERICAL_AND_PROVENANCE_HOLD_UNQUALIFIED",
 "candidateHash":None,"physicalAcceptance":False,"rawEvidenceModified":False,
 "productionJobsRun":[],"columnContinuationRun":False}
OUT.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({"outcome":report["outcome"]}))