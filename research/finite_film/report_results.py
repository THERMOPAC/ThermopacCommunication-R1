"""Render completed research evidence without executing a model or solver."""
from __future__ import annotations
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    thermo_path = ROOT / "research-results/finite-film-thermo-validation.json"
    solver_path = ROOT / "research-results/finite-film-solver-validation.json"
    thermo, solver = (json.loads(p.read_text()) for p in (thermo_path, solver_path))
    for path, expected in solver.get("sourceHashes", {}).items():
        if sha(ROOT / path) != expected:
            raise RuntimeError("NUMERICAL_EVIDENCE_SOURCE_CHANGED: " + path)
    if thermo["qualificationStatus"] != "NOT_SAFE_FOR_SAVED_CELL_SOLVE":
        raise RuntimeError("REVIEW_CHANGED_THERMODYNAMIC_QUALIFICATION_BEFORE_REPORTING")

    bundle = {
        "scope": "ISOLATED_FILM_IMPLEMENTATION_AND_QUALIFICATION",
        "thermodynamicQualification": thermo["qualificationStatus"],
        "numericalBenchmarkOutcome": solver["outcome"],
        "savedCellOutcome": "NOT_ATTEMPTED_DERIVATIVE_QUALIFICATION_STOP",
        "savedCellProfiles": None, "savedCellNewComponentFluxes": None,
        "productionJobsRun": [], "acceptedHeightM": None,
        "physicalStages": None, "efficiency": None, "finalRpm": None, "finalDiameterM": None,
        "evidence": {
            str(p.relative_to(ROOT)): sha(p) for p in (thermo_path, solver_path)
        },
        "stopReasons": thermo.get("stopReasons", []),
        "note": "No new real-state result may be inferred from synthetic benchmark profiles.",
    }
    (ROOT / "research-results/finite-film-qualification-outcome.json").write_text(
        json.dumps(bundle, indent=2) + "\n")

    def esc(value):
        return html.escape(str(value))
    def sci(value):
        return "not evaluated" if value is None else f"{value:.6g}"
    states = "".join(
        f"<tr><td>{esc(c['name'])}</td><td>{esc(c['numericalStatus'])}</td>"
        f"<td>{sci(c.get('unsymmetrizedGibbsDuhemAbs'))}</td>"
        f"<td>{sci(c.get('tangentIntegrabilityAbs'))}</td>"
        f"<td>{esc(c['qualificationStatus'])}</td></tr>"
        for c in thermo["cases"])
    refinement = ""
    for case in thermo["cases"]:
        if case["name"] not in ("cell1_dispersed", "literal_zero_dry_inlet"):
            continue
        for row in case["secondOrderForwardRefinement"]["grid"]:
            refinement += (
                f"<tr><td>{esc(case['name'])}</td>"
                f"<td>{sci(row['requestedForwardStep'])}</td>"
                f"<td>{sci(row['tangentIntegrabilityAbs'])}</td>"
                f"<td>{sci(row['unsymmetrizedGibbsDuhemAbs'])}</td></tr>")
    numerical = "".join(
        f"<tr><td>{esc(case['name'])}</td><td>{esc(case['status'])}</td></tr>"
        for case in solver.get("cases", []))
    sources = "".join(
        f"<li><code>{esc(path)}</code><br><small>{esc(digest)}</small></li>"
        for path, digest in bundle["evidence"].items())
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Isolated finite-film implementation and qualification</title>
<style>
body{{margin:0;background:#f1f4f6;color:#213140;font:16px/1.6 system-ui,sans-serif}}
main{{max-width:1060px;margin:30px auto;background:white;padding:35px 45px;border:1px solid #dbe3e9}}
h1{{font-size:30px;line-height:1.2}}h1,h2{{color:#163c54}}h2{{margin-top:35px}}
.hold{{background:#fff2dc;border-left:5px solid #a56010;padding:18px}}
table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:10px;border:1px solid #d8e1e8;text-align:left;vertical-align:top}}
th{{background:#edf3f7}}.table{{overflow:auto}}code,small{{overflow-wrap:anywhere}}
footer{{margin-top:30px;border-top:1px solid #d8e1e8;padding-top:15px;font-size:13px}}
@media(max-width:700px){{main{{margin:0;padding:20px 15px}}h1{{font-size:25px}}}}
@media print{{body{{background:white}}main{{border:0;margin:0;padding:0}}h2{{break-after:avoid}}tr{{break-inside:avoid}}}}
</style></head><body><main>
<p>ECR PRE-PILOT · ISOLATED RESEARCH · NO PRODUCTION REPLACEMENT</p>
<h1>Finite-film solver: implemented; saved-cell solve held</h1>
<div class="hold"><strong>Saved cell 1 was not solved with unqualified derivatives.</strong>
The almost solvent-free dispersed-bulk derivative check fails the declared
consistency criterion and worsens under refinement. The true unfloored
zero-component excess-activity limit is independently unqualified.</div>

<h2>1. What was implemented</h2>
<ul><li>A separate excess-activity adapter with analytic ideal-log separation,
equal-step central or second-order one-sided derivatives, and explicit input refusal.</li>
<li>A numerical single-film benchmark solver and a coupled two-film BVP with
seven common component fluxes; total molar flux is their sum.</li>
<li>Independent flux reconstruction, complete coordinate chain rules, explicit
Dirichlet lifting, cubic stationary-point checks and aggregate numerical gates.</li>
<li>No production Job A/B/C, inlet, upstream authority or historical result was changed.</li></ul>

<h2>2. Numerical solver verification</h2>
<p><strong>Overall numerical benchmark outcome: {esc(solver['outcome'])}.</strong>
These are numerical BVP solves, not just formula identities, but use synthetic
thermodynamics and manufactured data. They are not project operating results.</p>
<div class="table"><table><thead><tr><th>Scenario</th><th>Result</th></tr></thead>
<tbody>{numerical}</tbody></table></div>
<p>The high-transfer cases use successively refined tolerances and meshes.
The coupled two-film benchmark is solved from independently specified starts.
The nonideal benchmark compares finite-difference and analytical excess derivatives.
Existing acceptance thresholds are not widened.</p>
<p>Four additional guardrail tests verify literal-zero preservation, invalid
boundary refusal, the normalization chain rule and detection of a negative
cubic profile between nonnegative mesh endpoints.</p>

<h2>3. Actual saved-state derivative checks</h2>
<p>The exact pinned Job-B/Stage-4/base scientific lineage was verified, using
the historical 7C runtime rather than the generic current runtime. The actual
saved cell-1 bulk and interface states were reconstructed from the hash-verified
continuation—not substituted with axial initialization seeds. Only local
thermodynamic functions were evaluated; no flash or interface solve was rerun.</p>
<p>Declared limits: Gibbs–Duhem residual ≤ 2×10<sup>−6</sup>;
unsymmetrized tangent-integrability residual ≤ 2×10<sup>−5</sup>.
These are dimensionless derivative diagnostics in the documented tangent basis.</p>
<div class="table"><table><thead><tr><th>State</th><th>Numerical check</th>
<th>Gibbs–Duhem residual</th><th>Integrability residual</th><th>Qualification</th>
</tr></thead><tbody>{states}</tbody></table></div>

<h2>4. Refinement did not repair the dry-state derivative</h2>
<div class="table"><table><thead><tr><th>State</th><th>One-sided step</th>
<th>Integrability residual</th><th>Gibbs–Duhem residual</th></tr></thead>
<tbody>{refinement}</tbody></table></div>
<p>The integrability error approximately doubles as the one-sided step halves.
A passing Gibbs–Duhem diagnostic does not cancel this failed consistency check.
This pattern is consistent with floor-limited derivative contamination; it is
not proof that the underlying unfloored thermodynamic theory is inconsistent.</p>

<h2>5. Exact-zero evidence boundary</h2>
<p>The pinned assembled excess model applies a 10<sup>−12</sup> composition floor;
the original log-activity wrapper separately uses 10<sup>−10</sup>.
The physical fresh-RRBO NMP and water entries remain exactly zero. Internal
evaluation floors are not trace-solvent feed inventories.</p>
<p>One-sided evaluations through the clipped API are reported as numerical
diagnostics only. They do not establish the true unfloored excess-activity
boundary derivative. No clipped chemical-potential derivative was silently
admitted and no tolerance was relaxed.</p>

<h2>6. Outcome and remaining dependency</h2>
<p><strong>Numerical implementation and benchmark evidence are available;
real saved-cell qualification is stopped before solving.</strong> Consequently
there are no new cell-1 film profiles, interface compositions, total flux or
component fluxes. The archived negative-flux result has not been replaced.</p>
<p>The next dependency is a separately justified excess-activity boundary-limit
adapter, with matching interior thermodynamics and independently passing
derivative consistency. Only after that may the real cell be attempted.
This result does not establish extraction-process infeasibility.</p>
<p>No accepted height, physical-stage count, efficiency, final RPM or diameter
follows. Numerical polynomial checks are floating-point checks, not certified
interval arithmetic or experimental transport validation.</p>

<h2>7. Reproducibility</h2>
<p>Commands and limitations are in <code>research/finite_film/README.md</code>.
Machine-readable evidence:</p><ul>{sources}</ul>
<footer>Production jobs run: none. New real-state solve: none.
Research mobility remains a proposed effective-resistance transport assumption.</footer>
</main></body></html>"""
    target = ROOT / "research-results/finite-film-implementation-report.html"
    target.write_text(page)
    print(json.dumps({"report": str(target.relative_to(ROOT)),
                      "numericalOutcome": solver["outcome"],
                      "savedCellOutcome": bundle["savedCellOutcome"]}))


if __name__ == "__main__":
    main()