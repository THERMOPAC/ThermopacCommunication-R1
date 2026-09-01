"""Integrity verifier for the persisted Project 223 Task206 replay artifacts.

This invokes only the runner's request-reconstruction preflight.  It does not
launch the long-running cascade worker.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent
OUT = ROOT / ".agents/outputs/project-223-task206-predictive-nt-replay"
AMENDMENT_PROTOCOL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    protocol = json.loads((HERE / "protocol.json").read_text())
    results = json.loads((OUT / "results.json").read_text())
    manifest = json.loads((OUT / "provenance-manifest.json").read_text())

    # This is deterministic request construction and Stage 1 validation only.
    subprocess.run(
        [sys.executable, str(HERE / "run.py"), "--verify-preflight"],
        check=True,
    )

    assert sha(OUT / "source-job-input.json") == protocol["pins"]["sourceExportSha256"]
    assert sha(AMENDMENT_PROTOCOL) == protocol["pins"]["amendmentProtocolSha256"]
    assert results["pins"]["amendmentProtocolSha256"] == protocol["pins"]["amendmentProtocolSha256"]
    assert (
        results["referenceJob"] == protocol["referenceJob"]
        and results["researchOnly"]
        and not results["releaseEligible"]
        and results["predictiveNt"] is None
        and results["predictiveNtAssignment"]["status"] == "NOT_ASSIGNED"
        and results["sulfurPrediction"]["status"] == "NOT_CALCULABLE"
    )
    assert len(results["trials"]) == len(results["trialSummaries"]) == 10
    assert [x["stageCount"] for x in results["trials"]] == list(range(1, 11))
    task = json.loads(
        (ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json").read_text()
    )
    assert results["task206Parameters"] == task["parameters"]
    for trial, summary in zip(results["trials"], results["trialSummaries"]):
        assert trial["stageCount"] == summary["stageCount"]
        assert len(summary["stageStability"]) == trial["stageCount"]

    text = (OUT / "report.md").read_text()
    assert all(x in text for x in (
        "RESEARCH ONLY", "TASK206 PARAMETERS", "NOT ACCEPTED FOR DESIGN",
        "NOT ASSIGNED", "NOT CALCULABLE", "bottom-to-top",
    ))
    artifact_files = {
        "resultsSha256": OUT / "results.json",
        "reportSha256": OUT / "report.md",
        "requestSha256": OUT / "request.json",
        "reportRendererSha256": HERE / "report.mjs",
        "amendmentProtocolSha256": AMENDMENT_PROTOCOL,
    }
    for key, path in artifact_files.items():
        assert manifest[key] == sha(path)
    assert manifest["reportPdfSha256"] == sha(OUT / "report.pdf")

    pdf = (OUT / "report.pdf").read_bytes()
    # PDFKit compresses content streams; metadata provides practical text checks without a parser dependency.
    assert len(pdf) > 10_000
    assert pdf.count(b"/Type /Page") > 1
    assert b"RESEARCH ONLY" in pdf and b"NOT ACCEPTED" in pdf
    print(json.dumps({
        "status": "VERIFIED",
        "trials": 10,
        "scientificOutcome": "ACTUAL_OUTCOMES_RETAINED",
        "cascadeWorkerLaunched": False,
    }))


if __name__ == "__main__":
    main()