"""Terminal assessment for the single authorized sparse-v9 execution."""
import hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
RAW=ROOT/"research-results/finite-film-cell1-sparse-v9-terminal.json"
OUT=ROOT/"research-results/finite-film-cell1-sparse-v9-timeout-assessment.json"
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
raw=json.loads(RAW.read_text())
report={"schemaVersion":"SPARSE_V9_TERMINAL_TIMEOUT_ASSESSMENT",
 "rawEvidenceSha256":sha(RAW),
 "executedSourceSnapshots":raw.get("executedSourceSnapshots"),
 "validationEvidenceSha256":raw.get("validationEvidenceSha256"),
 "observedExecution":{"outerBudgetSeconds":300,
   "location":"first real independent start, local sparse Jacobian assembly during pinned excess derivative evaluation",
   "exception":"KeyboardInterrupt delivered by outer execution timeout",
   "completedIndependentStarts":len(raw.get("independentStarts",[])),
   "completedRefinements":len(raw.get("refinements",[]))},
 "outcome":"NO_QUALIFIED_SPARSE_V9_CANDIDATE_EXECUTION_TIMEOUT",
 "candidateHash":None,"physicalAcceptance":False,
 "interpretation":"Numerical execution hold only; not process infeasibility.",
 "productionJobsRun":[],"columnContinuationRun":False,
 "rawEvidenceModified":False}
OUT.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({"outcome":report["outcome"]}))