// Offline mathematics only. No application imports, services, or database access.
// Run: node deliverables/kuhni-dsd-moment-analysis.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const d32 = 6.068; // mm; stipulated, not independently validated here
const cutoffs = [0.5, 1, 1.455, 2.081]; // mm
const widths = [1.3, 1.5, 2, 2.5]; // UNFITTED geometric standard deviations
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} differs from ${expected}`);
function integrate(fn, lo, hi, n = 12000) {
  assert.ok(n % 2 === 0);
  const h = (hi - lo) / n;
  let sum = fn(lo) + fn(hi);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * fn(lo + i * h);
  return sum * h / 3;
}
const phi = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
function normalCDF(z) {
  // Absolute omitted tail beyond +/-12 is <2e-33.
  if (z <= -12) return 0;
  if (z >= 12) return 1;
  return integrate(phi, -12, z);
}
close(integrate(phi, -12, 12), 1);
close(normalCDF(0), 0.5);
close(normalCDF(1), 0.8413447460685429);
close(normalCDF(-1), 0.15865525393145707);

const bounds = cutoffs.map(c => ({ cutoff_mm: c, lower_fraction: 0,
  upper_supremum_fraction: c / d32 }));
const lognormal = widths.map(gsd => {
  const sigma = Math.log(gsd);
  // log(d / 1 mm) ~ N(muN, sigma^2) under NUMBER weighting.
  const muN = Math.log(d32) - 2.5 * sigma ** 2;
  const muV = muN + 3 * sigma ** 2;
  const moment = k => Math.exp(k * muN + 0.5 * k * k * sigma ** 2);
  const numericMoment = k =>
    integrate(z => Math.exp(k * (muN + sigma * z)) * phi(z), -12, 12);
  for (const k of [0, 1, 2, 3]) close(numericMoment(k), moment(k));
  close(moment(3) / moment(2), d32);
  close(numericMoment(3) / numericMoment(2), d32);
  const inverseVolumeMoment = Math.exp(-muV + sigma ** 2 / 2);
  const numericInverseVolumeMoment =
    integrate(z => Math.exp(-(muV + sigma * z)) * phi(z), -12, 12);
  close(inverseVolumeMoment, 1 / d32);
  close(numericInverseVolumeMoment, 1 / d32);
  const fractions = cutoffs.map(c => {
    const z = (Math.log(c) - muV) / sigma;
    const fraction = normalCDF(z);
    // Independent number-weighted truncated third moment, divided by M3.
    const numberZ = (Math.log(c) - muN) / sigma;
    const byNumberMoment = integrate(t =>
      Math.exp(3 * (muN + sigma * t)) * phi(t), -12, numberZ) / moment(3);
    close(fraction, byNumberMoment);
    assert.ok(fraction >= 0 && fraction <= c / d32);
    return { cutoff_mm: c, volume_fraction: fraction };
  });
  return { status: 'UNFITTED sensitivity, not a predicted DSD', geometric_sd: gsd,
    sigma_ln: sigma, mu_number_ln_d_over_1mm: muN, mu_volume_ln_d_over_1mm: muV,
    number_moments_mm_power_k: [0, 1, 2, 3].map(moment),
    numeric_d32_mm: numericMoment(3) / numericMoment(2),
    numeric_volume_inverse_moment_per_mm: numericInverseVolumeMoment, fractions };
});

function bimodal(a, b) {
  const w = (1 / d32 - 1 / b) / (1 / a - 1 / b);
  assert.ok(w > 0 && w < 1);
  const numberSmall = (w / a ** 3) / (w / a ** 3 + (1 - w) / b ** 3);
  const reconstructed = (numberSmall * a ** 3 + (1 - numberSmall) * b ** 3) /
    (numberSmall * a ** 2 + (1 - numberSmall) * b ** 2);
  close(1 / (w / a + (1 - w) / b), d32);
  close(reconstructed, d32);
  return { diameters_mm: [a, b], volume_fractions: [w, 1 - w],
    number_fractions: [numberSmall, 1 - numberSmall], reconstructed_d32_mm: reconstructed,
    fractions: cutoffs.map(c => ({ cutoff_mm: c,
      volume_fraction: (a <= c ? w : 0) + (b <= c ? 1 - w : 0) })) };
}
const bimodals = [bimodal(0.4, 12), bimodal(1.5, 12)];
const results = {
  basis: 'Stipulated calculated compartment d32=6.068 mm, NOT measured exit d32; bounds apply only to that same population; offline mathematics, no fitted distribution',
  cdf_definition: 'Fv(c)=P_volume(0<d<=c); strict below is P_volume(d<c)',
  d32_mm: d32, bounds, bimodals, lognormal,
  assertions: 'Passed normalization, analytic/numeric number moments k=0..3, d32, inverse volume moment, truncated volume fractions, and bimodal reconstruction',
};
const percent = x => (100 * x).toFixed(6);
const boundTable = bounds.map(r =>
  `| ${r.cutoff_mm} | 0 | ${percent(r.upper_supremum_fraction)} |`).join('\n');
const sensitivityTable = lognormal.map(r =>
  `| ${r.geometric_sd} | ${r.fractions.map(f => percent(f.volume_fraction)).join(' | ')} |`).join('\n');
const exampleTable = bimodals.map(r =>
  `| ${r.diameters_mm.join(', ')} | ${r.volume_fractions.map(percent).join(', ')} | ${r.number_fractions.map(percent).join(', ')} | ${r.fractions.map(f => percent(f.volume_fraction)).join(' | ')} |`).join('\n');
const report = `# Offline DSD moment analysis: stipulated d32 = 6.068 mm

