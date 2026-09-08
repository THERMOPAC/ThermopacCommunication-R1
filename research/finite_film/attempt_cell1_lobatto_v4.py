"""Gated saved-cell Lobatto attempt seeded by preserved v3 discrete evidence."""
from __future__ import annotations
import hashlib, json, signal, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/"research-results/finite-film-cell1-lobatto-v6-focused-refinement.json"
GATE = ROOT/"research-results/finite-film-boundary-qualification.json"
VALID = ROOT/"research-results/finite-film-physical-collocation-v4-validation.json"
V3 = ROOT/"research-results/finite-film-cell1-physical-v3-attempt.json"
V5 = ROOT/"research-results/finite-film-cell1-lobatto-v5-refined-attempt.json"


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(answer):
    row = {k: v for k, v in answer.items()
           if k not in ("continuousProfile", "dispersedProfile")}
    for phase in ("continuous", "dispersed"):
        profile = answer[phase+"Profile"]
        row[phase+"Profile"] = {
            "mesh": profile.mesh, "bernsteinControls": profile.controls,
            "representation": "AUTHORITATIVE_CUBIC_BERNSTEIN_DE_CASTELJAU",
        }
    return row


def run():
    began = time.monotonic()
    report = {"schemaVersion": "ISOLATED_SAVED_CELL_1_LOBATTO_V6_FOCUSED_REFINEMENT",
              "scope": "ISOLATED_SAVED_CELL_1_ONLY", "sourceSha256": sha(Path(__file__)),
              "attempts": [], "refinements": [], "productionJobsRun": [],
              "columnContinuationRun": False, "tasksCreatedOrChanged": [],
              "physicalFeedModified": False, "boundaryAdapterModified": False,
              "acceptanceGatesModified": False, "physicalAcceptance": False}
    def write():
        OUT.write_text(json.dumps(report, indent=2, allow_nan=False,
            default=lambda x: x.tolist() if hasattr(x, "tolist") else x.item())+"\n")
    temporary = None
    try:
        gate, validation, v3, v5 = map(lambda p: json.loads(p.read_text()), (GATE, VALID, V3, V5))
        if gate["verdict"] != "QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
            raise RuntimeError("BOUNDARY_ADAPTER_NOT_QUALIFIED")
        if validation["outcome"] != "PASS":
            raise RuntimeError("LOBATTO_V4_SYNTHETIC_VALIDATION_FAILED")
        for path, expected in validation["sourceHashes"].items():
            if sha(ROOT/path) != expected: raise RuntimeError("V4_VALIDATION_SOURCE_CHANGED")
        report.update({"qualificationEvidenceSha256": sha(GATE),
                       "validationEvidenceSha256": sha(VALID),
                       "preservedMidpointV3EvidenceSha256": sha(V3),
                       "preservedLobattoV5EvidenceSha256": sha(V5),
                       "v3CoarseResultNotAcceptedAsFullProfile": True})
        import verify_thermo
        _, engine, temporary, lineage = verify_thermo.load_pinned_adapter()
        np = engine.np
        for key in ("jobBManifestSha256", "stage4ManifestSha256", "baseManifestSha256"):
            if lineage[key] != gate["runtimeLineage"][key]:
                raise RuntimeError("QUALIFIED_RUNTIME_LINEAGE_CHANGED")
        sources = gate["sourceHashes"]
        for pkey, hkey in (("boundaryAdapterActualFile", "boundaryAdapterSha256"),
                           ("verifier", "verifierSha256"),
                           ("verifyThermoPinnedLoaderFile", "verifyThermoSha256")):
            if sha(ROOT/sources[pkey]) != sources[hkey]:
                raise RuntimeError("QUALIFIED_SOURCE_CHANGED")
        from boundary_adapter import BoundaryExcessAdapter
        from exact_cache import ExactExcessCache
        from physical_collocation_v4 import solve_lobatto
        states, audit, archived_n = verify_thermo.archived_state()
        for label, actual in (("sourceResponseSha256", audit["body"]["resultSha256"]),
                              ("sourceInputSha256", audit["snapshot"]["inputSha256"]),
                              ("sourceStateSha256", audit["digest"](audit["state"].tolist()))):
            if gate["archivedStateHashes"][label] != actual:
                raise RuntimeError("QUALIFIED_ARCHIVED_STATE_CHANGED")
        bc, bd = states["cell1_continuous"].copy(), states["cell1_dispersed"].copy()
        gc, gd = audit["solver"].kcct.copy(), audit["solver"].kdct.copy()
        adapter = ExactExcessCache(BoundaryExcessAdapter(engine, 298.15))
        seed = v5["refinements"][-1]
        from scipy.interpolate import PPoly
        seed_pc = PPoly(np.asarray(seed["continuousProfile"]["coefficients"]),
                        np.asarray(seed["continuousProfile"]["mesh"]))
        seed_pd = PPoly(np.asarray(seed["dispersedProfile"]["coefficients"]),
                        np.asarray(seed["dispersedProfile"]["mesh"]))
        report["input"] = {"continuousBulk": bc, "dispersedBulk": bd,
            "freshDispersedInlet": states["literal_zero_dry_inlet"],
            "continuousConductances": gc, "dispersedConductances": gd,
            "archivedTotalFluxForReferenceOnly": archived_n,
            "dominantDependentComponents": {"continuous": 5, "dispersed": 0},
            "fixedDirichletEndpointsExcludedFromNewtonUnknowns": True,
            "sevenFluxesFree": True, "totalFluxDefinition": "sum(componentFluxes)"}
        timed_out = False
        def alarm(signum, frame):
            nonlocal timed_out
            timed_out = True
            raise TimeoutError("LOBATTO_V4_BOUNDED_TIMEOUT")
        old = signal.signal(signal.SIGALRM, alarm)
        previous = {"interfaceContinuous": np.asarray(seed["interfaceContinuous"]),
                    "interfaceDispersed": np.asarray(seed["interfaceDispersed"]),
                    "flux": np.asarray(seed["flux"]),
                    "continuousProfile": type("Seed", (), {"values": lambda self, x: seed_pc(x)})(),
                    "dispersedProfile": type("Seed", (), {"values": lambda self, x: seed_pd(x)})()}
        try:
            common = np.linspace(0, 1, 1001)
            for sequence, nodes in enumerate((17, 33)):
                timed_out = False
                signal.setitimer(signal.ITIMER_REAL, 180)
                one = time.monotonic()
                try:
                    answer = solve_lobatto(
                        bc, bd, gc, gd, adapter, adapter,
                        interface_seed_c=previous["interfaceContinuous"],
                        interface_seed_d=previous["interfaceDispersed"],
                        flux_seed=previous["flux"],
                        profile_seed_c=previous["continuousProfile"].values,
                        profile_seed_d=previous["dispersedProfile"].values,
                        nodes=nodes, residual_tolerance=1e-8, max_iterations=18)
                    row = compact(answer)
                    row["elapsedSeconds"] = time.monotonic()-one
                    (report["attempts"] if sequence == 0 else report["refinements"]).append(row)
                    row["maximumScaledFluxDriftFromPrevious"] = float(np.max(
                            np.abs(answer["flux"]-previous["flux"])/np.maximum(gc, gd)))
                    row["maximumInterfaceDriftFromPrevious"] = float(max(
                            np.max(np.abs(answer["interfaceContinuous"]-
                                          previous["interfaceContinuous"])),
                            np.max(np.abs(answer["interfaceDispersed"]-
                                          previous["interfaceDispersed"]))))
                    row["maximumCommonCoordinateProfileDriftFromPrevious"] = float(max(
                            np.max(np.abs(answer["continuousProfile"].values(common)-
                                          previous["continuousProfile"].values(common))),
                            np.max(np.abs(answer["dispersedProfile"].values(common)-
                                          previous["dispersedProfile"].values(common)))))
                    previous = answer
                except Exception as error:
                    row = {"nodes": nodes, "status": "STOPPED",
                           "errorType": type(error).__name__, "error": str(error),
                           "elapsedSeconds": time.monotonic()-one}
                    if timed_out: row["stopReason"] = "NUMERICAL_TIME_BUDGET"
                    (report["attempts"] if sequence == 0 else report["refinements"]).append(row)
                    break
                finally:
                    signal.setitimer(signal.ITIMER_REAL, 0)
                report["exactCacheCounts"] = dict(adapter.counts); write()
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0); signal.signal(signal.SIGALRM, old)
        refined = report["refinements"]
        stable = len(refined) >= 2 and all(
            x.get("numericalAccepted") and
            x.get("maximumScaledFluxDriftFromPrevious", 1) <= 1e-8 and
            x.get("maximumInterfaceDriftFromPrevious", 1) <= 1e-8 and
            x.get("maximumCommonCoordinateProfileDriftFromPrevious", 1) <= 1e-8
            for x in refined[-2:])
        report["outcome"] = ("NUMERICAL_CANDIDATE_REQUIRES_GLOBAL_RANK_STABILITY_QUALIFICATION"
                             if stable else "NO_REFINED_ADMISSIBLE_NUMERICAL_CANDIDATE_FOUND")
        report["interpretation"] = "Numerical evidence only; failure is not process infeasibility."
    except Exception as error:
        report["outcome"] = "EVIDENCE_OR_EXECUTION_HOLD"
        report["error"] = f"{type(error).__name__}: {error}"
    finally:
        if temporary is not None: temporary.cleanup()
        report["elapsedSeconds"] = time.monotonic()-began; write()
    print(json.dumps({"outcome": report["outcome"], "levels":
                      len(report["attempts"])+len(report["refinements"])}))
    return report


if __name__ == "__main__": run()