"""Offline sizing-status report. Does not execute thermodynamics or change inputs."""
from pathlib import Path
import csv
import hashlib
import html
import io
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results"


def read(name):
    return json.loads((OUT / name).read_text())


def csv_payloads(name, key):
    return [
        json.loads(row[key])
        for row in csv.DictReader(io.StringIO(read(name)["output"]))
    ]


def esc(value):
    return html.escape(str(value))


def table(headers, rows):
    return "<table><thead><tr>" + "".join(
        f"<th>{esc(h)}</th>" for h in headers
    ) + "</tr></thead><tbody>" + "".join(
        "<tr>" + "".join(f"<td>{esc(c)}</td>" for c in row) + "</tr>"
        for row in rows
    ) + "</tbody></table>"


def build():
    basis_file = "prepilot-sizing-current-basis-db.json"
    duty_file = "prepilot-sizing-equilibrium-duty-db.json"
    readiness_file = "prepilot-sizing-authority-v1.readiness.json"
    basis = csv_payloads(basis_file, "payload")[0]
    trials = csv_payloads(duty_file, "trial")
    readiness = read(readiness_file)
    stage1 = basis["stage1"]
    hydraulic = basis["hydraulicResult"]["hydraulicRpmEnvelope"]
    sources = [basis_file, duty_file, readiness_file]

    rows = []
    for trial in trials:
        metrics = trial["productMetrics"]
        # The historical metric excludes PA. Reconstruct the explicitly inclusive
        # total from its underlying, named hydrocarbon component mass record.
        masses = trial["sulfurPrediction"]["componentMassBasis"]["finalRaffinate"]
        families = ("SAT", "MONO", "DI", "POLY", "PA")
        hc_mass = sum(masses[k] for k in families)
        if not hc_mass > 0:
            raise ValueError("Nonpositive historical hydrocarbon mass")
        inclusive_aromatics = 100 * sum(masses[k] for k in families[1:]) / hc_mass
        checks = [
            ("Total aromatics, including PA", inclusive_aromatics,
             stage1["targetRaffinateTotalAromaticsWt"], "≤", "wt% hydrocarbon"),
            ("Polar aromatics (subset)", metrics["raffinatePolarAromaticsWtNmpFree"],
             stage1["targetRaffinatePolarAromaticsWt"], "≤", "wt% hydrocarbon"),
            ("Hydrocarbon recovery", metrics["nmpFreeHydrocarbonRecoveryPct"],
             stage1["minimumRecoveryPct"], "≥", "%"),
            ("Saturates", metrics["raffinateSaturatesWtNmpFree"],
             stage1["minimumRaffinateSaturatesWt"], "≥", "wt% hydrocarbon"),
            ("NMP in wet raffinate", metrics["nmpInTotalRaffinateWt"],
             stage1["maximumNmpRaffinateWt"], "≤", "wt% full phase"),
        ]
        for label, value, target, sign, unit in checks:
            passed = value <= target if sign == "≤" else value >= target
            rows.append((label, f"{value:.4f}", f"{sign} {target:g}", unit,
                         "PASS" if passed else "FAIL"))
    trial_table = table(["Property", "Recorded/recomputed", "Target", "Basis", "Check"], rows)
    hydraulic_table = table(
        ["RPM", "Diameter (m)", "Hardware pitch (m)", "Stored hydraulic-pass flag"],
        [(t["rpm"], f'{t["columnDiameterM"]:.4f}',
          f'{t["compartmentHeightM"]:.4f}', str(t["hydraulicPass"]))
         for t in hydraulic],
    )
    deliverables = table(
        ["Requested output", "Current acceptance"],
        [(s, "Not qualified")
         for s in ["Active height", "Physical compartment count",
                   "Overall efficiency", "Selected operating RPM", "Selected diameter"]],
    )

    numerical = (
        "The earlier 17-node film trial remains unaccepted: its worst independent "
        "profile defect was approximately 1.30×10⁻⁶ against a 1×10⁻⁸ limit. "
        "A subsequent sparse experiment was interrupted deliberately after review "
        "found implementation and acceptance-check defects, not because process "
        "infeasibility had been established."
    )
    note_path = OUT / "prepilot-sizing-numerical-closeout.json"
    if note_path.exists():
        note = json.loads(note_path.read_text())
        numerical = note["summary"]
        sources.append(note_path.name)

    citations = "".join(
        f'<p class="source">{esc(name)}<br>{hashlib.sha256((OUT/name).read_bytes()).hexdigest()}</p>'
        for name in sources
    )
    body = f"""<!doctype html><html><head><meta charset="utf-8">
    <title>Pre-pilot sizing — current basis and qualification</title>
    <style>
    body{{font:13px/1.45 Arial,sans-serif;color:#243748;margin:0}}
    h1{{font-size:26px;line-height:1.18;color:#173e50}}
    h2{{font-size:18px;margin-top:23px;break-after:avoid}}
    .eyebrow,.muted{{color:#637481;font-size:11px}}
    .hold{{background:#fff1d5;border-left:4px solid #aa7417;padding:12px}}
    table{{border-collapse:collapse;width:100%;font-size:11.5px;margin:12px 0}}
    th,td{{border:1px solid #d2dce2;padding:7px;text-align:left}}
    th{{background:#edf2f5}}tr{{break-inside:avoid}}
    .page{{break-before:page}}.source{{font:9px/1.4 monospace;overflow-wrap:anywhere}}
    </style></head><body>
    <div class="eyebrow">PROJECT {esc(basis["projectNumber"])} · PRE-PILOT · NOT FOR FABRICATION</div>
    <h1>Column sizing: the actual basis<br>and what is still unqualified</h1>
    <div class="hold"><b>No complete column design has been accepted.</b>
    The effective-resistance transport model is authorized as a stated pre-pilot
    assumption. That approval does not waive numerical, stability or product-duty checks.</div>
    <p>Feed: <b>{stage1["designFeedRateLph"]:g} L/h</b> · Temperature:
    <b>{stage1["operatingTemperatureC"]:g} °C</b> · Solvent/oil mass ratio:
    <b>{stage1["solventOilRatio"]:g}</b> · Wet-solvent water:
    <b>{stage1["nmpWaterWt"]:g} wt%</b>. Fresh RRBO NMP and water remain exactly zero.</p>
    {deliverables}
    <h2>The saved equilibrium trial does not meet the full duty</h2>
    <p>The recorded trial used 10 configured equilibrium stages. It is a reproduced
    physical-LLE trial, not an accepted theoretical stage count or a global limit
    on every possible process design.</p>
    {trial_table}
    <p class="muted">The archived “total aromatics” value was 7.3494 wt% and excluded
    PA. The inclusive value above is recomputed from its component mass record,
    adding PA consistently with the current total-aromatics duty. Neither value
    meets the 5 wt% target. Water and NMP are excluded from the hydrocarbon denominator.</p>
    <div class="page"></div>
    <h2>Hydraulic candidates—not final selections</h2>
    {hydraulic_table}
    <p>These are saved in-range hydraulic trials. Their stored pass flags are
    preserved literally; the table does not independently revalidate them or
    recommend a final RPM/diameter. Local operating hydrodynamics and transport
    must be recalculated and qualified for the ultimately selected column.</p>
    <h2>Physical compartments and efficiency</h2>
    <p>The recorded hardware relation is compartment pitch = 0.5 × diameter.
    The seven finite-volume cells and ten configured equilibrium stages are
    <b>not physical compartments</b>. The current theoretical-stage authority
    is the explicitly labelled pre-pilot default N<sub>T</sub> = 7, not a calculated N<sub>T</sub>.</p>
    <p>A physical integer count must satisfy the full duty at its exact hardware
    height. Efficiency is then calculated as N<sub>T</sub>/physical count, retaining
    that theoretical-stage provenance—not assumed to obtain a height.</p>
    <h2>Numerical closeout</h2><p>{esc(numerical)}</p>
    <h2>Sulfur remains a separate qualification</h2>
    <p>The archived allocation-based sulfur post-processing reported
    {trials[0]["sulfurPrediction"]["predictedRaffinateSulfurPpm"]:.1f} ppm against
    {stage1["targetRaffinateSulfurPpm"]:g} ppm. This is a conditional family-retention
    estimate, not independently species-resolved sulfur transport. Aromatic
    transfer alone does not qualify the sulfur duty.</p>
    <p><b>Decision boundary:</b> a qualified local film still needs a qualified
    whole-column calculation, exact hardware-height replay and all applicable
    product targets before any of the five requested outputs can be accepted.
    No production A/B/C reruns or saved-input changes were made.</p>
    <h2>Evidence</h2>{citations}
    </body></html>"""
    destination = OUT / "prepilot-sizing-current-results.html"
    destination.write_text(body)
    print(destination.relative_to(ROOT))


if __name__ == "__main__":
    build()