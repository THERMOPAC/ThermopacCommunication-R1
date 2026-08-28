#!/usr/bin/env python3
"""Fail-closed molecular-descriptor transfer qualification."""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
import hashlib, json, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
U = ROOT / "server/research/ecr-pre-pilot-uniquac"
VENDOR = ROOT / "server/research/ecr-pre-pilot-cosmors/vendor/python"
sys.path[:0] = [str(U), str(VENDOR)]
import run as uq
import numpy as np
from scipy.optimize import least_squares

OUT = ROOT / ".agents/outputs/ecr-pre-pilot-descriptor-transfer"
REG = HERE / "descriptor-registry.json"
SPLIT = HERE / "frozen-holdouts.json"
PROTOCOL = HERE / "frozen-protocol.json"
FIT_START = HERE / "fit-start.json"
REGISTRATION_REFERENCE = HERE / "registration-commit.txt"
DATA = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
FIT_NAMES = ("carbonNumber", "longestSideChainCarbons")
SCALES = np.array([5., 5.])
BASE_PM = [{"i": i, "j": j, "from": uq.FAMILIES[i], "to": uq.FAMILIES[j],
            "form": "a+b/T", "b_fixed": None}
           for i in (0, 1, 4) for j in (0, 1, 4) if i != j]
NBASE = 2 * len(BASE_PM)
NFEATURE = 2 * len(FIT_NAMES)
NPAR = NBASE + 2 * NFEATURE

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def descriptors(reg, identity):
    raw = reg["molecules"][identity]
    order = reg["descriptorOrder"]
    return {name: raw[order.index(name)] for name in order}

def pair_features(reg, row, mapping):
    by_family = {i: descriptors(reg, name) for i, name in zip(row["active"], row["identities"])}
    fs, ft = by_family[mapping["i"]], by_family[mapping["j"]]
    return np.r_[[fs[n] for n in FIT_NAMES], [ft[n] for n in FIT_NAMES]] / np.r_[SCALES, SCALES]

def local_parameters(theta, row, reg):
    a_slopes = theta[NBASE:NBASE + NFEATURE]
    b_slopes = theta[NBASE + NFEATURE:]
    out = []
    for k, mapping in enumerate(BASE_PM):
        f = pair_features(reg, row, mapping)
        out.extend((theta[2*k] + f @ a_slopes, theta[2*k+1] + f @ b_slopes))
    return np.asarray(out)

def fit(rows, reg):
    old_pm, old_gamma = uq.PM, uq.gamma
    uq.PM = BASE_PM
    def gamma(v, row, theta):
        return old_gamma(v, row, local_parameters(theta, row, reg))
    uq.gamma = gamma
    def measurement(theta, rr=rows):
        residuals = []
        for row in rr:
            gx, gy = gamma(row["x"], row, theta), gamma(row["y"], row, theta)
            residuals.extend(np.log(row["x"][i]) + gx[i] - np.log(row["y"][i]) - gy[i]
                             for i in row["active"] if row["x"][i] > 0 and row["y"][i] > 0)
        return np.asarray(residuals)
    def objective(theta):
        regularization = np.r_[np.tile([np.sqrt(1e-3), np.sqrt(1e-7)], len(BASE_PM)),
                                np.full(NFEATURE, np.sqrt(3e-3)),
                                np.full(NFEATURE, np.sqrt(3e-7))]
        return np.r_[measurement(theta), regularization * theta]
    lo = np.r_[np.tile([-8., -2000.], len(BASE_PM)), np.full(NFEATURE, -4.), np.full(NFEATURE, -1000.)]
    hi = -lo
    x0 = np.asarray(json.loads(FIT_START.read_text())["parameters"], dtype=float)
    if x0.shape != (NPAR,):
        raise RuntimeError("fit warm-start dimension mismatch")
    solved = least_squares(objective, x0, bounds=(lo, hi), jac="2-point",
                           x_scale="jac", max_nfev=1500, ftol=1e-10, xtol=1e-10, gtol=1e-10)
    residual = measurement(solved.x)
    jac = np.empty((len(residual), NPAR))
    for j in range(NPAR):
        h = 1e-5 * max(1., abs(solved.x[j]))
        plus, minus = solved.x.copy(), solved.x.copy()
        plus[j] += h; minus[j] -= h
        jac[:, j] = (measurement(plus) - measurement(minus)) / (2*h)
    sv = np.linalg.svd(jac, compute_uv=False)
    tol = sv[0] * max(jac.shape) * np.finfo(float).eps
    rank = int((sv > tol).sum())
    sigma2 = float(residual @ residual / max(1, len(residual) - rank))
    covariance = sigma2 * np.linalg.pinv(jac.T @ jac, rcond=1e-10)
    diagnostics = {
        "success": bool(solved.success), "message": solved.message, "nfev": int(solved.nfev),
        "measurementRows": len(residual), "parameterCount": NPAR, "rank": rank,
        "unidentifiableDirections": NPAR-rank,
        "practicallyWeakDirections": int(np.sum(sv/sv[0] < 1e-4)),
        "conditionNumber": float(sv[0]/sv[-1]) if sv[-1] else None,
        "singularValues": sv.tolist(), "measurementRss": float(residual @ residual),
        "standardErrors": np.sqrt(np.maximum(0., np.diag(covariance))).tolist(),
        "uncertaintyCaveat": "linearized local covariance; weak/rank-deficient directions make extrapolation uncertainty non-Gaussian"
    }
    uq.gamma, uq.PM = old_gamma, old_pm
    return solved.x, diagnostics, covariance

