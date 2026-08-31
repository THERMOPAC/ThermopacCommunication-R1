#!/usr/bin/env python3
"""ACK_V2 worker for the Stage-1-authoritative six-family predictive N_T study.

This is deliberately a research diagnostic worker.  It invokes the coupled
COSMO-SAC + project-residual cascade; it does not import the legacy UNIQUAC
five-family worker.
"""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
COUNTER = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"
AMENDMENT = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"

spec = importlib.util.spec_from_file_location("six_component_countercurrent", COUNTER / "run.py")
cc = importlib.util.module_from_spec(spec)
assert spec.loader
sys.modules[spec.name] = cc
spec.loader.exec_module(cc)
model = cc.model
np = model.np

ENGINE_ID = "ECR2_PREDICTIVE_NT_SIX_COMPONENT_COSMOSAC"
ENGINE_VERSION = "1.0.0"
FAMILIES = list(model.FAMILIES)
THERMO = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics"
PROFILES = THERMO / "generated/profiles"
RUNTIME_MANIFEST = ROOT / "predictive-nt-runtime-manifest.json"
TASK213 = ROOT / ".agents/outputs/task-213-mono-rich-qualification"
TASK213_PROTOCOL = ROOT / "server/research/task-213-mono-rich-qualification/protocol.json"
TASK213_RUNNER = ROOT / "server/research/task-213-mono-rich-qualification/run.py"


def canonical(value):
    # Keep hashes interoperable with the TypeScript recursive canonicalJson:
    # sorted keys and JSON.stringify UTF-8/string/number spellings.
    return stage1_canonical(value)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def javascript_number(value):
    """The number spelling used by JSON.stringify for Stage-1 canonicalization."""
    # json.loads preserves a lexical JSON integer as int.  JSON.stringify
    # writes that as ``100``, not Python's float spelling ``100.0``.
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("STAGE1_AUTHORITY_NONFINITE_NUMBER")
    if value == 0:
        return "0"
    # JavaScript has one Number type.  JSON.stringify(100.0) is "100";
    # retaining Python's lexical float distinction makes an ACK canonical
    # differ from the same value after TypeScript parses the final JSON.
    if value.is_integer() and abs(value) < 1e21:
        return str(int(value))
    text = repr(value)
    if "e" not in text and "E" not in text:
        return text
    mantissa, exponent = text.lower().split("e")
    power = int(exponent)
    # JSON.stringify uses fixed notation from 1e-6 through <1e21.
    if 1e-6 <= abs(value) < 1e21:
        return format(value, ".15f").rstrip("0").rstrip(".")
    return mantissa.rstrip("0").rstrip(".") + "e" + ("+" if power >= 0 else "") + str(power)


def stage1_canonical(value):
    """Mirror the recursive TS canonicalJson used by stage1SnapshotHash."""
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(str(key), ensure_ascii=False, separators=(",", ":")) + ":" + stage1_canonical(value[key])
            for key in sorted(value)
        ) + "}"
    if isinstance(value, list):
        return "[" + ",".join(stage1_canonical(item) for item in value) + "]"
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return javascript_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    raise ValueError("STAGE1_AUTHORITY_INVALID_JSON_VALUE")


def scientific_runtime_inputs():
    """Every immutable file in the bundled scientific dependency closure."""
    vendor = ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
    inputs = [
        Path(__file__), COUNTER / "run.py", COUNTER / "protocol.json",
        AMENDMENT / "model.py", AMENDMENT / "protocol.json",
        ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py",
        ROOT / "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json",
        ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json",
        THERMO / "provenance-manifest.json",
        THERMO / "generated/profile-verification.json",
        TASK213_PROTOCOL,
        TASK213_RUNNER,
        TASK213 / "results.json",
        TASK213 / "report.md",
        TASK213 / "provenance-manifest.json",
        ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
        ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/fixed-nt7-feed-sensitivity-results.json",
        ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic/results.json",
        ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json",
        ROOT / ".agents/outputs/task-207-seven-stage-multistart-closure/results.json",
    ]
    for directory in (vendor, PROFILES):
        inputs.extend(
            candidate for candidate in directory.rglob("*")
            if (
                candidate.is_file()
                and "__pycache__" not in candidate.parts
                and candidate.suffix not in (".pyc", ".pyo")
            )
        )
    return sorted(set(path.resolve() for path in inputs))


