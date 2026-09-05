import type { Express, Request, Response } from "express";
import {
  KUHNI_GEOMETRY_RESOLVER_HASH,
  KUHNI_GEOMETRY_RESOLVER_VERSION,
  resolveKuhniGeometry,
} from "./kuhni-geometry-resolver";
import type { HydrodynamicProcessBasis } from "./kuhni-hydrodynamics";

const PROJECT_236_VERIFICATION_BASIS: HydrodynamicProcessBasis = {
  schemaVersion: "ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1",
  stage1SnapshotHash: "b".repeat(64),
  operatingTemperatureC: 50,
  temperatureK: 323.15,
  operatingPressure: "atmospheric",
  phaseConfiguration: "nmp-continuous-rrbo-dispersed",
  composition: {
    rrboGrade: "SN150",
    rrboFeedWt: { saturates: 70, monoAromatics: 10, diAromatics: 10, polyAromatics: 5, polarAromatics: 5, nmp: 0 },
    wetSolventWt: { nmp: 98, water: 2 },
  },
  rrboFeed: {
    identity: "RRBO_FEED",
    valueLph: 4000,
    conversion: "4000 L/h ÷ 3.6e6",
    flowM3S: 4000e-3 / 3600,
    densityKgM3: 878,
    dynamicViscosityPaS: 0.056,
  },
  wetSolventPhase: {
    identity: "WET_NMP_SOLVENT_PHASE",
    solventOilMassRatio: 0.5,
    conversion: "RRBO volumetric flow × density × S/O mass ratio ÷ wet-solvent density",
    flowM3S: (4000e-3 / 3600 * 878 * 0.5) / 1028,
    densityKgM3: 1028,
    dynamicViscosityPaS: 0.001666,
  },
  interfacialTensionNM: 0.012,
};

const VERIFICATION_STAGE_AUTHORITY = {
  value: 7,
  provenance: "PRE_PILOT_DESIGN_DEFAULT" as const,
  label: "PRE-PILOT DESIGN DEFAULT (Stage-2 calculated NT unavailable)",
  stage2JobId: null,
  stage2ResultHash: null,
};

function renderPreviewPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Kühni Geometry Resolver Verification</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f3f6fb}
    *{box-sizing:border-box}body{margin:0}.shell{max-width:1320px;margin:auto;padding:28px}
    .hero{background:linear-gradient(135deg,#0f2d57,#1859a8);color:white;border-radius:18px;padding:25px 28px;box-shadow:0 14px 35px #123d7224}
    h1{font-size:25px;margin:0 0 7px}.subtitle{opacity:.82;font-size:13px;margin:0}.tag{display:inline-block;margin-top:14px;padding:6px 10px;border:1px solid #ffffff45;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em}
    .notice{margin:18px 0;padding:13px 15px;border:1px solid #f1c86b;background:#fff8e6;border-radius:10px;color:#6e4b00;font-size:13px}
    .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:18px 0}
    button{border:0;border-radius:9px;background:#1767c5;color:white;padding:11px 16px;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:wait}
    .status{font-size:13px;color:#526177}.status.ok{color:#08783e}.status.error{color:#b42318}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.card{background:white;border:1px solid #dde5ef;border-radius:11px;padding:13px;min-height:82px}
    .label{font-size:10px;color:#67758a;text-transform:uppercase;letter-spacing:.07em}.value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;font-size:13px;margin-top:7px;overflow-wrap:anywhere}
    .panel{margin-top:16px;background:white;border:1px solid #dde5ef;border-radius:12px;overflow:hidden}.panel h2{font-size:14px;margin:0;padding:14px 16px;background:#f8fafc;border-bottom:1px solid #e4eaf1}
    .table-wrap{overflow:auto}table{width:100%;min-width:950px;border-collapse:collapse;font-size:11px}th,td{text-align:left;padding:9px 11px;border-bottom:1px solid #edf1f5;white-space:nowrap}th{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#59677b;background:#fbfcfe}
    details{margin-top:16px;background:white;border:1px solid #dde5ef;border-radius:10px;padding:12px}summary{font-weight:700;font-size:12px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;line-height:1.55}
    @media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:540px){.shell{padding:14px}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main class="shell">
  <section class="hero">
    <h1>Kühni Automatic Geometry Resolver</h1>
    <p class="subtitle">Direct development verification surface for the real server-side hydraulic kernel</p>
    <span class="tag">${KUHNI_GEOMETRY_RESOLVER_VERSION} · PRE-PILOT PREDICTIVE</span>
  </section>
  <div class="notice"><strong>Verification basis only.</strong> This page executes the production resolver with a fixed Project‑236 test basis. It does not read or write an ERP design record. Final RPM, physical compartments and active height remain dependency-blocked pending the approved mass-transfer/efficiency model.</div>
  <div class="toolbar">
    <button id="run">Run hydraulic resolver</button>
    <span id="status" class="status">Ready</span>
  </div>
  <section id="metrics" class="grid" aria-live="polite"></section>
  <section class="panel">
    <h2>Hydraulic RPM envelope</h2>
    <div class="table-wrap"><table><thead><tr><th>RPM</th><th>Column D</th><th>Rotor D</th><th>d32</th><th>Flood holdup</th><th>Loading</th><th>Tip speed</th><th>P/V</th><th>Terminal / characteristic / swarm Re</th><th>Applicability</th></tr></thead><tbody id="trials"></tbody></table></div>
  </section>
  <details><summary>Calculation record and evidence trace</summary><pre id="raw"></pre></details>
</main>
<script>
  const button=document.getElementById("run"),statusNode=document.getElementById("status"),metrics=document.getElementById("metrics"),trials=document.getElementById("trials"),raw=document.getElementById("raw");
  const number=(value,digits=3)=>Number.isFinite(Number(value))?Number(value).toFixed(digits):"—";
  const addCell=(row,value)=>{const cell=document.createElement("td");cell.textContent=value;row.appendChild(cell)};
  function renderMetric(label,value){const card=document.createElement("div");card.className="card";const l=document.createElement("div");l.className="label";l.textContent=label;const v=document.createElement("div");v.className="value";v.textContent=value;card.append(l,v);metrics.appendChild(card)}
  function render(result){
    const point=result.hydraulicDiagnosticPoint||{},authority=result.theoreticalStagesUsed||{},envelope=result.hydraulicRpmEnvelope||[];
    const rpm=envelope.map(x=>Number(x.rpm)).filter(Number.isFinite);
    metrics.replaceChildren();
    [
      ["Hydraulic column diameter",number(result.hydraulicResolvedColumnDiameterM)+" m"],
      ["Rotor diameter",number(point.rotorDiameterM)+" m"],
      ["Minimum in-range hydraulic RPM",number(point.rpm,1)+" rpm"],
      ["Hydraulic RPM range",rpm.length?Math.min(...rpm)+"–"+Math.max(...rpm)+" rpm":"—"],
      ["d32 at diagnostic",number(Number(point.d32M)*1000)+" mm"],
      ["Flood-point holdup",number(point.floodHoldup)],
      ["Calculated flooding load",number(Number(point.actualLoading)*100,1)+"%"],
      ["Tip speed",number(point.tipSpeedMS)+" m/s"],
      ["P/V",number(point.powerVolumeWM3,1)+" W/m³"],
      ["Theoretical stages",String(authority.value??"—")+" — "+String(authority.label??"—")],
      ["Final operating RPM",result.finalOperatingRpm==null?"PENDING COUPLED MASS-TRANSFER DUTY":number(result.finalOperatingRpm,1)+" rpm"],
      ["Physical compartments / height",result.physicalCompartments==null?"DEPENDENCY BLOCKED":String(result.physicalCompartments)+" / "+number(result.activeHeightM)+" m"],
      ["Calculation hash",String(result.calculationHash??"—")],
      ["Implementation hash",String(result.engine?.implementationHash??"—")]
    ].forEach(x=>renderMetric(x[0],x[1]));
    trials.replaceChildren();
    envelope.forEach(item=>{const row=document.createElement("tr");[
      number(item.rpm,1),number(item.columnDiameterM)+" m",number(item.rotorDiameterM)+" m",number(Number(item.d32M)*1000)+" mm",
      number(item.floodHoldup),number(Number(item.actualLoading)*100,1)+"%",number(item.tipSpeedMS)+" m/s",number(item.powerVolumeWM3,1)+" W/m³",
      number(item.terminal?.re,1)+" / "+number(item.characteristicRe,1)+" / "+number(item.swarmRe,1),
      item.applicability?.length?item.applicability.join(" · "):"Within recorded ranges"
    ].forEach(value=>addCell(row,value));trials.appendChild(row)});
    raw.textContent=JSON.stringify(result,null,2);
  }
  async function run(){
    button.disabled=true;statusNode.className="status";statusNode.textContent="Running real resolver…";
    try{const response=await fetch("/api/ecr-pre-pilot/kuhni-geometry-resolver/verification",{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error||"Resolver verification failed");render(body);statusNode.className="status ok";statusNode.textContent="Completed — deterministic server result received"}
    catch(error){statusNode.className="status error";statusNode.textContent=error instanceof Error?error.message:String(error)}
    finally{button.disabled=false}
  }
  button.addEventListener("click",run);run();
</script>
</body>
</html>`;
}

export function setupKuhniResolverPreview(app: Express): void {
  if (process.env.NODE_ENV === "production") return;

  app.get("/api/ecr-pre-pilot/kuhni-geometry-resolver/verification", (_req: Request, res: Response) => {
    try {
      const result = resolveKuhniGeometry(PROJECT_236_VERIFICATION_BASIS, VERIFICATION_STAGE_AUTHORITY);
      if (result.status === "NOT_CALCULABLE" || result.hydraulicRpmEnvelope.length === 0) {
        return res.status(422).json({
          error: "Verification basis produced no admissible hydraulic RPM trials.",
          rejectedRpmTrials: result.rejectedRpmTrials,
        });
      }
      return res.json({
        ...result,
        verification: {
          status: "PASSED",
          basis: "PROJECT_236_FIXED_DEVELOPMENT_VERIFICATION",
          businessDataWritten: false,
          resolverVersion: KUHNI_GEOMETRY_RESOLVER_VERSION,
          implementationHash: KUHNI_GEOMETRY_RESOLVER_HASH,
        },
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Resolver verification failed." });
    }
  });

  app.get("/ecr-pre-pilot/kuhni-resolver-preview", (_req: Request, res: Response) => {
    return res.status(200).type("html").set("Cache-Control", "no-store").send(renderPreviewPage());
  });
}