export type RecordValue = Record<string, unknown>;

export type PartialTransferResultIdentity = {
  id: number | null;
  createdAt: number | null;
};

export type PartialTransferRead = {
  value: RecordValue | null;
  error: string | null;
  notFound: boolean;
};

export type PartialTransferControllerPhase =
  | "idle"
  | "baseline"
  | "running"
  | "reconciling"
  | "completed"
  | "blocked"
  | "timed_out";

export type PartialTransferRunStatus = PartialTransferControllerPhase;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type TimerApi = {
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
};

export type PartialTransferControllerCallbacks = {
  onPhase?: (phase: PartialTransferControllerPhase) => void;
  onResult?: (value: RecordValue, source: "baseline" | "refresh" | "reconciled") => void;
  onGetError?: (message: string, source: "baseline" | "refresh" | "poll") => void;
  onPostError?: (message: string) => void;
  onLoading?: (loading: boolean) => void;
};

export type PartialTransferControllerOptions = {
  fetcher?: Fetcher;
  callbacks?: PartialTransferControllerCallbacks;
  isDesignCurrent?: (designId: number) => boolean;
  now?: () => number;
  timers?: TimerApi;
  pollIntervalMs?: number;
  getTimeoutMs?: number;
  reconciliationTimeoutMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_GET_TIMEOUT_MS = 10_000;
const DEFAULT_RECONCILIATION_TIMEOUT_MS = 150_000;

function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function read(value: RecordValue, ...keys: string[]): unknown {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function responseErrorMessage(response: Response, payload: RecordValue, fallback: string): string {
  const detail = read(payload, "reason", "error", "message", "status");
  if (detail != null && String(detail).trim()) return String(detail);
  const status = Number(response.status);
  const statusText = String(response.statusText ?? "").trim();
  return Number.isFinite(status) && status > 0
    ? `${fallback} (HTTP ${status}${statusText ? ` ${statusText}` : ""}). The server may still have saved a child result; read-only reconciliation will continue.`
    : fallback;
}

function transportErrorMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === "object" && "name" in cause
    && String((cause as { name?: unknown }).name) === "AbortError") {
    return `${fallback} (request timed out or was cancelled). The server may still have saved a child result; read-only reconciliation will continue.`;
  }
  if (cause instanceof Error && cause.message.trim()) {
    return `${cause.message}. The server may still have saved a child result; read-only reconciliation will continue.`;
  }
  return `${fallback} The server may still have saved a child result; read-only reconciliation will continue.`;
}

async function responseObject(response: Response): Promise<RecordValue> {
  try {
    return object(await response.json());
  } catch {
    return {};
  }
}

export function partialTransferResultIdentity(value: unknown): PartialTransferResultIdentity {
  const record = object(value);
  const id = optionalNumber(read(record, "id", "resultId", "savedId"));
  const rawCreatedAt = read(record, "createdAt", "created_at", "savedAt", "completedAt");
  const createdAt = rawCreatedAt == null ? null : Date.parse(String(rawCreatedAt));
  return {
    id,
    createdAt: Number.isFinite(createdAt) ? createdAt : null,
  };
}

export function isNewerPartialTransferResult(
  value: unknown,
  baseline: PartialTransferResultIdentity | null,
): boolean {
  if (!Object.keys(object(value)).length) return false;
  if (!baseline || (baseline.id == null && baseline.createdAt == null)) return true;
  const candidate = partialTransferResultIdentity(value);
  if (candidate.id != null && baseline.id != null) return candidate.id > baseline.id;
  if (candidate.createdAt != null && baseline.createdAt != null) {
    return candidate.createdAt > baseline.createdAt;
  }
  if (candidate.id != null && baseline.id == null) return true;
  return candidate.createdAt != null && baseline.createdAt == null;
}

