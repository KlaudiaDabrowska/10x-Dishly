import type { PricingSnapshot, UsageCounts } from "./budget.ts";
import { assertMaximumCost, calculateCostNanoUsd } from "./budget.ts";

interface RpcResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface AccountingRpcClient {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<RpcResult<unknown>>;
}

export interface BatchReservation {
  importId: string;
  batchIndex: number;
  fileFingerprint: string;
  manifestDigest: string;
  inputDigest: string;
  corePageStart: number;
  corePageEnd: number;
  maximumCostNanoUsd: number;
  pricing: PricingSnapshot;
  expiresAt: string;
}

export interface DispatchClaim {
  claimed: boolean;
  import_id: string;
  batch_index: number;
  attempt_id: string;
  reservation_id: string;
  status: string;
}

export interface UsageReport extends UsageCounts {
  reportId: string;
  reservationId: string;
  outputDigest: string;
}

export class SpendingControlError extends Error {
  readonly code: string;
  constructor(code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = "SpendingControlError";
    this.code = code;
  }
}

function assertIdentity(value: string, name: string): string {
  if (!value.trim()) throw new SpendingControlError(`invalid-${name}`);
  return value;
}

export function createImportState(client: AccountingRpcClient, authenticatedOwnerId: string | null | undefined) {
  const ownerId = authenticatedOwnerId?.trim();
  if (!ownerId) throw new SpendingControlError("authentication-required");

  return {
    async reserveAndClaim(reservation: BatchReservation): Promise<DispatchClaim> {
      const maximumCostNanoUsd = assertMaximumCost(reservation.maximumCostNanoUsd);
      const { data: rawData, error } = await client.rpc("reserve_pdf_batch", {
        p_owner_id: ownerId,
        p_import_id: assertIdentity(reservation.importId, "import-id"),
        p_batch_index: reservation.batchIndex,
        p_file_fingerprint: assertIdentity(reservation.fileFingerprint, "file-fingerprint"),
        p_manifest_digest: assertIdentity(reservation.manifestDigest, "manifest-digest"),
        p_input_digest: assertIdentity(reservation.inputDigest, "input-digest"),
        p_core_page_start: reservation.corePageStart,
        p_core_page_end: reservation.corePageEnd,
        p_maximum_cost_nano_usd: maximumCostNanoUsd,
        p_pricing_snapshot: reservation.pricing,
        p_expires_at: reservation.expiresAt,
      });
      if (error) throw new SpendingControlError("reservation-failed", { cause: error });
      const data = rawData as DispatchClaim[] | null;
      const claim = data?.[0];
      if (!claim) throw new SpendingControlError("reservation-failed");
      return claim;
    },

    async reconcile(report: UsageReport, pricing: PricingSnapshot): Promise<boolean> {
      const actualCostNanoUsd = calculateCostNanoUsd(report, pricing);
      const { data, error } = await client.rpc("reconcile_pdf_usage", {
        p_owner_id: ownerId,
        p_reservation_id: assertIdentity(report.reservationId, "reservation-id"),
        p_usage_report_id: assertIdentity(report.reportId, "usage-report-id"),
        p_actual_cost_nano_usd: actualCostNanoUsd,
        p_input_tokens: report.inputTokens,
        p_output_tokens: report.outputTokens,
        p_output_digest: assertIdentity(report.outputDigest, "output-digest"),
      });
      if (error) throw new SpendingControlError("reconciliation-failed", { cause: error });
      return data === true;
    },

    // HTTP 429 is an unbilled rejection: only a dispatch-claimed reservation is reconciled at zero.
    async reconcileRateLimited(reservationId: string, reportId: string): Promise<boolean> {
      const { data, error } = await client.rpc("reconcile_pdf_rate_limited", {
        p_owner_id: ownerId,
        p_reservation_id: assertIdentity(reservationId, "reservation-id"),
        p_usage_report_id: assertIdentity(reportId, "usage-report-id"),
      });
      if (error) throw new SpendingControlError("reconciliation-failed", { cause: error });
      return data === true;
    },
  };
}

export async function dispatchWithSpendingControl<T>(options: {
  state: ReturnType<typeof createImportState>;
  reservation: BatchReservation;
  dispatch: (claim: DispatchClaim) => Promise<{ value: T; usage: UsageCounts; outputDigest: string; reportId: string }>;
}): Promise<{ claim: DispatchClaim; value?: T; duplicate: boolean }> {
  const claim = await options.state.reserveAndClaim(options.reservation);
  if (!claim.claimed) return { claim, duplicate: true };

  // The reservation RPC has committed before this external operation starts. Any error after
  // the claim is intentionally fail-closed: its held capacity is not released automatically.
  const response = await options.dispatch(claim);
  await options.state.reconcile(
    {
      reportId: response.reportId,
      reservationId: claim.reservation_id,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      outputDigest: response.outputDigest,
    },
    options.reservation.pricing,
  );
  return { claim, value: response.value, duplicate: false };
}
