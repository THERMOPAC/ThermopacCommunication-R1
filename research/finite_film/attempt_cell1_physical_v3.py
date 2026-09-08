"""Bounded physical-collocation attempt for saved cell 1 only."""
from __future__ import annotations
import hashlib
import json
import signal
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-cell1-physical-v3-attempt.json"
GATE = ROOT / "research-results/finite-film-boundary-qualification.json"
VALIDATION = ROOT / "research-results/finite-film-physical-collocation-v3-validation.json"
V2 = ROOT / "research-results/finite-film-cell1-domain-v2-attempt.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    started = time.monotonic()
    report = {
        "schemaVersion": "ISOLATED_SAVED_CELL_1_PHYSICAL_COLLOCATION_V3",
        "scope": "ISOLATED_SAVED_CELL_1_ONLY", "attempts": [],
        "sourceSha256": sha(Path(__file__)), "productionJobsRun": [],
        "columnContinuationRun": False, "tasksCreatedOrChanged": [],
        "physicalFeedModified": False, "boundaryAdapterModified": False,
        "acceptanceGatesModified": False, "physicalAcceptance": False,
    }

    def write():
        OUT.write_text(json.dumps(report, indent=2, allow_nan=False,
            default=lambda x: x.tolist() if hasattr(x, "tolist") else x.item()) + "\n")

    temporary = None
    try:
        gate, validation = json.loads(GATE.read_text()), json.loads(VALIDATION.read_text())
        if gate["verdict"] != "QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
            raise RuntimeError("BOUNDARY_ADAPTER_NOT_QUALIFIED")
        if validation["outcome"] != "PASS":
            raise RuntimeError("PHYSICAL_COLLOCATION_V3_BENCHMARK_FAILED")
        for path, expected in validation["sourceHashes"].items():
            if sha(ROOT / path) != expected:
                raise RuntimeError("V3_VALIDATION_SOURCE_CHANGED: " + path)
        report["qualificationEvidenceSha256"] = sha(GATE)
        report["validationEvidenceSha256"] = sha(VALIDATION)
        report["priorV2EvidenceSha256"] = sha(V2)
        report["preservedV2NegativeDiagnosis"] = json.loads(V2.read_text())[
            "priorAlgorithmNegativeTrialDiagnosis"]

        import verify_thermo
        _, engine, temporary, lineage = verify_thermo.load_pinned_adapter()
        np = engine.np
        for key in ("jobBManifestSha256", "stage4ManifestSha256", "baseManifestSha256"):
            if lineage[key] != gate["runtimeLineage"][key]:
                raise RuntimeError("QUALIFIED_RUNTIME_LINEAGE_CHANGED")
        for prefix in ("archivedSnapshot", "contract"):
            path = ROOT / gate["inputHashes"][prefix]
            if sha(path) != gate["inputHashes"][prefix + "Sha256"]:
                raise RuntimeError("QUALIFIED_INPUT_CHANGED")
        source = gate["sourceHashes"]
        for path_key, hash_key in (
            ("boundaryAdapterActualFile", "boundaryAdapterSha256"),
            ("verifier", "verifierSha256"),
            ("verifyThermoPinnedLoaderFile", "verifyThermoSha256"),
        ):
            if sha(ROOT / source[path_key]) != source[hash_key]:
                raise RuntimeError("QUALIFIED_SOURCE_CHANGED")

        from boundary_adapter import BoundaryExcessAdapter
        from exact_cache import ExactExcessCache
        from physical_collocation_v3 import solve_physical_collocation
        states, audit, archived_n = verify_thermo.archived_state()
        for label, actual in (
            ("sourceResponseSha256", audit["body"]["resultSha256"]),
            ("sourceInputSha256", audit["snapshot"]["inputSha256"]),
            ("sourceStateSha256", audit["digest"](audit["state"].tolist())),
        ):
            if gate["archivedStateHashes"][label] != actual:
                raise RuntimeError("QUALIFIED_ARCHIVED_STATE_CHANGED")
        bc, bd = states["cell1_continuous"].copy(), states["cell1_dispersed"].copy()
        gc, gd = audit["solver"].kcct.copy(), audit["solver"].kdct.copy()
        adapter = ExactExcessCache(BoundaryExcessAdapter(engine, 298.15))
        report["input"] = {
            "continuousBulk": bc, "dispersedBulk": bd,
            "freshDispersedInlet": states["literal_zero_dry_inlet"],
            "continuousConductances": gc, "dispersedConductances": gd,
            "archivedTotalFluxForReferenceOnly": archived_n,
            "fixedDirichletEndpointsExcludedFromNewtonUnknowns": True,
            "sevenFluxesFree": True, "totalFluxDefinition": "sum(componentFluxes)",
        }
        report["pinnedGates"] = engine.gates
        sc = np.array([.01, .01, .01, .005, .005, .88, .08])
        sd = np.array([.72, .12, .06, .025, .015, .05, .01])
        starts = [
            ("ORIENTED_PHASE_TEMPLATE", sc, sd),
            ("ARCHIVED_INTERFACES", states["cell1_interface_continuous"],
             states["cell1_interface_dispersed"]),
        ]
        timed_out = False

        def alarm(signum, frame):
            nonlocal timed_out
            timed_out = True
            raise TimeoutError("BOUNDED_PHYSICAL_COLLOCATION_TIMEOUT")

        old = signal.signal(signal.SIGALRM, alarm)
        try:
            for label, seed_c, seed_d in starts:
                row = {"start": label, "seedContinuous": seed_c,
                       "seedDispersed": seed_d, "physicalAcceptance": False}
                one = time.monotonic()
                timed_out = False
                signal.setitimer(signal.ITIMER_REAL, 150)
                try:
                    answer = solve_physical_collocation(
                        bc, bd, gc, gd, adapter, adapter,
                        interface_seed_c=seed_c, interface_seed_d=seed_d,
                        nodes=5, residual_tolerance=1e-8, max_iterations=18,
                    )
                    row.update(answer)
                    row["resultStatus"] = ("NUMERICAL_CANDIDATE_REQUIRES_REFINEMENT"
                                           if answer["numericalAccepted"] else
                                           "NO_NUMERICAL_CANDIDATE")
                except Exception as error:
                    row.update({"resultStatus": "NUMERICAL_ATTEMPT_STOPPED",
                                "errorType": type(error).__name__, "error": str(error)})
                    if timed_out:
                        row["stopReason"] = "NUMERICAL_TIME_BUDGET"
                finally:
                    signal.setitimer(signal.ITIMER_REAL, 0)
                row["elapsedSeconds"] = time.monotonic() - one
                report["attempts"].append(row)
                report["exactCacheCounts"] = dict(adapter.counts)
                write()
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, old)
        candidates = [a for a in report["attempts"] if a.get("numericalAccepted")]
        report["refinements"] = []
        if candidates:
            seed = candidates[0]
            for nodes in (7, 9):
                answer = solve_physical_collocation(
                    bc, bd, gc, gd, adapter, adapter,
                    interface_seed_c=seed["interfaceContinuous"],
                    interface_seed_d=seed["interfaceDispersed"],
                    flux_seed=seed["flux"], nodes=nodes,
                    residual_tolerance=1e-8, max_iterations=18,
                )
                report["refinements"].append(answer)
                write()
        report["outcome"] = (
            "NUMERICAL_CANDIDATE_REQUIRES_GLOBAL_RANK_STABILITY_QUALIFICATION"
            if candidates and len(report["refinements"]) == 2 and
               all(x["numericalAccepted"] for x in report["refinements"])
            else "NO_ADMISSIBLE_NUMERICAL_CANDIDATE_FOUND"
        )
        report["interpretation"] = "Numerical hold only; never process infeasibility."
    except Exception as error:
        report["outcome"] = "EVIDENCE_OR_EXECUTION_HOLD"
        report["error"] = f"{type(error).__name__}: {error}"
    finally:
        if temporary is not None:
            temporary.cleanup()
        report["elapsedSeconds"] = time.monotonic() - started
        write()
    print(json.dumps({"outcome": report["outcome"], "attempts": len(report["attempts"])}))
    return report


if __name__ == "__main__":
    run()