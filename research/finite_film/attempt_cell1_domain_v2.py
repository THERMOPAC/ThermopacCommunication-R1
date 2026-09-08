"""Bounded saved-cell-1 attempt with positive log-ratio collocation."""
from __future__ import annotations

import hashlib
import json
import signal
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GATE = ROOT / "research-results/finite-film-boundary-qualification.json"
BENCHMARK = ROOT / "research-results/finite-film-domain-solver-v2-validation.json"
OUTPUT = ROOT / "research-results/finite-film-cell1-domain-v2-attempt.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_file(relative, expected):
    path = ROOT / relative
    if sha(path) != expected:
        raise RuntimeError("RESEARCH_EVIDENCE_SOURCE_CHANGED: " + relative)


def plain_result(result):
    omitted = {"result"}
    row = {}
    for key, value in result.items():
        if key in omitted:
            continue
        if key.endswith("Audit"):
            row[key] = {k: v for k, v in value.items() if k != "values"}
        else:
            row[key] = value
    return row


def main():
    started = time.monotonic()
    report = {
        "schemaVersion": "ISOLATED_SAVED_CELL_1_DOMAIN_SOLVER_V2_ATTEMPT",
        "scope": "ISOLATED_SAVED_CELL_1_ONLY",
        "sourceSha256": sha(Path(__file__)), "attempts": [],
        "productionJobsRun": [], "columnContinuationRun": False,
        "tasksCreatedOrChanged": [], "physicalFeedModified": False,
        "boundaryAdapterModified": False, "acceptanceGatesModified": False,
        "physicalAcceptance": False, "designOutputs": None,
    }

    def write():
        OUTPUT.write_text(json.dumps(
            report, indent=2, allow_nan=False,
            default=lambda x: x.tolist() if hasattr(x, "tolist") else x.item(),
        ) + "\n")

    temporary = None
    try:
        gate = json.loads(GATE.read_text())
        report["qualificationEvidenceSha256"] = sha(GATE)
        if gate["verdict"] != "QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
            raise RuntimeError("BOUNDARY_ADAPTER_NOT_EXTERNALLY_QUALIFIED")
        for prefix in ("archivedSnapshot", "contract"):
            check_file(gate["inputHashes"][prefix], gate["inputHashes"][prefix + "Sha256"])
        sources = gate["sourceHashes"]
        check_file(sources["boundaryAdapterActualFile"], sources["boundaryAdapterSha256"])
        check_file(sources["verifier"], sources["verifierSha256"])
        check_file(sources["verifyThermoPinnedLoaderFile"], sources["verifyThermoSha256"])
        benchmark = json.loads(BENCHMARK.read_text())
        if benchmark["outcome"] != "PASS":
            raise RuntimeError("DOMAIN_SOLVER_V2_SYNTHETIC_BENCHMARK_FAILED")
        for path, expected in benchmark["sourceHashes"].items():
            check_file(path, expected)
        report["numericalBenchmarkEvidenceSha256"] = sha(BENCHMARK)

        import verify_thermo
        _, engine, temporary, lineage = verify_thermo.load_pinned_adapter()
        np = engine.np
        for key in ("jobBManifestSha256", "stage4ManifestSha256", "baseManifestSha256"):
            if lineage[key] != gate["runtimeLineage"][key]:
                raise RuntimeError("QUALIFIED_RUNTIME_LINEAGE_CHANGED")
        from boundary_adapter import BoundaryExcessAdapter
        from exact_cache import ExactExcessCache
        from domain_solver_v2 import solve_two_films_logratio
        from solver import FilmDomainError, gradient
        from scipy.integrate import solve_bvp

        states, audit, archived_n = verify_thermo.archived_state()
        for label, actual in (
            ("sourceResponseSha256", audit["body"]["resultSha256"]),
            ("sourceInputSha256", audit["snapshot"]["inputSha256"]),
            ("sourceStateSha256", audit["digest"](audit["state"].tolist())),
        ):
            if gate["archivedStateHashes"][label] != actual:
                raise RuntimeError("QUALIFIED_ARCHIVED_STATE_CHANGED: " + label)
        request = audit["r"]
        if float(request["temperatureK"]) != 298.15:
            raise RuntimeError("SAVED_TEMPERATURE_CHANGED")
        if request["phaseConfiguration"] != "nmp-continuous-rrbo-dispersed":
            raise RuntimeError("SAVED_PHASE_CONFIGURATION_CHANGED")
        if request["dispersedFeedMolS"][5:] != [0, 0]:
            raise RuntimeError("FRESH_DISPERSED_SOLVENT_INVENTORY_CHANGED")

        bc = states["cell1_continuous"].copy()
        bd = states["cell1_dispersed"].copy()
        gc, gd = audit["solver"].kcct.copy(), audit["solver"].kdct.copy()
        adapter = ExactExcessCache(BoundaryExcessAdapter(engine, 298.15))
        report["input"] = {
            "temperatureK": 298.15, "phaseConfiguration": request["phaseConfiguration"],
            "componentOrder": ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"],
            "continuousBulk": bc, "dispersedBulk": bd,
            "freshDispersedInlet": states["literal_zero_dry_inlet"],
            "continuousConductances": gc, "dispersedConductances": gd,
            "archivedTotalFluxForReferenceOnly": archived_n,
            "sevenComponentFluxesFree": True, "totalFluxDefinition": "sum(componentFluxes)",
        }
        report["pinnedGates"] = engine.gates

        # Reproduce one formerly failing start while inspecting the collocation
        # trial before thermodynamic evaluation.  This copy changes no old source.
        diagnostic = {}
        sc = np.array([.01, .01, .01, .005, .005, .88, .08])
        sd = np.array([.72, .12, .06, .025, .015, .05, .01])
        scale = float(max(np.max(gc), np.max(gd)))

        def legacy_ode(s, y, parameters):
            flux = parameters * scale
            columns = []
            for j in range(y.shape[1]):
                for phase, vector in (("continuous", y[:7, j]),
                                      ("dispersed", y[7:, j])):
                    if np.any(vector < 0):
                        index = int(np.argmin(vector))
                        diagnostic.update({
                            "phase": phase, "componentIndex": index,
                            "component": report["input"]["componentOrder"][index],
                            "coordinate": float(s[j]), "minimumRawCoordinate": float(vector[index]),
                            "rawCoordinateVector": vector.copy(),
                            "rawCoordinateSum": float(vector.sum()),
                            "isSpatialEndpoint": bool(s[j] == 0 or s[j] == 1),
                            "isPrescribedDirichletEndpoint": bool(
                                (phase == "continuous" and s[j] == 0) or
                                (phase == "dispersed" and s[j] == 1)
                            ),
                            "magnitudeRelativeToMachineEpsilon": float(
                                abs(vector[index]) / np.finfo(float).eps
                            ),
                        })
                        raise FilmDomainError("DIAGNOSTIC_NEGATIVE_TRIAL_CAPTURED")
                columns.append(np.r_[gradient(y[:7, j], flux, gc, adapter),
                                      gradient(y[7:, j], flux, gd, adapter)])
            return np.column_stack(columns)

        def legacy_bc(yl, yr, parameters):
            xc, xd = yr[:7] / yr[:7].sum(), yl[7:] / yl[7:].sum()
            chemistry = np.log(xc) + adapter.excess(xc) - np.log(xd) - adapter.excess(xd)
            return np.r_[yl[:7] - bc, yr[7:] - bd, chemistry]

        mesh = np.linspace(0, 1, 17)
        initial = np.vstack([bc[:, None] * (1 - mesh) + sc[:, None] * mesh,
                             sd[:, None] * (1 - mesh) + bd[:, None] * mesh])
        try:
            solve_bvp(legacy_ode, legacy_bc, mesh, initial, p=np.zeros(7),
                      tol=1e-8, bc_tol=1e-12, max_nodes=513)
            diagnostic["status"] = "NEGATIVE_TRIAL_NOT_REPRODUCED"
        except FilmDomainError as error:
            diagnostic["status"] = str(error)
        report["priorAlgorithmNegativeTrialDiagnosis"] = diagnostic
        write()

        starts = [
            ("ARCHIVED_INTERFACES", states["cell1_interface_continuous"],
             states["cell1_interface_dispersed"]),
            ("ORIENTED_PHASE_TEMPLATE", sc, sd),
            ("FROZEN_BULKS", bc, bd),
        ]
        deadline_hit = False

        def timeout_handler(signum, frame):
            nonlocal deadline_hit
            deadline_hit = True
            raise TimeoutError("DOMAIN_V2_BOUNDED_ATTEMPT_TIMEOUT")

        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        try:
            for label, seed_c, seed_d in starts:
                if time.monotonic() - started > 450:
                    report["totalTimeBudgetExhausted"] = True
                    break
                row = {"start": label, "seedContinuous": seed_c,
                       "seedDispersed": seed_d, "seedFlux": [0.0] * 7}
                attempt_started = time.monotonic()
                deadline_hit = False
                signal.setitimer(signal.ITIMER_REAL, 120)
                try:
                    answer = solve_two_films_logratio(
                        bc, bd, gc, gd, adapter, adapter,
                        interface_seed_c=seed_c, interface_seed_d=seed_d,
                        flux_seed=np.zeros(7), tolerance=1e-8, nodes=17, max_nodes=513,
                    )
                    row.update(plain_result(answer))
                    row["status"] = ("NUMERICAL_CANDIDATE_REQUIRES_INDEPENDENT_REFINEMENT"
                                     if answer["numericalAccepted"] else
                                     "NUMERICAL_GATES_NOT_PASSED")
                except Exception as error:
                    row.update({"status": "NUMERICAL_ATTEMPT_STOPPED_NO_CANDIDATE",
                                "errorType": type(error).__name__, "error": str(error)})
                    if deadline_hit:
                        row["stopReason"] = "NUMERICAL_TIME_BUDGET"
                finally:
                    signal.setitimer(signal.ITIMER_REAL, 0)
                row["elapsedSeconds"] = time.monotonic() - attempt_started
                report["attempts"].append(row)
                report["exactCacheCounts"] = dict(adapter.counts)
                write()
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, old_handler)

        candidates = [x for x in report["attempts"] if x.get("numericalAccepted")]
        # Refinement is deliberately conditional: never spend/refashion a failed
        # profile as a candidate.  Two successive levels retain the original gates.
        report["refinements"] = []
        if candidates:
            base = candidates[0]
            for tolerance, nodes in ((1e-8, 33), (3e-9, 65)):
                answer = solve_two_films_logratio(
                    bc, bd, gc, gd, adapter, adapter,
                    interface_seed_c=base["interfaceContinuous"],
                    interface_seed_d=base["interfaceDispersed"],
                    flux_seed=base["flux"], tolerance=tolerance,
                    nodes=nodes, max_nodes=2049,
                )
                report["refinements"].append({
                    "requestedTolerance": tolerance, "initialNodes": nodes,
                    **plain_result(answer),
                })
                write()
        report["outcome"] = (
            "NUMERICAL_CANDIDATE_REQUIRES_RANK_STABILITY_AND_PHYSICAL_QUALIFICATION"
            if candidates and len(report["refinements"]) == 2 and
               all(x["numericalAccepted"] for x in report["refinements"])
            else "NO_ADMISSIBLE_NUMERICAL_CANDIDATE_FOUND"
        )
        report["interpretation"] = (
            "A numerical hold is not process infeasibility. No production or column run occurred."
        )
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
    main()