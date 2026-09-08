"""Gated, bounded saved-cell shooting attempt; creates only a new artifact."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import signal
import time

# The pinned runtime loader is deliberately the first project import.
import verify_thermo

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-cell1-shooting-v8.json"
GATE = ROOT / "research-results/finite-film-boundary-qualification.json"
SOURCE = ROOT / "research-results/finite-film-cell1-lobatto-v6-focused-refinement.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    began = time.monotonic()
    deadline = began + 240.0
    temporary = None
    old_alarm = None
    report = {
        "schemaVersion": "ISOLATED_SAVED_CELL_1_PHYSICAL_SHOOTING_V8",
        "scope": "ISOLATED_SAVED_CELL_1_ONLY",
        "sourceSha256": sha(Path(__file__)),
        "helperSha256": sha(ROOT/"research/finite_film/physical_shooting_v8.py"),
        "attempts": [], "refinements": [], "productionJobsRun": [],
        "columnContinuationRun": False, "tasksCreatedOrChanged": [],
        "physicalFeedModified": False, "qualifiedAdapterModified": False,
        "originalSolverModified": False, "frozenRuntimeModified": False,
        "physicalAcceptance": False,
    }

    def serial(value):
        if hasattr(value, "tolist"):
            return value.tolist()
        if hasattr(value, "item"):
            return value.item()
        raise TypeError(type(value).__name__)

    def write():
        OUT.write_text(json.dumps(report, indent=2, allow_nan=False,
                                  default=serial) + "\n")

    try:
        def alarm(_, __):
            raise TimeoutError("PHYSICAL_SHOOTING_HARD_235_SECOND_BOUND")
        old_alarm = signal.signal(signal.SIGALRM, alarm)
        signal.setitimer(signal.ITIMER_REAL, 235.0)
        # Loading and manifest verification precedes reading evidence/source data.
        _, engine, temporary, lineage = verify_thermo.load_pinned_adapter()
        gate = json.loads(GATE.read_text())
        source = json.loads(SOURCE.read_text())
        if gate["verdict"] != "QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
            raise RuntimeError("BOUNDARY_ADAPTER_NOT_QUALIFIED")
        for key in ("jobBManifestSha256", "stage4ManifestSha256",
                    "baseManifestSha256"):
            if lineage[key] != gate["runtimeLineage"][key]:
                raise RuntimeError("QUALIFIED_RUNTIME_LINEAGE_CHANGED")
        for pkey, hkey in (
            ("boundaryAdapterActualFile", "boundaryAdapterSha256"),
            ("verifier", "verifierSha256"),
            ("verifyThermoPinnedLoaderFile", "verifyThermoSha256"),
        ):
            if sha(ROOT/gate["sourceHashes"][pkey]) != gate["sourceHashes"][hkey]:
                raise RuntimeError("QUALIFIED_SOURCE_CHANGED")

        from boundary_adapter import BoundaryExcessAdapter
        from exact_cache import ExactExcessCache
        from physical_shooting_v8 import (
            audit_profile, bernstein_profile, residual, solve_flux,
            validate_dense_conversion,
        )

        states, audit, archived_n = verify_thermo.archived_state()
        for label, actual in (
            ("sourceResponseSha256", audit["body"]["resultSha256"]),
            ("sourceInputSha256", audit["snapshot"]["inputSha256"]),
            ("sourceStateSha256", audit["digest"](audit["state"].tolist())),
        ):
            if gate["archivedStateHashes"][label] != actual:
                raise RuntimeError("QUALIFIED_ARCHIVED_STATE_CHANGED")
        np = engine.np
        bc = states["cell1_continuous"].copy()
        bd = states["cell1_dispersed"].copy()
        gc, gd = audit["solver"].kcct.copy(), audit["solver"].kdct.copy()
        seed_row = source["attempts"][-1]
        seed = np.asarray(seed_row["flux"], dtype=float)
        adapter = ExactExcessCache(BoundaryExcessAdapter(engine, 298.15))
        report.update({
            "qualificationEvidenceSha256": sha(GATE),
            "initialCandidateEvidenceSha256": sha(SOURCE),
            "runtimeLineage": lineage,
            "input": {
                "continuousBulk": bc, "dispersedBulk": bd,
                "freshDispersedInletForContrastOnly":
                    states["literal_zero_dry_inlet"],
                "continuousConductances": gc, "dispersedConductances": gd,
                "initialFlux": seed,
                "archivedTotalFluxForReferenceOnly": archived_n,
                "bulkTraceValuesPreservedNotFreshZeros": True,
                "sevenFreeComponentFluxes": True,
                "totalFluxDefinition": "sum(componentFluxes)",
            },
            "method": {
                "continuous": "x(0)=saved bulk; dx/ds=f(x,N); shoot to s=1",
                "dispersed": "x(0)=saved bulk; dx/du=-f(x,N), u=1-s0; shoot to u=1",
                "physicalFluxSignChangedForDispersed": False,
                "coordinateType": "SEVEN_PHYSICAL_MOLE_FRACTIONS",
                "logOdeUsed": False, "floorsOrClippingUsed": False,
                "independentOfPhysicalCollocationHelper": True,
            },
            "thermodynamicStabilityGate": {
                "evidencePath":
                    "research-results/finite-film-candidate-stability-corrected-v2.json",
                "evidenceSha256": sha(
                    ROOT/"research-results/finite-film-candidate-stability-corrected-v2.json"),
                "reportedOutcome": "BLOCKED_CANDIDATE_INTERFACE_STABILITY",
                "finalMatchingThermodynamicStabilityAvailable": False,
                "forcesPhysicalAcceptanceFalse": True,
            },
        })

        initial_value, initial_c, initial_d = residual(
            bc, bd, seed, gc, gd, adapter, adapter, 2e-8, 2e-12
        )
        report["initialFixedFluxEvidence"] = {
            "flux": seed, "totalFlux": float(seed.sum()),
            "interfaceContinuous": initial_c.y[:, -1],
            "interfaceDispersed": initial_d.y[:, -1],
            "isoactivityResidual": initial_value,
            "maximumIsoactivityResidual": float(
                np.max(np.abs(initial_value))),
            "notARefinedFluxRoot": True,
        }
        write()

        answer = solve_flux(
            bc, bd, gc, gd, adapter, adapter, seed, rtol=2e-9, atol=2e-13,
            residual_tolerance=3e-9, max_iterations=4, deadline=deadline,
        )
        keep = {k: v for k, v in answer.items()
                if k not in ("continuousIntegration", "dispersedIntegrationU")}
        keep["startLabel"] = "LATEST_COARSE_NEAR_ROOT"
        report["attempts"].append(keep)

        # Two successive refined-flux roots, not fixed-flux integrations.
        previous = answer
        previous_pc = bernstein_profile(answer["continuousIntegration"])
        previous_pd = bernstein_profile(
            answer["dispersedIntegrationU"], reverse=True)
        for level, (rtol, atol) in enumerate(((3e-10, 3e-14),
                                               (4e-11, 4e-15)), 1):
            refined = solve_flux(
                bc, bd, gc, gd, adapter, adapter, previous["flux"],
                rtol=rtol, atol=atol, residual_tolerance=3e-9,
                max_iterations=3, deadline=deadline,
            )
            value = refined["isoactivityResidual"]
            c = refined["continuousIntegration"]
            d = refined["dispersedIntegrationU"]
            pc = bernstein_profile(c)
            # Convert u back to the original dispersed s0 coordinate.
            pd = bernstein_profile(d, reverse=True)
            ac = audit_profile(pc, refined["flux"], gc, adapter)
            ad = audit_profile(pd, refined["flux"], gd, adapter)
            vc = validate_dense_conversion(c, pc)
            vd = validate_dense_conversion(d, pd, reverse=True)
            from physical_shooting_v8 import _evaluate_profile
            common = np.linspace(0.0, 1.0, 1001)
            row = {
                "level": level, "method": "DOP853", "rtol": rtol, "atol": atol,
                "flux": refined["flux"], "totalFlux": refined["totalFlux"],
                "interfaceContinuous": c.y[:, -1],
                "interfaceDispersed": d.y[:, -1],
                "isoactivityResidual": value,
                "maximumIsoactivityResidual": float(np.max(np.abs(value))),
                "continuousProfile": pc, "dispersedProfile": pd,
                "continuousAudit": ac, "dispersedAudit": ad,
                "continuousDenseConversionValidation": vc,
                "dispersedDenseConversionValidation": vd,
                "maximumInterfaceDriftFromPrevious": float(max(
                    np.max(np.abs(c.y[:, -1]-previous["interfaceContinuous"])),
                    np.max(np.abs(d.y[:, -1]-previous["interfaceDispersed"])))),
                "maximumFluxDriftFromPrevious": float(np.max(np.abs(
                    refined["flux"]-previous["flux"]))),
                "maximumFullProfileDriftFromPrevious": float(max(
                    np.max(np.abs(_evaluate_profile(pc, common) -
                                  _evaluate_profile(previous_pc, common))),
                    np.max(np.abs(_evaluate_profile(pd, common) -
                                  _evaluate_profile(previous_pd, common))))),
            }
            row["fullProfilePassed"] = bool(
                ac["status"] == ad["status"] == "NUMERICAL_PROFILE_CHECKS_PASSED"
                and row["maximumIsoactivityResidual"] <= 1e-7
                and vc["passed"] and vd["passed"]
                and row["maximumFluxDriftFromPrevious"] <= 1e-8
                and row["maximumInterfaceDriftFromPrevious"] <= 1e-8
                and row["maximumFullProfileDriftFromPrevious"] <= 1e-8
            )
            report["refinements"].append(row)
            previous = refined
            previous_pc, previous_pd = pc, pd
            write()

        # A bounded independent start is evaluated, but not allowed to consume
        # the acceptance refinements if the scientific deadline is close.
        independent_seed = seed + np.asarray(
            [1, -1, 1, -1, 1, -1, 1], dtype=float
        ) * np.maximum(np.abs(seed), 1e-5) * 2e-5
        if time.monotonic() < deadline - 20:
            other = solve_flux(
                bc, bd, gc, gd, adapter, adapter, independent_seed,
                rtol=2e-9, atol=2e-13, residual_tolerance=3e-9,
                max_iterations=4, deadline=deadline,
            )
            opc = bernstein_profile(other["continuousIntegration"])
            opd = bernstein_profile(other["dispersedIntegrationU"], reverse=True)
            oac = audit_profile(opc, other["flux"], gc, adapter)
            oad = audit_profile(opd, other["flux"], gd, adapter)
            ovc = validate_dense_conversion(other["continuousIntegration"], opc)
            ovd = validate_dense_conversion(
                other["dispersedIntegrationU"], opd, reverse=True)
            common = np.linspace(0.0, 1.0, 1001)
            report["attempts"].append({
                **{k: v for k, v in other.items()
                   if k not in ("continuousIntegration", "dispersedIntegrationU")},
                "startLabel": "BOUNDED_INDEPENDENT_PERTURBATION",
                "maximumFluxDifferenceFromPrimary": float(
                    np.max(np.abs(other["flux"]-previous["flux"]))),
                "maximumInterfaceDifferenceFromPrimary": float(max(
                    np.max(np.abs(other["interfaceContinuous"] -
                                  previous["interfaceContinuous"])),
                    np.max(np.abs(other["interfaceDispersed"] -
                                  previous["interfaceDispersed"])))),
                "maximumFullProfileDifferenceFromPrimary": float(max(
                    np.max(np.abs(_evaluate_profile(opc, common) -
                                  _evaluate_profile(previous_pc, common))),
                    np.max(np.abs(_evaluate_profile(opd, common) -
                                  _evaluate_profile(previous_pd, common))))),
                "continuousProfile": opc, "dispersedProfile": opd,
                "continuousAudit": oac, "dispersedAudit": oad,
                "continuousDenseConversionValidation": ovc,
                "dispersedDenseConversionValidation": ovd,
            })
        else:
            report["attempts"].append({
                "startLabel": "BOUNDED_INDEPENDENT_PERTURBATION",
                "status": "NOT_RUN_TO_PRESERVE_240_SECOND_SCIENTIFIC_BUDGET",
            })

        successive = len(report["refinements"]) == 2 and all(
            row["fullProfilePassed"] for row in report["refinements"]
        )
        reproducible = (
            len(report["attempts"]) > 1
            and report["attempts"][1].get("maximumIsoactivityResidual", 1) <= 1e-7
            and report["attempts"][1].get(
                "maximumFluxDifferenceFromPrimary", 1) <= 1e-8
            and report["attempts"][1].get(
                "maximumInterfaceDifferenceFromPrimary", 1) <= 1e-8
            and report["attempts"][1].get(
                "maximumFullProfileDifferenceFromPrimary", 1) <= 1e-8
            and report["attempts"][1].get(
                "continuousAudit", {}).get("status")
                == "NUMERICAL_PROFILE_CHECKS_PASSED"
            and report["attempts"][1].get(
                "dispersedAudit", {}).get("status")
                == "NUMERICAL_PROFILE_CHECKS_PASSED"
        )
        numerical_checks = bool(
            successive and reproducible
            and answer["reducedShootingJacobian"]["fullRank"])
        report["numericalChecksPassed"] = numerical_checks
        # Never promote numerical evidence while matching interface stability
        # remains blocked in the preserved corrected audit.
        report["physicalAcceptance"] = False
        report["outcome"] = (
            "NUMERICAL_SHOOTING_EVIDENCE_ONLY_STABILITY_BLOCKED"
            if numerical_checks
            else "SHOOTING_RESULT_REPORTED_WITHOUT_NUMERICAL_ACCEPTANCE"
        )
        report["exactCacheCounts"] = dict(adapter.counts)
    except TimeoutError as error:
        report["outcome"] = "BOUNDED_PARTIAL_SHOOTING_EVIDENCE"
        report["stopReason"] = str(error)
    except Exception as error:
        # The immutable native adapter translates every interruption raised
        # inside its ABI call to BoundaryAdapterError.  Preserve that detail,
        # but do not misclassify a hard-timer interruption as model evidence.
        if time.monotonic() - began >= 234.0:
            report["outcome"] = "BOUNDED_PARTIAL_SHOOTING_EVIDENCE"
            report["stopReason"] = (
                "HARD_TIMER_INTERRUPTED_NATIVE_CALL_AND_WAS_WRAPPED_BY_ADAPTER")
            report["wrappedInterruption"] = f"{type(error).__name__}: {error}"
        else:
            report["outcome"] = "EVIDENCE_OR_EXECUTION_HOLD"
            report["error"] = f"{type(error).__name__}: {error}"
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        if old_alarm is not None:
            signal.signal(signal.SIGALRM, old_alarm)
        if temporary is not None:
            temporary.cleanup()
        report["elapsedScientificSeconds"] = time.monotonic() - began
        report["within240SecondScientificBudget"] = (
            report["elapsedScientificSeconds"] <= 240.0
        )
        write()
    print(json.dumps({"outcome": report["outcome"],
                      "seconds": report["elapsedScientificSeconds"]}))
    return report


if __name__ == "__main__":
    run()