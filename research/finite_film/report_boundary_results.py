"""Render completed boundary and bounded cell evidence; executes no model."""
from pathlib import Path
import hashlib
import html
import json

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    paths = {
        "qualification": ROOT / "research-results/finite-film-boundary-qualification.json",
        "initialBoundaryCheck": ROOT / "research-results/finite-film-boundary-qualification-initial-failed.json",
        "segmentProof": ROOT / "research-results/finite-film-boundary-native-segment-proof.json",
        "cellAttempt": ROOT / "research-results/finite-film-cell1-attempt.json",
    }
    q = json.loads(paths["qualification"].read_text())
    cell = json.loads(paths["cellAttempt"].read_text())
    if q["verdict"] != "QUALIFIED_EXCESS_ADAPTER_FOR_SAVED_CELL_ATTEMPT_ONLY":
        raise RuntimeError("BOUNDARY_QUALIFICATION_NOT_PASSED")
    if cell["qualificationEvidenceSha256"] != digest(paths["qualification"]):
        raise RuntimeError("CELL_ATTEMPT_AND_QUALIFICATION_EVIDENCE_DIFFER")
    if cell["outcome"] != "NO_ADMISSIBLE_NUMERICAL_CANDIDATE_FOUND":
        raise RuntimeError("REASSESS_CHANGED_CELL_OUTCOME_BEFORE_RENDERING")
    check_sources = {
        q["sourceHashes"]["boundaryAdapterActualFile"]: q["sourceHashes"]["boundaryAdapterSha256"],
        q["sourceHashes"]["verifier"]: q["sourceHashes"]["verifierSha256"],
        q["sourceHashes"]["verifyThermoPinnedLoaderFile"]: q["sourceHashes"]["verifyThermoSha256"],
        "research/finite_film/attempt_cell1.py": cell["sourceSha256"],
        "research/finite_film/exact_cache.py": cell["exactCache"]["sourceSha256"],
    }
    for path, expected in check_sources.items():
        if digest(ROOT / path) != expected:
            raise RuntimeError("EVIDENCE_SOURCE_CHANGED: " + path)
    esc = lambda value: html.escape(str(value))
    rows = []
    counts = {"negativeTrial": 0, "timeBudget": 0}
    for attempt in cell["attempts"]:
        timed = attempt.get("stopReason") == "NUMERICAL_TIME_BUDGET"
        negative = attempt.get("error") == "NEGATIVE_NUMERICAL_TRIAL_PROFILE"
        if not (timed or negative):
            raise RuntimeError("UNCLASSIFIED_CELL_STOP")
        counts["timeBudget" if timed else "negativeTrial"] += 1
        reason = "Numerical time budget" if timed else "Negative numerical trial profile — rejected"
        rows.append(f"<tr><td>{esc(attempt['start'])}</td><td>{reason}</td>"
                    f"<td>{attempt['elapsedSeconds']:.2f} s</td></tr>")
    evidence = "".join(
        f"<li><code>{esc(p.relative_to(ROOT))}</code><br><small>{digest(p)}</small></li>"
        for p in paths.values())
    output = {
        "scope": "ISOLATED_BOUNDARY_ADAPTER_AND_SAVED_CELL_1",
        "derivativeGate": q["verdict"],
        "cellOutcome": cell["outcome"],
        "startOutcomeCounts": counts, "physicalAcceptance": False,
        "newAcceptedProfiles": None, "newAcceptedFluxes": None,
        "acceptedHeight": None, "physicalStages": None, "efficiency": None,
        "finalRpm": None, "finalDiameter": None, "productionJobsRun": [],
        "evidence": {str(p.relative_to(ROOT)): digest(p) for p in paths.values()},
        "interpretation": "Derivative gate cleared; numerical film solve unresolved, not proof of process infeasibility.",
    }
    (ROOT / "research-results/finite-film-boundary-and-cell1-outcome.json").write_text(
        json.dumps(output, indent=2) + "\n")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boundary adapter qualified; cell-1 film solve unresolved</title>
