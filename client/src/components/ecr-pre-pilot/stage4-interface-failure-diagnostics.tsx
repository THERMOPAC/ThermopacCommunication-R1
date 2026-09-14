type RecordValue = Record<string, unknown>;

export type Stage4InterfaceFailureCase = {
  key: string;
  label: string;
  coefficient: string;
  trial: unknown;
};

type Props = {
  cases: Stage4InterfaceFailureCase[];
};

const COMPONENT_ORDER = ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"];

const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : {};

const list = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.map(record) : [];

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const valueText = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "NOT EVALUATED";
  if (finiteNumber(value)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 12 });
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const prettyJson = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === undefined ? "NOT EVALUATED" : serialized;
  } catch {
    return "UNSERIALIZABLE RESPONSE EVIDENCE";
  }
};

function measuredStatus(
  actual: unknown,
  threshold: unknown,
  direction: "lte" | "gte" = "lte",
): string {
  if (!finiteNumber(actual) || !finiteNumber(threshold)) return "NOT EVALUATED";
  return direction === "lte"
    ? actual <= threshold ? "PASS" : "FAIL"
    : actual >= threshold ? "PASS" : "FAIL";
}

function booleanStatus(value: unknown): string {
  return value === true ? "PASS" : value === false ? "FAIL" : "NOT EVALUATED";
}

function JsonDetails({
  label,
  value,
  testId,
}: {
  label: string;
  value: unknown;
  testId: string;
}) {
  return (
    <details className="mt-2" data-testid={testId}>
      <summary className="cursor-pointer font-semibold">{label}</summary>
      <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-[9px] leading-4 text-slate-100">
        {prettyJson(value)}
      </pre>
    </details>
  );
}

function Check({
  label,
  actual,
  threshold,
  direction,
  status,
}: {
  label: string;
  actual: unknown;
  threshold?: unknown;
  direction?: "lte" | "gte";
  status?: string;
}) {
  const measured = status ?? measuredStatus(actual, threshold, direction);
  return (
    <>
      <td className="p-1">{label}</td>
      <td className="p-1 font-mono">{valueText(actual)}</td>
      <td className="p-1 font-mono">
        {threshold === undefined ? "NOT EVALUATED" : valueText(threshold)}
      </td>
      <td className="p-1 font-semibold">{measured}</td>
    </>
  );
}

