import type { ImportChannel } from "./pdf-processing/persistence.ts";

export interface PdfFailureEvent {
  event: "pdf_import_error";
  channel: ImportChannel;
  route: string;
  status: number;
  code: string;
  db_code: string | null;
}

const PUBLIC_PDF_ERROR_CODES = new Set([
  "active-import-exists",
  "authentication-required",
  "batch-already-dispatched",
  "batch-already-processed",
  "batch-result-recording-failed",
  "batch-results-missing",
  "batch-too-large",
  "decision-conflict",
  "decision-payload-mismatch",
  "decision-resolution-failed",
  "encrypted-document",
  "file-size-changed",
  "finalization-failed",
  "import-budget-insufficient",
  "import-cancel-failed",
  "import-creation-failed",
  "import-id-conflict",
  "import-not-found",
  "import-not-processing",
  "import-read-failed",
  "import-update-failed",
  "input-token-accounting-mismatch",
  "input-token-count-incompatible",
  "input-token-count-unavailable",
  "input-token-limit-exceeded",
  "internal-error",
  "invalid-document",
  "invalid-json",
  "invalid-layout",
  "invalid-page-sequence",
  "invalid-processing-start",
  "invalid-request",
  "manifest-mismatch",
  "outcome-missing",
  "output-token-accounting-mismatch",
  "output-token-limit-exceeded",
  "payload-digest-mismatch",
  "pricing-model-incompatible",
  "processing-timeout",
  "provider-blocked",
  "provider-configuration-error",
  "provider-http-error",
  "provider-incomplete-response",
  "provider-invalid-structured-output",
  "provider-malformed-json",
  "provider-malformed-response",
  "provider-missing-candidates",
  "provider-missing-output",
  "provider-missing-usage",
  "provider-rate-limited",
  "provider-refused",
  "provider-response-too-large",
  "provider-server-error",
  "provider-timeout",
  "provider-transport-error",
  "reader-timeout",
  "reconciliation-failed",
  "request-too-large",
  "reservation-failed",
  "text-too-large",
  "too-many-batches",
  "unreadable-document",
  "worker-origin",
]);

export function sanitizePdfErrorCode(value: unknown): string {
  return typeof value === "string" && PUBLIC_PDF_ERROR_CODES.has(value) ? value : "internal-error";
}

export function pdfFailureEvent(
  error: unknown,
  status: number,
  route: string,
  channel: ImportChannel,
  code: string,
): PdfFailureEvent {
  const cause = error instanceof Error ? error.cause : undefined;
  const dbCode = (cause as { code?: unknown } | undefined)?.code;
  return {
    event: "pdf_import_error",
    channel,
    route,
    status,
    code,
    db_code: typeof dbCode === "string" && /^[0-9A-Z]{5}$/.test(dbCode) ? dbCode : null,
  };
}
