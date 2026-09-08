"""Render an audited, self-contained report without changing the raw evidence."""
import hashlib
import html
import json
from pathlib import Path

source = Path("research-results/job-c-final-continuation.json")
data = json.loads(source.read_text())
result = data["result"]
continuation = result["diagnostics"]["branchContinuation"]


def canonical_numbers(value):
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        mantissa, exponent = format(0.0 if value == 0 else float(value), ".16e").split("e")
        return {"$number": f"{mantissa}e{int(exponent)}"}
    if isinstance(value, list):
        return [canonical_numbers(x) for x in value]
    return {k: canonical_numbers(v) for k, v in value.items()}


def digest(value):
    return hashlib.sha256(json.dumps(canonical_numbers(value), sort_keys=True,
        separators=(",", ":"), allow_nan=False).encode()).hexdigest()


assert digest({k: v for k, v in result.items() if k != "resultSha256"}) == result["resultSha256"]
assert digest(data["input"]) == data["inputSha256"]
assert data["input"]["dispersedFeedMolS"][5:7] == [0, 0]
assert not continuation["fullCouplingAccepted"]
bracket = continuation["terminalBracket"]
high = next(row for row in reversed(bracket["attempts"]) if row["lambda"] == bracket["upper"])
low = next((row for row in bracket["attempts"] if row["lambda"] == bracket["lower"]), None)
accepted_high_starts = sum(int(row["accepted"]) for row in high["attempts"])
limited_high_starts = sum(int(row.get("evaluationLimitReached",
    row["functionEvaluations"] >= 12)) for row in high["attempts"])
resolved = bool(low and low["accepted"] and accepted_high_starts == 0
                and limited_high_starts == 0 and bracket["width"] <= 1e-9)
assert not resolved, "Reassess the report if the measured bracket changes."
signed = continuation["signedStartingRootDiagnostic"]
assert signed["independentlyConfirmed"] and not signed["accepted"]
assert all(row["tightDiagnosticClosure"] and not row["operatingStateEligible"]
           for row in signed["attempts"])


def number(value):
    return "Not established" if value is None else f"{value:.12e}"


def row(label, *values):
    return "<tr><th>" + html.escape(label) + "</th>" + "".join(
        "<td>" + html.escape(str(v)) + "</td>" for v in values) + "</tr>"


last = continuation["lastAcceptedCell1NmpBalance"]
failed = continuation["firstRejectedCell1NmpBalance"]
closed = signed["attempts"][1]["cell1NmpBalance"]
uncertainty = last["numericalUncertainty"]
boundary = continuation["physicalBoundary"]
balance_rows = "".join(row(label, *(number(item[key]) for item in (last, failed, closed)))
    for label, key in [
        ("Cell-1 NMP flow [mol/s]", "flowMolS"),
        ("Cell-2 NMP flow [mol/s]", "neighborCell2FlowMolS"),
        ("Convection [mol/s]", "convectionMolS"),
        ("Axial backmixing [mol/s]", "axialBackmixingMolS"),
        ("Interphase transfer [mol/s]", "interphaseTransferMolS"),
        ("Residual [mol/s]", "residualMolS"),
        ("Independent FV reconstruction difference [mol/s]", "decompositionDifferenceMolS"),
    ])
