#!/usr/bin/env python3
"""Operational progress wrapper for the frozen 7C-1.5.0 worker."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FROZEN_WORKER = (
    ROOT / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-5/worker.py"
)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


frozen = load(FROZEN_WORKER, "frozen_production_7c_1_5_with_progress")


def observe_stage_assembly(original_solve, maximum, callback=None, *args, **kwargs):
    """Observe appended cascade stages in one solve frame without mutating it."""
    if not isinstance(maximum, int) or maximum < 1 or maximum > 10:
        raise ValueError("PREDICTIVE_NT_INTERNAL_PROGRESS_MAXIMUM_INVALID")
    if callback is None:
        return original_solve(*args, **kwargs)
    code = original_solve.__func__.__code__
    previous_trace = sys.gettrace()
    stages = None
    emitted = 0

    def observe(frame):
        nonlocal stages, emitted
        candidate = frame.f_locals.get("stages")
        if not isinstance(candidate, list):
            return
        stages = candidate
        assembled = len(stages)
        if assembled > maximum:
            raise RuntimeError("PREDICTIVE_NT_INTERNAL_PROGRESS_BOUNDS_INVALID")
        while emitted < assembled:
            emitted += 1
            callback(emitted, maximum)

    def local_trace(frame, event, arg):
        if event in ("line", "return", "exception"):
            observe(frame)
        return local_trace

    def global_trace(frame, event, arg):
        if event == "call" and frame.f_code is code:
            return local_trace
        return None

    callback(0, maximum)
    sys.settrace(global_trace)
    try:
        return original_solve(*args, **kwargs)
    finally:
        try:
            # A return/exception trace normally catches the final append. Retain
            # a direct catch-up for interpreters that omit the final line event.
            if isinstance(stages, list):
                assembled = len(stages)
                if assembled > maximum:
                    raise RuntimeError("PREDICTIVE_NT_INTERNAL_PROGRESS_BOUNDS_INVALID")
                while emitted < assembled:
                    emitted += 1
                    callback(emitted, maximum)
        finally:
            sys.settrace(previous_trace)


def emit_internal_progress(completed, maximum):
    if (
        not isinstance(completed, int)
        or not isinstance(maximum, int)
        or completed < 0
        or maximum < 1
        or maximum > 10
        or completed > maximum
    ):
        raise ValueError("PREDICTIVE_NT_INTERNAL_PROGRESS_BOUNDS_INVALID")
    print(
        f"PREDICTIVE_NT_INTERNAL_PROGRESS {completed} {maximum}",
        file=sys.stderr,
        flush=True,
    )


original_build_engine = frozen.parent.scientific.build_engine


class ObservedEngine:
    """Transparent engine proxy; the frozen engine instance is never patched."""

    def __init__(self, engine):
        self._engine = engine

    def __getattr__(self, name):
        return getattr(self._engine, name)

    def solve_cascade(self, stage_count, temperature, feed, solvent, previous=None):
        return observe_stage_assembly(
            self._engine.solve_cascade,
            stage_count,
            emit_internal_progress,
            stage_count,
            temperature,
            feed,
            solvent,
            previous,
        )


def build_engine_with_progress(temperature_k, water_wt_pct):
    built = original_build_engine(temperature_k, water_wt_pct)
    return (built[0], ObservedEngine(built[1]), *built[2:])


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        # Progress instrumentation is operational only. The immutable scientific
        # engine evidence and hash remain owned by the frozen 7C-1.5 worker.
        frozen.parent.single_test_main = frozen.parent.single_test_main
        print(frozen.original_canonical({
            "status": "PASS",
            "python": f"{sys.version_info.major}.{sys.version_info.minor}",
            **frozen.engine_evidence(),
            "checkpointProtocol": frozen.parent.parent.CHECKPOINT_PROTOCOL,
            "governanceStatus": frozen.STATUS,
        }))
    else:
        frozen.parent.scientific.build_engine = build_engine_with_progress
        frozen.parent.single_test_main()