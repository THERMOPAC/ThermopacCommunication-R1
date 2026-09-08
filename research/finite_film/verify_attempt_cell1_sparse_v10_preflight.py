#!/usr/bin/env python3
"""No-science driver preflight plus mutation/literal rejection unit checks."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import numpy as np
from attempt_cell1_sparse_v10 import require_hash,require_literal
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"research-results/finite-film-cell1-sparse-v10-preflight-test-v2.json"
def rejected(call):
    try: call()
    except RuntimeError: return True
    return False
with tempfile.TemporaryDirectory() as directory:
    p=Path(directory)/"source"; p.write_bytes(b"exact")
    expected=hashlib.sha256(b"exact").hexdigest()
    exact_ok=(require_hash(p,expected,"changed") is None)
    p.write_bytes(b"mutated")
    mutation_rejected=rejected(lambda:require_hash(p,expected,"changed"))
literal=np.array([.8,.2,0.,0.,0.,0.,0.])
literal_ok=(require_literal(literal,literal.copy(),"changed",np) is None)
changed=literal.copy(); changed[-1]=np.nextafter(0.,1.); changed[0]-=changed[-1]
literal_mutation_rejected=rejected(lambda:require_literal(changed,literal,"changed",np))
completed=subprocess.run(
    ["python","-B",str(Path(__file__).with_name("attempt_cell1_sparse_v10.py")),
     "--preflight-only"],cwd=ROOT,text=True,capture_output=True,timeout=120)
terminal=json.loads(completed.stdout.strip().splitlines()[-1]) if completed.stdout.strip() else {}
raw=json.loads((ROOT/"research-results/finite-film-cell1-sparse-v10-terminal-v2.json").read_text())
warm_endpoints=raw.get("warmLiteralEndpointsVerified",{})
report={"schemaVersion":"SPARSE_V10_REAL_DRIVER_PREFLIGHT_TEST",
 "scope":"NO_SAVED_CELL_NATIVE_SCIENCE","preflightExitCode":completed.returncode,
 "preflightTerminal":terminal,"sourceMutationRejected":mutation_rejected,
 "literalEndpointExactPass":literal_ok,
 "literalEndpointMutationRejected":literal_mutation_rejected,
 "warmRecordedBernsteinLiteralEndpointsVerified":warm_endpoints,
 "exactSourceHashPass":exact_ok,"realScientificRun":False,
 "outcome":"PASS" if completed.returncode==0 and
   terminal.get("outcome")=="PREFLIGHT_ONLY_PASS_NO_NATIVE_SCIENCE" and
   warm_endpoints=={"continuousLeft":True,"dispersedRight":True} and
   all((mutation_rejected,literal_ok,literal_mutation_rejected,exact_ok)) else "FAIL"}
OUT.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report))
raise SystemExit(0 if report["outcome"]=="PASS" else 1)