def bundled_records(paths):
    records = []
    for path in paths:
        if not path.is_file():
            raise RuntimeError(f"SCIENTIFIC_RUNTIME_INPUT_MISSING:{path}")
        records.append({
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": file_hash(path),
        })
    return sorted(records, key=lambda record: record["path"])


def record_text(records):
    return "\n".join(
        f"{record['path']}:{record['bytes']}:{record['sha256']}"
        for record in records
    )


def verify_packaged_manifest(records):
    if not RUNTIME_MANIFEST.is_file():
        return "SOURCE_TREE_NO_PACKAGE_MANIFEST"
    manifest = json.loads(RUNTIME_MANIFEST.read_text())
    if (
        manifest.get("schemaVersion") != "PREDICTIVE_NT_RUNTIME_MANIFEST_V1"
        or manifest.get("hashAlgorithm") != "sha256"
        or manifest.get("fileCount") != len(records)
        or manifest.get("files") != records
    ):
        raise RuntimeError("SCIENTIFIC_RUNTIME_MANIFEST_FILE_MISMATCH")
    aggregate = hashlib.sha256(record_text(records).encode()).hexdigest()
    if manifest.get("aggregateSha256") != aggregate:
        raise RuntimeError("SCIENTIFIC_RUNTIME_MANIFEST_AGGREGATE_MISMATCH")
    return "PACKAGED_MANIFEST_VERIFIED"


