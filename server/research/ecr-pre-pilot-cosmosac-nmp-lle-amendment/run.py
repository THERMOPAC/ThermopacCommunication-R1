#!/usr/bin/env python3
"""Fit, validate, and execute the research-only NMP LLE amendment."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

import model

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
DATA_PATH = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
COTO_PATH = ROOT / "server/engine-framework/cel/coto2022-nmp-lle.ts"
PROTOCOL_PATH = HERE / "protocol.json"
DEFAULT_SNAPSHOT = HERE / "stage1-qualification-snapshot.json"
DEFAULT_OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
PRIOR_PROTOCOL_PATH = ROOT / "server/research/ecr-pre-pilot-cosmosac-qualification/protocol.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def require_number(stage1, key, minimum=0.0):
    value = stage1.get(key)
    if not isinstance(value, (int, float)) or not model.math.isfinite(value) or value < minimum:
        raise ValueError(f"STAGE1_REQUIRED_INPUT_INVALID:{key}")
    return float(value)


def resolve_stage1(snapshot):
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("stage1"), dict):
        raise ValueError("STAGE1_SNAPSHOT_REQUIRED")
    s = snapshot["stage1"]
    prior = snapshot.get("authoritativePriorProtocol", {})
    if prior.get("path") != str(PRIOR_PROTOCOL_PATH.relative_to(ROOT)) or prior.get("sha256") != sha(PRIOR_PROTOCOL_PATH):
        raise ValueError("STAGE1_PRIOR_PROTOCOL_BINDING_INVALID")
    composition_keys = {
        "SAT": "saturatesWt", "MONO": "monoAromaticsWt", "DI": "diAromaticsWt",
        "POLY": "polyAromaticsWt", "PA": "polarAromaticsWt", "NMP": "nmpInFeedWt",
    }
    feed = {family: require_number(s, key) for family, key in composition_keys.items()}
    if abs(sum(feed.values()) - 100.0) >= 0.005:
        raise ValueError("STAGE1_COMPOSITION_DOES_NOT_CLOSE")
    if s.get("satIdentity") != "n-dodecane" or s.get("monoIdentity") != "n-propylbenzene":
        raise ValueError("STAGE1_PROFILE_IDENTITY_NOT_AVAILABLE")
    expected_fixed = {
        "diIdentity": "1-methylnaphthalene", "polyIdentity": "pyrene",
        "paCas": "10081-67-1", "nmpIdentity": "N-methyl-2-pyrrolidone",
    }
    if any(s.get(key) != value for key, value in expected_fixed.items()):
        raise ValueError("STAGE1_FIXED_IDENTITY_MISMATCH")
    temperature_k = require_number(s, "operatingTemperatureC") + 273.15
    solvent_ratio = require_number(s, "solventOilRatio", 1e-12)
    purity = require_number(s, "nmpPurityWt") / 100.0
    water = require_number(s, "nmpWaterWt") / 100.0
    if purity > 1.0 or water > 1.0 or purity + water > 1.000001:
        raise ValueError("STAGE1_NMP_PURITY_WATER_BASIS_INVALID")
    targets = {
        "minimumRaffinateSaturatesWt": require_number(s, "minimumRaffinateSaturatesWt"),
        "maximumRaffinateTotalAromaticsWt": require_number(s, "targetRaffinateTotalAromaticsWt"),
        "maximumRaffinatePolarAromaticsWt": require_number(s, "targetRaffinatePolarAromaticsWt"),
        "minimumNmpFreeRecoveryPct": require_number(s, "minimumRecoveryPct"),
        "maximumNmpRaffinateWt": require_number(s, "maximumNmpRaffinateWt"),
        "targetRaffinateSulfurPpm": require_number(s, "targetRaffinateSulfurPpm"),
        "maximumStages": require_number(s, "maximumStages"),
    }
    masses = dict(feed)
    fresh_solvent_mass = 100.0 * solvent_ratio
    masses["NMP"] += fresh_solvent_mass * purity
    mws = {name: float(model.base.COMP[name][4]) for name in model.FAMILIES}
    moles = {name: masses[name] / mws[name] for name in model.FAMILIES}
    total_moles = sum(moles.values())
    z = [moles[name] / total_moles for name in model.FAMILIES]
    return {
        "temperatureK": temperature_k,
        "feedMassPercent": feed,
        "chargeMassBasis": masses,
        "freshSolventMassBasis": fresh_solvent_mass,
        "effectiveFreshNmpMassBasis": fresh_solvent_mass * purity,
        "excludedWaterMassBasis": fresh_solvent_mass * water,
        "unrepresentedFreshSolventImpurityMassBasis": fresh_solvent_mass * max(0.0, 1.0 - purity - water),
        "waterTreatment": "EXCLUDED_BASIS_CORRECTION_NOT_A_SEVENTH_FLASH_COMPONENT",
        "molecularWeightsGmol": mws,
        "totalChargeMoles": total_moles,
        "overallMolarComposition": dict(zip(model.FAMILIES, z)),
        "targets": targets,
    }


def process_metrics(charge, flash):
    names = model.FAMILIES
    mws = charge["molecularWeightsGmol"]
    total_moles = charge["totalChargeMoles"]
    beta = flash["betaExtract"]
    r = dict(zip(names, flash["raffinate"]))
    e = dict(zip(names, flash["extract"]))
    r_mass = {n: (1.0 - beta) * total_moles * r[n] * mws[n] for n in names}
    e_mass = {n: beta * total_moles * e[n] * mws[n] for n in names}
    hydro = ("SAT", "MONO", "DI", "POLY", "PA")
    r_hydro = sum(r_mass[n] for n in hydro)
    r_total = r_hydro + r_mass["NMP"]
    initial_hydro = sum(charge["chargeMassBasis"][n] for n in hydro)
    values = {
        "raffinateSaturatesWtNmpFree": 100.0 * r_mass["SAT"] / r_hydro,
        "raffinateTotalAromaticsWtNmpFree": 100.0 * sum(r_mass[n] for n in ("MONO", "DI", "POLY")) / r_hydro,
        "raffinatePolarAromaticsWtNmpFree": 100.0 * r_mass["PA"] / r_hydro,
        "nmpFreeHydrocarbonRecoveryPct": 100.0 * r_hydro / initial_hydro,
        "nmpInTotalRaffinateWt": 100.0 * r_mass["NMP"] / r_total,
        "satLossPct": 100.0 * e_mass["SAT"] / charge["chargeMassBasis"]["SAT"],
        "componentExtractionPct": {
            n: 100.0 * e_mass[n] / charge["chargeMassBasis"][n]
            for n in ("MONO", "DI", "POLY", "PA")
        },
        "phaseMassesOn100OilBasis": {"raffinate": r_mass, "extract": e_mass},
    }
    t = charge["targets"]
    compliance = {
        "minimumRaffinateSaturatesWt": {
            "target": t["minimumRaffinateSaturatesWt"], "calculated": values["raffinateSaturatesWtNmpFree"],
            "basis": "NMP-free five-family hydrocarbon mass", "status": "PASS" if values["raffinateSaturatesWtNmpFree"] >= t["minimumRaffinateSaturatesWt"] else "FAIL",
        },
        "maximumRaffinateTotalAromaticsWt": {
            "target": t["maximumRaffinateTotalAromaticsWt"], "calculated": values["raffinateTotalAromaticsWtNmpFree"],
            "basis": "MONO+DI+POLY on NMP-free hydrocarbon mass", "status": "PASS" if values["raffinateTotalAromaticsWtNmpFree"] <= t["maximumRaffinateTotalAromaticsWt"] else "FAIL",
        },
        "maximumRaffinatePolarAromaticsWt": {
            "target": t["maximumRaffinatePolarAromaticsWt"], "calculated": values["raffinatePolarAromaticsWtNmpFree"],
            "basis": "PA on NMP-free hydrocarbon mass", "status": "PASS" if values["raffinatePolarAromaticsWtNmpFree"] <= t["maximumRaffinatePolarAromaticsWt"] else "FAIL",
        },
        "minimumNmpFreeRecoveryPct": {
            "target": t["minimumNmpFreeRecoveryPct"], "calculated": values["nmpFreeHydrocarbonRecoveryPct"],
            "basis": "recovered five-family hydrocarbon mass / oil-feed hydrocarbon mass", "status": "PASS" if values["nmpFreeHydrocarbonRecoveryPct"] >= t["minimumNmpFreeRecoveryPct"] else "FAIL",
        },
        "maximumNmpRaffinateWt": {
            "target": t["maximumNmpRaffinateWt"], "calculated": values["nmpInTotalRaffinateWt"],
            "basis": "total raffinate mass", "status": "PASS" if values["nmpInTotalRaffinateWt"] <= t["maximumNmpRaffinateWt"] else "FAIL",
        },
        "targetRaffinateSulfurPpm": {
            "target": t["targetRaffinateSulfurPpm"], "calculated": None, "basis": "independent sulfur model required", "status": "NOT_CALCULABLE",
        },
        "maximumStages": {
            "target": t["maximumStages"], "calculated": None, "basis": "counter-current multistage extraction requirement N_T <= 10", "status": "NOT_EVALUATED_BY_EQUILIBRIUM_FLASH",
        },
    }
    return {"values": values, "targetCompliance": compliance}


def coto_transfer(parameters):
    text = COTO_PATH.read_text()
    pattern = r"\{ x: \[([^\]]+)\], y: \[([^\]]+)\], tableOrder: (\d+)"
    residuals = []
    for a, b, _ in re.findall(pattern, text):
        x5 = [float(v.strip()) for v in a.split(",")]
        y5 = [float(v.strip()) for v in b.split(",")]
        x = [x5[0], x5[1], x5[2], x5[3], 1e-12, x5[4]]
        y = [y5[0], y5[1], y5[2], y5[3], 1e-12, y5[4]]
        x = model.normalize(x); y = model.normalize(y)
        mur = model.np.log(x) + model.total_lngamma(model.FAMILIES, 298.15, x, parameters)
        mue = model.np.log(y) + model.total_lngamma(model.FAMILIES, 298.15, y, parameters)
        residuals.extend((mur - mue)[[0, 1, 2, 3, 5]].tolist())
    return {
        "rows": 17,
        "activityEqualityRms": float(model.np.sqrt(model.np.mean(model.np.square(residuals)))),
        "role": "EXTERNAL_DI_POLY_TRANSFER_CHECK_NOT_FITTED_NOT_RECONSTRUCTED_AS_FEEDS",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage1-snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument("--output-dir", type=Path, default=Path(os.environ.get("TASK199_OUTPUT_DIR", DEFAULT_OUT)))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    protocol = json.loads(PROTOCOL_PATH.read_text())
    snapshot = json.loads(args.stage1_snapshot.read_text())
    charge = resolve_stage1(snapshot)
    evidence = json.loads(DATA_PATH.read_text())
    parameters, partitions = model.fit_parameters(evidence["tieLines"], protocol)
    validation = {
        key: model.validation_metrics(parameters, partitions[key])
        for key in ("training", "heldOutTemperature", "heldOutMolecularSystem")
    }
    validation["cotoFiveComponentTransfer"] = coto_transfer(parameters)
    ceiling = protocol["fit"]["quantitativeCompositionRmsdCeiling"]
    for key in ("training", "heldOutTemperature", "heldOutMolecularSystem"):
        validation[key]["ceiling"] = ceiling
        validation[key]["status"] = "PASS" if validation[key]["compositionRmsd"] <= ceiling else "FAIL"
    flash = model.flash(
        model.FAMILIES, charge["temperatureK"],
        [charge["overallMolarComposition"][n] for n in model.FAMILIES],
        parameters, protocol,
    )
    metrics = process_metrics(charge, flash) if flash["accepted"] else None
    quantitative_pass = all(validation[k]["status"] == "PASS" for k in ("training", "heldOutTemperature", "heldOutMolecularSystem"))
    result = {
        "schemaVersion": "1.0.0",
        **protocol["governance"],
        "model": {
            "identity": protocol["modelIdentity"],
            "baseActivityDefinition": protocol["baseActivityDefinition"],
            "residualEquation": protocol["residualEquation"],
            "parameters": dict(zip(model.PARAMETER_NAMES, map(float, parameters))),
            "parameterFitDiagnostics": partitions["fitDiagnostics"],
        },
        "stage1Authority": {
            "snapshotPath": str(args.stage1_snapshot.relative_to(ROOT)),
            "snapshotSha256": sha(args.stage1_snapshot),
            "sourceStatement": snapshot.get("source"),
            "charge": charge,
        },
        "evidence": {
            "sourceSha256": sha(DATA_PATH),
            "citation": evidence["citation"],
            "partition": protocol["evidencePartition"],
            "validation": validation,
        },
        "stage1Prediction": {
            "status": "ACCEPTED_TWO_LIQUID_RESEARCH_PREDICTION" if flash["accepted"] else "NOT_QUALIFIED",
            "flash": flash,
            "phaseCompositions": {
                "componentOrder": list(model.FAMILIES),
                "oilRichRaffinate": flash["raffinate"] if flash["accepted"] else None,
                "nmpRichExtract": flash["extract"] if flash["accepted"] else None,
                "extractMolarPhaseFraction": flash["betaExtract"] if flash["accepted"] else None,
                "KExtractOverRaffinate": dict(zip(model.FAMILIES, flash["K"])) if flash["accepted"] else None,
            },
            "processMetrics": metrics,
            "downstreamProcessConstraint": {
                "process": "COUNTER_CURRENT_MULTISTAGE_EXTRACTION",
                "theoreticalStageRequirement": "N_T <= 10",
                "maximumTheoreticalStages": charge["targets"]["maximumStages"],
                "status": "NOT_EVALUATED_BY_SINGLE_STAGE_EQUILIBRIUM_FLASH",
            },
        },
        "qualification": {
            "quantitativeLleGate": "PASSED" if quantitative_pass else "FAILED",
            "fullSixComponentModelQualification": "NOT_QUALIFIED" if not quantitative_pass else "CALIBRATION_REQUIRED_PA_PROVISIONAL",
            "stage1TwoLiquidNumericalGate": "PASSED" if flash["accepted"] else "FAILED",
            "reason": "Blind analogue composition RMSD exceeds the frozen 0.03 ceiling." if not quantitative_pass else "Numerical and analogue gates passed; direct PA evidence remains unavailable.",
        },
    }
    results_path = args.output_dir / "results.json"
    results_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report = [
        "# COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL",
        "",
        "Research-only, calibration-required, non-pilot-validated, and non-release-eligible.",
        "",
        "## Stage 1 equilibrium",
        f"- Status: `{result['stage1Prediction']['status']}`",
        f"- Minimum TPD: {flash['minimumTpd']:.12e}",
        f"- Gibbs reduction: {flash['gibbsReduction']:.12e}",
        f"- Isoactivity residual: {flash['isoactivityLogResidual']:.12e}",
        f"- Material-balance residual: {flash['materialBalanceMaxResidual']:.12e}",
        f"- Extract molar phase fraction: {flash['betaExtract']:.10f}",
        "",
        "## Phase mole fractions",
    ]
    for i, name in enumerate(model.FAMILIES):
        report.append(f"- {name}: raffinate={flash['raffinate'][i]:.10f}; extract={flash['extract'][i]:.10f}; K={flash['K'][i]:.10f}")
    report += [
        "",
        "## Full tangent-space phase stability",
        "",
        "Each returned phase was checked in all five independent composition-tangent dimensions. "
        "The eigenspectrum was reconstructed independently from reduced-Gibbs differences and "
        "from the projected chemical-potential Jacobian at log-ratio steps 1e-3, 5e-4, and 2.5e-4.",
    ]
    for phase in ("raffinate", "extract"):
        stability = flash["postSplitTangentStability"][phase]
        search = flash["postSplitTpdSearch"][phase]
        report += [
            f"- {phase}: minimum eigenvalue={stability['minimumEigenvalue']:.12e}; "
            f"maximum modewise relative reconstruction difference={stability['maximumModewiseRelativeEigenvalueDifference']:.12e}; "
            f"post-split minimum TPD={search['minimum']:.12e}; "
            f"global/reference seeds={search['seedClasses']['globalSimplexAndReference']}; "
            f"local seeds={search['seedClasses']['phaseLocalLogRatioPerturbations']}.",
        ]
    report += ["", "## Blind validation"]
    for key, value in validation.items():
        report.append(f"- {key}: {value}")
    report += ["", "## Process targets"]
    if metrics:
        for key, value in metrics["targetCompliance"].items():
            report.append(f"- {key}: {value}")
    report += [
        "",
        "## Decision",
        f"`FULL_SIX_COMPONENT_MODEL_QUALIFICATION = {result['qualification']['fullSixComponentModelQualification']}`",
        "",
        result["qualification"]["reason"],
        "Sulfur remains `NOT_CALCULABLE`. PA transfer is provisional and is not sulfur removal.",
    ]
    report_path = args.output_dir / "report.md"
    report_path.write_text("\n".join(report) + "\n")
    manifest = {
        "schemaVersion": "1.0.0",
        "inputs": {
            "protocol": sha(PROTOCOL_PATH), "stage1Snapshot": sha(args.stage1_snapshot),
            "lleEvidence": sha(DATA_PATH), "cotoEvidenceModule": sha(COTO_PATH),
            "baseEngine": sha(model.BASE_PATH),
            "priorStage1Protocol": sha(PRIOR_PROTOCOL_PATH),
        },
        "implementation": {"runner": sha(HERE / "run.py"), "model": sha(HERE / "model.py")},
        "outputs": {"results": sha(results_path), "report": sha(report_path)},
        "parameterVectorSha256": canonical_sha(result["model"]["parameters"]),
    }
    (args.output_dir / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"output": str(args.output_dir), "stage1": result["stage1Prediction"]["status"], "qualification": result["qualification"]}, indent=2))


if __name__ == "__main__":
    main()