import { buildStage3GeometryReport, type Stage3GeometryReportInput } from "@shared/ecr-stage3-geometry-report";

export function Stage3GeometryBasisReport({ run }: { run?: Stage3GeometryReportInput | null }) {
  const report = buildStage3GeometryReport(run ?? {});
  return (
    <section aria-label="Stage 3 geometry basis and correlation applicability" className="mt-3 rounded-md border border-amber-200 bg-white p-3 text-xs text-slate-700">
      <h4 className="font-semibold text-slate-950">Geometry basis and correlation applicability</h4>
      <p className="mt-1 leading-5">
        Reporting only. These source comparisons do not change numerical results, selected diameter,
        optimizer ranking, acceptance, or the Stage-4 handoff. They do not establish governing design validity.
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <h5 className="font-semibold">1. Design/search envelope — Perry / Pratt–Stevens</h5>
          <p className="mt-1 leading-5">
            Perry, 8th edition, p. 15-83 attributes the recommended Kühni scale-up factors to
            Pratt and Stevens, Science and Practice of Liquid-Liquid Extraction, vol. 1, Ch. 8,
            p. 541. These recommendations define the current search envelope, not correlation
            validity limits. Discrete search choices are project numerical choices.
          </p>
        </div>
        <div>
          <h5 className="font-semibold">2. Correlation applicability/extrapolation — K&amp;H / Garthe</h5>
          <p className="mt-1 leading-5">
            K&amp;H 1995 Table 1 (p. 3927) gives pooled marginal experimental ranges.
            Being within one range does not establish interpolation for the combined geometry,
            fluid system, phase orientation or operating conditions. Existing hydraulic status and
            acceptance remain separate from this geometry comparison.
          </p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
          <caption className="sr-only">Saved geometry compared with design recommendations and experimental geometry evidence</caption>
          <thead className="bg-slate-50">
            <tr>{["Parameter", "Design envelope", "Saved search choices", "Selected", "K&H experimental range", "Selected-value assessment"].map(label => <th key={label} scope="col" className="border border-slate-200 p-2 align-top font-semibold">{label}</th>)}</tr>
          </thead>
          <tbody>
            {report.rows.map(row => (
              <tr key={row.key}>
                <th scope="row" className="border border-slate-200 p-2 align-top font-medium">{row.label}</th>
                <td className="border border-slate-200 p-2 align-top">{row.designEnvelope}</td>
                <td className="border border-slate-200 p-2 align-top">{row.savedSearchChoices}</td>
                <td className="border border-slate-200 p-2 align-top font-mono">{row.selected ?? "Unavailable"}</td>
                <td className="border border-slate-200 p-2 align-top">{row.experimentalEnvelope}</td>
                <td className="border border-slate-200 p-2 align-top">{row.applicability}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-4 leading-5">
        {report.rows.map(row => <li key={row.key}>{row.coverage}</li>)}
        <li>
          Garthe Eq. 5.6 / Fig. 5.20 (pp. 86–87) does not provide complete paired geometry
          coverage for the fitted data. The full current search envelope cannot be certified
          as interpolation for that correlation. Ring and perforated stators are not proven
          equivalent at equal free area.
        </li>
      </ul>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <h5 className="font-semibold">3. Physical construction reference — Garthe / Weber–Jupke</h5>
        <p className="mt-1 leading-5">
          Garthe Table A.1 (p. 177) and Weber–Jupke 2020, §2.1 / Figs. 1–2 describe an
          80 mm column, 45 mm six-blade stepped rotor, 50 mm compartment pitch and ring
          stators: hc/D = 0.625, DR/D = 0.5625, nominal φs = 0.40.
          This is apparatus-specific construction evidence, not new defaults or a general
          scaling law. Sulzer's public ECR evidence supports adjustable geometry but gives
          no numerical bounds for these ratios.
        </p>
      </div>
      <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 leading-5">
        <strong>Free-area mapping remains unresolved.</strong>{" "}
        Gross opening / gross column area is the leading interpretation for the reference
        ring stator, not a verified mapping for both correlations. The 80/50/10 mm
        column/opening/shaft dimensions give gross fraction 0.390625 versus shaft-blocked
        fraction 0.375; nominal φs = 0.40 does not uniquely resolve the convention.
        The K&amp;H area-formula parenthetical is RDC-specific. No shaft correction is applied
        here and the Stage-5 shaft-blocked opening formula is unchanged.
      </div>
      <p className="mt-2 leading-5">
        Sources:{" "}
        <a className="underline" href="https://doi.org/10.1021/ie00038a032" target="_blank" rel="noreferrer">K&amp;H 1995</a>
        {" · "}<a className="underline" href="https://mediatum.ub.tum.de/601973" target="_blank" rel="noreferrer">Garthe dissertation</a>
        {" · "}<a className="underline" href="https://doi.org/10.1002/aic.16286" target="_blank" rel="noreferrer">Weber–Jupke 2020</a>
        {" · "}<a className="underline" href="https://www.sulzer.com/en/shared/products/kuehni-agitated-columns-ecr" target="_blank" rel="noreferrer">Sulzer ECR</a>.
      </p>
    </section>
  );
}