export async function readLatestPartialTransferResult(
  designId: number,
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<PartialTransferRead> {
  try {
    const response = await fetcher(
      `/api/ecr-pre-pilot/designs/${designId}/partial-transfer-physical-sizing/latest`,
      { credentials: "include", ...(signal ? { signal } : {}) },
    );
    const payload = await responseObject(response);
    if (response.status === 404) return { value: null, error: null, notFound: true };
    if (!response.ok) {
      return {
        value: null,
        error: responseErrorMessage(response, payload, "The latest separate estimate is unavailable."),
        notFound: false,
      };
    }
    const value = object(payload);
    return Object.keys(value).length
      ? { value, error: null, notFound: false }
      : { value: null, error: "The latest separate estimate returned no saved result.", notFound: false };
  } catch (cause: unknown) {
    return {
      value: null,
      error: transportErrorMessage(cause, "The latest separate estimate could not be loaded."),
      notFound: false,
    };
  }
}

export class PartialTransferResultController {
  private readonly fetcher: Fetcher;
  private readonly callbacks: PartialTransferControllerCallbacks;
  private readonly isDesignCurrent: (designId: number) => boolean;
  private readonly now: () => number;
  private readonly timers: TimerApi;
  private readonly pollIntervalMs: number;
  private readonly getTimeoutMs: number;
  private readonly reconciliationTimeoutMs: number;
  private generation = 0;
  private loadSequence = 0;
  private activeRun: { token: number; designId: number } | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollGetTimer: ReturnType<typeof setTimeout> | null = null;
  private pollAbort: AbortController | null = null;
  private stopped = false;

  constructor(options: PartialTransferControllerOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.callbacks = options.callbacks ?? {};
    this.isDesignCurrent = options.isDesignCurrent ?? (() => true);
    this.now = options.now ?? (() => Date.now());
    this.timers = options.timers ?? {
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (timer) => clearTimeout(timer),
    };
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.getTimeoutMs = options.getTimeoutMs ?? DEFAULT_GET_TIMEOUT_MS;
    this.reconciliationTimeoutMs = options.reconciliationTimeoutMs
      ?? DEFAULT_RECONCILIATION_TIMEOUT_MS;
  }

  private current(designId: number, token: number): boolean {
    return !this.stopped
      && this.activeRun?.token === token
      && this.activeRun.designId === designId
      && this.isDesignCurrent(designId);
  }

  private clearPoll() {
    if (this.pollTimer !== null) {
      this.timers.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.pollGetTimer !== null) {
      this.timers.clearTimeout(this.pollGetTimer);
      this.pollGetTimer = null;
    }
    this.pollAbort?.abort();
    this.pollAbort = null;
  }

  private finishRun(
    designId: number,
    token: number,
    phase: "completed" | "blocked" | "timed_out",
    value?: RecordValue,
  ): boolean {
    if (!this.current(designId, token)) return false;
    // Invalidate every earlier same-design GET before publishing the result.
    // This prevents a manual refresh that started earlier from overwriting it.
    this.loadSequence += 1;
    this.activeRun = null;
    this.clearPoll();
    if (value) this.callbacks.onResult?.(value, "reconciled");
    this.callbacks.onPhase?.(phase);
    this.callbacks.onLoading?.(false);
    return true;
  }

  async refresh(designId: number): Promise<PartialTransferRead> {
    this.stopped = false;
    const sequence = ++this.loadSequence;
    this.callbacks.onLoading?.(true);
    const result = await readLatestPartialTransferResult(designId, this.fetcher);
    if (sequence !== this.loadSequence || !this.isDesignCurrent(designId)) return result;
    if (result.value) {
      this.callbacks.onResult?.(result.value, "refresh");
    } else if (result.error) {
      this.callbacks.onGetError?.(result.error, "refresh");
    }
    this.callbacks.onLoading?.(false);
    return result;
  }

  async evaluate(designId: number): Promise<void> {
    this.stopped = false;
    if (!this.isDesignCurrent(designId) || this.activeRun) return;
    const token = ++this.generation;
    this.activeRun = { token, designId };
    // A baseline read supersedes every earlier same-design manual GET. The
    // result that authorizes the POST must be the latest successful read.
    const baselineSequence = ++this.loadSequence;
    this.callbacks.onPhase?.("baseline");
    this.callbacks.onLoading?.(true);
    const baselineRead = await readLatestPartialTransferResult(designId, this.fetcher);
    if (!this.current(designId, token) || baselineSequence !== this.loadSequence) return;
    this.callbacks.onLoading?.(false);
    if (baselineRead.error) {
      this.callbacks.onGetError?.(baselineRead.error, "baseline");
      this.finishRun(designId, token, "blocked");
      return;
    }
    const baseline = partialTransferResultIdentity(baselineRead.value);
    if (baselineRead.value) this.callbacks.onResult?.(baselineRead.value, "baseline");
    this.callbacks.onPhase?.("running");

    try {
      // The explicit POST is the only operation that can start a solver.
      const postRequest = this.fetcher(
        `/api/ecr-pre-pilot/designs/${designId}/partial-transfer-physical-sizing/evaluate`,
        { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      this.startPoll(designId, token, baseline);
      const response = await postRequest;
      const payload = await responseObject(response);
      if (response.status === 409) {
        if (!this.current(designId, token)) return;
        this.callbacks.onPostError?.(responseErrorMessage(response, payload, "The separate estimate was blocked by a definitive dependency result."));
        this.finishRun(designId, token, "blocked");
        return;
      }
      if (!response.ok) {
        if (!this.current(designId, token)) return;
        this.callbacks.onPostError?.(responseErrorMessage(response, payload, "The separate estimate could not be evaluated."));
        if (this.current(designId, token)) this.callbacks.onPhase?.("reconciling");
        return;
      }
      const latest = await readLatestPartialTransferResult(designId, this.fetcher);
      if (latest.value && isNewerPartialTransferResult(latest.value, baseline)) {
        this.finishRun(designId, token, "completed", latest.value);
      } else if (this.current(designId, token)) {
        this.callbacks.onPhase?.("reconciling");
      }
    } catch (cause: unknown) {
      if (this.current(designId, token)) {
        this.callbacks.onPostError?.(transportErrorMessage(cause, "The separate estimate could not be evaluated."));
        this.callbacks.onPhase?.("reconciling");
      }
    } finally {
      if (this.current(designId, token)) this.callbacks.onLoading?.(false);
    }
  }

  private startPoll(
    designId: number,
    token: number,
    baseline: PartialTransferResultIdentity,
  ) {
    this.clearPoll();
    const deadline = this.now() + this.reconciliationTimeoutMs;
    const poll = async () => {
      if (!this.current(designId, token)) return;
      const controller = new AbortController();
      this.pollAbort = controller;
      const getTimeout = this.timers.setTimeout(
        () => controller.abort(),
        this.getTimeoutMs,
      );
      this.pollGetTimer = getTimeout;
      const result = await readLatestPartialTransferResult(designId, this.fetcher, controller.signal);
      if (this.pollGetTimer === getTimeout) {
        this.timers.clearTimeout(getTimeout);
        this.pollGetTimer = null;
      }
      if (this.pollAbort === controller) this.pollAbort = null;
      if (!this.current(designId, token)) return;
      if (result.value && isNewerPartialTransferResult(result.value, baseline)) {
        this.finishRun(designId, token, "completed", result.value);
        return;
      }
      if (result.error) this.callbacks.onGetError?.(result.error, "poll");
      if (this.now() >= deadline) {
        this.callbacks.onPostError?.(result.error
          ?? "No newer saved result was observed before the reconciliation deadline.");
        this.finishRun(designId, token, "timed_out");
        return;
      }
      this.pollTimer = this.timers.setTimeout(() => void poll(), this.pollIntervalMs);
    };
    void poll();
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    this.loadSequence += 1;
    this.activeRun = null;
    this.clearPoll();
  }
}