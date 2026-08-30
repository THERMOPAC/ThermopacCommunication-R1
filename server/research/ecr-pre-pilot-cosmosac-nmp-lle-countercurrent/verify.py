"""Independent structural, balance, equilibrium, target, and provenance checks."""
import hashlib
import importlib.util
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
DEFAULT_OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"
AMEND = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
spec = importlib.util.spec_from_file_location("m", AMEND / "model.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
np = m.np

parser = argparse.ArgumentParser()
parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUT)
args = parser.parse_args()
OUT = args.output_dir.resolve()
data = json.loads((OUT / "results.json").read_text())
manifest = json.loads((OUT / "provenance-manifest.json").read_text())


def resolve_source(value):
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def validate_snapshot_with_application(path):
    completed = subprocess.run(
        [
            str(ROOT / "node_modules/.bin/tsx"),
            str(ROOT / "scripts/validate-ecr-pre-pilot-stage1.ts"),
            str(Path(path).resolve()),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        return None, completed.stderr.strip() or completed.stdout.strip()
    return json.loads(completed.stdout.strip().splitlines()[-1]), ""


stage1_snapshot_path = resolve_source(manifest["sources"]["stage1Snapshot"])
amendment_results_path = resolve_source(manifest["sources"]["amendmentResults"])
stage1_snapshot = json.loads(stage1_snapshot_path.read_text())
validated_authority, authority_error = validate_snapshot_with_application(stage1_snapshot_path)
saved_stage1 = stage1_snapshot["stage1"]
prior = json.loads(amendment_results_path.read_text())
p = np.asarray([prior["model"]["parameters"][name] for name in m.PARAMETER_NAMES])
protocol = json.loads((HERE / "protocol.json").read_text())
gates = protocol["numericalAcceptance"]

checks = []
def check(name, condition, detail=""):
    checks.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})


def independent_tangent_spectra(composition, temperature_k, step):
    composition = m.normalize(composition)
    logits = np.log(composition[:-1] / composition[-1])
    tangent = np.empty((6, 5))
    for i in range(6):
        for j in range(5):
            tangent[i, j] = composition[i] * (
                (1.0 if i == j else 0.0) - composition[j]
            )
    reference_mu = np.log(composition) + m.total_lngamma(
        m.FAMILIES, temperature_k, composition, p
    )

    def local_tpd(log_ratio):
        value = m.base.softmax(log_ratio)
        return float(np.sum(value * (
            np.log(value)
            + m.total_lngamma(m.FAMILIES, temperature_k, value, p)
            - reference_mu
        )))

    derivative_columns = []
    direct_hessian = np.zeros((5, 5))
    center = local_tpd(logits)
    for i, direction in enumerate(np.eye(5)):
        plus = m.base.softmax(logits + step * direction)
        minus = m.base.softmax(logits - step * direction)
        mu_plus = np.log(plus) + m.total_lngamma(
            m.FAMILIES, temperature_k, plus, p
        )
        mu_minus = np.log(minus) + m.total_lngamma(
            m.FAMILIES, temperature_k, minus, p
        )
        derivative_columns.append((mu_plus - mu_minus) / (2 * step))
        direct_hessian[i, i] = (
            local_tpd(logits + step * direction)
            - 2 * center
            + local_tpd(logits - step * direction)
        ) / step ** 2
        for j in range(i):
            other = np.eye(5)[j]
            direct_hessian[i, j] = direct_hessian[j, i] = (
                local_tpd(logits + step * direction + step * other)
                - local_tpd(logits + step * direction - step * other)
                - local_tpd(logits - step * direction + step * other)
                + local_tpd(logits - step * direction - step * other)
            ) / (4 * step ** 2)
    chemical_hessian = tangent.T @ np.asarray(derivative_columns).T
    chemical_hessian = 0.5 * (chemical_hessian + chemical_hessian.T)
    return np.linalg.eigvalsh(direct_hessian), np.linalg.eigvalsh(chemical_hessian)