<style>
body{{margin:0;background:#f1f4f6;color:#203344;font:16px/1.6 system-ui,sans-serif}}
main{{max-width:1040px;margin:28px auto;background:white;border:1px solid #dae2e8;padding:35px 42px}}
h1{{font-size:30px;line-height:1.2}}h1,h2{{color:#183e57}}h2{{margin-top:34px}}
.pass,.hold{{padding:16px 20px;margin:15px 0;border-left:5px solid}}
.pass{{background:#edf8f2;border-color:#26714c}}.hold{{background:#fff3df;border-color:#a56617}}
table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{border:1px solid #d9e1e8;padding:9px;text-align:left}}
th{{background:#eef3f7}}.table{{overflow:auto}}code,small{{overflow-wrap:anywhere}}
footer{{margin-top:30px;border-top:1px solid #dbe3e9;padding-top:16px;font-size:13px}}
@media(max-width:700px){{main{{margin:0;padding:22px 16px}}h1{{font-size:25px}}}}
@media print{{body{{background:white}}main{{margin:0;padding:0;border:0}}h2{{break-after:avoid}}tr{{break-inside:avoid}}}}
</style></head><body><main>
<p>ECR PRE-PILOT · ISOLATED RESEARCH · NO PRODUCTION REPLACEMENT</p>
<h1>Boundary adapter qualified;<br>cell-1 film solve remains unresolved</h1>
<div class="pass"><strong>Thermodynamic derivative gate: passed.</strong>
The separate excess-only adapter passed all required checks across 27
composition cases and 15 boundary families at the frozen 298.15 K condition.</div>
<div class="hold"><strong>Actual cell-1 film qualification: not achieved.</strong>
Seven starts produced no admissible numerical candidate. Four were stopped
on negative numerical trial profiles and three reached their time limit.
No negative trial, timeout or incomplete result was accepted.</div>

<h2>1. What caused the earlier derivative failure?</h2>
<p>The active path contains two different composition floors: 10<sup>−12</sup>
in the assembled wrapper and 10<sup>−10</sup> in the native wrapper. Controlled
layer-by-layer tests isolate their effect on the nearly solvent-free derivative
audit. The fully unfloored native-plus-RK calculation removes the increasing
cross-derivative inconsistency while preserving the interior equations.</p>
<p>This is an internal evaluation issue, not evidence of trace NMP or water in
the physical fresh RRBO. Its prescribed solvent entries remain exactly zero.</p>

<h2>2. Why the new adapter is more than deleted floors</h2>
<ul><li>Exact pinned NIST cCOSMO source commit, binary hash, profile data and RK
parameter lineage were checked. No library was replaced or rebuilt.</li>
<li>The combinatorial expression is already algebraically ratio-reduced and
finite at zero component concentration when mixture geometry is positive.</li>
<li>The residual uses the absent species' own pure profile. Mixture profile
weights vanish at zero concentration without deleting the absent species'
infinite-dilution excess activity.</li>
<li>Positive-kernel segment equations provide an exact-equation existence and
local implicit-function regularity argument, with actual profile, kernel and
fixed-point checks against the pinned binary.</li>
<li>The original additive RK polynomial is retained. Ideal ln(x) is separate;
finite excess activity does not make ideal ln(0) finite.</li></ul>
<p>Source correspondence plus ABI checks is not reproducible-build
certification. Finite-difference checks assess the numerical evaluator;
the analytic argument applies to the exact segment equations.</p>

<h2>3. Independent qualification results</h2>
<div class="table"><table><thead><tr><th>Check</th><th>Worst observed</th><th>Unchanged limit</th></tr></thead>
<tbody>
<tr><td>Gibbs–Duhem residual</td><td>2.255×10<sup>−7</sup></td><td>2×10<sup>−6</sup></td></tr>
<tr><td>Tangent-integrability residual</td><td>1.256×10<sup>−6</sup></td><td>2×10<sup>−5</sup></td></tr>
<tr><td>Relative derivative-refinement drift</td><td>1.556×10<sup>−7</sup></td><td>2×10<sup>−3</sup></td></tr>
<tr><td>Interior chemical-potential agreement</td><td>1.827×10<sup>−14</sup></td><td>2×10<sup>−10</sup></td></tr>
<tr><td>Terminal-three zero-limit agreement</td><td>2.342×10<sup>−12</sup></td><td>2×10<sup>−10</sup></td></tr>
</tbody></table></div>
<p>Additional checks passed: native combinatorial agreement, independent
residual reconstruction, nonnegative normalized pure/mixture profiles, positive
symmetric kernel, actual mixture and pure segment fixed-point residuals,
invalid-input refusal and unchanged literal-zero vectors.</p>
<p>The active segment iteration tolerance remains 10<sup>−8</sup>. Its damped
stopping rule implies a fixed-point residual bound 2t+t²; the worst measured
1.381×10<sup>−8</sup> is below 2.00000001×10<sup>−8</sup>. That bound is derived
from the existing rule, not a loosened tolerance.</p>

<h2>4. The initially failed approach point remains failed</h2>
<p>At the pure-water corner, the equal-component approach with ε=10<sup>−12</sup>
had a 2.312×10<sup>−10</sup> value difference, slightly above the 2×10<sup>−10</sup>
limit. The entire original failed report and curve remain preserved.</p>
<p>One additional mathematical refinement, ε=10<sup>−18</sup>, supplied three
consecutive finer passing points: ε=10<sup>−14</sup>, 10<sup>−16</sup>, 10<sup>−18</sup>,
with differences 2.342×10<sup>−12</sup>, 2.998×10<sup>−14</sup>, 5.329×10<sup>−15</sup>.
The evaluated terminal window moved; the limit, model, cases and physical feed
did not. These approach compositions are numerical limit tests, not feed data.</p>

<h2>5. Actual saved cell-1 attempts</h2>
<p>The frozen bulk vectors, Job-A conductances, phase orientation, temperature
and archived state hashes were retained. Total molar flux was free: an initial
zero guess was not an n=0 constraint. No archived flux was accepted as a new
finite-film result.</p>
<div class="table"><table><thead><tr><th>Start</th><th>Stop reason</th><th>Elapsed</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>
<p>The initial uncached attempt was time-limited. A bounded exact-state cache
then avoided repeated identical evaluations; its outputs were verified bitwise
equal on the saved states, including cache misses and hits. No composition was
rounded and no thermodynamic value interpolated.</p>
<p>Operational timeouts can be wrapped by native/RK exception handlers. The
instrumented attempt records their causes and labels them as time budgets,
not undefined thermodynamics. Negative <em>intermediate numerical trials</em>
do not prove that all possible physical solutions have negative profiles.</p>

<h2>6. What is—and is not—established</h2>
<p><strong>The original derivative blocker has been resolved for this isolated,
source-bound adapter. The film problem has not been solved or accepted.</strong>
No candidate exists on which to complete independent profile refinement,
Jacobian-rank, reproduction or interface stability/TPD acceptance. These checks
are not marked passed or bypassed.</p>
<p>Next numerical requirement: keep trial updates inside the admissible
composition domain and control derivative-evaluation cost, then repeat the
single-cell attempt under the same physics and gates. A further attempt is not
a column run, and no process-infeasibility conclusion follows from this result.</p>
<p>No new accepted flux, active height, physical-stage count, efficiency,
final RPM or final diameter follows. Production Jobs A/B/C remain unchanged.</p>

<h2>7. Reproducibility</h2><p>Commands and caveats are in
<code>research/finite_film/README.md</code>. Machine-readable evidence:</p>
<ul>{evidence}</ul>
<footer>Overall status: DERIVATIVE GATE PASSED / NUMERICAL CELL HOLD.
Effective-resistance mobility remains an unvalidated transport assumption.</footer>
</main></body></html>"""
    path = ROOT / "research-results/finite-film-boundary-and-cell1-report.html"
    path.write_text(page)
    print(json.dumps({"report": str(path.relative_to(ROOT)), "counts": counts,
                      "derivativeGate": q["verdict"], "cellOutcome": cell["outcome"]}))


if __name__ == "__main__":
    main()