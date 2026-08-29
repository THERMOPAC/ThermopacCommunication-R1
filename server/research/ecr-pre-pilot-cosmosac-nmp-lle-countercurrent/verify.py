"""Independent structural, balance, equilibrium, target, and provenance checks."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent"
AMEND = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
spec = importlib.util.spec_from_file_location("m", AMEND / "model.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
np = m.np

data = json.loads((OUT / "results.json").read_text())
manifest = json.loads((OUT / "provenance-manifest.json").read_text())
prior = json.loads((ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json").read_text())
p = np.asarray([prior["model"]["parameters"][name] for name in m.PARAMETER_NAMES])

checks = []
def check(name, condition, detail=""):
    checks.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})

check("temperature cases exact", [case["temperatureK"] for case in data["temperatureCases"]] == [298.15, 323.15])
check("single default execution mode", data["executionMode"] == "DEFAULT_FROZEN_PROTOCOL")
for case in data["temperatureCases"]:
    check(f"{case['temperatureC']:.0f}C has stages 1-10", [x["stageCount"] for x in case["trials"]] == list(range(1, 11)))
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
    "stage1SnapshotSha256": AMEND / "stage1-qualification-snapshot.json",
    "amendmentModelSha256": AMEND / "model.py",
    "amendmentResultsSha256": ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json",
    "runnerSha256": HERE / "run.py",
    "resultsSha256": OUT / "results.json",
}
for key, path in paths.items():
    check(key, hashlib.sha256(path.read_bytes()).hexdigest() == manifest[key])
check("governance remains research-only", data["decision"]["fullSixComponentModelQualification"] == "NOT_QUALIFIED" and not data["decision"]["releaseEligible"])
check("reportSha256", hashlib.sha256((OUT / "report.md").read_bytes()).hexdigest() == manifest["reportSha256"])

failed = [item for item in checks if item["status"] == "FAIL"]
report = {"status": "FAIL" if failed else "PASS", "checks": checks, "failed": failed}
(OUT / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"status": report["status"], "checkCount": len(checks), "failedCount": len(failed)}))
raise SystemExit(1 if failed else 0)