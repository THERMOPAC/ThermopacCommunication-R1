#!/usr/bin/env python3
"""Native-free orchestration tests for the 7C-1.6 sweep worker."""
from __future__ import annotations

import ast
import io
import json
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-6/worker.py"


def worker_functions():
    tree = ast.parse(WORKER.read_text(), filename=str(WORKER))
    selected = [
        node for node in tree.body
        if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef))
        and (
            not isinstance(node, ast.FunctionDef)
            or node.name in {"canonical", "emit_checkpoint", "sweep_main"}
        )
    ]
    namespace = {
        "__file__": str(WORKER),
        "ENGINE_VERSION": "7C-1.6.0",
        "CHECKPOINT_PROTOCOL": "ACK_V3_ENGINE_CONTRACT",
        "SWEEP_MAXIMUM": 10,
    }
    exec(
        compile(
            ast.fix_missing_locations(ast.Module(body=selected, type_ignores=[])),
            str(WORKER),
            "exec",
        ),
        namespace,
    )
    return namespace


class FakeEngine:
    np = object()
    metrics = {"nativeFreeFixture": True}

    def __init__(self, events):
        self.calls = []
        self.events = events

    def solve_cascade(self, count, *_args):
        self.calls.append(count)
        self.events.append(("solve", count))
        return {"stageCount": count}


class TemporaryResource:
    def cleanup(self):
        pass


class ProtocolInput:
    def __init__(self, request, events):
        self.lines = [json.dumps(request) + "\n"]
        self.events = events

    def add_ack(self, count, digest):
        self.lines.append(f"PREDICTIVE_NT_ACK {count} {digest}\n")

    def readline(self):
        if not self.lines:
            return ""
        line = self.lines.pop(0)
        if line.startswith("PREDICTIVE_NT_ACK "):
            self.events.append(("ack", int(line.split()[1])))
        return line


class CheckpointStderr(io.StringIO):
    def __init__(self, protocol, events, acknowledge=True):
        super().__init__()
        self.protocol = protocol
        self.events = events
        self.acknowledge = acknowledge

    def write(self, text):
        if text.startswith("PREDICTIVE_NT_CHECKPOINT "):
            fields = text.rstrip("\n").split(" ", 3)
            count, digest = int(fields[1]), fields[2]
            self.events.append(("checkpoint", count))
            if self.acknowledge:
                self.protocol.add_ack(count, digest)
        return super().write(text)


class V16WorkerOrchestrationTest(unittest.TestCase):
    def setUp(self):
        self.api = worker_functions()
        self.events = []
        self.engine = FakeEngine(self.events)
        legacy = types.SimpleNamespace(
            FAMILIES=["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"]
        )
        parent = types.SimpleNamespace(
            scientific=types.SimpleNamespace(
                build_engine=lambda *_: (
                    TemporaryResource(),
                    self.engine,
                    {"integrity": True},
                    {"runtime": True},
                )
            )
        )
        frozen = types.SimpleNamespace(STATUS="PRE-PILOT MULTISTAGE PREDICTIVE MODEL")
        self.api.update({
            "legacy": legacy,
            "parent": parent,
            "frozen": frozen,
            "canonical": lambda value: json.dumps(
                value, sort_keys=True, separators=(",", ":")
            ),
            "engine_evidence": lambda: {"engineHash": "f" * 64},
            "wet_charge": lambda _stage1: (
                {"feed": True},
                {"solvent": True},
                {"waterWeightPercentOfWetSolvent": 0.5},
            ),
            "continuation": lambda _np, state, _count: state,
            "advance_continuation": lambda raw, _state, count: (
                {
                    "raffinateComponentMoles": [raw["stageCount"]],
                    "extractComponentMoles": [],
                },
                count + 1,
            ),
            "complete_trial": lambda _np, raw, *_args: {
                "stageCount": raw["stageCount"],
                "accepted": raw["stageCount"] in {2, 5},
                "sulfurPrediction": {
                    "status": "CALCULABLE",
                    "fixtureStage": raw["stageCount"],
                },
                "diagnosticContinuationUsed": raw["stageCount"] > 1,
            },
        })

    def request(self, resume=None):
        value = {
            "engineContractVersion": "7C-1.6.0",
            "engineHash": "f" * 64,
            "maximumStages": 10,
            "stage1Authority": {
                "source": {
                    "stage1": {
                        "operatingTemperatureC": 50,
                        "temperatureK": 323.15,
                    }
                }
            },
        }
        if resume is not None:
            value["_resume"] = resume
        return value

    def execute(self, request, acknowledge=True):
        protocol = ProtocolInput(request, self.events)
        stderr = CheckpointStderr(protocol, self.events, acknowledge)
        stdout = io.StringIO()
        previous = (sys.stdin, sys.stderr, sys.stdout)
        sys.stdin, sys.stderr, sys.stdout = protocol, stderr, stdout
        try:
            self.api["sweep_main"]()
        finally:
            sys.stdin, sys.stderr, sys.stdout = previous
        return json.loads(stdout.getvalue())

    def test_full_sweep_ack_precedes_next_solve_and_selects_matching_sulfur(self):
        result = self.execute(self.request())
        self.assertEqual(self.engine.calls, list(range(1, 11)))
        self.assertEqual(
            [item["stageCount"] for item in result["trials"]],
            list(range(1, 11)),
        )
        self.assertEqual(result["predictiveNt"], 2)
        self.assertEqual(result["establishedTheoreticalStages"], 2)
        self.assertEqual(result["sulfurPrediction"]["fixtureStage"], 2)
        for count in range(1, 10):
            self.assertLess(
                self.events.index(("ack", count)),
                self.events.index(("solve", count + 1)),
            )

    def test_resume_from_four_and_already_complete_prefix(self):
        first = self.execute(self.request())
        prefix = first["trials"][:4]

        self.engine.calls.clear()
        resumed = self.execute(self.request({
            "engineContractVersion": "7C-1.6.0",
            "acknowledgedStageCount": 4,
            "trials": prefix,
            "continuationState": {
                "raffinateComponentMoles": [4],
                "extractComponentMoles": [],
            },
            "continuationStageCount": 4,
        }))
        self.assertEqual(self.engine.calls, list(range(5, 11)))
        self.assertEqual(
            [item["stageCount"] for item in resumed["trials"]],
            list(range(1, 11)),
        )

        self.engine.calls.clear()
        complete = self.execute(self.request({
            "engineContractVersion": "7C-1.6.0",
            "acknowledgedStageCount": 10,
            "trials": resumed["trials"],
            "continuationState": {
                "raffinateComponentMoles": [7],
                "extractComponentMoles": [],
            },
            # The frozen continuation retains the last fully diagnostic
            # continuation while later accepted/rejected trials proceed.
            "continuationStageCount": 7,
        }))
        self.assertEqual(self.engine.calls, [])
        self.assertEqual(
            [item["stageCount"] for item in complete["trials"]],
            list(range(1, 11)),
        )

    def test_missing_ack_cancels_before_next_solve(self):
        with self.assertRaises(RuntimeError) as failure:
            self.execute(self.request(), acknowledge=False)
        self.assertEqual(
            str(failure.exception),
            "PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED",
        )
        self.assertEqual(self.engine.calls, [1])


if __name__ == "__main__":
    unittest.main()