expected_temperature_c = float(saved_stage1["operatingTemperatureC"])
expected_temperature_k = expected_temperature_c + 273.15
expected_stage_min = 1
expected_stage_max = int(saved_stage1["maximumStages"])
snapshot_sha256 = hashlib.sha256(stage1_snapshot_path.read_bytes()).hexdigest()
check("Stage-1 source schema", stage1_snapshot["schemaVersion"] == "ECR_PRE_PILOT_STAGE_1_V1")
check(
    "Stage-1 application validator",
    validated_authority is not None
    and validated_authority["immutableHash"] == stage1_snapshot["immutableHash"],
    authority_error,
)
check("Stage-1 source hash", data["stage1Authority"]["snapshotSha256"] == snapshot_sha256)
check("Stage-1 project reference", data["stage1Authority"]["projectReference"] == saved_stage1["projectReference"])
check("Stage-1 operating temperature", float(data["stage1Authority"]["operatingTemperatureC"]) == expected_temperature_c)
check(
    "Stage-1 stage range",
    data["stage1Authority"]["stageRange"] == {"minimum": expected_stage_min, "maximum": expected_stage_max},
)
check("single Stage-1 temperature case", [case["temperatureK"] for case in data["temperatureCases"]] == [expected_temperature_k])
check("user-saved Stage-1 execution mode", data["executionMode"] == "USER_SAVED_STAGE1_RESEARCH_DIAGNOSTIC")
for case in data["temperatureCases"]:
    check(
        f"{case['temperatureC']:.0f}C has saved Stage-1 range",
        [x["stageCount"] for x in case["trials"]]
        == list(range(expected_stage_min, expected_stage_max + 1)),
    )
    for trial in case["trials"]:
        n = trial["stageCount"]
        rejected_for_closure = any(
            item["code"] == "COUPLED_SOLVER_CLOSURE_FAILED"
            for item in trial["acceptanceBlockers"]
        )
        check(
            f"{case['temperatureC']:.0f}C NT{n} overall balance gate",
            trial["maximumOverallComponentBalanceResidualMol"] <= 1e-8
            or rejected_for_closure,
        )
        check(f"{case['temperatureC']:.0f}C NT{n} stage count", len(trial["stages"]) == n)
        for stage in trial["stages"]:
            x = np.asarray(stage["raffinateLeaving"]["moleFractions"])
            y = np.asarray(stage["extractLeaving"]["moleFractions"])
            mu = np.log(x) + m.total_lngamma(m.FAMILIES, case["temperatureK"], x, p) - np.log(y) - m.total_lngamma(m.FAMILIES, case["temperatureK"], y, p)
            equilibrium_closed = float(np.max(np.abs(mu))) <= 2e-5
            check(
                f"{case['temperatureC']:.0f}C NT{n} stage {stage['stageFromFeedEnd']} equilibrium gate",
                equilibrium_closed or rejected_for_closure,
            )
            for phase_name, composition in (("raffinate", x), ("extract", y)):
                stability = stage["localPostSplitStability"][phase_name]
                search = stage["postSplitTpdSearch"][phase_name]
                steps = [
                    item["stepLogRatio"]
                    for item in stability["stepSizeConvergence"]
                ]
                structural_stability_evidence = (
                    stability["dimension"] == 5
                    and steps == [1e-3, 5e-4, 2.5e-4]
                    and len(stability["freeEnergyDifferenceEigenvalues"]) == 5
                    and len(stability["chemicalPotentialJacobianEigenvalues"]) == 5
                    and search["seedClasses"]["globalSimplexAndReference"] == 7
                    and search["seedClasses"]["phaseLocalLogRatioPerturbations"] == 10
                    and search["refinementSeedCount"] == 2
                    and {
                        item["seedClass"] for item in search["refinements"]
                    } == {"GLOBAL_SIMPLEX", "PHASE_LOCAL_LOG_RATIO_PERTURBATION"}
                    and search["allRefinementsAccepted"]
                    and len(search["seedEvaluations"]) == 17
                )
                check(
                    f"{case['temperatureC']:.0f}C NT{n} stage {stage['stageFromFeedEnd']} {phase_name} complete stability evidence",
                    structural_stability_evidence,
                )

                for step_result in stability["stepSizeConvergence"]:
                    h = step_result["stepLogRatio"]
                    direct, chemical = independent_tangent_spectra(
                        composition, case["temperatureK"], h
                    )
                    direct_error = float(np.max(np.abs(
                        direct
                        - np.asarray(step_result["freeEnergyDifferenceEigenvalues"])
                    )))
                    chemical_error = float(np.max(np.abs(
                        chemical
                        - np.asarray(step_result["chemicalPotentialJacobianEigenvalues"])
                    )))
                    check(
                        f"{case['temperatureC']:.0f}C NT{n} stage {stage['stageFromFeedEnd']} {phase_name} independent Hessian reproduction h={h}",
                        direct_error <= 1e-10 and chemical_error <= 1e-10,
                    )
                phase_stable = (
                    stability["minimumEigenvalue"]
                    >= gates["minimumLocalStabilityCurvature"]
                    and stability["independentReconstructionsAgree"]
                    and stability["stepSizeConverged"]
                    and search["minimum"] >= gates["postSplitTpdThreshold"]
                    and search["allRefinementsAccepted"]
                )
                if not phase_stable:
                    check(
                        f"{case['temperatureC']:.0f}C NT{n} stage {stage['stageFromFeedEnd']} {phase_name} instability blocks acceptance",
                        not stage["accepted"],
                    )
        statuses = [v["status"] for v in trial["targetCompliance"].values() if v["status"] != "NOT_CALCULABLE"]
        check(f"{case['temperatureC']:.0f}C NT{n} target aggregation", trial["allCalculableTargetsPass"] == (trial["accepted"] and all(v == "PASS" for v in statuses)))
        check(
            f"{case['temperatureC']:.0f}C NT{n} rejection evidence",
            trial["accepted"] or bool(trial["acceptanceBlockers"]),
        )
        check(
            f"{case['temperatureC']:.0f}C NT{n} multistart evidence",
            trial["multistartEvidence"]["startCount"] == 2
            and trial["multistartEvidence"]["primary"]["maximumScaledEquationResidual"] >= 0
            and trial["multistartEvidence"]["secondary"]["maximumScaledEquationResidual"] >= 0
            and (
                trial["multistartEvidence"]["bothStartsClosed"]
                or any(
                    blocker["code"] == "MULTISTART_SECONDARY_CLOSURE_FAILED"
                    for blocker in trial["acceptanceBlockers"]
                )
            ),
        )

paths = {
    "protocolSha256": HERE / "protocol.json",
    "stage1SnapshotSha256": stage1_snapshot_path,
    "amendmentModelSha256": AMEND / "model.py",
    "amendmentResultsSha256": amendment_results_path,
    "runnerSha256": HERE / "run.py",
    "resultsSha256": OUT / "results.json",
}
for key, path in paths.items():
    check(key, hashlib.sha256(path.read_bytes()).hexdigest() == manifest[key])
check("governance remains research-only", data["decision"]["fullSixComponentModelQualification"] == "NOT_QUALIFIED" and not data["decision"]["releaseEligible"])
check(
    "frozen blind-validation verdict unchanged",
    prior["qualification"]["quantitativeLleGate"] == "FAILED"
    and prior["qualification"]["fullSixComponentModelQualification"] == "NOT_QUALIFIED",
)
check("reportSha256", hashlib.sha256((OUT / "report.md").read_bytes()).hexdigest() == manifest["reportSha256"])

failed = [item for item in checks if item["status"] == "FAIL"]
report = {"status": "FAIL" if failed else "PASS", "checks": checks, "failed": failed}
(OUT / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"status": report["status"], "checkCount": len(checks), "failedCount": len(failed)}))
raise SystemExit(1 if failed else 0)