def flash_one(args):
    row, theta, reg, label = args
    old_pm, old_gamma, old_stand = uq.PM, uq.gamma, uq.stand_gamma
    uq.PM = BASE_PM
    def gamma(v, row, ignored):
        return old_gamma(v, row, local_parameters(theta, row, reg))
    def stand(v, row, ignored, log_name="standaloneFinalGate"):
        return old_stand(v, row, local_parameters(theta, row, reg), log_name)
    uq.gamma, uq.stand_gamma = gamma, stand
    value = uq.validate([row], np.zeros(1), label)[0]
    uq.gamma, uq.stand_gamma, uq.PM = old_gamma, old_stand, old_pm
    return value

def qualify(rows, theta, reg, label):
    # Rows are independent after parameter freeze. Ordered process mapping keeps
    # byte output deterministic while avoiding any weakening of flash searches.
    with ProcessPoolExecutor(max_workers=min(4, len(rows))) as pool:
        values = list(pool.map(flash_one, [(row, theta, reg, label) for row in rows]))
    records = []
    for value, source_row in zip(values, rows):
        final = value.get("independentFinalPhaseChecks")
        active = source_row["active"]
        if value["phaseBehavior"] == "PREDICTED_TWO_PHASE":
            errors = np.r_[[value["RRBO_rich"][i]-source_row["x"][i] for i in active],
                           [value["NMP_rich"][i]-source_row["y"][i] for i in active]]
            row_rmsd = float(np.sqrt(errors @ errors / len(errors)))
            squared_error = float(errors @ errors)
        else:
            row_rmsd, squared_error = None, None
        if value["phaseBehavior"] == "PREDICTED_TWO_PHASE":
            checks_pass = bool(uq.seed_contract(value) and final and final["pass"] and
                               value.get("gibbsDecrease", 0) > 1e-8 and
                               value.get("massBalanceMaxResidual", 1) < 1e-9 and
                               value.get("isoactivityLogResidual", 1) < 2e-4)
            diagnostic = "PASS" if checks_pass else "FAIL_THERMODYNAMIC_CHECK"
        elif value["phaseBehavior"] == "NONCONVERGED_OR_BOUNDARY":
            checks_pass, diagnostic = False, "FAIL_NONCONVERGED_OR_BOUNDARY"
        elif value["phaseBehavior"] == "AMBIGUOUS_UNRESOLVED":
            checks_pass, diagnostic = False, "FAIL_AMBIGUOUS_UNRESOLVED"
        else:
            checks_pass, diagnostic = False, "FAIL_TOPOLOGY_SINGLE_PHASE_FOR_MEASURED_TIE_LINE"
        records.append({
            "id": value["id"], "T_K": value["T_K"], "phaseBehavior": value["phaseBehavior"],
            "compositionRmsd": row_rmsd, "activeEndpointComponentCount": 2*len(active),
            "activeEndpointSquaredError": squared_error,
            "tpd": {"minimum": value["stabilityTPDMinimum"],
                    "latticePoints": value["stabilityLattice"]["point_count"],
                    "refinementAttempts": value["stabilityLattice"]["refinement_attempts"],
                    "distinctRefinedBasins": value["stabilityLattice"]["distinct_refined_basins"]},
            "seedContractPass": uq.seed_contract(value),
            "ambiguityComparisons": value.get("clusterComparisons", []),
            "conservationMax": value.get("massBalanceMaxResidual"),
            "isoactivityMax": value.get("isoactivityLogResidual"),
            "gibbsDecrease": value.get("gibbsDecrease"),
            "independentFinalPhaseChecks": final,
            "qualificationOutcome": "PASS" if checks_pass else "FAIL",
            "diagnosticStatus": diagnostic,
            "qualified": checks_pass
        })
    accepted = [r for r in records if r["compositionRmsd"] is not None]
    sse = sum(r["activeEndpointSquaredError"] for r in accepted)
    count = sum(r["activeEndpointComponentCount"] for r in accepted)
    metrics = {"rows": len(records), "twoPhase": len(accepted),
               "topologyRecall": len(accepted)/len(records),
               "tieLineRmsd": float(np.sqrt(sse/count)) if accepted else None,
               "tieLineRmsdFormula": "sqrt(sum((predicted-measured)^2) / N) over both endpoints and active components only",
               "activeEndpointComponentCount": count}
    return records, metrics