## Conclusion and scope

**No: the volume fractions below 0.5, 1, 1.455, and 2.081 mm are not identifiable from d32 alone.** One moment ratio is not a distribution. The bounds below are upper limits/suprema, **not predictions** of fines, capture, or carryover. The lognormal cases are explicitly UNFITTED sensitivity examples, not a predicted Kühni DSD.

This calculation takes the **calculated compartment d32 = 6.068 mm** as given; it is **not a measured exit d32**. All bounds and sensitivities below are conditional on the **same population** having that d32; they are not outlet bounds. This calculation does not validate the d32 source or physical applicability. No application, database, design basis, or existing record is changed. No arbitrary 500-micrometre capture criterion or equipment decision is introduced. The requested 0.5 mm cutoff is only a mathematical reporting threshold.

## Exact moment constraints and units

Let N be a normalized number distribution on strictly positive finite diameters d, measured in mm, with M_k = E_number[d^k], finite positive M_2 and M_3. For spherical or consistently volume-equivalent diameters with the usual d-cubed volume weighting,

- d32 = M_3/M_2 = 6.068 mm.
- dP_volume = d^3 dP_number / M_3.
- Integral dP_volume = 1, and E_volume[1/d] = M_2/M_3 = 1/(6.068 mm).
- Hence d32 = 1/E_volume[1/d]: a volume-weighted harmonic mean, not a volume arithmetic mean or median.

These are the normalization and single inverse-moment constraints; they do not fix a CDF. Converting an arbitrary volume measure back to a normalized number distribution additionally requires finite E_volume[d^-3]; all examples here satisfy this. A zero-diameter atom is excluded. The same algebra applies to nonnormalized number measures after normalization when the relevant moments exist.

Define Fv(c) = P_volume(0 < d <= c). Literal “below” means Fv(c-) = P_volume(d < c). These differ at atoms; all reported cutoffs avoid the example atoms, and lognormals have none.

## Distribution-free bounds

On d <= c, 1/d >= 1/c. Thus

1/d32 = E_volume[1/d] >= E_volume[(1/d) 1_{d<=c}] >= Fv(c)/c,

so 0 <= Fv(c) <= min(1, c/d32). The same weak inequality holds for strict-below fractions.

| Cutoff (mm) | Attainable lower bound (%) | Upper supremum (%) |
|---|---:|---:|
${boundTable}

Every cutoff here is below d32. With finite positive diameters the positive mass outside the cutoff contributes a strictly positive inverse moment, so Fv(c) < c/d32: the stated upper bound is a **supremum, not an attained maximum**. For the inclusive CDF it is approached by volume atoms at c and b with b tending to infinity, using w = (1/d32 - 1/b)/(1/c - 1/b). For literal strict-below, use an atom a < c and let a tend to c from below while b tends to infinity. An artificial atom at infinite diameter is not physical and is not used.

The lower bound zero is attained by a monodisperse distribution at 6.068 mm for every requested cutoff. Therefore no positive lower fraction follows here. Merely specifying a maximum diameter compatible with this d32 (necessarily at least d32) still does not force fines below these smaller cutoffs. More generally, for c > d32 the infimum is also zero without a positive minimum diameter: arbitrarily little volume at arbitrarily small d can supply the inverse moment. An upper-size constraint alone is not a universal source of a positive lower bound. Additional support/distribution information must be evaluated explicitly, rather than presumed to identify fines.

## Explicit nonidentifiability examples

For two diameters a < d32 < b and small-drop volume fraction w,

w = (1/d32 - 1/b)/(1/a - 1/b), and 1/d32 = w/a + (1-w)/b.

Number fractions are proportional to w/a^3 and (1-w)/b^3, not equal to volume fractions.

