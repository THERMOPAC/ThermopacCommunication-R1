/**
 * Local preliminary BVP values are shown as performance results only after
 * both numerical acceptance and the authoritative transfer-status check.
 * Unaccepted BVP arrays remain solver diagnostics, never calculated output.
 */
export function canDisplayECR2PreliminaryTransferPerformance(
  bvp: { status?: unknown; massBalanceStatus?: unknown } | null | undefined,
  transferStatus: { status?: unknown } | null | undefined,
): boolean {
  return bvp?.status === "converged" &&
    bvp.massBalanceStatus === "passed" &&
    transferStatus?.status === "LOCAL_PRELIMINARY_CALCULATED";
}