def applicability(rows, train, reg):
    train_molecules = {}
    for row in train:
        for family, identity in zip(row["active"], row["identities"]):
            train_molecules.setdefault(family, set()).add(identity)
    train_systems = {tuple(row["identities"][:2]) for row in train}
    identities = []
    max_distance = 0.
    all_inside = True
    for row in rows:
        for family, identity in zip(row["active"], row["identities"]):
            if any(x["identity"] == identity and x["family"] == uq.FAMILIES[family] for x in identities):
                continue
            d = descriptors(reg, identity)
            candidates = sorted(train_molecules.get(family, set()))
            vectors = [np.array([descriptors(reg, x)[n] for n in FIT_NAMES])/SCALES for x in candidates]
            vector = np.array([d[n] for n in FIT_NAMES])/SCALES
            distance = min((float(np.linalg.norm(vector-v)) for v in vectors), default=float("inf"))
            ranges = {n: [min(descriptors(reg, x)[n] for x in candidates),
                          max(descriptors(reg, x)[n] for x in candidates)] for n in FIT_NAMES} if candidates else {}
            inside = bool(candidates and all(ranges[n][0] <= d[n] <= ranges[n][1] for n in FIT_NAMES))
            all_inside &= inside
            max_distance = max(max_distance, distance)
            identities.append({"identity": identity, "family": uq.FAMILIES[family],
                               "seenIdentityInTraining": identity in candidates,
                               "insideSameFamilyCoordinateBox": inside,
                               "nearestTrainingNormalizedDescriptorDistance": distance,
                               "fitFeatureTrainingRanges": ranges})
    systems = sorted({tuple(row["identities"][:2]) for row in rows})
    tmin, tmax = min(r["T"] for r in train), max(r["T"] for r in train)
    temperatures = sorted({r["T"] for r in rows})
    temperature_inside = all(tmin <= t <= tmax for t in temperatures)
    return {"identityDetails": identities, "allMoleculesInsideSameFamilyCoordinateBox": all_inside,
            "allHydrocarbonSystemsSeenInTraining": all(s in train_systems for s in systems),
            "novelHydrocarbonSystems": [list(s) for s in systems if s not in train_systems],
            "maximumNearestNormalizedDescriptorDistance": max_distance,
            "temperatureTrainingRange_K": [tmin, tmax], "temperatures_K": temperatures,
            "temperatureInsideCoordinateRange": temperature_inside,
            "descriptorStatus": "INTERPOLATION" if all_inside else "EXTRAPOLATION",
            "temperatureStatus": "INTERPOLATION" if temperature_inside else "EXTRAPOLATION"}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reg, split, protocol = json.loads(REG.read_text()), json.loads(SPLIT.read_text()), json.loads(PROTOCOL.read_text())
    if not REGISTRATION_REFERENCE.exists():
        raise RuntimeError("registration reference missing: create registration-commit.txt after the dedicated protocol freeze commit")
    registration_commit = REGISTRATION_REFERENCE.read_text()
    if not registration_commit.endswith("\n") or len(registration_commit.strip()) != 40 or any(c not in "0123456789abcdef" for c in registration_commit.strip()):
        raise RuntimeError("registration reference must be one lowercase 40-hex commit identifier followed by newline")
    expected_links = {"descriptorRegistry": sha(REG), "frozenHoldouts": sha(SPLIT),
                      "fitStart": sha(FIT_START),
                      "tieLineSource": sha(DATA), "qualifiedUniquacImplementation": sha(U/"run.py")}
    if protocol["sha256Links"] != expected_links:
        raise RuntimeError("task-local frozen protocol SHA link mismatch")
    _, table = uq.structural()
    population = uq.mt_rows(table)
    unseen_ids = set(split["unseenSystem"]["ids"])
    temperature_ids = set(split["leaveTemperatureOut"]["ids"])
    holdout_ids = unseen_ids | temperature_ids
    all_ids = {r["id"] for r in population}
    if unseen_ids & temperature_ids or not holdout_ids <= all_ids:
        raise RuntimeError("frozen holdout identity failure")
    train = [r for r in population if r["id"] not in holdout_ids]
    unseen = [r for r in population if r["id"] in unseen_ids]
    temperature = [r for r in population if r["id"] in temperature_ids]
    train_ids = {r["id"] for r in train}
    leakage = {
        "trainHoldoutIdIntersection": sorted(train_ids & holdout_ids),
        "unseenIdentityPresentInTrain": any(tuple(r["identities"][:2]) == tuple(split["unseenSystem"]["identities"]) for r in train),
        "heldTemperaturePresentInTrain": any(abs(r["T"]-split["leaveTemperatureOut"]["temperature_K"]) < 1e-12 for r in train),
        "trainCount": len(train), "unseenSystemCount": len(unseen), "leaveTemperatureOutCount": len(temperature)
    }
    if leakage["trainHoldoutIdIntersection"] or leakage["unseenIdentityPresentInTrain"] or leakage["heldTemperaturePresentInTrain"]:
        raise RuntimeError("LEAKAGE_CHECK_FAILED before fit")
    theta, identifiability, covariance = fit(train, reg)
    frozen_hash = hashlib.sha256(np.asarray(theta, dtype=np.float64).tobytes()).hexdigest()
    unseen_records, unseen_metrics = qualify(unseen, theta, reg, "TRUE_UNSEEN_SYSTEM")
    temp_records, temp_metrics = qualify(temperature, theta, reg, "LEAVE_TEMPERATURE_OUT")
    all_records = unseen_records + temp_records
    qualification_ok = all(r["qualificationOutcome"] == "PASS" for r in all_records)
    gates = {
        "topologyRecall": {"threshold": 0.90, "value": min(unseen_metrics["topologyRecall"], temp_metrics["topologyRecall"]),
                           "pass": unseen_metrics["topologyRecall"] >= .90 and temp_metrics["topologyRecall"] >= .90},
        "tieLineRmsd": {"threshold": 0.03, "value": max(unseen_metrics["tieLineRmsd"] or float("inf"), temp_metrics["tieLineRmsd"] or float("inf")),
                        "pass": unseen_metrics["tieLineRmsd"] is not None and temp_metrics["tieLineRmsd"] is not None and
                                unseen_metrics["tieLineRmsd"] <= .03 and temp_metrics["tieLineRmsd"] <= .03},
        "thermodynamicQualification": {"pass": qualification_ok}
    }
    gate_pass = all(g["pass"] for g in gates.values())
    train_desc = {name: [descriptors(reg, identity)[name] for r in train for identity in r["identities"]]
                  for name in reg["descriptorOrder"]}
    unseen_ad = applicability(unseen, train, reg)
    temperature_ad = applicability(temperature, train, reg)
    applicability_report = {
        "rule": "each molecule is compared only with admitted training molecules in its family; Euclidean distance uses preregistered fit features divided by their model scales",
        "trainingRanges": {name: [min(v), max(v)] for name, v in train_desc.items()},
        "temperatureRange_K": [min(r["T"] for r in train), max(r["T"] for r in train)],
        "trueUnseenSystem": unseen_ad, "leaveTemperatureOut": temperature_ad,
        "status": "NOT_QUALIFIED" if not gate_pass else "WITHIN_DECLARED_DOMAIN"
    }
    fail_closed = {
        "DI_POLY_temperature_transfer": {"status": "FAIL_CLOSED", "reason": "DI and POLY have only one admitted 298.15 K Coto identity each and no multi-temperature direct evidence in the fit population"},
        "polar_heteroatom": {"status": "FAIL_CLOSED", "reason": "no non-NMP polar-heteroatom direct tie-lines admitted"},
        "sulfur": {"status": "FAIL_CLOSED", "reason": "no sulfur-containing direct NMP tie-lines admitted"},
        "simulatorIntegration": {"status": "PROHIBITED" if not gate_pass else "ELIGIBLE_FOR_SEPARATE_REVIEW",
                                 "performed": False, "reason": "research pipeline never modifies simulator; integration requires all gates and separate review"}
    }
    # Bounded parameter-to-prediction propagation: nominal qualification remains
    # exhaustive; only preregistered sentinels are reflashed for sensitivity.
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)
    direction = np.sqrt(max(0., eigenvalues[-1])) * eigenvectors[:, -1]
    lo = np.r_[np.tile([-8., -2000.], len(BASE_PM)), np.full(NFEATURE, -4.), np.full(NFEATURE, -1000.)]
    hi = -lo
    ratios = [0.25*min(theta[i]-lo[i], hi[i]-theta[i])/abs(direction[i])
              for i in range(NPAR) if abs(direction[i]) > 1e-15]
    cap = min([1.] + ratios)
    delta = cap*direction
    sentinel_ids = protocol["uncertaintyProtocol"]["sentinelIds"]
    sentinels = [r for r in unseen+temperature if r["id"] in sentinel_ids]
    minus_rows, minus_metrics = qualify(sentinels, theta-delta, reg, "UNCERTAINTY_MINUS")
    plus_rows, plus_metrics = qualify(sentinels, theta+delta, reg, "UNCERTAINTY_PLUS")
    sensitivity = {"method": protocol["uncertaintyProtocol"]["method"], "sentinelIds": sentinel_ids,
                   "leadingCovarianceEigenvalue": float(eigenvalues[-1]), "boundMarginCapFactor": float(cap),
                   "minus": {"metrics": minus_metrics, "rows": minus_rows},
                   "plus": {"metrics": plus_metrics, "rows": plus_rows},
                   "topologyRecallRange": [min(minus_metrics["topologyRecall"], plus_metrics["topologyRecall"]),
                                           max(minus_metrics["topologyRecall"], plus_metrics["topologyRecall"])],
                   "tieLineRmsdRange": [min(minus_metrics["tieLineRmsd"], plus_metrics["tieLineRmsd"]),
                                        max(minus_metrics["tieLineRmsd"], plus_metrics["tieLineRmsd"])],
                   "limitations": "Local covariance, one leading direction, and five preregistered sentinels are a bounded sensitivity analysis, not calibrated predictive intervals; no sensitivity result can rescue nominal gates."}
    result = {
        "format": "ecr-pre-pilot-descriptor-transfer-v1",
        "decision": "PASS" if gate_pass else "REJECT", "fitEvidencePolicy": "admitted direct tie-lines only",
        "model": {"thermodynamics": "standard Abrams-Prausnitz UNIQUAC",
                  "parameterization": reg["modelUse"]["hierarchy"], "parameterCount": NPAR,
                  "qualifiedFlashImplementation": str((U/"run.py").relative_to(ROOT)),
                  "flashRequirements": ["TPD lattice and refinement", "Gibbs minimization and decrease", "component conservation",
                                        "isoactivity", "ambiguity rejection", "independent final-phase TPD/Gibbs checks"]},
        "sources": {"tieLines": {"path": str(DATA.relative_to(ROOT)), "sha256": sha(DATA)},
                    "descriptorRegistry": {"path": str(REG.relative_to(ROOT)), "sha256": sha(REG)},
                    "frozenHoldouts": {"path": str(SPLIT.relative_to(ROOT)), "sha256": sha(SPLIT)},
                    "frozenProtocol": {"path": str(PROTOCOL.relative_to(ROOT)), "sha256": sha(PROTOCOL),
                                       "claim": protocol["freezeClaim"]},
                    "fitStart": {"path": str(FIT_START.relative_to(ROOT)), "sha256": sha(FIT_START),
                                 "role": "neutral all-zero initialization; not accepted as fitted parameters"},
                    "registrationReference": {"path": str(REGISTRATION_REFERENCE.relative_to(ROOT)),
                                              "freezeCommit": registration_commit.strip()},
                    "qualifiedUniquac": {"path": str((U/"run.py").relative_to(ROOT)), "sha256": sha(U/"run.py")}},
        "leakageChecks": {**leakage, "status": "PASS"}, "fit": {"calledOnceBeforeHoldout": True,
        "trainingIdsSha256": canonical_sha(sorted(train_ids)), "parameterBinary64Sha256": frozen_hash,
        "parameters": theta.tolist(), "identifiability": identifiability},
        "holdouts": {"trueUnseenSystem": {"identities": split["unseenSystem"]["identities"], "metrics": unseen_metrics, "rows": unseen_records},
                     "leaveTemperatureOut": {"temperature_K": split["leaveTemperatureOut"]["temperature_K"], "metrics": temp_metrics, "rows": temp_records}},
        "gates": gates, "applicabilityDomain": applicability_report, "uncertainty": {
            "method": "linearized fit covariance plus frozen external holdouts",
            "predictionSensitivity": sensitivity,
            "conclusion": "not decision-grade outside admitted coordinate support; sensitivity is local and intentionally bounded"},
        "dataGaps": fail_closed, "integratedIntoSimulator": False
    }
    (OUT/"results.json").write_text(json.dumps(result, indent=2, sort_keys=True)+"\n")
    provenance = {"format": "ecr-descriptor-transfer-provenance-v1", "resultSha256": sha(OUT/"results.json"),
                  "runSha256": sha(__file__), "inputs": result["sources"], "parameterBinary64Sha256": frozen_hash}
    (OUT/"provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True)+"\n")
    (OUT/"report.md").write_text(
        "# ECR pre-pilot descriptor transfer qualification\n\n"
        f"**Decision: {result['decision']}; simulator integration: NOT PERFORMED.**\n\n"
        "A task-local frozen pre-fit protocol (SHA-enforced, without an external timestamp claim) fixed a hierarchical molecular-descriptor mapping and was fitted once after "
        "removing a true unseen molecular system and a complete temperature. The unchanged qualified UNIQUAC flash "
        "machinery was invoked for every held row. Unavailable final-phase checks on nonconverged/boundary rows are explicit qualification failures, not successful checks.\n\n"
        f"| Holdout | rows | topology recall | tie-line RMSD |\n|---|---:|---:|---:|\n"
        f"| true unseen system | {unseen_metrics['rows']} | {unseen_metrics['topologyRecall']:.6f} | {unseen_metrics['tieLineRmsd']} |\n"
        f"| leave 323.2 K out | {temp_metrics['rows']} | {temp_metrics['topologyRecall']:.6f} | {temp_metrics['tieLineRmsd']} |\n\n"
        "Tie-line RMSD is the square root of summed squared mole-fraction errors over both endpoints and measured active components only; inactive zeros are excluded. "
        "Gates remain topology recall >=0.90 and tie-line RMSD <=0.03. DI/POLY temperature transfer, polar "
        "heteroatom transfer, and sulfur transfer fail closed for lack of direct evidence. The fitted Jacobian has "
        f"rank {identifiability['rank']} of {NPAR}, {identifiability['practicallyWeakDirections']} practically weak "
        "directions; uncertainty and the applicability-domain extrapolations preclude deployment.\n")

if __name__ == "__main__":
    main()