| Diameters (mm) | Volume shares (%) | Number shares (%) | Fv(0.5) % | Fv(1) % | Fv(1.455) % | Fv(2.081) % |
|---|---|---|---:|---:|---:|---:|
${exampleTable}

Both bimodal distributions reconstruct d32 = 6.068 mm. A third, monodisperse distribution at 6.068 mm has zero volume below all four cutoffs. Thus even exact knowledge of d32 leaves multiple incompatible fine-volume fractions.

## Conditional lognormal sensitivity — UNFITTED

Assume ONLY for sensitivity that ln(d / 1 mm) under number weighting is normal with mean mu_N and standard deviation sigma = ln(GSD). Then

M_k = (1 mm)^k exp(k mu_N + k^2 sigma^2/2),

d32/(1 mm) = exp(mu_N + 5 sigma^2/2).

Volume weighting shifts the log mean by 3 sigma^2 without changing sigma:

mu_N = ln(6.068) - 2.5 sigma^2; mu_V = mu_N + 3 sigma^2 = ln(6.068) + 0.5 sigma^2.

Consequently Fv(c) = Phi((ln(c / 6.068 mm) - 0.5 sigma^2)/sigma). Number and volume geometric medians are exp(mu_N) mm and exp(mu_V) mm respectively, and must not be interchanged.

**All entries below are volume percentages conditional on arbitrarily selected, explicitly UNFITTED widths. None is a measured or predicted DSD.**

| UNFITTED GSD | Fv(0.5 mm) % | Fv(1 mm) % | Fv(1.455 mm) % | Fv(2.081 mm) % |
|---|---:|---:|---:|---:|
${sensitivityTable}

Values rounded to six decimal places in percent can display zero despite a strictly positive lognormal probability. Full numerical fractions are in the JSON.

## Exit flux versus bulk holdup; carryover

An exit load requires the **outward flux-weighted exit DSD**, not automatically the bulk volume/holdup DSD. In a size-resolved description its volume measure is proportional to exit number concentration times drop volume times outward normal velocity, integrated over the exit area. Size-dependent slip, spatial segregation, breakup, and coalescence can make it different from bulk. The inverse-moment identity holds within a consistently defined weighting, but a bulk d32 cannot simply be assigned to an exit flux distribution.

For illustration only, in a dilute, uniform, steady upward carrier flow with downward settling speed vt(d), ideal size-resolved outward volume flux is j_out(d) proportional to pV,bulk(d) max(U - vt(d), 0). Its normalized integral defines the exit CDF when total outward flux is positive. If vt increases with size, this classification preferentially passes fine classes; exit fine fractions can exceed the compartment bounds reported above. This is not an evaluated model: bulk DSD, local flow/holdup, turbulence and departures from dilute uniform conditions are unknown. A calculated compartment d32 alone supplies neither an exit d32 nor an exit CDF.

Given an applicable exit volume-flux CDF, dispersed-phase volume throughput Q_d,exit, and a size-dependent capture grade efficiency eta(d), residual volumetric carryover is

Q_carry = Q_d,exit integral [1 - eta(d)] dFv,exit(d).

For a uniform dispersed-phase density rho_d, mass load is rho_d Q_carry. A cutoff fraction alone is not a carryover load. A step-function efficiency would be an additional unvalidated assumption, not a result of this analysis. No capture efficiency, throughput, or equipment selection is inferred here.

## Reproduction and checks

Run \`node deliverables/kuhni-dsd-moment-analysis.mjs\` from the project root. Only this calculation's JSON and Markdown outputs are written; no external packages or services are used. Node built-ins only.

Composite Simpson quadrature (12,000 panels) integrates standard-normal coordinates over [-12,12]; omitted normal probability is below 2e-33. Exponentially weighted moment tail errors are larger but negligible for the listed widths and k <= 3. Assertions use a 1e-10 scaled tolerance and check normalization, reference normal CDF values, number moments 0 through 3, analytic and numeric d32, the inverse volume moment, truncated third-moment CDF agreement, the upper bounds, and both bimodal reconstructions. Output units and weighting definitions are explicit in the JSON. These numerical checks verify the mathematics, not the physical lognormal assumption.
`;
writeFileSync(fileURLToPath(new URL('./kuhni-dsd-moment-analysis.json', import.meta.url)),
  JSON.stringify(results, null, 2) + '\n');
writeFileSync(fileURLToPath(new URL('./kuhni-dsd-moment-analysis.md', import.meta.url)), report);
console.log(JSON.stringify({ bounds, lognormal: lognormal.map(r => ({
  geometric_sd: r.geometric_sd, fractions: r.fractions })), bimodals,
  assertions: results.assertions }, null, 2));