face_rows = "".join(row(key, number(value)) for key, value in last["signedFaces"].items())
facts = "".join(row(label, number(value)) for label, value in [
    ("Last independently qualified, tolerance-accepted λ", bracket["lower"]),
    ("First failed independent-confirmation λ", bracket["upper"]),
    ("Sampling interval width", bracket["width"]),
    ("Flow error estimate at the tolerance-accepted point [mol/s]", uncertainty["flowAbsoluteEstimateMolS"]),
    ("Cell residual arithmetic-roundoff estimate [mol/s]", uncertainty["residualRoundoffEstimateMolS"]),
    ("Two-FD flow-correction spread [mol/s]", uncertainty["finiteDifferenceCorrectionSpreadMolS"]),
])
output = Path("research-results/job-c-continuation-report.html")
output.write_text(f"""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job C — audited continuation findings</title>
<style>body{{font:15px/1.55 system-ui,sans-serif;color:#182838;background:#f4f6f8;margin:0}}
main{{max-width:1120px;margin:32px auto;padding:32px;background:white}}h1{{font-size:27px}}
h2{{margin-top:28px;font-size:20px}}.warning{{border-left:5px solid #ad6a14;background:#fff5e4;padding:16px}}
table{{border-collapse:collapse;width:100%;font-size:13px;margin:16px 0}}
td,th{{border:1px solid #dbe2e8;padding:9px;text-align:left}}td{{font-family:ui-monospace,monospace}}
small{{color:#526374}}.scroll{{overflow-x:auto}}code{{overflow-wrap:anywhere}}
@media print{{body{{background:white}}main{{margin:0;padding:10px}}}}</style><main>
<small>8 September 2026 · Frozen 2 m Job-C replay · Research / preliminary</small>
<h1>Job C: full coupling not established</h1>
<div class="warning"><strong>The true terminal boundary remains unresolved.</strong>
The measured interval ends at failed independent confirmation—not a proven original-gate rejection.
No accepted active height, physical-stage count, efficiency, final RPM/diameter, Job D or release result is claimed.</div>
<h2>What the calculation establishes</h2>
<p>Two materially separated starts at λ = {number(bracket["lower"])} close the unchanged coupled
equations tightly only with cell-1 dispersed NMP flow around −6.99926639608×10<sup>−7</sup> mol/s.
Both signed roots are rejected as operating states. The tiny positive flow in the earlier point
is tolerance-accepted, not a resolved positive inventory.</p>
<p>RRBO inlet NMP and H₂O remain exactly zero. The frozen Stage-2, Job-A, Job-B and Stage-3 authorities
and physical equations are retained. This replay does not rerun Jobs A or B.</p>
<h2>Continuation and uncertainty</h2><table>{facts}</table>
<p>The upper endpoint has {accepted_high_starts} start passing the original gates, while
{limited_high_starts} start reaches its 12-evaluation cap. The lower endpoint was inherited from
the earlier two-start qualification, not re-confirmed by this bracketing procedure.
All {len(bracket["attempts"])} new two-start probes failed confirmation. Interval narrowing therefore
does <strong>not</strong> establish a resolved gate-usability or physical boundary.</p>
<p>Uncertainty is a local, non-certified a posteriori estimate: two finite-difference Jacobians,
residual correction and arithmetic roundoff, with a factor of ten. It is not an experimental
confidence interval. The estimated flow correction itself is
{number(uncertainty["finiteDifferenceChecks"][1]["flowCorrectionMolS"])} mol/s;
the positive inventory margin is unresolved.</p>
<h2>Complete dispersed cell-1 NMP balance</h2>
<p>Signed equation: convection + axial backmixing + interphase transfer = residual.
Negative transfer removes NMP from the dispersed phase. The outlet backmixing face is zero by
the unchanged boundary condition.</p>
<div class="scroll"><table><tr><th>Quantity</th><th>Last qualified numerical point</th>
<th>Upper candidate: failed two-start confirmation</th><th>Tightly closed signed root, start 2 — NOT accepted</th>
</tr>{balance_rows}</table></div>
<h3>Signed face terms at the last qualified numerical point</h3><table>{face_rows}</table>
<h2>Independent reproduction and zero-active diagnostic</h2>
<p>Signed-root scaled state difference across starts:
{number(signed["maximumScaledStateDifferenceAcrossStarts"])}. Maximum raw FV residuals:
{number(signed["attempts"][0]["rawFvResidualMolS"])} and
{number(signed["attempts"][1]["rawFvResidualMolS"])} mol/s.</p>
<p>The reduced zero-active diagnostic gives λ = {number(boundary["lambda"])},
with a non-certified absolute λ estimate of
{number(boundary["numericalUncertainty"]["lambdaAbsoluteEstimate"])}.
It has {len(boundary["nonpositiveFlowCoordinates"])} nonpositive coordinates.
This is a local signed multi-inventory root near zero coupling, not an accepted state, a unique
physical NMP limiter, or proof of global process infeasibility.</p>
<h2>Downstream engineering result</h2>
<p>λ = 1 was not independently accepted. Consequently the full-coupling 2 m outlet duty and
the governed 2–20 m height search were not authorized. No numerical-cell count is converted into
physical stages or efficiency.</p>
<h2>Evidence and audit note</h2>
<p>The raw snapshot is preserved unchanged at <code>{source}</code>. Its original
<code>terminalBracket.resolved=true</code> flag is a reporting defect and is superseded by this audit:
the endpoint evidence above does not support it. The implementation now explicitly prevents
this classification when a start passes the gates or independent confirmation is iteration-limited.</p>
<p>Input and response hashes were independently recomputed successfully. Runtime source bytes
are archived alongside the snapshot. Verified replay elapsed time: {data["elapsedSeconds"]:.3f} s.</p>
<p><small>Input SHA-256: <code>{data["inputSha256"]}</code><br>
Response SHA-256: <code>{result["resultSha256"]}</code></small></p>
</main></html>""")
print(json.dumps({"report": str(output), "inputHashVerified": True,
                  "responseHashVerified": True, "terminalBoundaryResolved": False}))