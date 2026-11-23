import { OpenAiPdfError } from "./openai.ts";

export function inputTokenAccountingDiagnostic(error: unknown) {
  if (
    !(error instanceof OpenAiPdfError) ||
    error.code !== "input-token-accounting-mismatch" ||
    error.evidence === undefined
  )
    return null;
  return {
    publicBody: { error: "input-token-accounting-mismatch" as const, diagnosticId: error.evidence.diagnosticId },
    privateEvent: { event: "pdf_input_token_accounting_mismatch" as const, ...error.evidence },
  };
}

export function sanitizedPdfErrorBody(error: unknown, code: string) {
  return inputTokenAccountingDiagnostic(error)?.publicBody ?? { error: code };
}
