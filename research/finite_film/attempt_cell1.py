"""Gated, bounded cell-1 numerical attempts. Never executes a production job.

A numerical candidate is not physical qualification. The caller must finish
independent reproduction, rank, profile and phase-stability checks before any
real-cell acceptance. Failed numerical trials are not process verdicts.
"""
from __future__ import annotations

import hashlib
import json
import signal
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / "research-results/finite-film-boundary-qualification.json"
OUTPUT = ROOT / "research-results/finite-film-cell1-attempt.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_file(path, expected):
    if sha(ROOT / path) != expected:
        raise RuntimeError("RESEARCH_EVIDENCE_SOURCE_CHANGED: " + path)


def main():
    previous_sha = None
    if OUTPUT.exists():
        previous = ROOT / "research-results/finite-film-cell1-attempt-uncached.json"
        # Preserve the original bounded attempt; never overwrite it on retries.
        if not previous.exists():
            shutil.copyfile(OUTPUT, previous)
        previous_sha = sha(previous)
    report = {
        "scope": "ISOLATED_SAVED_CELL_1_ONLY",
        "qualificationEvidenceSha256": sha(GATE),
        "sourceSha256": sha(Path(__file__)),
        "attempts": [], "productionJobsRun": [],
        "columnContinuationRun": False, "physicalFeedModified": False,
        "physicalAcceptance": False, "designOutputs": None,
        "previousUncachedAttemptSha256": previous_sha,
    }

    def write():
        OUTPUT.write_text(json.dumps(
            report, indent=2, allow_nan=False,
            default=lambda value: value.item() if hasattr(value, "item") else value.tolist()
        ) + "\n")

    temporary = None
    started = time.monotonic()
    try:
        gate = json.loads(GATE.read_text())
        if gate["verdict"] != "QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
            report["outcome"] = "NOT_ATTEMPTED_DERIVATIVE_QUALIFICATION_STOP"
            write()
            return report
        sources = gate["sourceHashes"]
        check_file(sources["boundaryAdapterActualFile"], sources["boundaryAdapterSha256"])
        check_file(sources["verifier"], sources["verifierSha256"])
        check_file(sources["verifyThermoPinnedLoaderFile"], sources["verifyThermoSha256"])
        for prefix in ("archivedSnapshot", "contract"):
            check_file(gate["inputHashes"][prefix], gate["inputHashes"][prefix + "Sha256"])
        benchmark_path = ROOT / "research-results/finite-film-solver-validation.json"
        benchmark = json.loads(benchmark_path.read_text())
        if benchmark["outcome"] != "PASS":
            raise RuntimeError("NUMERICAL_FILM_BENCHMARK_NOT_PASSED")
        for path, expected in benchmark["sourceHashes"].items():
            check_file(path, expected)
        report["numericalBenchmarkEvidenceSha256"] = sha(benchmark_path)

        # Import order preserves the pinned numerical ABI before any solver
        # imports NumPy or SciPy. No global environment/workflow is changed.
        import verify_thermo
        _, engine, temporary, lineage = verify_thermo.load_pinned_adapter()
        np = engine.np
        for key in ("jobBManifestSha256", "stage4ManifestSha256", "baseManifestSha256"):
            if lineage[key] != gate["runtimeLineage"][key]:
                raise RuntimeError("QUALIFIED_RUNTIME_LINEAGE_CHANGED")
        from boundary_adapter import BoundaryExcessAdapter
        from exact_cache import ExactExcessCache
        from solver import solve_two_films
        states, audit, archived_n = verify_thermo.archived_state()
        for label, actual in (
            ("sourceResponseSha256", audit["body"]["resultSha256"]),
            ("sourceInputSha256", audit["snapshot"]["inputSha256"]),
            ("sourceStateSha256", audit["digest"](audit["state"].tolist())),
        ):
            if gate["archivedStateHashes"][label] != actual:
                raise RuntimeError("QUALIFIED_ARCHIVED_STATE_CHANGED: " + label)

        request = audit["r"]
        temperature = float(request["temperatureK"])
        if temperature != 298.15:
            raise RuntimeError("SAVED_TEMPERATURE_OUTSIDE_BOUNDARY_QUALIFICATION")
        if request["phaseConfiguration"] != "nmp-continuous-rrbo-dispersed":
            raise RuntimeError("SAVED_PHASE_CONFIGURATION_CHANGED")
        if request["dispersedFeedMolS"][5:] != [0, 0]:
            raise RuntimeError("FRESH_DISPERSED_SOLVENT_INVENTORY_CHANGED")
        gc, gd = audit["solver"].kcct.copy(), audit["solver"].kdct.copy()
        bc, bd = states["cell1_continuous"].copy(), states["cell1_dispersed"].copy()
        raw_adapter = BoundaryExcessAdapter(engine, temperature)
        adapter = ExactExcessCache(raw_adapter)
        equality_checks = []
        for name, x in states.items():
            value = raw_adapter.excess(x)
            derivative = raw_adapter.excess_jacobian_full(x)
            equality_checks.append(
                bool(np.array_equal(value, adapter.excess(x)))
                and bool(np.array_equal(value, adapter.excess(x)))
                and bool(np.array_equal(derivative, adapter.excess_jacobian_full(x)))
                and bool(np.array_equal(derivative, adapter.excess_jacobian_full(x)))
            )
        if not all(equality_checks):
            raise RuntimeError("EXACT_CACHE_VALUE_EQUIVALENCE_FAILED")
        report["exactCache"] = {
            "sourceSha256": sha(ROOT / "research/finite_film/exact_cache.py"),
            "allSavedStatesBitwiseEquivalentOnMissAndHit": True,
            "compositionRounding": False, "capacityPerTable": adapter.capacity,
        }
        nc = np.array([.01, .01, .01, .005, .005, .88, .08])
        nd = np.array([.72, .12, .06, .025, .015, .05, .01])

        def perturbed(x, direction):
            # Initial-guess perturbation, not a physical-boundary modification.
            logs = np.log(x[:-1] / x[-1]) + direction
            exponential = np.exp(np.r_[logs, 0] - max(0, max(logs)))
            return exponential / exponential.sum()

        perturbation = np.linspace(-.02, .02, 6)
        starts = [
            ("ARCHIVED_INTERFACES_NEW_FREE_FLUX", states["cell1_interface_continuous"],
             states["cell1_interface_dispersed"]),
            ("ORIENTED_PHASE_TEMPLATE", nc, nd),
            ("FROZEN_BULK_BOUNDARIES", bc, bd),
            ("ORIENTED_TEMPLATE_BULK_C", nc, bd),
            ("ORIENTED_BULK_D_TEMPLATE", bc, nd),
            ("ORIENTED_PHASE_TEMPLATE_PERTURB_PLUS",
             perturbed(nc, perturbation), perturbed(nd, -perturbation)),
            ("ORIENTED_PHASE_TEMPLATE_PERTURB_MINUS",
             perturbed(nc, -perturbation), perturbed(nd, perturbation)),
        ]
        report["input"] = {
            "temperatureK": temperature, "phaseConfiguration": request["phaseConfiguration"],
            "componentOrder": ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"],
            "continuousBulk": bc.tolist(), "dispersedBulk": bd.tolist(),
            "freshDispersedInlet": states["literal_zero_dry_inlet"].tolist(),
            "continuousConductances": gc.tolist(), "dispersedConductances": gd.tolist(),
            "archivedTotalFluxForReferenceOnly": archived_n,
            "sourceResponseSha256": audit["body"]["resultSha256"],
            "sourceInputSha256": audit["snapshot"]["inputSha256"],
            "sourceStateSha256": audit["digest"](audit["state"].tolist()),
            "zeroInitialFluxIsGuessOnly": True, "totalFluxConstrainedToZero": False,
        }
        report["pinnedGates"] = engine.gates
        report["numericalBudget"] = {
            "perStartSeconds": 30, "totalSeconds": 180,
            "initialNodes": 17, "maxNodes": 513, "requestedTolerance": 1e-8,
            "domainFailure": "REJECT_NOT_CLIP",
        }

        deadline_hit = False

        def timeout_handler(signum, frame):
            nonlocal deadline_hit
            deadline_hit = True
            raise TimeoutError("BOUNDED_LOCAL_CELL_ATTEMPT_EXHAUSTED")

        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        try:
            for label, seed_c, seed_d in starts:
                remaining = 180 - (time.monotonic() - started)
                if remaining <= 0:
                    report["totalTimeBudgetExhausted"] = True
                    break
                attempt_start = time.monotonic()
                row = {"start": label, "seedContinuous": seed_c.tolist(),
                       "seedDispersed": seed_d.tolist(),
                       "seedFlux": [0.] * 7, "physicalAcceptance": False}
                deadline_hit = False
                signal.setitimer(signal.ITIMER_REAL, min(30, remaining))
                try:
                    result = solve_two_films(
                        bc, bd, gc, gd, adapter, adapter,
                        interface_seed_c=seed_c, interface_seed_d=seed_d,
                        flux_seed=np.zeros(7), tolerance=1e-8, nodes=17, max_nodes=513,
                    )
                    row.update({key: value for key, value in result.items()
                                if key not in ("continuousProfile", "dispersedProfile")})
                    for side in ("continuous", "dispersed"):
                        profile = result[side + "Profile"]
                        row[side + "Profile"] = {
                            "mesh": profile.polynomial.x.tolist(),
                            "coefficients": profile.polynomial.c.tolist(),
                            "leftBoundary": None if profile.left_boundary is None
                                else profile.left_boundary.tolist(),
                            "rightBoundary": None if profile.right_boundary is None
                                else profile.right_boundary.tolist(),
                            "affineLiftMaximum": profile.lift_maximum,
                        }
                    row["status"] = ("NUMERICAL_CANDIDATE_REQUIRES_FULL_QUALIFICATION"
                                     if result["numericalAccepted"]
                                     else "NUMERICAL_GATES_NOT_PASSED")
                except Exception as error:
                    row["status"] = "NUMERICAL_ATTEMPT_STOPPED_NO_CANDIDATE"
                    row["errorType"], row["error"] = type(error).__name__, str(error)
                    chain = []
                    cause = error
                    while cause is not None:
                        chain.append(f"{type(cause).__name__}: {cause}")
                        cause = cause.__cause__
                    row["errorChain"] = chain
                    if deadline_hit:
                        # The numerical deadline can be caught and wrapped by a
                        # native/RK adapter. It is not an undefined-physics event.
                        row["stopReason"] = "NUMERICAL_TIME_BUDGET"
                        row["error"] = "Bounded attempt exceeded its wall-time budget."
                finally:
                    signal.setitimer(signal.ITIMER_REAL, 0)
                row["elapsedSeconds"] = time.monotonic() - attempt_start
                report["attempts"].append(row)
                report["exactCache"]["counts"] = dict(adapter.counts)
                write()
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, old_handler)
        candidates = [row for row in report["attempts"] if row.get("numericalAccepted")]
        report["outcome"] = (
            "NUMERICAL_CANDIDATES_REQUIRE_REFINEMENT_RANK_AND_STABILITY"
            if candidates else "NO_ADMISSIBLE_NUMERICAL_CANDIDATE_FOUND"
        )
        report["interpretation"] = (
            "Only an isolated numerical attempt. No negative trial is accepted. "
            "This does not prove physical impossibility or authorize Job C."
        )
    except Exception as error:
        report["outcome"] = "EVIDENCE_OR_EXECUTION_HOLD"
        report["error"] = f"{type(error).__name__}: {error}"
    finally:
        if temporary is not None:
            temporary.cleanup()
        report["elapsedSeconds"] = time.monotonic() - started
        write()
    print(json.dumps({"outcome": report["outcome"],
                      "starts": len(report["attempts"])}))
    return report


if __name__ == "__main__":
    main()