def native_dependency_records(paths):
    """Hash the interpreter and full ldd closure of every bundled extension."""
    native_inputs = [Path(sys.executable).resolve()]
    native_inputs.extend(
        path for path in paths
        if path.suffix == ".so" or ".so." in path.name
    )
    dependencies = {Path(sys.executable).resolve()}
    for binary in native_inputs:
        result = subprocess.run(
            ["ldd", str(binary)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        for line in result.stdout.splitlines():
            candidate = None
            if "=>" in line:
                target = line.split("=>", 1)[1].strip().split(" ", 1)[0]
                if target.startswith("/"):
                    candidate = Path(target)
            else:
                target = line.strip().split(" ", 1)[0]
                if target.startswith("/"):
                    candidate = Path(target)
            if candidate is not None and candidate.is_file():
                dependencies.add(candidate.resolve())
    records = []
    for dependency in dependencies:
        try:
            dependency.relative_to(ROOT)
            continue
        except ValueError:
            pass
        records.append({
            "name": dependency.name,
            "bytes": dependency.stat().st_size,
            "sha256": file_hash(dependency),
        })
    return sorted(records, key=lambda record: (
        record["name"], record["bytes"], record["sha256"]
    ))


def runtime_identity():
    """Pin the loaded numeric runtime, including its principal native modules."""
    ccosmo = model.base.cCOSMO
    native_numpy = Path(np._core._multiarray_umath.__file__).resolve()
    scipy_module = Path(cc.scipy.__file__).resolve()

    def rooted(path):
        """Report stable package-relative locations, never deployment paths."""
        try:
            return str(Path(path).resolve().relative_to(ROOT)).replace("\\", "/")
        except ValueError as exc:
            raise RuntimeError(f"PINNED_RUNTIME_OUTSIDE_ROOT:{path}") from exc

    return {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "numpy": {"version": np.__version__, "module": rooted(np.__file__), "coreBinarySha256": file_hash(native_numpy)},
        "scipy": {"version": cc.scipy.__version__, "module": rooted(scipy_module), "packageInitSha256": file_hash(scipy_module)},
        "cCOSMO": {"module": rooted(ccosmo.__file__), "binarySha256": file_hash(Path(ccosmo.__file__))},
    }


def engine_evidence():
    paths = scientific_runtime_inputs()
    records = bundled_records(paths)
    manifest_status = verify_packaged_manifest(records)
    native_records = native_dependency_records(paths)
    identity = runtime_identity()
    evidence = (
        record_text(records)
        + "\nnativeDependencies:" + canonical(native_records)
        + "\nruntimeIdentity:" + canonical(identity)
    )
    return {
        "engineId": ENGINE_ID,
        "engineVersion": ENGINE_VERSION,
        "engineHash": hashlib.sha256(evidence.encode()).hexdigest(),
        "scientificRuntimeFileCount": len(records),
        "scientificRuntimeAggregateSha256": hashlib.sha256(record_text(records).encode()).hexdigest(),
        "nativeDependencyCount": len(native_records),
        "nativeDependencyAggregateSha256": hashlib.sha256(canonical(native_records).encode()).hexdigest(),
        "runtimeManifestStatus": manifest_status,
        "runtimeIdentity": identity,
    }


def engine_hash():
    return engine_evidence()["engineHash"]


def thermodynamic_qualification(counter_protocol):
    """Verify the pinned Task-213 decision before permitting N_T assignment."""
    required = (
        TASK213_PROTOCOL, TASK213_RUNNER, TASK213 / "results.json",
        TASK213 / "report.md", TASK213 / "provenance-manifest.json",
    )
    if not all(path.is_file() for path in required):
        return False, "TASK213_QUALIFICATION_EVIDENCE_MISSING"
    protocol = json.loads(TASK213_PROTOCOL.read_text())
    result = json.loads((TASK213 / "results.json").read_text())
    provenance = json.loads((TASK213 / "provenance-manifest.json").read_text())
    if (
        provenance.get("runnerSha256") != file_hash(TASK213_RUNNER)
        or provenance.get("resultsSha256") != file_hash(TASK213 / "results.json")
        or provenance.get("reportSha256") != file_hash(TASK213 / "report.md")
    ):
        return False, "TASK213_QUALIFICATION_PROVENANCE_MISMATCH"
    expected_inputs = protocol.get("pinnedInputs", {})
    actual_inputs = {
        "amendmentModelSha256": file_hash(AMENDMENT / "model.py"),
        "amendmentResultsSha256": file_hash(
            ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
        ),
        "negativeTpdDiagnosticSha256": file_hash(
            ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic/results.json"
        ),
        "stabilityConstrainedAmendmentSha256": file_hash(
            ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json"
        ),
        "multistartClosureSha256": file_hash(
            ROOT / ".agents/outputs/task-207-seven-stage-multistart-closure/results.json"
        ),
        "frozenTrialsSha256": file_hash(
            ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/fixed-nt7-feed-sensitivity-results.json"
        ),
        "countercurrentProtocolSha256": file_hash(COUNTER / "protocol.json"),
    }
    if expected_inputs != actual_inputs:
        return False, "TASK213_QUALIFICATION_INPUT_MISMATCH"
    coverage = result.get("completeAllStageAllTrialCoverage", {})
    accepted = bool(
        result.get("qualified") is True
        and result.get("status") == "QUALIFIED"
        and result.get("blockers") == []
        and coverage.get("demonstratedForFrozenTrials") is True
        and coverage.get("everyPhaseStableAtFrozenThreshold") is True
        and coverage.get("expectedPhaseCount") == 42
        and coverage.get("coveredPhaseCount") == 42
        and result.get("postSplitTpdThreshold")
        == counter_protocol["numericalAcceptance"]["postSplitTpdThreshold"]
        and counter_protocol["governance"]["equilibriumModelQualification"] == "QUALIFIED"
    )
    return (
        (True, "TASK213_QUALIFICATION_VERIFIED")
        if accepted else (False, "TASK213_QUALIFICATION_NOT_ACCEPTED")
    )


def plain(value):
    return cc.json_safe(value)


def stage1_from_request(request):
    authority = request.get("stage1Authority", {})
    snapshot = authority.get("source", request.get("stage1Snapshot", authority))
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("stage1"), dict):
        raise ValueError("STAGE1_AUTHORITY_INVALID: immutable full snapshot required")
    # This validates the six-family binding, identities, required saved fields,
    # and fixed PA profile.  It intentionally does not call node from a worker.
    stage1 = cc.validate_authoritative_stage1_snapshot(snapshot)
    # TypeScript hashes the immutable authority with immutableHash omitted.
    immutable_payload = {key: value for key, value in snapshot.items() if key != "immutableHash"}
    actual = hashlib.sha256(stage1_canonical(immutable_payload).encode()).hexdigest()
    if snapshot.get("immutableHash") != actual:
        raise ValueError("STAGE1_AUTHORITY_IMMUTABLE_HASH_MISMATCH")
    expected = authority.get("snapshotHash") or request.get("stage1SnapshotHash")
    if expected and expected != actual:
        raise ValueError("STAGE1_AUTHORITY_HASH_MISMATCH")
    return snapshot, stage1, actual


def get_equilibrium(request, stage1=None):
    candidate = request.get("equilibriumResult") or request.get("sixComponentEquilibriumResult")
    if isinstance(candidate, str):
        candidate = json.loads(Path(candidate).read_text())
    if not isinstance(candidate, dict):
        # The production job contract supplies the immutable Stage-1 authority,
        # not a filesystem result.  Recreate the pinned parameter fit and the
        # temperature-specific six-component seed from its frozen evidence.
        if stage1 is None:
            raise ValueError("MATCHING_SIX_COMPONENT_EQUILIBRIUM_RESULT_REQUIRED")
        amendment_protocol = json.loads((AMENDMENT / "protocol.json").read_text())
        evidence = json.loads((ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json").read_text())
        parameters, _ = model.fit_parameters(evidence["tieLines"], amendment_protocol)
        mw = {name: float(model.base.COMP[name][4]) for name in FAMILIES}
        feed_mass = np.asarray([stage1[k] for k in ("saturatesWt", "monoAromaticsWt", "diAromaticsWt", "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt")], dtype=float)
        fresh_mass = 100. * float(stage1["solventOilRatio"])
        all_moles = feed_mass / np.asarray([mw[name] for name in FAMILIES])
        all_moles[5] += fresh_mass / mw["NMP"]
        flash = model.flash(FAMILIES, float(stage1["operatingTemperatureC"]) + 273.15, all_moles / all_moles.sum(), parameters, amendment_protocol)
        if not flash.get("raffinate") or not flash.get("extract"):
            raise ValueError("SIX_COMPONENT_EQUILIBRIUM_SEED_FAILED")
        charge = {
            "molecularWeightsGmol": mw,
            "targets": {
                "minimumRaffinateSaturatesWt": stage1["minimumRaffinateSaturatesWt"],
                "maximumRaffinateTotalAromaticsWt": stage1["targetRaffinateTotalAromaticsWt"],
                "maximumRaffinatePolarAromaticsWt": stage1["targetRaffinatePolarAromaticsWt"],
                "minimumNmpFreeRecoveryPct": stage1["minimumRecoveryPct"],
                "maximumNmpRaffinateWt": stage1["maximumNmpRaffinateWt"],
                "targetRaffinateSulfurPpm": stage1["targetRaffinateSulfurPpm"],
            },
        }
        return {"model": {"parameters": dict(zip(model.PARAMETER_NAMES, map(float, parameters)))}}, parameters, flash, charge
    parameters = candidate.get("model", {}).get("parameters")
    flash = candidate.get("stage1Prediction", {}).get("flash")
    charge = candidate.get("stage1Authority", {}).get("charge", {})
    if not isinstance(parameters, dict) or not isinstance(flash, dict) or not isinstance(charge, dict):
        raise ValueError("SIX_COMPONENT_EQUILIBRIUM_RESULT_INCOMPLETE")
    return candidate, np.asarray([parameters[name] for name in model.PARAMETER_NAMES], dtype=float), flash, charge


def stream(flow, mw):
    flow = np.asarray(flow, dtype=float)
    mass = flow * mw
    return {
        "componentMoles": flow.tolist(), "componentMass": mass.tolist(),
        "flowMol": float(flow.sum()), "mass": float(mass.sum()),
        "moleFractions": (flow / flow.sum()).tolist(),
        "massFractions": (mass / mass.sum()).tolist(),
    }


def continuation_encode(solution):
    r, e = solution
    return {"raffinateComponentMoles": plain(r), "extractComponentMoles": plain(e)}


def continuation_decode(value, count):
    try:
        r = np.asarray(value["raffinateComponentMoles"], dtype=float)
        e = np.asarray(value["extractComponentMoles"], dtype=float)
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("PREDICTIVE_NT_RESUME_STATE_INVALID") from exc
    if r.shape != (count, 6) or e.shape != (count, 6) or not np.all(np.isfinite(r)) or not np.all(np.isfinite(e)) or np.any(r <= 0) or np.any(e <= 0):
        raise ValueError("PREDICTIVE_NT_RESUME_STATE_INVALID")
    return r, e


def checkpoint(trial, continuation_state, protocol):
    trial_canonical = canonical(plain(trial))
    normalized_trial = json.loads(trial_canonical)
    if protocol != "ACK_V2":
        return normalized_trial, trial_canonical
    payload = {
        "continuationState": continuation_state,
        "trialCanonical": trial_canonical,
        "trialHash": hashlib.sha256(trial_canonical.encode()).hexdigest(),
    }
    payload_canonical = canonical(payload)
    payload_hash = hashlib.sha256(payload_canonical.encode()).hexdigest()
    print("PREDICTIVE_NT_CHECKPOINT %d %s %s" % (
        trial["stageCount"], payload_hash, base64.b64encode(payload_canonical.encode()).decode()
    ), file=sys.stderr, flush=True)
    if sys.stdin.readline().strip() != f"PREDICTIVE_NT_ACK {trial['stageCount']} {payload_hash}":
        raise RuntimeError("PREDICTIVE_NT_CHECKPOINT_NOT_ACKNOWLEDGED")
    return normalized_trial, trial_canonical


def enrich_trial(trial, feed, solvent, mw, feed_mass, targets):
    solution = trial.pop("_streamSolution")
    raffinate_product = trial.pop("_raffinateProduct")
    values, checks, targets_pass = cc.product_metrics(raffinate_product, feed_mass, mw, targets)
    for stage in trial["stages"]:
        for label in ("raffinateIncoming", "extractIncoming", "raffinateLeaving", "extractLeaving"):
            # Countercurrent already supplies phase fractions; add complete
            # component boundary flows without changing its numerical evidence.
            if label == "raffinateIncoming":
                arr = feed if stage["stageFromFeedEnd"] == 1 else solution[0][stage["stageFromFeedEnd"] - 2]
            elif label == "extractIncoming":
                arr = solvent if stage["stageFromFeedEnd"] == trial["stageCount"] else solution[1][stage["stageFromFeedEnd"]]
            elif label == "raffinateLeaving":
                arr = solution[0][stage["stageFromFeedEnd"] - 1]
            else:
                arr = solution[1][stage["stageFromFeedEnd"] - 1]
            stage[label].update(stream(arr, mw))
    b = trial["boundaryStreams"]
    b["oilFeed"] = {**b["oilFeed"], **stream(feed, mw)}
    b["freshNmp"] = {**b["freshNmp"], **stream(solvent, mw)}
    b["finalRaffinate"] = {**b["finalRaffinate"], **stream(solution[0][-1], mw)}
    b["finalExtract"] = {**b["finalExtract"], **stream(solution[1][0], mw)}
    trial["overallComponentBalanceResidualMass"] = (np.asarray(trial["overallComponentBalanceResidualMol"]) * mw).tolist()
    trial["productMetrics"] = values
    trial["targetCompliance"] = checks
    trial["numericalAcceptancePassed"] = bool(trial["accepted"])
    trial["allCalculableTargetsPass"] = bool(trial["numericalAcceptancePassed"] and targets_pass)
    trial["researchStatus"] = "RESEARCH_DIAGNOSTIC_NOT_ACCEPTED"
    trial["releaseEligible"] = False
    # A numerical gate can pass, but this unqualified model can never turn
    # that diagnostic into an accepted/release decision.
    trial["accepted"] = False
    return trial, continuation_encode(solution)


def main():
    request = json.loads(sys.stdin.readline())
    protocol_name = request.pop("_checkpointProtocol", None)
    resume = request.pop("_resume", None)
    starting_engine = engine_evidence()
    if request.get("engineHash") != starting_engine["engineHash"]:
        raise ValueError("PREDICTIVE_NT_REQUEST_ENGINE_HASH_MISMATCH")
    snapshot, s, snapshot_hash = stage1_from_request(request)
    equilibrium, parameters, flash, charge = get_equilibrium(request, s)
    if equilibrium.get("stage1Authority", {}).get("snapshotSha256") not in (None, snapshot_hash):
        raise ValueError("STAGE1_AUTHORITY_MISMATCH")
    temperature_k = float(s["operatingTemperatureC"]) + 273.15
    maximum = int(s["maximumStages"])
    if maximum < 1 or maximum != float(s["maximumStages"]):
        raise ValueError("STAGE1_INVALID_NT_RANGE")
    if "maximumStages" in request and int(request["maximumStages"]) != maximum:
        raise ValueError("STAGE1_MAXIMUM_STAGES_OVERRIDE_FORBIDDEN")
    feed_mass = np.asarray([s[k] for k in ("saturatesWt", "monoAromaticsWt", "diAromaticsWt", "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt")], dtype=float)
    if not np.isclose(feed_mass.sum(), 100., atol=1e-10, rtol=0):
        raise ValueError("STAGE1_INVALID_FEED_COMPOSITION")
    purity, water = float(s["nmpPurityWt"]), float(s["nmpWaterWt"])
    ratio = float(s["solventOilRatio"])
    if not (0 < purity <= 100 and 0 <= water <= 100 and ratio >= 0):
        raise ValueError("STAGE1_INVALID_FRESH_SOLVENT_COMPOSITION")
    mw_map = charge.get("molecularWeightsGmol", {})
    mw = np.asarray([mw_map[n] for n in FAMILIES], dtype=float)
    # The thermodynamic charge is pure NMP on the saved S/O oil basis.  Saved
    # purity/water values remain authority/specification metadata only: WATER
    # and an unspecified impurity must never become flash components.
    fresh_nmp_mass = 100. * ratio
    if fresh_nmp_mass <= 0:
        raise ValueError("STAGE1_SOLVENT_SIDE_NMP_INLET_MUST_BE_POSITIVE")
    feed, solvent = feed_mass / mw, np.asarray([0, 0, 0, 0, 0, fresh_nmp_mass]) / mw
    targets = charge.get("targets")
    if not isinstance(targets, dict):
        raise ValueError("STAGE1_TARGETS_MISSING")
    seed = {"raffinate": np.asarray(flash["raffinate"]), "extract": np.asarray(flash["extract"]), "beta": float(flash["betaExtract"]), "mw": mw}
    trials, checkpoint_trial_canonicals, previous, start = [], [], None, 1
    input_hash = digest(request)
    if resume is not None:
        trials = resume.get("trials")
        acknowledged = resume.get("acknowledgedStageCount")
        if not isinstance(trials, list) or not isinstance(acknowledged, int) or acknowledged < 1 or acknowledged > maximum or len(trials) != acknowledged or any(t.get("stageCount") != i + 1 for i, t in enumerate(trials)):
            raise ValueError("PREDICTIVE_NT_RESUME_PREFIX_INVALID")
        previous = continuation_decode(resume.get("continuationState"), acknowledged)
        # Resumed trials were already ACKed.  Re-canonicalize their parsed
        # values so the same value-level invariant is checked at final output.
        checkpoint_trial_canonicals = [canonical(plain(trial)) for trial in trials]
        trials = [json.loads(value) for value in checkpoint_trial_canonicals]
        start = acknowledged + 1
        print(f"PREDICTIVE_NT_RESUME {acknowledged} {start}", file=sys.stderr, flush=True)
    for count in range(start, maximum + 1):
        raw = cc.solve_cascade(count, temperature_k, feed, solvent, parameters, cc.load_json(COUNTER / "protocol.json"), seed, previous)
        trial, previous_state = enrich_trial(raw, feed, solvent, mw, feed_mass, targets)
        # continuation is only allowed after equation closure, exactly as the
        # governed cascade specifies.
        previous = continuation_decode(previous_state, count) if trial["maximumScaledEquationResidual"] <= cc.load_json(COUNTER / "protocol.json")["numericalAcceptance"]["maximumScaledEquationResidual"] else None
        normalized_trial, trial_canonical = checkpoint(
            trial, previous_state, protocol_name
        )
        # Retain exactly the normalized value represented by trialCanonical.
        # This prevents later output normalization from drifting from the
        # acknowledged checkpoint.
        trials.append(normalized_trial)
        checkpoint_trial_canonicals.append(trial_canonical)
        print(f"PREDICTIVE_NT_PROGRESS {count} {maximum}", file=sys.stderr, flush=True)
    if (
        len(checkpoint_trial_canonicals) != len(trials)
        or any(
            canonical(plain(trial)) != acknowledged_canonical
            for trial, acknowledged_canonical in zip(
                trials, checkpoint_trial_canonicals
            )
        )
    ):
        raise RuntimeError("PREDICTIVE_NT_FINAL_CHECKPOINT_TRIAL_MISMATCH")
    # Selection is a reported numerical diagnostic only.  It is intentionally
    # separate from the worker's research-only/non-accepted decision.
    diagnostic_selection = next((
        trial for trial in trials
        if trial.get("numericalAcceptancePassed") and trial.get("allCalculableTargetsPass")
    ), None)
    # The amended six-component model remains explicitly NOT_QUALIFIED.  A
    # numerically closed research trial is useful diagnostic evidence, but it
    # must never be surfaced as predictive N_T until the frozen thermodynamic
    # qualification (including post-split TPD stability) is accepted.
    counter_protocol = cc.load_json(COUNTER / "protocol.json")
    thermodynamic_qualification_accepted, qualification_status = (
        thermodynamic_qualification(counter_protocol)
    )
    sequence_evidence_available = bool(trials) and all(
        isinstance(trial.get("monotonicFromPrevious"), bool) for trial in trials
    )
    ending_engine = engine_evidence()
    if ending_engine["engineHash"] != starting_engine["engineHash"]:
        raise RuntimeError("PREDICTIVE_NT_ENGINE_CHANGED_DURING_EXECUTION")
    final = {
        "status": "RESEARCH_DIAGNOSTIC_NOT_ACCEPTED",
        "executionMode": "USER_SAVED_STAGE1_RESEARCH_DIAGNOSTIC",
        "releaseEligible": False, "calibrationRequired": True, "pilotValidated": False,
        "sulfurPrediction": {"status": "NOT_CALCULABLE"},
        "componentOrder": FAMILIES, "modelIdentity": cc.load_json(COUNTER / "protocol.json")["modelIdentity"],
        "engine": ending_engine,
        "stage1Authority": {"snapshotSha256": snapshot_hash, "immutableHash": snapshot["immutableHash"], "stageRange": {"minimum": 1, "maximum": maximum}, "feedMassBasis": dict(zip(FAMILIES, feed_mass.tolist())), "freshModeledNmpMassBasis": fresh_nmp_mass, "nmpPurityAndWaterSpecificationOnly": {"nmpPurityWt": purity, "nmpWaterWt": water}},
        "inputHash": input_hash,
        "predictiveNt": (
            diagnostic_selection["stageCount"]
            if thermodynamic_qualification_accepted and diagnostic_selection
            else None
        ),
        "predictiveNtAssignment": {
            "status": (
                "ASSIGNED_FROM_VERIFIED_THERMODYNAMIC_QUALIFICATION"
                if thermodynamic_qualification_accepted and diagnostic_selection
                else qualification_status
            ),
            "thermodynamicQualificationAccepted": thermodynamic_qualification_accepted,
            "postSplitTpdThreshold": counter_protocol["numericalAcceptance"]["postSplitTpdThreshold"],
            "numericalDiagnosticCandidateStageCount": (
                diagnostic_selection["stageCount"] if diagnostic_selection else None
            ),
        },
        "monotonicSequence": (
            all(trial["monotonicFromPrevious"] for trial in trials)
            if sequence_evidence_available else False
        ),
        "diagnosticSelectionBasis": (
            "FIRST_STAGE_WITH_NUMERICAL_ACCEPTANCE_AND_ALL_CALCULABLE_PRODUCT_TARGETS_PASS; "
            "RESEARCH_DIAGNOSTIC_ONLY_NOT_GOVERNED_OR_ACCEPTED"
        ),
        "trials": trials,
    }
    json.dump(plain(final), sys.stdout, separators=(",", ":"), allow_nan=False)


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        # Importing the real cascade is itself the guard against accidentally
        # deploying the legacy five-component UNIQUAC path.
        evidence = engine_evidence()
        # engine_hash checks every listed file, while these fields make the
        # scientific closure of the preflight response auditable.
        print(canonical({
            "status": "PASS", "python": f"{sys.version_info.major}.{sys.version_info.minor}",
            "engineId": ENGINE_ID, "engineHash": evidence["engineHash"],
            "componentOrder": FAMILIES,
            "modelIdentity": cc.load_json(COUNTER / "protocol.json")["modelIdentity"],
            "verifiedScientificInputCount": evidence["scientificRuntimeFileCount"],
            "verifiedScientificInputAggregateSha256": evidence["scientificRuntimeAggregateSha256"],
            "verifiedNativeDependencyCount": evidence["nativeDependencyCount"],
            "verifiedNativeDependencyAggregateSha256": evidence["nativeDependencyAggregateSha256"],
            "runtimeManifestStatus": evidence["runtimeManifestStatus"],
            "runtimeIdentity": evidence["runtimeIdentity"],
        }))
    else:
        try:
            main()
        except Exception as exc:
            json.dump({"status": "ENGINE_ERROR", "error": f"{type(exc).__name__}: {exc}", "releaseEligible": False, "sulfurPrediction": {"status": "NOT_CALCULABLE"}}, sys.stdout, separators=(",", ":"))
            sys.exit(1)