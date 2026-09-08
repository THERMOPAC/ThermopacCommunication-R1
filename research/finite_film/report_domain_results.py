"""Render saved evidence only: no thermodynamic or production calculation."""
from pathlib import Path
import hashlib
import html
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results"
NAMES = ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H₂O"]
COLORS = ["#243c65", "#c97911", "#754ca2", "#b44e70", "#777777", "#087c94", "#44994b"]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plot(profile, title):
    mesh, controls = profile["mesh"], profile["bernsteinControls"]
    assert len(controls) == len(mesh) - 1
    assert all(v >= 0 for block in controls for row in block for v in row)
    points = []
    for k, block in enumerate(controls):
        for j in range(13):
            t = j / 12
            weights = [(1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3]
            values = [sum(weights[b]*block[b][c] for b in range(4)) for c in range(7)]
            points.append((mesh[k] + t*(mesh[k+1]-mesh[k]), values))
    paths = []
    for c, color in enumerate(COLORS):
        xy = " ".join(f"{38+s*277:.2f},{167-values[c]*125:.2f}" for s, values in points)
        paths.append(f'<polyline points="{xy}" fill="none" stroke="{color}" stroke-width="2"/>')
    return f"""<svg viewBox="0 0 340 210" role="img" aria-label="{title}">
<text x="38" y="20" font-size="13" font-weight="600">{title}</text>
<path d="M38 42V167H315" fill="none" stroke="#9aa8b7"/>
<path d="M38 104.5H315M38 42H315" fill="none" stroke="#e2e7eb"/>
<g font-size="10" fill="#455563"><text x="12" y="46">1.0</text>
<text x="12" y="108">0.5</text><text x="18" y="171">0</text>
<text x="36" y="183">0</text><text x="308" y="183">1</text>
<text x="62" y="202">Physical film coordinate · mole fractions</text></g>
{''.join(paths)}</svg>"""


def main():
    evidence_paths = [
        OUT / "finite-film-cell1-lobatto-v7-final-hold.json",
        OUT / "finite-film-cell1-lobatto-v6-focused-refinement.json",
        OUT / "finite-film-candidate-stability-corrected-v2.json",
    ]
    hold, saved, stability = [json.loads(p.read_text()) for p in evidence_paths]
    assert hold["preservedFocusedV6EvidenceSha256"] == sha(evidence_paths[1])
    assert hold["outcome"] == "NO_REFINED_ADMISSIBLE_NUMERICAL_CANDIDATE_FOUND"
    assert not hold["physicalAcceptance"]
    state = next(a for a in saved["attempts"] if a.get("nodes") == 17)
    assert not state["numericalAccepted"]
    assert abs(sum(state["flux"]) - state["totalFlux"]) < 1e-15
    assert saved["input"]["freshDispersedInlet"][-2:] == [0, 0]
    level = hold["completedLevel"]
    rows = "".join(
        f"<tr><td>{name}</td><td>{value:+.7e}</td>"
        f"<td>{'NMP phase → RRBO phase' if value > 0 else 'RRBO phase → NMP phase'}</td></tr>"
        for name, value in zip(NAMES, state["flux"])
    )
    legend = "".join(f'<span style="color:{color}">━ {name}</span>'
                     for name, color in zip(NAMES, COLORS))
    source_rows = "".join(
        f"<li>{html.escape(str(p.relative_to(ROOT)))}<br><small>{sha(p)}</small></li>"
        for p in evidence_paths)
    supplemental = OUT / "finite-film-final-check-note.json"
    final_note = ""
    if supplemental.exists():
        extra = json.loads(supplemental.read_text())
        final_note = f"<h2>Final high-accuracy check</h2><p>{html.escape(extra['summary'])}</p>"
        for source, expected in extra.get("evidence", {}).items():
            assert sha(ROOT / source) == expected, "Final-check source changed"
            source_rows += f"<li>{html.escape(source)}<br><small>{expected}</small></li>"
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Single-cell solver results — unaccepted research trial</title>
<style>
body{{font:13px/1.42 Arial,sans-serif;color:#243748;margin:0}}
main{{max-width:930px;margin:auto;padding:28px}}
h1{{font-size:29px;line-height:1.16;color:#153f5d}}h2{{font-size:18px;color:#153f5d;margin-top:24px}}
.hold{{padding:13px 16px;background:#fff1d9;border-left:4px solid #a56b12}}
.caption{{font-size:12px;color:#536374}}.charts{{display:flex;gap:12px}}.charts svg{{width:49%}}
.legend{{display:flex;justify-content:center;gap:15px;font-size:11px}}
table{{border-collapse:collapse;width:100%;font-size:12px}}th,td{{border:1px solid #d5dee6;padding:7px;text-align:left}}
th{{background:#edf2f6}}.sources{{font-size:10px;overflow-wrap:anywhere}}small{{font-size:9px}}
.nextpage{{margin-top:22px}}h2,tr,.hold{{break-inside:avoid}}h2{{break-after:avoid}}
@media print{{main{{padding:0}}}}@media(max-width:600px){{.charts{{display:block}}.charts svg{{width:100%}}}}
</style></head><body><main>
<p class="caption">SAVED CELL 1 ONLY · 298.15 K · RESEARCH CALCULATION</p>
<h1>Actual single-cell results<br>with the remaining limits shown</h1>
<div class="hold"><strong>Status: numerical qualification HOLD.</strong>
A converged 17-node trial has nonnegative complete film profiles and positive
NMP/water transfer into the RRBO. However, its independent profile accuracy
still fails the existing acceptance limit. These are <strong>unaccepted trial
values, not design results</strong>.</div>
<h2>Calculated component fluxes</h2>
<p>Positive flux is from the NMP-rich continuous phase toward the RRBO-rich
dispersed phase. Units: mol/(m²·s). All seven fluxes remain free.</p>
<table><tr><th>Component</th><th>Trial flux</th><th>Direction</th></tr>{rows}
<tr><th>Total</th><th>{state['totalFlux']:+.7e}</th><td>Sum of the seven component fluxes</td></tr></table>
<p class="caption">Source: the completed 17-node collocation trial. Do not use
these values to infer column throughput, recovery, removal, height or efficiency.</p>
<h2>Complete calculated profiles — still unaccepted</h2>
<div class="charts">{plot(state['continuousProfile'], 'Continuous phase: bulk → interface')}
{plot(state['dispersedProfile'], 'Dispersed phase: interface → bulk')}</div>
<div class="legend">{legend}</div>
<p class="caption">Curves are evaluated from the authoritative Bernstein
controls, not reconstructed from endpoint values. The dispersed stored water
boundary is 2.50594×10⁻³⁷; it appears at zero on this linear plot.
The physical fresh RRBO inlet still contains exactly zero NMP and H₂O.</p>
<div class="nextpage"></div><h2>What passed, and what did not</h2>
<table><tr><th>Check</th><th>Observed</th><th>Required / status</th></tr>
<tr><td>Boundary-adapter derivative qualification</td><td>Previously passed</td><td>Unchanged, isolated scope only</td></tr>
<tr><td>Complete-profile nonnegativity</td><td>Both phases; all Bernstein controls nonnegative</td><td>Passed for the represented trial curves</td></tr>
<tr><td>Interface isoactivity residual</td><td>{level['maximumIsoactivityResidual']:.3e}</td><td>≤1e−7: passed</td></tr>
<tr><td>Discrete equation residual</td><td>{level['maximumLobattoResidual']:.3e}</td><td>Small; not a substitute for profile accuracy</td></tr>
<tr><td>Continuous profile constitutive defect</td><td>{level['continuousMaximumScaledConstitutiveDefect']:.3e}</td><td>≤1e−8: failed</td></tr>
<tr><td>Dispersed profile constitutive defect</td><td>{level['dispersedMaximumScaledConstitutiveDefect']:.3e}</td><td>≤1e−8: failed</td></tr>
<tr><td>13→17-node common-profile change</td><td>{level['maximumCommonCoordinateProfileDriftFrom13Nodes']:.3e}</td><td>≤1e−8: failed</td></tr>
<tr><td>13→17-node scaled flux change</td><td>{level['maximumScaledFluxDriftFrom13Nodes']:.3e}</td><td>≤1e−8: passed for this comparison only</td></tr>
<tr><td>Discrete system rank</td><td>199 / 199</td><td>Full rank; not continuum acceptance</td></tr>
<tr><td>Two successive qualifying refinements</td><td>Not established</td><td>Not passed</td></tr>
<tr><td>Candidate-matched phase stability</td><td>Not qualified</td><td>Not passed</td></tr></table>
<h2>What changed in this work</h2>
<p>The former invalid Newton step was substantial (MONO −0.168893), not roundoff.
Log-ratio coordinates prevented negative fractions but encountered extreme
near-dry-boundary stiffness. Physical-coordinate collocation with feasible
backtracking found the trial shown here. Exact bulk endpoints are removed from
the unknowns; Bernstein evaluation avoids the old endpoint-cancellation blind spot.</p>
<p>The 33-node collocation refinement did not finish within its bounded
execution budget. It was not accepted or extrapolated.</p>
<h2>Phase-stability evidence: important correction</h2>
<p>The earlier preliminary stability PASS is not valid global-search evidence:
a boundary-start optimizer had not moved. The corrected, unfloored check
remains blocked by two required dispersed MONO-rich optimizer failures.
That check concerns older coarse interfaces, not the profiles plotted above.
It does <strong>not</strong> establish negative TPD or physical instability.</p>
{final_note}
<h2>Job A → B → C status</h2>
<p>Existing Job-A inputs remain frozen. The local Job-B/finite-film calculation
has produced trial values but is not qualified. No production Job A/B/C reruns
or column continuation were performed. There is no accepted active height,
physical-stage count, efficiency, final RPM or final diameter.</p>
<p><strong>This remains a numerical/qualification hold—not a conclusion that
the real extraction process is infeasible.</strong> The effective-resistance
transport law is a modelling assumption, not measured Maxwell–Stefan transport.</p>
<h2>Evidence references</h2><ul class="sources">{source_rows}</ul>
</main></body></html>"""
    target = OUT / "finite-film-domain-solver-results.html"
    target.write_text(page)
    print(target.relative_to(ROOT))


if __name__ == "__main__":
    main()