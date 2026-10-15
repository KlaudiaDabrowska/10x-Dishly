import type { ImportChannel } from "./pdf-processing/persistence.ts";
import { PdfRequestError } from "./pdf-processing/manifest.ts";

export interface PdfImportConfig {
  deploymentEnv?: string;
  openAiApiKey?: string;
  productEnabled?: string;
  validationEnabled?: string;
  supabaseUrl?: string;
  supabaseSecretKey?: string;
}

export type ImportOperation = "create" | "batch" | "finalize" | "status" | "cancel" | "resolve";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isImportResourceId(value: string | undefined): boolean {
  return value === undefined || UUID.test(value);
}

export function importMutationIsSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return origin === url.origin && (site === null || site === "same-origin");
}

export async function readBoundedImportJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes))
    throw new PdfRequestError("request-too-large");
  if (!request.body) throw new PdfRequestError("invalid-request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PdfRequestError("request-too-large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new PdfRequestError("invalid-json");
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  "import-not-found": 404,
  "active-import-exists": 409,
  "import-id-conflict": 409,
  "import-not-processing": 409,
  "batch-already-processed": 409,
  "batch-already-dispatched": 409,
  "batch-results-missing": 409,
  "manifest-mismatch": 409,
  "payload-digest-mismatch": 409,
  "decision-conflict": 409,
  "decision-payload-mismatch": 409,
  "import-budget-insufficient": 409,
  "reservation-failed": 409,
  "invalid-request": 400,
};

export function importErrorHttpStatus(code: string): number {
  return STATUS_BY_CODE[code] ?? 500;
}

export function importDatabaseAvailable(config: PdfImportConfig): boolean {
  return config.deploymentEnv !== "preview" && Boolean(config.supabaseUrl && config.supabaseSecretKey);
}

export function importInfrastructureAvailable(config: PdfImportConfig): boolean {
  return importDatabaseAvailable(config) && Boolean(config.openAiApiKey?.trim());
}

export function importCreationAvailable(config: PdfImportConfig, channel: ImportChannel): boolean {
  if (!importInfrastructureAvailable(config)) return false;
  return channel === "product" ? config.productEnabled === "true" : config.validationEnabled === "true";
}

export function importOperationAvailable(
  config: PdfImportConfig,
  channel: ImportChannel,
  operation: ImportOperation,
): boolean {
  if (operation === "create") return importCreationAvailable(config, channel);
  if (operation === "batch") return importInfrastructureAvailable(config);
  return importDatabaseAvailable(config);
}

export function importUserAuthorized(
  channel: ImportChannel,
  userId: string | undefined,
  evaluationIds: ReadonlySet<string>,
): boolean {
  if (!userId) return false;
  return channel === "product" || evaluationIds.has(userId.toLowerCase());
}
