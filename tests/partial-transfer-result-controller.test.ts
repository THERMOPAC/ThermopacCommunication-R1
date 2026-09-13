import { describe, expect, it, vi } from "vitest";
import {
  isNewerPartialTransferResult,
  PartialTransferResultController,
  type PartialTransferControllerPhase,
} from "@/lib/partial-transfer-result-controller";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (cause: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Gateway Timeout",
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

async function settle() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

function callbacks() {
  const phases: PartialTransferControllerPhase[] = [];
  const results: Record<string, unknown>[] = [];
  const postErrors: string[] = [];
  const getErrors: string[] = [];
  return {
    phases,
    results,
    postErrors,
    getErrors,
    callbacks: {
      onPhase: (phase: PartialTransferControllerPhase) => phases.push(phase),
      onResult: (value: Record<string, unknown>) => results.push(value),
      onPostError: (message: string) => postErrors.push(message),
      onGetError: (message: string) => getErrors.push(message),
    },
  };
}

describe("partial-transfer saved-result controller", () => {
  it("reads an authoritative baseline before POST and does not POST after baseline failure", async () => {
    const calls: string[] = [];
    const baselineFailure = new PartialTransferResultController({
      fetcher: async (url) => {
        calls.push(url);
        return response({ message: "baseline database unavailable" }, 503);
      },
      isDesignCurrent: () => true,
    });
    await baselineFailure.evaluate(47);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/latest");
    expect(calls.some((url) => url.includes("/evaluate"))).toBe(false);

    const orderedCalls: string[] = [];
    const post = deferred<Response>();
    const observed = callbacks();
    const controller = new PartialTransferResultController({
      fetcher: async (url) => {
        orderedCalls.push(url);
        if (url.includes("/latest")) return response({ id: 3, createdAt: "2025-01-01T00:00:00Z", status: "MODEL_INVALID" });
        return post.promise;
      },
      callbacks: observed.callbacks,
      isDesignCurrent: () => true,
    });
    void controller.evaluate(47);
    await settle();
    expect(orderedCalls[0]).toContain("/latest");
    expect(orderedCalls.some((url) => url.includes("/evaluate"))).toBe(true);
    post.resolve(response({ status: "accepted-but-not-authoritative" }));
    await settle();
  });

  it("compares saved IDs, not status, and delayed older GET cannot overwrite a reconciled result", async () => {
    expect(isNewerPartialTransferResult({ id: 4, status: "INDETERMINATE" }, { id: 3, createdAt: null })).toBe(true);
    expect(isNewerPartialTransferResult({ id: 3, status: "INDETERMINATE" }, { id: 3, createdAt: null })).toBe(false);

    const manualRefresh = deferred<Response>();
    const poll = deferred<Response>();
    const post = deferred<Response>();
    let latestCalls = 0;
    const observed = callbacks();
    const controller = new PartialTransferResultController({
      fetcher: async (url) => {
        if (url.includes("/evaluate")) return post.promise;
        latestCalls += 1;
        if (latestCalls === 1) return response({ id: 3, createdAt: "2025-01-01T00:00:00Z", status: "MODEL_INVALID" });
        if (latestCalls === 2) return poll.promise;
        return manualRefresh.promise;
      },
      callbacks: observed.callbacks,
      isDesignCurrent: () => true,
    });
    void controller.evaluate(47);
    await settle();
    const refresh = controller.refresh(47);
    await settle();
    post.resolve(response({ status: "proxy-timeout" }, 504));
    await settle();
    poll.resolve(response({ id: 4, createdAt: "2025-01-01T00:00:01Z", status: "INDETERMINATE" }));
    await settle();
    manualRefresh.resolve(response({ id: 3, createdAt: "2025-01-01T00:00:00Z", status: "MODEL_INVALID" }));
    await refresh;
    await settle();
    expect(observed.results.map((item) => item.id)).toEqual([3, 4]);
    expect(observed.phases).toContain("completed");
  });

  it("ignores delayed responses after a design switch", async () => {
    let currentDesign = 47;
    const baseline = deferred<Response>();
    const post = deferred<Response>();
    const observed = callbacks();
    const controller = new PartialTransferResultController({
      fetcher: async (url) => {
        if (url.includes("/latest")) return baseline.promise;
        return post.promise;
      },
      callbacks: observed.callbacks,
      isDesignCurrent: (designId) => designId === currentDesign,
    });
    const run = controller.evaluate(47);
    currentDesign = 48;
    controller.stop();
    baseline.resolve(response({ id: 3, createdAt: "2025-01-01T00:00:00Z" }));
    post.resolve(response({ status: "late" }));
    await run;
    await settle();
    expect(observed.results).toHaveLength(0);
    expect(observed.phases).not.toContain("completed");
  });

  it("treats HTTP 409 as definitive blocked and stops polling", async () => {
    const timer = vi.fn();
    const observed = callbacks();
    const calls: string[] = [];
    const controller = new PartialTransferResultController({
      fetcher: async (url) => {
        calls.push(url);
        if (url.includes("/evaluate")) return response({ reason: "DEPENDENCY_BLOCKED" }, 409);
        return response({ id: 3, createdAt: "2025-01-01T00:00:00Z" });
      },
      callbacks: observed.callbacks,
      isDesignCurrent: () => true,
      timers: { setTimeout: timer, clearTimeout: vi.fn() },
    });
    await controller.evaluate(47);
    await settle();
    expect(observed.phases.at(-1)).toBe("blocked");
    expect(observed.postErrors[0]).toContain("DEPENDENCY_BLOCKED");
    expect(calls.filter((url) => url.includes("/latest")).length).toBeLessThanOrEqual(2);
    expect(timer).toHaveBeenCalledTimes(1);
  });

  it("labels non-JSON timeout as unknown and recovers a newer saved result", async () => {
    const observed = callbacks();
    const post = deferred<Response>();
    let latestCalls = 0;
    let pollTimer: (() => void) | null = null;
    const controller = new PartialTransferResultController({
      fetcher: async (url) => {
        if (url.includes("/evaluate")) return post.promise;
        latestCalls += 1;
        return latestCalls <= 2
          ? response({ id: 3, createdAt: "2025-01-01T00:00:00Z", status: "MODEL_INVALID" })
          : response({ id: 4, createdAt: "2025-01-01T00:00:01Z", status: "INDETERMINATE" });
      },
      callbacks: observed.callbacks,
      isDesignCurrent: () => true,
      timers: {
        setTimeout: (callback: () => void) => {
          pollTimer = callback;
          return 1 as ReturnType<typeof setTimeout>;
        },
        clearTimeout: vi.fn(),
      },
    });
    void controller.evaluate(47);
    await settle();
    post.resolve(response("<html>504</html>", 504));
    await settle();
    expect(observed.postErrors[0]).toContain("HTTP 504");
    expect(observed.phases).toContain("reconciling");
    expect(observed.phases.at(-1)).not.toBe("completed");
    pollTimer?.();
    await settle();
    expect(observed.phases.at(-1)).toBe("completed");
    expect(observed.results.at(-1)?.status).toBe("INDETERMINATE");
  });

  it("expires bounded reconciliation and manual refresh performs GET only", async () => {
    let now = 0;
    let timerCallback: (() => void) | null = null;
    const timer = {
      setTimeout: (callback: () => void) => {
        timerCallback = callback;
        return 1 as ReturnType<typeof setTimeout>;
      },
      clearTimeout: vi.fn(),
    };
    const post = deferred<Response>();
    const calls: string[] = [];
    const observed = callbacks();
    const controller = new PartialTransferResultController({
      fetcher: async (url) => {
        calls.push(url);
        if (url.includes("/evaluate")) return post.promise;
        return response({ id: 3, createdAt: "2025-01-01T00:00:00Z", status: "MODEL_INVALID" });
      },
      callbacks: observed.callbacks,
      isDesignCurrent: () => true,
      now: () => now,
      timers: timer,
      pollIntervalMs: 5,
      reconciliationTimeoutMs: 10,
    });
    void controller.evaluate(47);
    await settle();
    now = 11;
    timerCallback?.();
    await settle();
    expect(observed.phases.at(-1)).toBe("timed_out");
    const beforeRefresh = calls.length;
    await controller.refresh(47);
    expect(calls.length).toBe(beforeRefresh + 1);
    expect(calls.at(-1)).toContain("/latest");
    expect(calls.some((url) => url.includes("/evaluate"))).toBe(true);
    post.resolve(response({ status: "late" }));
  });

  it("manual refresh never invokes the evaluate POST", async () => {
    const calls: string[] = [];
    const controller = new PartialTransferResultController({
      fetcher: async (url) => {
        calls.push(url);
        return response({ id: 8, createdAt: "2025-01-01T00:00:00Z", status: "INDETERMINATE" });
      },
      isDesignCurrent: () => true,
    });
    await controller.refresh(47);
    expect(calls).toEqual(["/api/ecr-pre-pilot/designs/47/partial-transfer-physical-sizing/latest"]);
  });
});