function InputVector({
  label,
  value,
  componentOrder,
}: {
  label: string;
  value: unknown;
  componentOrder: string[];
}) {
  const vector = Array.isArray(value) ? value : [];
  if (!vector.length) return null;
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2">
      <p className="font-semibold">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
        {componentOrder.map((component, index) => (
          <div key={`${label}-${component}`} className="rounded bg-white p-1">
            <span className="text-slate-500">{component}</span>
            <span className="ml-1 font-mono">{valueText(vector[index])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestInputs({
  request,
  testId,
}: {
  request: RecordValue;
  testId: string;
}) {
  const requestOrder = Array.isArray(request.componentOrder)
    && request.componentOrder.every(value => typeof value === "string")
    ? request.componentOrder as string[]
    : COMPONENT_ORDER;
  const vectorKeys = new Set([
    "componentOrder",
    "x_bulk_continuous",
    "x_bulk_dispersed",
    "kc",
    "kd",
  ]);
  const scalarEntries = Object.entries(request).filter(([key, value]) =>
    !vectorKeys.has(key) && !Array.isArray(value) && typeof value !== "object");
  return (
    <div data-testid={testId} className="mt-2 space-y-2">
      <p>
        Component order (preserved): {requestOrder.join(" → ")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {scalarEntries.map(([key, value]) => (
          <div key={key} className="rounded border border-slate-200 bg-slate-50 p-2">
            <dt className="text-slate-500">{key}</dt>
            <dd className="mt-1 font-mono">{valueText(value)}</dd>
          </div>
        ))}
      </div>
      <InputVector
        label="x_bulk_continuous"
        value={request.x_bulk_continuous}
        componentOrder={requestOrder}
      />
      <InputVector
        label="x_bulk_dispersed"
        value={request.x_bulk_dispersed}
        componentOrder={requestOrder}
      />
      <InputVector label="kc" value={request.kc} componentOrder={requestOrder} />
      <InputVector label="kd" value={request.kd} componentOrder={requestOrder} />
      <JsonDetails
        label="Full exact Job B scientific request JSON"
        value={request}
        testId={`${testId}-json`}
      />
    </div>
  );
}

function StartChecks({
  response,
}: {
  response: RecordValue;
}) {
  const thresholds = record(response.acceptanceThresholds);
  const diagnostics = list(response.startDiagnostics);
  const assessments = list(response.endpointAssessments);
  const assessmentsByStart = new Map(
    assessments.map(assessment => [String(assessment.startClass ?? ""), assessment]),
  );

  if (!diagnostics.length && !assessments.length) {
    return (
      <p className="mt-2 text-amber-900">
        Per-start interface checks: NOT EVALUATED — no start diagnostics were returned.
      </p>
    );
  }

  const starts = diagnostics.length
    ? diagnostics
    : assessments.map(assessment => ({ startClass: assessment.startClass }));
  return (
    <div className="mt-2 overflow-x-auto">
      <table
        data-testid="stage4-interface-start-diagnostics"
        className="w-full min-w-[780px] border-collapse text-left text-[10px]"
      >
        <caption className="mb-1 text-left text-slate-700">
          Per-start measured checks from the immutable Job B response. Thresholds
          are never supplied by this UI.
        </caption>
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="p-1 font-semibold">Start</th>
            <th className="p-1 font-semibold">Check</th>
            <th className="p-1 font-semibold">Measured</th>
            <th className="p-1 font-semibold">Response threshold</th>
            <th className="p-1 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {starts.map((diagnostic, index) => {
            const start = String(diagnostic.startClass ?? `START_${index + 1}`);
            const assessment = assessmentsByStart.get(start) ?? {};
            const stability = record(assessment.localStability);
            const postTpd = record(assessment.postInterfaceTpd);
            const hasStabilityEvidence = Object.keys(stability).length > 0
              || Object.keys(postTpd).length > 0;
            const stabilityCurvatures = Object.values(stability)
              .map(phase => record(phase).minimumEigenvalue)
              .filter(finiteNumber);
            const postTpdMinimums = Object.values(postTpd)
              .map(phase => record(phase).minimum)
              .filter(finiteNumber);
            const checks: Array<{
              label: string;
              actual: unknown;
              threshold?: unknown;
              direction?: "lte" | "gte";
              status?: string;
            }> = [
              {
                label: "Optimizer success",
                actual: diagnostic.optimizerSuccess,
                status: booleanStatus(diagnostic.optimizerSuccess),
              },
              {
                label: "Numerical Jacobian rank",
                actual: diagnostic.numericalJacobianRank,
                threshold: thresholds.requiredNumericalJacobianRank,
                direction: "gte",
              },
              {
                label: "Maximum isoactivity log residual",
                actual: diagnostic.maximumIsoactivityLogResidual,
                threshold: thresholds.maximumIsoactivityLogResidual,
              },
              {
                label: "Maximum scaled flux equality residual",
                actual: diagnostic.maximumScaledFluxEqualityResidual,
                threshold: thresholds.maximumScaledFluxEqualityResidual,
              },
              {
                label: "Maximum absolute flux equality residual",
                actual: diagnostic.maximumFluxEqualityResidualMolM2S,
                threshold: thresholds.absoluteFluxToleranceMolM2S,
              },
              {
                label: "Interface composition separation",
                actual: diagnostic.maximumInterfaceCompositionSeparation,
                threshold: thresholds.minimumInterfaceCompositionSeparation,
                direction: "gte",
              },
              {
                label: "Numerical endpoint assessment",
                actual: assessment.numericalAccepted,
                status: booleanStatus(assessment.numericalAccepted),
              },
              {
                label: "Phase-separation endpoint assessment",
                actual: assessment.phaseSeparationAccepted,
                status: booleanStatus(assessment.phaseSeparationAccepted),
              },
              {
                label: "Phase-orientation endpoint assessment",
                actual: assessment.phaseOrientationAccepted,
                status: booleanStatus(assessment.phaseOrientationAccepted),
              },
              {
                label: "Endpoint local stability",
                actual: hasStabilityEvidence
                  ? assessment.endpointStabilityAccepted
                  : undefined,
                status: hasStabilityEvidence
                  ? booleanStatus(assessment.endpointStabilityAccepted)
                  : "NOT EVALUATED",
              },
              {
                label: "Minimum local stability curvature",
                actual: stabilityCurvatures.length ? Math.min(...stabilityCurvatures) : undefined,
                threshold: thresholds.minimumLocalStabilityCurvature,
                direction: "gte",
              },
              {
                label: "Post-interface TPD minimum",
                actual: postTpdMinimums.length ? Math.min(...postTpdMinimums) : undefined,
                threshold: thresholds.postInterfaceTpdThreshold,
                direction: "gte",
              },
            ];
            return checks.map((check, checkIndex) => (
              <tr key={`${start}-${check.label}`} className="border-b border-slate-100 align-top">
                {checkIndex === 0 && (
                  <td rowSpan={checks.length} className="p-1 font-semibold">
                    {start}
                  </td>
                )}
                <Check {...check} />
              </tr>
            ));
          })}
        </tbody>
      </table>
      <p className="mt-2 text-slate-600">
        A missing stability or post-interface TPD record is shown as NOT
        EVALUATED; it is never treated as PASS.
      </p>
    </div>
  );
}

function Thresholds({ response }: { response: RecordValue }) {
  const thresholds = record(response.acceptanceThresholds);
  const entries = Object.entries(thresholds);
  return (
    <div className="mt-2">
      <h5 className="font-semibold">Acceptance thresholds returned by Job B</h5>
      {entries.length ? (
        <dl className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded border border-slate-200 bg-slate-50 p-1">
              <dt className="text-slate-500">{key}</dt>
              <dd className="font-mono">{valueText(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1">NOT EVALUATED — response contained no acceptance thresholds.</p>
      )}
    </div>
  );
}

function BoundaryComposition({
  response,
  componentOrder,
}: {
  response: RecordValue;
  componentOrder: string[];
}) {
  const boundary = record(response.bulkBoundary);
  const continuous = boundary.continuousMoleFractions;
  const dispersed = boundary.dispersedMoleFractions;
  if (!Array.isArray(continuous) && !Array.isArray(dispersed)) return null;
  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
      <h5 className="font-semibold">Bulk boundary used by Job B (response evidence)</h5>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <InputVector
          label="continuousMoleFractions"
          value={continuous}
          componentOrder={componentOrder}
        />
        <InputVector
          label="dispersedMoleFractions"
          value={dispersed}
          componentOrder={componentOrder}
        />
      </div>
    </div>
  );
}

function FailureEvidence({
  item,
  mesh,
  evidence,
}: {
  item: Stage4InterfaceFailureCase;
  mesh: string;
  evidence: RecordValue;
}) {
  const request = record(evidence.request);
  const response = record(evidence.response);
  const componentOrder = Array.isArray(request.componentOrder)
    && request.componentOrder.every(value => typeof value === "string")
    ? request.componentOrder as string[]
    : COMPONENT_ORDER;
  const baseId = `stage4-interface-failure-${item.key}-${mesh}`;
  return (
    <details
      data-testid={baseId}
      className="rounded border border-rose-300 bg-rose-50/50 p-2"
    >
      <summary className="cursor-pointer font-semibold">
        {item.label} · c={item.coefficient} · {mesh} mesh — interface failure evidence
      </summary>
      <div className="mt-2 space-y-2">
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Request hash", evidence.requestHash],
            ["Iteration", evidence.iteration],
            ["Cell index", evidence.cellIndex],
            ["Job B response status", response.status],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border border-rose-200 bg-white p-2">
              <dt className="text-slate-600">{label}</dt>
              <dd className="mt-1 break-all font-mono">{valueText(value)}</dd>
            </div>
          ))}
        </dl>

        <details className="rounded border border-slate-200 bg-white p-2">
          <summary className="cursor-pointer font-semibold">
            Exact Job B scientific request inputs
          </summary>
          <RequestInputs request={request} testId={`${baseId}-request`} />
        </details>

        <section className="rounded border border-slate-200 bg-white p-2">
          <h4 className="font-semibold">Measured interface checks</h4>
          <StartChecks response={response} />
          <Thresholds response={response} />
          <BoundaryComposition response={response} componentOrder={componentOrder} />
        </section>

        <JsonDetails
          label="Full immutable Job B response JSON"
          value={response}
          testId={`${baseId}-response`}
        />
        <JsonDetails
          label="Full interface-failure evidence JSON"
          value={evidence}
          testId={`${baseId}-full`}
        />
      </div>
    </details>
  );
}

function failureEvidence(
  trial: RecordValue,
  mesh: "coarse" | "refined",
): RecordValue {
  const candidate = trial[mesh];
  const meshTrial = record(candidate);
  return record(meshTrial.interfaceFailure);
}

export default function Stage4InterfaceFailureDiagnostics({ cases }: Props) {
  const evidenceRows: Array<{
    item: Stage4InterfaceFailureCase;
    mesh: "coarse" | "refined";
    evidence: RecordValue;
  }> = [];

  cases.forEach(item => {
    const trial = record(item.trial);
    (["coarse", "refined"] as const).forEach(mesh => {
      const evidence = failureEvidence(trial, mesh);
      if (Object.keys(evidence).length > 0) {
        evidenceRows.push({ item, mesh, evidence });
      }
    });
  });

  if (!evidenceRows.length) return null;

  return (
    <section
      data-testid="stage4-interface-failure-diagnostics"
      className="rounded border-2 border-rose-300 bg-rose-50/30 p-3 text-[10px]"
    >
      <h3 className="text-xs font-semibold text-rose-950">
        Job B interface failure diagnostics
      </h3>
      <p className="mt-1 text-rose-950">
        The last conserved physical trial was blocked at a finite-volume cell.
        These are exact backend inputs and immutable Job B responses, not a
        browser reconstruction or an inferred pass.
      </p>
      <div className="mt-2 space-y-2">
        {evidenceRows.map(({ item, mesh, evidence }) => (
          <FailureEvidence
            key={`${item.key}-${mesh}`}
            item={item}
            mesh={mesh}
            evidence={evidence}
          />
        ))}
      </div>
    </section>
  );
}