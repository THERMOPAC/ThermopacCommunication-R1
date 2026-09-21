import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Offline scientific synthesis. No application imports, DB, network or workflow access.
const stem = 'deliverables/kuhni-top-dsd-investigation';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : e.isFile() ? [`${dir}/${e.name}`] : []);
const protectedPaths = [...walk('deliverables').filter(p=>!p.startsWith(stem)), 'server/ecr-pre-pilot/rrbo-wetnmp-hydraulic-p1.ts'];
const before = Object.fromEntries(protectedPaths.map(p=>[p,hash(p)]));
const old = JSON.parse(fs.readFileSync('deliverables/kuhni-dsd-moment-analysis.json','utf8'));
for (const p of ['kuhni-outlet-dsd-literature.md','kuhni-terminal-coalescence-review.md','kuhni-dsd-moment-analysis.md','top-disengager-final-review.mjs']) assert(fs.readFileSync(`deliverables/${p}`,'utf8').length>100);
const d32 = 6.068, cutoffs = [0.5,1,1.455,2.081], widths = [0.35,0.44,0.70,1.0];
function simpson(f,a,b,n=16000) {
  const h=(b-a)/n; let sum=f(a)+f(b);
  for(let i=1;i<n;i++) sum+=(i%2?4:2)*f(a+i*h);
  return sum*h/3;
}
// Integrate the smaller tail directly, with the leading exponential factored out.
// No 1-erf cancellation for small negative arguments; upper integration tail <~4e-33.
function cdf(z,n=16000) {
  const x=Math.abs(z);
  const small=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI)*simpson(t=>Math.exp(-x*t-t*t/2),0,12,n);
  return z<=0 ? small : 1-small;
}
const near=(a,b,rtol=2e-9,atol=1e-25)=>assert(Math.abs(a-b)<=atol+rtol*Math.abs(b),`${a} != ${b}`);
near(cdf(0),0.5); near(cdf(-1),0.15865525393145707);
near(cdf(-3),0.0013498980316300945); near(cdf(-8),6.220960574271784e-16);
const phi=z=>Math.exp(-z*z/2)/Math.sqrt(2*Math.PI);
const makeRow=s=>{
  const mu=Math.log(d32)-2.5*s*s;
  const moments=[0,1,2,3].map(k=>Math.exp(k*mu+k*k*s*s/2));
  const numericMoments=[0,1,2,3].map(k=>simpson(z=>Math.exp(k*(mu+s*z))*phi(z),-14,14));
  moments.forEach((m,k)=>near(numericMoments[k],m));
  near(moments[3]/moments[2],d32);
  const inverse=simpson(z=>Math.exp(-(mu+3*s*s+s*z))*phi(z),-14,14);
  near(inverse,1/d32);
  const tails=cutoffs.map(c=>{
    const zv=(Math.log(c/d32)-s*s/2)/s, zn=(Math.log(c/d32)+2.5*s*s)/s;
    const fv=cdf(zv), fn=cdf(zn);
    near(cdf(zv,32000),fv);
    const truncated=simpson(z=>Math.exp(3*(mu+s*z))*phi(z),-16,(Math.log(c)-mu)/s)/moments[3];
    near(truncated,fv,2e-8);
    assert(fv<=c/d32);
    return {cutoff_mm:c,volume_fraction:fv,number_fraction:fn};
  });
  return {sigma_ln:s,classification:'Assumed family and width; Calculated conditional fractions, not predictions',mu_number:mu,geometric_sd:Math.exp(s),moments,numericMoments,inverse_volume_moment_per_mm:inverse,tails};
};
const rows=widths.map(makeRow);
// Independently compare all old GSD cases, moments, inverse moments and fractions.
for(const r of old.lognormal) {
  const fresh=makeRow(Math.log(r.geometric_sd));
  fresh.moments.forEach((m,k)=>near(m,r.number_moments_mm_power_k[k]));
  near(fresh.inverse_volume_moment_per_mm,r.numeric_volume_inverse_moment_per_mm);
  fresh.tails.forEach((t,i)=>near(t.volume_fraction,r.fractions[i].volume_fraction,2e-8));
}
const bounds=cutoffs.map(c=>({cutoff_mm:c,lower_fraction:0,upper_supremum_fraction:c/d32}));
bounds.forEach((b,i)=>near(b.upper_supremum_fraction,old.bounds[i].upper_supremum_fraction));
const a=0.4,b=12,w=(1/d32-1/b)/(1/a-1/b), numberFine=(w/a**3)/(w/a**3+(1-w)/b**3);
near(w,old.bimodals[0].volume_fractions[0]); near(1/(w/a+(1-w)/b),d32);
const rho=869,mu=0.0598,deltaRho=146,q=3.8218/3600,g=9.80665;
const vt=d=>{
  let lo=0,hi=1;
  for(let i=0;i<100;i++){
    const v=(lo+hi)/2,re=rho*v*d/mu;
    const drag=24/re*(1+0.15*re**0.687)*rho*v*v/2;
    if(drag>2*d*deltaRho*g/3) hi=v; else lo=v;
  }
  return (lo+hi)/2;
};
const diameterAt=v=>{
  let lo=1e-8,hi=0.02;
  for(let i=0;i<100;i++){const d=(lo+hi)/2;if(vt(d)>v)hi=d;else lo=d;}
  return (lo+hi)*500;
};
const areaRows=[700,900,1000,1200].map(D=>{
  const area=Math.PI*(D/1000)**2/4,U=q/area;
  return {diameter_mm:D,classification:D===700?'Inherited reservation':'Engineer-selected comparison only',area_m2:area,U_mm_s:U*1000,zero_net_mm:diameterAt(U),margin_mm:diameterAt(2*U)};
});
near(areaRows[0].zero_net_mm,1.45534,1e-5); near(areaRows[0].margin_mm,2.08075,1e-5);
const pct=f=>{
  const p=100*f;
  return p<0.0001 ? p.toExponential(2).replace('e-',' × 10<sup>−')+'</sup>' : p.toPrecision(3);
};
const table=(heads,rs)=>`<table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rs.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const note=s=>`<aside>${s}</aside>`;
const page=(n,title,body)=>`<section><header>SCIENTIFIC INVESTIGATION · RRBO / NMP · ${n} / 7</header><h1>${title}</h1>${body}<footer>Research only · equipment selection and performance release HOLD · no geometry revision</footer></section>`;
const pages=[
page(1,'Do the actual terminal droplets<br>justify changing the top?',`
${note('<b>Not yet established.</b> Available Kühni experiments establish real terminal <em>active-stage</em> distributions, but do not determine whether droplets below 0.500, 1.000, 1.455 or 2.081 mm materially contribute to this NMP withdrawal load. Neither negligible fines nor a mandatory coalescer follows.')}
<p><b>Disposition:</b> retain the <b>Ø700 × 1600 mm</b> top spatial reservation [I; historically E]. Bare Ø700 remains the baseline <em>candidate</em>, not a separation PASS. No enlargement, internal collector or external guard is justified for selection now. All active geometry and the complete bottom arrangement remain fixed.</p>
<h2>Correction to the previous selection interpretation</h2>
<p>This investigation <b>supersedes the selection interpretation</b> in <i>top-disengager-final-review</i> that treated an assigned 500 µm screen as a design capture basis or gave an aided/guard route preferred status. <b>That duty and preselection are withdrawn here.</b> The conditional single-drop arithmetic is not erased, but its failure cannot establish equipment need. Earlier reports remain unmodified for audit.</p>
<p>“Material” requires the physical dispersed load, transported size distribution and an agreed carryover specification. None is established by the calculated active-section mean. A small volume fraction may still matter to a stringent specification; a large local count fraction is not automatically a large solvent loss.</p>
${table(['Classification used throughout','Meaning'],[
['I · Inherited','Existing basis or cited donor measurement; not newly measured or approved.'],
['C · Calculated','Mathematical/model result conditional on inputs.'],
['A · Assumed','Unverified distribution, transferred width or physical model.'],
['E · Engineer-selected','Reporting cutoff, comparison diameter or legacy screening factor; not a measured duty.'],
['HOLD','Unresolved service evidence or equipment performance.'],
['PASS','Only the explicitly named numerical or preservation check; never engineering acceptance.']])}
<p class="small">Tables identify status in their captions or adjacent text; those labels cover every numeric entry. Source numbers and page numbers are identifiers, not engineering quantities. Literature access claims are inherited from the supplied research records, not new retrievals in this synthesis.</p>
<h2>Scientific answer in one sentence</h2>
<p>Use genuine Kühni DSD evidence to frame a <b>testable family and transport question</b>, not to manufacture a fine-capture duty from d32 or to choose a large vessel.</p>`),
page(2,'What the terminal-stage<br>literature really supports',`
<h2>S1 · Oliveira et al. (2008): full primary evidence [I]</h2>
<p>Five-stage, Ø150 mm Kühni; photographs at distributor stage 0 and active stages 1, 3 and <b>5</b>; Ø85 mm rotor, 70 mm spacing, 30% stator free area; 60–180 rpm, 1.24/2.00 L/min phase flows. Water continuous / Exxsol D-80 dispersed, mutually saturated, no mass transfer. This is a real terminal <b>active-compartment</b> DSD, not an outlet-flux or quiet-zone measurement [S1].</p>
<p>The fitted lognormal is <b>number weighted</b>. Its width s is the standard deviation of ln(d), not variance. At least 400 photographed drops per condition; 18 classes of 0.5 mm, observed sizes 0.5–8.5 mm. No validated sub-500-µm completeness limit was established. A lowest observed size is not a physical lower cutoff.</p>
${note('<b>Donor widths [I]:</b> nominal regression s = 0.2992–0.373984 within the experiment; graphical fitted widths approximately 0.26–0.44 across all conditions. The latter is neither a terminal-only interval nor an RRBO confidence band. Regression R² = 0.67; roughly 20% width agreement in the donor study.')}
${table(['Transfer comparison [I unless C]','Donor S1','Fixed target'],[
['Continuous viscosity, Pa·s','0.0011','0.0598 (54.4× [C])'],
['μdispersed / μcontinuous','≈1.45','0.02368 [C]'],
['Rotor Reynolds number','7225–21675','≈388 [C], about 19× below donor minimum'],
['Dispersed-phase buoyancy','Light drops rise','Heavy NMP-rich drops normally descend'],
['Rotor / column diameter','0.567 [C]','0.330 [C]'],
['Stage height / column diameter','0.467 [C]','0.300 [C]']])}
<p>Matching a mean, rpm or assigned power number cannot repair the rheology, Reynolds number, geometry, mass-transfer and direction differences. Do not extrapolate the donor width correlation to this service. Even “final stage” refers to a different dispersed-phase trajectory.</p>
<h2>Other primary evidence: what is and is not transferred</h2>
<p><b>S2 Kentish (1997), abstract only:</b> static photographic and dynamic probe distributions differ through transport. <b>S3 Kentish (1998), abstract only:</b> axial DSD profiles were used to fit breakage/coalescence closure; no universal rate follows. <b>S4 Asadollahzadeh (2017), abstract/previews:</b> genuine Kühni tests compare maximum entropy, Gamma, inverse Gaussian and Weibull; maximum entropy reportedly fit best. No accessible target-transferable shape parameters.</p>
<p class="small">Thus lognormal is an evidence-informed comparison, not a universal family. Distributor volume distributions in Garthe and breakup daughter kernels are not terminal ensemble DSDs; Shirvani mean-size correlations and Gomes abstract-level local DSD evidence do not fill the outlet-tail gap [S5–S7].</p>`),
page(3,'One mean does not identify<br>the fine-volume population',`
<p><b>Inherited premise:</b> d32 = 6.068 mm is calculated for the active population, not measured at the terminal exit. All results on this page are [C], conditional on <em>the same population</em> having that mean [A]. Spherical or consistently volume-equivalent diameter weighting is assumed.</p>
<div class="equation">M<sub>k</sub> = E<sub>N</sub>[d<sup>k</sup>]; &nbsp; d32 = M<sub>3</sub> / M<sub>2</sub><br>
dP<sub>V</sub> = d³ dP<sub>N</sub> / M<sub>3</sub>; &nbsp; E<sub>V</sub>[1/d] = 1/d32<br>
F<sub>V</sub>(c) ≤ c E<sub>V</sub>[1/d] = c/d32 &nbsp; (0 &lt; c &lt; d32)</div>
<p>d32 is a volume-weighted harmonic mean, not the number median, minimum or a percentile. These normalization and inverse-moment constraints do not fix the CDF.</p>
${table(['Cutoff [E], mm','Lower fraction [C], vol%','Upper supremum [C], vol%'],bounds.map(r=>[r.cutoff_mm.toFixed(3),'0',(100*r.upper_supremum_fraction).toFixed(2)]))}
${note('<b>Not outlet bounds.</b> These bounds apply only to that same local population. They cannot constrain a selectively transported outlet distribution by assigning it the compartment d32. No positive minimum fine fraction follows.')}
<p>The upper values are loose <b>suprema</b>: with finite positive drops and c &lt; d32, the fraction is strictly below c/d32. Approaching the supremum requires increasingly large coarse drops and a fine atom approaching c. They are not probable tails or an implied physically realizable giant-drop population. Strict “below” and “at or below” agree for continuous distributions; cutoff atoms require care.</p>
<h2>One constructive counterexample</h2>
<p>Assume [A] two diameters, <b>0.4 and 12 mm</b>. Set small-drop volume share w = (1/d32 − 1/12)/(1/0.4 − 1/12). Then [C] <b>${(w*100).toFixed(3)}%</b> of volume is below <em>every</em> requested cutoff, with <b>${(numberFine*100).toFixed(3)}%</b> of the count in small drops. The remaining volume at 12 mm reconstructs d32 = 6.068 mm.</p>
<p>A monodisperse population at 6.068 mm [A] instead has zero below all four cutoffs [C], with exactly the same mean. These are mathematical counterexamples, not proposed physical DSDs. A fine satellite mode can escape a single-lognormal assumption.</p>
<h2>Independent verification against the moment report</h2>
<p>The new generator reconstructs these bounds and the bimodal mean, and independently compares the earlier GSD = 1.3, 1.5, 2.0 and 2.5 cases. Number moments k = 0–3, d32, volume inverse moment and all four truncated volume fractions agree within numerical tolerances. <b>PASS — mathematical consistency only.</b></p>`),
page(4,'Conditional tails — all four<br>requested cutoffs',`
<p>Assume a number-lognormal population [A], ln(d/1 mm) ~ Normal(m,s²), anchored to inherited d32 = 6.068 mm. Rescaling a donor width does <b>not</b> predict the RRBO/NMP tail or produce a confidence band.</p>
<div class="equation">M<sub>k</sub> = exp(km + k²s²/2) mm<sup>k</sup>; &nbsp; m = ln(6.068) − 2.5s²<br>
F<sub>N</sub>(c) = Φ([ln(c/d32) + 2.5s²]/s)<br>
F<sub>V</sub>(c) = Φ([ln(c/d32) − 0.5s²]/s)</div>
<h2>Dispersed-volume fraction below cutoff, % [C | A]</h2>
${table(['s [A]','0.500 mm','1.000 mm','1.455 mm','2.081 mm'],rows.map(r=>[r.sigma_ln.toFixed(2),...r.tails.map(t=>pct(t.volume_fraction))]))}
<p class="small"><b>s = 0.35 and 0.44:</b> conditional width transfers inside the approximate donor graphical envelope; neither a fitted target width nor a probability band. <b>s = 0.70 and 1.00:</b> deliberately broad analyst stress assumptions, not literature recommendations. All four columns are reporting cutoffs [E], not selected capture duties.</p>
<h2>Number fraction below the same cutoff, % [C | A]</h2>
${table(['s [A]','0.500 mm','1.000 mm','1.455 mm','2.081 mm'],rows.map(r=>[r.sigma_ln.toFixed(2),...r.tails.map(t=>pct(t.number_fraction))]))}
${note(`At s = 0.44, below 2.081 mm: <b>${pct(rows[1].tails[3].number_fraction)}% of count</b> but <b>${pct(rows[1].tails[3].volume_fraction)}% of dispersed volume</b> [C | A]. Neither quantity is the raffinate-path flux fraction or NMP concentration.`)}
<p>Extremely small numbers are retained in scientific notation, not rounded to a misleading zero. Their displayed precision is computational, <b>not empirical resolving power</b>: the donor photographs cannot establish such trace tails. Unknown detection bias, feed-generated fines or a second mode may dominate these mathematical extrapolations.</p>
<p class="small">Numerics: the smaller normal tail is integrated directly by composite Simpson quadrature, factoring out exp(−z²/2); no subtraction of nearly equal numbers. Reference CDF checks include z = 0, −1, −3 and −8; doubling 16,000 panels checks stability. Independent normal-coordinate integration verifies moments and truncated third moments. These are calculation checks, not physical validation.</p>`),
page(5,'Transport and coalescence:<br>the missing link to carryover',`
${table(['Quantity','What it represents / missing evidence'],[
['Number DSD','Local counts of individual drops; image detection and sampling bias matter.'],
['Local volume DSD','Counts weighted by d³; specifies relative local dispersed inventory, not load.'],
['One-way upward volume-flux DSD','Crossing volume weighted by outward velocity over the actual exit plane; not a snapshot.'],
['Quiet-region / outlet DSD','Evolves through selective return, coalescence, residual breakup and feed interaction.'],
['Physical carryover','Dispersed NMP-rich droplets in the withdrawal; distinct from molecularly dissolved NMP.']])}
<p>In an ideal dilute uniform counterflow [A], outward volume flux is proportional to <b>d³ n(d) max[U − vt(d), 0]</b>. Where settling speed grows with size, this preferentially transports fines. The normalized outlet tail can be much larger than the local-volume tail. Real stator jets, recirculation, turbulent exchange and nonuniform holdup prevent treating this illustration as a calibrated model [S2]. Upward and downward crossings must be resolved separately.</p>
<p><b>Fresh NMP introduced above the terminal stator is another possible droplet source.</b> Measuring only the final active compartment misses feed jets, distributor breakup and possible short-circuit paths to withdrawal. Heavy NMP normally travels downward; upward escaped drops are a selected population.</p>
<h2>Coalescence is plausible, not quantified</h2>
<p>After the final rotor/stator, reduced breakup may permit growth. But drops must collide, drain the continuous-phase film and merge. Collision frequency depends on concentration, size, differential settling and shear; merger efficiency depends on composition, contaminants, interfacial mobility and contact duration. Quiet conditions may reduce both breakup <em>and collisions</em>. Sparse fines can persist.</p>
<p>S3 fitted rates to axial DSDs and transport; it provides no universal “growth per second,” no service-specific coalescence time and no justified growth credit here. A rising mean alone is not proof of merger: selective departure changes the measured population. Batch settling and material-specific coalescing-aid studies [S8, S9] suggest methods, not target parameters.</p>
${note('<b>No actual ppm, kg/h, holdup or entrainment load is calculated.</b> Relative tails cannot supply total escaped dispersed flow, composition or permitted residual. Raffinate flow is not entrained solvent throughput.')}
<p>If entering physical dispersed flow and its flux DSD were measured, a no-growth grade-efficiency balance could integrate residual load. With coalescence, capture also depends on load, residence paths and accumulated inventory. None is closed here. Droplet volume is not automatically pure-NMP mass; dissolved NMP is not gravity-removable.</p>
<p>The 1600 mm reservation [I/E] is not entirely quiet liquid. The prior 600 mm clear allowance [I/E] corresponds to a nominal L/U ≈218 s [C], <b>not a coalescence time or validated residence distribution</b>. No minimum quiet height is derived.</p>`),
page(6,'Compare concepts without<br>preselecting equipment',`
<p><b>Frozen basis [I]:</b> Ø700 ×4200 mm active section; 20 ×210 mm compartments; Ø231 mm rotor; 30 rpm; assigned Np = 1.2; stator free area 0.40. Entire bottom unchanged. At 40 °C: ρc/ρd = 869/1015 kg/m³, μc/μd = 0.0598/0.001416 Pa·s, interfacial tension 0.011 N/m; raffinate 3.8218 m³/h. These are inherited, not newly validated outlet properties.</p>
<h2>Conditional local-area sensitivity — not approved enlargement</h2>
${table(['ID, mm [I/E]','Area m² [C]','U mm/s [C]','vt = U, mm [C]','vt = 2U, mm [C]'],areaRows.map(r=>[r.diameter_mm+(r.diameter_mm===700?' [I]':' [E]'),r.area_m2.toFixed(3),r.U_mm_s.toFixed(3),r.zero_net_mm.toFixed(3),r.margin_mm.toFixed(3)]))}
<p class="small">Schiller–Naumann immobile spherical isolated-drop model [A]: Re = ρc vt d/μc; CD = (24/Re)(1+0.15Re<sup>0.687</sup>); CD ρc vt²/2 = (2/3)d Δρ g. The vt = 2U column retains the former engineer-selected f = 0.5 margin [E], <b>not a grade-efficiency law</b>. Rounded baseline values explain 1.455 and 2.081 mm; they are velocity equalities, not percentiles.</p>
${table(['Candidate','Present disposition','Evidence that could justify it'],[
['Bare Ø700 ×1600 reservation','Baseline candidate; performance HOLD, not PASS','Actual physical carryover meets specification with stable top inventory and return across representative conditions.'],
['Modest area increase','No change justified now; comparison only','Measured limiting transported load lies in a size range materially helped by lower U; validate flow and full return path.'],
['Internal collector / aid','Not mandated by a 500 µm failure','Representative capture/coalescence, compatibility, drainage, fouling, pressure loss and access evidence.'],
['External guard','Not mandated or preselected','Actual withdrawal load and specification justify independent separation; demonstrate collection, pressure/control and return.']])}
<h2>The unchanged Ø700 return throat remains controlling</h2>
<p>An enlarged region may allow local settling but cannot make an unchanged drop descend through the faster upflow below. For example, a 1 mm drop has vt ≈${(vt(0.001)*1000).toFixed(3)} mm/s [C | A]: it can settle in the 1200 mm comparison, but not through Ø700. Enlargement alone is not an integrated return solution.</p>
<p>Growth, a demonstrated descending collected phase/film, or a protected return route needs evidence. A drain requires a real collector, pressure/elevation balance, losses, liquid seal and capacity at the <em>entrained</em> load. Do not assume a top heavy-phase interface, wall film or spare volume. <b>No new geometry, giant vessel or equipment purchase is recommended.</b></p>`),
page(7,'Qualification and<br>reproducible evidence record',`
<h2>Next scientific qualification — actual duty first</h2>
<p>At representative <b>40 °C and 30 rpm [I]</b>, use actual equilibrated/aged RRBO–NMP, phase rates, water/solids/contamination history and internals. Obtain matched raw drop sizes or n(d) in the <b>last active compartment, immediately above the terminal stator, above fresh-NMP feed, along the available quiet region, and actual raffinate withdrawal</b>. Record axial/radial position, time, spatial versus one-way-flux weighting and withdrawal bias.</p>
<p>Validate optical or minimally disruptive sampling for viscous/opaque material: report resolution and calibrated recovery below all four cutoffs, unresolved sub-resolution volume, sample count, uncertainty and induced breakup/coalescence. Report measured d32, number/volume CDFs, dV10/dV50/dV90 and Fv at <b>0.500, 1.000, 1.455 and 2.081 mm [E]</b>; test a second fine mode rather than force a lognormal. Separately quantify actual physical dispersed carryover, dissolved NMP, droplet composition and a matched mass balance.</p>
<p>Use time-resolved DSD/merger observations and representative-material settling data to test post-stator kinetics and stable return. Define permitted physical carryover and relevant normal, startup and surge conditions before qualification. <b>No arbitrary duration or sample count is declared sufficient.</b> Precision and operating coverage must discriminate against the agreed specification. Qualify the bare candidate first; evaluate aids or area only if evidence identifies the limitation.</p>
<h2>Primary references and access limits</h2>
<p class="small">Access below is as documented in the supplied research reviews; no new online retrieval. No retrieved source closes the full terminal-stator-to-outlet RRBO/NMP chain.</p>
<ol class="refs">
<li><b>S1 Oliveira et al. (2008), terminal DSD.</b> <a href="https://doi.org/10.1590/S0104-66322008000400010">doi:10.1590/S0104-66322008000400010</a>. Full HTML/PDF text and equation images inspected in source review; pp. 731–736, Table 1, Figs. 2–5, Eqs. 2–5. Direct PDF curl gave HTML; not misrepresented as downloaded PDF.</li>
<li><b>S2 Kentish et al. (1997), drop velocities.</b> <a href="https://doi.org/10.1021/ie9702690">doi:10.1021/ie9702690</a>. Publisher abstract only; full method and envelope unavailable.</li>
<li><b>S3 Kentish et al. (1998), coalescence/breakage rates.</b> <a href="https://doi.org/10.1021/ie970336q">doi:10.1021/ie970336q</a>. Publisher abstract only; no fitted rates transferred.</li>
<li><b>S4 Asadollahzadeh et al. (2017), DSD families.</b> <a href="https://doi.org/10.1016/j.cherd.2016.08.025">doi:10.1016/j.cherd.2016.08.025</a>. Abstract/section previews; no full parameter tables.</li>
<li><b>S5 Garthe (2006), dissertation.</b> <a href="https://mediatum.ub.tum.de/601973">https://mediatum.ub.tum.de/601973</a>. Repository/full existing text; initial q3 distributions are not terminal tails.</li>
<li><b>S6 Shirvani et al. (2016).</b> <a href="https://doi.org/10.5829/idosi.ije.2016.29.03c.02">doi:10.5829/idosi.ije.2016.29.03c.02</a>. Full existing primary text; mean-size/flooding, not verified outlet width.</li>
<li><b>S7 Gomes et al. (2009).</b> <a href="https://doi.org/10.1021/ie801034a">doi:10.1021/ie801034a</a>. Publisher abstract only; local DSD/mass-transfer effects, no transferred parameters.</li>
<li><b>S8 Henschke et al. (2002).</b> <a href="https://doi.org/10.1016/S1385-8947(01)00251-0">doi:10.1016/S1385-8947(01)00251-0</a>. Abstract/introduction/previews; batch coalescence characterization.</li>
<li><b>S9 Schäfer et al. (2022).</b> <a href="https://doi.org/10.1002/cjce.24503">doi:10.1002/cjce.24503</a>. Open full text, relevant sections reviewed; material-specific coalescing aids, not NMP qualification.</li>
</ol>
<p class="small"><b>Reproduce:</b> <code>node deliverables/kuhni-top-dsd-investigation.mjs --pdf</code>. Writes only this new prefix. Companion results record numerical checks, classifications, all old deliverable SHA-256 hashes (including basis reports) and unchanged hydraulic source. No app/DB access. <b>PASS = arithmetic/preservation only; actual DSD, carryover and selection remain HOLD.</b></p>`)
];
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kühni top DSD investigation — scientific selection HOLD</title><style>
*{box-sizing:border-box}body{margin:0;background:#e8edf0;color:#253b49;font:14px/1.43 Arial,sans-serif}section{position:relative;width:210mm;height:297mm;margin:18px auto;padding:14mm 15mm 17mm;background:#fff}header{font-size:10px;font-weight:bold;letter-spacing:1.2px;color:#547485}h1{font-size:29px;line-height:1.12;margin:13px 0 18px;color:#183f53}h2{font-size:17px;margin:15px 0 7px;color:#183f53}p{margin:10px 0}aside{border-left:4px solid #aa7729;background:#fff2d9;padding:12px 14px;margin:12px 0}table{width:100%;border-collapse:collapse;font-size:11.5px;margin:11px 0}td,th{border:1px solid #cbd7de;padding:7px;text-align:left;vertical-align:top}th{background:#ecf2f5}tr{break-inside:avoid}.equation{background:#edf3f5;padding:12px 14px;font:13px/1.7 Georgia,serif}.small{font-size:11px}.refs{padding-left:18px;font-size:10.5px;line-height:1.35}.refs li{margin:6px 0}a{color:#17627b;overflow-wrap:anywhere}footer{position:absolute;bottom:9mm;left:15mm;right:15mm;border-top:1px solid #d7e0e5;padding-top:5px;font-size:9px;color:#69808b}code{font-size:10px;overflow-wrap:anywhere}@page{size:A4;margin:0}@media print{body{background:white}section{margin:0;break-after:page}section:last-child{break-after:auto}}
body{font-size:13.5px;line-height:1.4}p{margin:9px 0}
</style></head><body>${pages.join('')}</body></html>`;
fs.writeFileSync(stem+'.html',html);
let renderChecks=null;
if(process.argv.includes('--pdf')){
  const {default:puppeteer}=await import('puppeteer');
  const executablePath=fs.existsSync(puppeteer.executablePath())?puppeteer.executablePath():execFileSync('which',['chromium'],{encoding:'utf8'}).trim();
  const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
  try {
    const p=await browser.newPage();
    await p.setRequestInterception(true); p.on('request',r=>r.abort());
    await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.emulateMediaType('print');
    renderChecks=await p.evaluate(()=>[...document.querySelectorAll('section')].map((s,i)=>{
      const footer=s.querySelector('footer').getBoundingClientRect();
      const body=[...s.children].filter(e=>e.tagName!=='FOOTER');
      return {page:i+1,bodyBottom:Math.max(...body.map(e=>e.getBoundingClientRect().bottom)),footerTop:footer.top};
    }));
    assert(renderChecks.every(r=>r.bodyBottom<r.footerTop-7),'Page body overlaps footer: '+JSON.stringify(renderChecks));
    await p.pdf({path:stem+'.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
  }finally{await browser.close();}
}
for(const p of protectedPaths) assert.equal(hash(p),before[p],`Protected file changed: ${p}`);
const results={
  status:'SCIENTIFIC_INVESTIGATION_COMPLETE_SELECTION_HOLD',
  classificationKey:{I:'Inherited',C:'Calculated',A:'Assumed',E:'Engineer-selected',HOLD:'Evidence missing',PASS:'Named checks only, not engineering acceptance'},
  basis:{d32_mm:d32,status:'Inherited calculated compartment mean, not measured exit',topReservation_mm:[700,1600],geometryChange:false,activeAndBottomUnchanged:true},
  cutoffs:{values_mm:cutoffs,status:'Engineer-selected reporting cutoffs; no capture duty selected'},
  lognormal:rows,bounds:{status:'Calculated same-population upper suprema only; not outlet bounds',rows:bounds},
  bimodal:{status:'Assumed mathematical counterexample',diameters_mm:[a,b],volume_fractions:[w,1-w],number_fine_fraction:numberFine},
  localAreaSensitivity:{model:'Assumed isolated immobile sphere Schiller–Naumann',margin:'Engineer-selected vt=2U, not a capture curve',rows:areaRows},
  checks:{normalReferenceValues:'PASS',tailPanelDoubling:'PASS',analyticAndQuadratureMoments:'PASS',truncatedThirdMoments:'PASS',oldMomentReportAgreement:'PASS',bimodalReconstruction:'PASS',protectedFilesUnchanged:'PASS',renderChecks},
  numericalMethod:{CDF:'Direct smaller-tail Simpson integration with leading exponential factored; 16000 and 32000 panels over t=0..12',moments:'Independent normal-coordinate Simpson integral z=-14..14; truncated third moment lower bound -16',comparisonRelativeTolerance:2e-8},
  selection:{bare700:'Baseline candidate, not PASS',modestEnlargement:'Not selected',internalAid:'Not selected',externalGuard:'Not selected',actualCarryover:'HOLD',previous500DutyAndGuardPreselection:'Superseded and withdrawn in this investigation; old reports preserved'},
  protectedFileHashes:before
};
fs.writeFileSync(stem+'.results.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({status:results.status,protectedFiles:protectedPaths.length,checks:results.checks},null,2));