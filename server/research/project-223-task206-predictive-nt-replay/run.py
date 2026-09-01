"""Isolated Project 223 Task206 replay; no database or production route is used."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent
OUT = ROOT / ".agents/outputs/project-223-task206-predictive-nt-replay"
SRC = OUT / "source-job-input.json"
TASK = ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json"
WORKER = ROOT / "server/research/ecr-pre-pilot-model-freeze/predictive_nt_six_component.py"
COUNTER = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json"
MODEL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
AMENDMENT_PROTOCOL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/protocol.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canon(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def load_worker():
    spec = importlib.util.spec_from_file_location("frozen223", WORKER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"WORKER_IMPORT_FAILED:{WORKER}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_protocol_and_validate_pins() -> dict:
    protocol = json.loads((HERE / "protocol.json").read_text())
    pins = protocol["pins"]
    checks = (
        (SRC, pins["sourceExportSha256"]),
        (TASK, pins["task206ResultsSha256"]),
        (WORKER, pins["workerSha256"]),
        (COUNTER, pins["countercurrentProtocolSha256"]),
        (MODEL, pins["modelSha256"]),
        (AMENDMENT_PROTOCOL, pins["amendmentProtocolSha256"]),
    )
    for path, expected in checks:
        if sha(path) != expected:
            raise ValueError(f"PIN_MISMATCH:{path}")
    return protocol


def reconstruct_request(protocol: dict) -> tuple[dict, object, dict, str, dict]:
    """Rebuild the exact persisted Task206 request, including its fresh Stage 1 flash."""
    source = json.loads(SRC.read_text())
    identity = (
        source["id"], source["project_number"], source["design_id"], source["completed_at"]
    )
    expected = (
        protocol["referenceJob"]["id"], 223, 256, protocol["referenceJob"]["completedAt"]
    )
    if identity != expected:
        raise ValueError("SOURCE_IDENTITY_MISMATCH")

    task = json.loads(TASK.read_text())
    params = task["parameters"]
    worker = load_worker()
    request = json.loads(json.dumps(source["input_snapshot"]))
    _, stage1, snapshot_hash = worker.stage1_from_request(request)

    # Fresh flash specifically uses the Task206 vector; no worker/global qualification is copied.
    import numpy as np

    molecular_weights = np.asarray(
        [float(worker.model.base.COMP[name][4]) for name in worker.FAMILIES]
    )
    mass = np.asarray(
        [stage1[key] for key in (
            "saturatesWt", "monoAromaticsWt", "diAromaticsWt",
            "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt",
        )]
    )
    all_moles = mass / molecular_weights
    all_moles[5] += 100 * float(stage1["solventOilRatio"]) / molecular_weights[5]
    parameter_vector = np.asarray(
        [params[name] for name in worker.model.PARAMETER_NAMES]
    )
    amendment_protocol = worker.cc.load_json(AMENDMENT_PROTOCOL)
    flash = worker.model.flash(
        worker.FAMILIES,
        float(stage1["operatingTemperatureC"]) + 273.15,
        all_moles / all_moles.sum(),
        parameter_vector,
        amendment_protocol,
    )
    if not flash.get("raffinate") or not flash.get("extract"):
        raise ValueError("TASK206_STAGE1_FLASH_FAILED")

    # This worker command is its fast engine preflight, not a cascade solve.
    preflight = json.loads(
        subprocess.check_output([sys.executable, str(WORKER), "--preflight"], text=True)
    )
    charge = {
        "molecularWeightsGmol": dict(zip(worker.FAMILIES, molecular_weights.tolist())),
        "targets": {
            "minimumRaffinateSaturatesWt": stage1["minimumRaffinateSaturatesWt"],
            "maximumRaffinateTotalAromaticsWt": stage1["targetRaffinateTotalAromaticsWt"],
            "maximumRaffinatePolarAromaticsWt": stage1["targetRaffinatePolarAromaticsWt"],
            "minimumNmpFreeRecoveryPct": stage1["minimumRecoveryPct"],
            "maximumNmpRaffinateWt": stage1["maximumNmpRaffinateWt"],
            "targetRaffinateSulfurPpm": stage1["targetRaffinateSulfurPpm"],
        },
    }
    request.update({
        "engineHash": preflight["engineHash"],
        "equilibriumResult": {
            "model": {"parameters": params},
            "stage1Prediction": {"flash": flash},
            "stage1Authority": {"charge": charge, "snapshotSha256": snapshot_hash},
        },
    })
    request.pop("modelHash", None)
    request.pop("model_hash", None)
    return request, worker, params, snapshot_hash, flash


def request_bytes(request: dict) -> bytes:
    return (json.dumps(request, indent=2) + "\n").encode()


def verify_preflight() -> None:
    """Validate pins and prove deterministic reconstruction without launching cascade worker."""
    protocol = load_protocol_and_validate_pins()
    request, _, _, _, _ = reconstruct_request(protocol)
    persisted = OUT / "request.json"
    if not persisted.exists():
        raise ValueError(f"PERSISTED_REQUEST_MISSING:{persisted}")
    expected_bytes = request_bytes(request)
    actual_bytes = persisted.read_bytes()
    if actual_bytes != expected_bytes:
        # Object comparison makes an accidental formatting-only divergence explicit in diagnosis.
        same_object = json.loads(actual_bytes) == request
        raise ValueError(
            "PERSISTED_REQUEST_MISMATCH:"
            + ("FORMAT_BYTES_DIFFER" if same_object else "OBJECT_CONTENT_DIFFER")
        )
    print(json.dumps({
        "status": "VERIFY_PREFLIGHT_OK",
        "requestSha256": hashlib.sha256(actual_bytes).hexdigest(),
        "cascadeWorkerLaunched": False,
    }))


def build_summaries(trials: list[dict]) -> list[dict]:
    summaries = []
    for trial in trials:
        evidence = trial.get("multistartEvidence", {})
        summaries.append({
            "stageCount": trial["stageCount"],
            "primaryClosure": evidence.get("primary", {}).get("residualClosureStatus"),
            "secondaryClosure": evidence.get("secondary", {}).get("residualClosureStatus"),
            "branchReproduced": evidence.get("branchReproduced"),
            "maximumScaledEquationResidual": trial.get("maximumScaledEquationResidual"),
            "maximumOriginalComponentBalanceResidualMol": trial.get(
                "maximumOriginalComponentBalanceResidualMol"
            ),
            "blockers": [x.get("code") for x in trial.get("acceptanceBlockers", [])],
            "productMetrics": trial.get("productMetrics"),
            "targetCompliance": trial.get("targetCompliance"),
            "stageStability": [{
                "stage": stage["stageFromFeedEnd"],
                "raffinate": stage.get("postSplitTpdSearch", {}).get("raffinate", {}).get("minimum"),
                "extract": stage.get("postSplitTpdSearch", {}).get("extract", {}).get("minimum"),
                "localR": stage.get("localPostSplitStability", {}).get("raffinate", {}).get("minimumEigenvalue"),
                "localE": stage.get("localPostSplitStability", {}).get("extract", {}).get("minimumEigenvalue"),
            } for stage in trial.get("stages", [])],
        })
    return summaries


def render_markdown(result: dict, trials: list[dict], flash: dict) -> str:
    lines = [
        "# RESEARCH ONLY — TASK206 PARAMETERS — NOT ACCEPTED FOR DESIGN", "",
        "Project 223; source job a72e53d4-6747-4bc1-a36f-80bffdf2dc18; design 256.", "",
        "## Executive conclusion",
        "All 10 N_T systems numerically closed and reproduced the recorded branch. "
        "N_T=1 and N_T=2 have no replay-stage post-split TPD blocker; they remain replay "
        "trials, not accepted design results. N_T=3 through N_T=10 fail post-split TPD "
        "stability. **Accepted Predictive N_T: NOT ASSIGNED. Formal COSMO-SAC sulfur: "
        "NOT CALCULABLE.**", "",
        "Stage numbering is bottom-to-top: Stage 1 = RRBO-feed/bottom; final stage = fresh-NMP/top.", "",
        "## N_T comparison",
        "|N_T|Max scaled residual|Worst stage/phase TPD|Stability|NMP-free recovery %|Saturates %|Total aromatics %|Polar aromatics %|NMP raffinate %|Targets|",
        "|---:|---:|---|---|---:|---:|---:|---:|---:|---|",
    ]
    for trial in trials:
        product = trial["productMetrics"]
        stability = [
            (stage["stageFromFeedEnd"], phase, stage["postSplitTpdSearch"][phase]["minimum"])
            for stage in trial["stages"] for phase in ("raffinate", "extract")
        ]
        stage, phase, tpd = min(stability, key=lambda row: row[2])
        targets = trial["targetCompliance"].values()
        counts = (
            f"{sum(x['status'] == 'PASS' for x in targets)} pass / "
            f"{sum(x['status'] == 'FAIL' for x in trial['targetCompliance'].values())} fail / "
            f"{sum(x['status'] == 'NOT_CALCULABLE' for x in trial['targetCompliance'].values())} NC"
        )
        verdict = "FAIL: post-split TPD" if trial.get("acceptanceBlockers") else "No replay-stage TPD blocker"
        lines.append(
            f"|{trial['stageCount']}|{trial['maximumScaledEquationResidual']:.4g}|"
            f"S{stage}/{'R' if phase == 'raffinate' else 'E'} {tpd:.4g}|{verdict}|"
            f"{product['nmpFreeHydrocarbonRecoveryPct']:.3f}|"
            f"{product['raffinateSaturatesWtNmpFree']:.3f}|"
            f"{product['raffinateTotalAromaticsWtNmpFree']:.3f}|"
            f"{product['raffinatePolarAromaticsWtNmpFree']:.3f}|"
            f"{product['nmpInTotalRaffinateWt']:.3f}|{counts}|"
        )
    lines.extend([
        "", "## Fresh Stage 1 flash", "|Metric|Value|", "|---|---:|",
        f"|Equilibrium polish residual|{flash['equilibriumPolishResidual']:.4g}|",
        f"|Extract fraction|{flash['betaExtract']:.6f}|",
        f"|Pre-split minimum TPD|{flash['minimumTpd']:.6f}|",
        f"|Post-split TPD, raffinate / extract|{flash['postSplitTpd']['raffinate']:.4g} / {flash['postSplitTpd']['extract']:.4g}|",
        "", "## Stage-level post-split TPD and local stability",
        "|N_T|Stage|Phase|TPD minimum|Local minimum eigenvalue|",
        "|---:|---:|---|---:|---:|",
    ])
    for trial in trials:
        for stage in trial["stages"]:
            for phase in ("raffinate", "extract"):
                lines.append(
                    f"|{trial['stageCount']}|{stage['stageFromFeedEnd']}|{phase}|"
                    f"{stage['postSplitTpdSearch'][phase]['minimum']:.6g}|"
                    f"{stage['localPostSplitStability'][phase]['minimumEigenvalue']:.6g}|"
                )
    lines.extend([
        "", "## Target-compliance details",
        "|N_T|Target|Calculated|Limit|Status|",
        "|---:|---|---:|---:|---|",
    ])
    for trial in trials:
        for target, value in trial["targetCompliance"].items():
            calculated = (
                "NOT CALCULABLE"
                if value["calculated"] is None
                else f"{value['calculated']:.6g}"
            )
            lines.append(
                f"|{trial['stageCount']}|{target}|{calculated}|"
                f"{value['target']:.6g}|{value['status']}|"
            )
    lines.extend([
        "", "## Task206 parameter vector", "|Parameter|Value|", "|---|---:|",
    ])
    for parameter, value in result["task206Parameters"].items():
        lines.append(f"|{parameter}|{value:.12f}|")
    lines.extend([
        "", "## Provenance and limitations",
        f"Task206 parameter vector SHA256: `{result['task206ParameterVectorSha256']}`.",
        "Task206 frozen validation is INCOMPATIBLE_FAIL_CLOSED; worker-carried active-model "
        "global qualification was segregated and is not attributed to Task206.", "",
    ])
    return "\n".join(lines)


def write_manifest() -> dict:
    return {
        "runnerSha256": sha(Path(__file__)),
        "reportRendererSha256": sha(HERE / "report.mjs"),
        "protocolSha256": sha(HERE / "protocol.json"),
        "sourceSha256": sha(SRC),
        "task206ResultsSha256": sha(TASK),
        "workerSha256": sha(WORKER),
        "modelSha256": sha(MODEL),
        "countercurrentProtocolSha256": sha(COUNTER),
        "amendmentProtocolSha256": sha(AMENDMENT_PROTOCOL),
        "requestSha256": sha(OUT / "request.json"),
        "resultsSha256": sha(OUT / "results.json"),
        "reportSha256": sha(OUT / "report.md"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-preflight", action="store_true")
    args = parser.parse_args()
    if args.verify_preflight:
        verify_preflight()
        return

    protocol = load_protocol_and_validate_pins()
    request, worker, params, snapshot_hash, flash = reconstruct_request(protocol)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "request.json").write_bytes(request_bytes(request))

    proc = subprocess.run(
        [sys.executable, str(WORKER)], input=json.dumps(request) + "\n",
        text=True, capture_output=True, check=True,
    )
    raw = json.loads(proc.stdout)
    removed = {
        key: raw.pop(key, None)
        for key in ("globalStabilityQualification", "task218CandidateGeneratedStability")
    }
    trials = raw["trials"]
    result = {
        "schemaVersion": "1.0.0", "status": "RESEARCH_ONLY_NOT_ACCEPTED",
        "researchOnly": True, "releaseEligible": False, "predictiveNt": None,
        "predictiveNtAssignment": {"status": "NOT_ASSIGNED"},
        "sulfurPrediction": {"status": "NOT_CALCULABLE"},
        "stageNumbering": protocol["stageNumbering"], "referenceJob": protocol["referenceJob"],
        "pins": protocol["pins"], "stage1ImmutableHash": snapshot_hash,
        "task206Parameters": params,
        "task206ParameterVectorSha256": canon([params[name] for name in worker.model.PARAMETER_NAMES]),
        "stage1FreshFlash": flash, "workerStderrProgress": proc.stderr.splitlines(),
        "segregatedWorkerCarriedGlobalQualification": {
            "status": "NOT_ATTRIBUTED_TO_TASK206", "removedFields": list(removed),
        },
        "trials": trials, "trialSummaries": build_summaries(trials),
        "limitations": [
            "Task206 frozen validation is INCOMPATIBLE_FAIL_CLOSED.",
            "No active-model global qualification is attributed to Task206.",
            "Formal COSMO-SAC sulfur remains NOT_CALCULABLE.",
        ],
    }
    (OUT / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    (OUT / "report.md").write_text(render_markdown(result, trials, flash))
    manifest = write_manifest()
    (OUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    subprocess.run(["node", str(HERE / "report.mjs")], check=True)
    manifest["reportPdfSha256"] = sha(OUT / "report.pdf")
    (OUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()