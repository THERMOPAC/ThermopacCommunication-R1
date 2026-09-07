#!/usr/bin/env python3
"""Replay H=2 continuation and capture its last positive local bulk state."""
from __future__ import annotations

import json
import hashlib
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / ".agents/outputs/job-b-boundary-branch"
SOURCE = ROOT / "server/ecr-pre-pilot/job-c/worker.py"
GENERATED = OUTPUT / "instrumented-job-c"


def main():
    GENERATED.mkdir(parents=True, exist_ok=True)
    source = SOURCE.read_text()
    marker = '''"globalInletFluxAudit":global_inlet_full_scale_audit,
                   "runtimeSeconds":time.monotonic()-started})'''
    replacement = '''"globalInletFluxAudit":global_inlet_full_scale_audit,
                    "acceptedStateBeforeFailedLambda":{
                      "acceptedLambda":previous_lambda,
                      "continuousLocalComponentMolarFlowMolS":
                        unpack(accepted_x)[0].tolist(),
                      "dispersedLocalComponentMolarFlowMolS":
                        unpack(accepted_x)[1].tolist()},
                   "runtimeSeconds":time.monotonic()-started})'''
    if source.count(marker) != 1:
        raise RuntimeError("JOB_C_CAPTURE_PATCH_POINT_CHANGED")
    (GENERATED / "worker.py").write_text(source.replace(marker, replacement))
    shutil.copyfile(
        ROOT / "server/ecr-pre-pilot/job-c/candidate_interface.py",
        GENERATED / "candidate_interface.py",
    )

    frozen = json.loads((OUTPUT / "frozen-input.json").read_text())
    request = {
        "protocol": "ECR_PRE_PILOT_JOB_C_V1",
        "operation": "SOLVE_HEIGHT",
        **frozen["workerRequest"],
    }
    env = {
        key: os.environ[key] for key in (
            "PATH", "LD_LIBRARY_PATH", "NIX_LD", "NIX_LD_LIBRARY_PATH",
            "LOCALE_ARCHIVE", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR",
        ) if key in os.environ
    }
    env.update({
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "JOB_B_INTERFACE_PROTOCOL": "ECR_JOB_B_INTERFACE_V1",
        "JOB_B_INTERFACE_RUNTIME_ROOT":
            str(ROOT / "dist/job-b-interface-runtime"),
        "STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL":
            "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1",
        "STAGE4_EQUILRIUM_ADAPTER_RUNTIME_ROOT":
            str(ROOT / "dist/stage4-seven-component-adapter-runtime"),
        "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT":
            str(ROOT / "dist/stage4-seven-component-adapter-runtime"),
        "STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT":
            str(ROOT / "dist/predictive-nt-runtime-7c-1-5"),
    })
    completed = subprocess.run(
        ["python3.12", str(GENERATED / "worker.py")],
        cwd=ROOT, env=env, input=json.dumps(request) + "\n",
        text=True, capture_output=True, timeout=900, check=True,
    )
    final = [
        line for line in completed.stdout.splitlines()
        if line and not line.startswith("JOB_C_PROGRESS ")
    ]
    if len(final) != 1:
        raise RuntimeError("JOB_C_CAPTURE_RESPONSE_FRAMING_INVALID")
    response = json.loads(final[0])
    diagnostic = response.get("diagnostics", {})
    captured = diagnostic.get("acceptedStateBeforeFailedLambda")
    if (
        response.get("error") != "JOB_C_LOCAL_FLUX_PICARD_NONCONVERGENCE"
        or diagnostic.get("heightM") != 2.0
        or not captured
    ):
        raise RuntimeError("JOB_C_CAPTURE_EXPECTED_BOUNDARY_NOT_REPRODUCED")
    body = {
        "schemaVersion": "ECR_JOB_B_H2_LOCAL_BOUNDARY_STATE_V1",
        "componentOrder": frozen["workerRequest"]["componentOrder"],
        "heightM": diagnostic["heightM"],
        "failedLambda": diagnostic["lambda"],
        "acceptedLambda": captured["acceptedLambda"],
        "continuousLocalComponentMolarFlowMolS":
            captured["continuousLocalComponentMolarFlowMolS"],
        "dispersedLocalComponentMolarFlowMolS":
            captured["dispersedLocalComponentMolarFlowMolS"],
        "qualification":
            "LAST_STRICTLY_POSITIVE_CLOSED_STATE_BEFORE_FROZEN_FV_BOUNDARY",
        "jobBInterfaceWorkerSha256":
            frozen["responseBasis"]["dependencies"]["jobBInterfaceWorkerSha256"],
        "sourceJobCWorkerSha256":
            hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "instrumentedJobCWorkerSha256":
            hashlib.sha256((GENERATED / "worker.py").read_bytes()).hexdigest(),
    }
    (OUTPUT / "h2-local-boundary-state.json").write_text(
        json.dumps(body, indent=2) + "\n")
    print(json.dumps({
        "status": response["status"],
        "error": response["error"],
        "acceptedLambda": body["acceptedLambda"],
        "failedLambda": body["failedLambda"],
        "minimumCapturedFlowMolS": min(
            value for phase in (
                body["continuousLocalComponentMolarFlowMolS"],
                body["dispersedLocalComponentMolarFlowMolS"])
            for cell in phase for value in cell),
    }, indent=2))
    shutil.rmtree(GENERATED)


if __name__ == "__main__":
    main()