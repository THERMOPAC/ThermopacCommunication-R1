#!/usr/bin/env python3
"""Scientific equivalence/classification harness for 7C-1.2.0.

This harness is intentionally separate from production execution.  It checks
the inherited six-component dry-submixture chemical potentials and compares
routine TPD classification with the frozen 7C-1.1 exhaustive audit.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("seven_component_1_2", HERE / "engine.py")
contract = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(contract)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--temperature-k", type=float, default=323.15)
    parser.add_argument("--water-wt-pct", type=float, default=0.5)
    arguments = parser.parse_args()
    temporary, subject, integrity, runtime = contract.build_engine(
        arguments.temperature_k, arguments.water_wt_pct
    )
    np = subject.np
    try:
        dry_cases = (
            [0.55, 0.16, 0.08, 0.05, 0.02, 0.14],
            [0.20, 0.10, 0.06, 0.04, 0.01, 0.59],
        )
        inherited = []
        for composition in dry_cases:
            expected = subject.model.inherited_six_lngamma(
                arguments.temperature_k, composition
            )
            wet = np.r_[np.asarray(composition) * (1.0 - 1e-10), 1e-10]
            actual = subject.model.wet_lngamma(
                np, arguments.temperature_k, wet
            )[:6]
            inherited.append({
                "composition": composition,
                "maximumDryLimitLngammaDifference": float(
                    np.max(np.abs(expected - actual))
                ),
            })
        reference = np.asarray([0.43, 0.13, 0.06, 0.04, 0.02, 0.30, 0.02])
        routine = subject.routine_tpd(
            reference, arguments.temperature_k, allow_escalation=False
        )
        exhaustive = subject.exhaustive_tpd(reference)
        threshold = subject.gates["negativeTpdThreshold"]
        payload = {
            "schemaVersion": "ECR_7C_1_2_EQUIVALENCE_CLASSIFICATION_V1",
            "engineContractVersion": contract.ENGINE_VERSION,
            "componentOrder": list(contract.FAMILIES),
            "dryLimit": inherited,
            "tpd": {
                "routineGridDenominator": routine["gridDenominator"],
                "routineGridPointCount": routine["gridPointCount"],
                "routineMinimum": routine["minimum"],
                "frozenSevenComponentMinimum": exhaustive["minimum"],
                "routineVerdict": routine["minimum"] < threshold,
                "frozenSevenComponentVerdict": exhaustive["minimum"] < threshold,
            },
            "pinnedIntegrity": integrity,
            "runtime": runtime,
        }
        payload["canonicalPayloadSha256"] = hashlib.sha256(
            canonical(payload).encode()
        ).hexdigest()
        print(canonical(payload))
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()