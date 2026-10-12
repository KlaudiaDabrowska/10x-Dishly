import type { ImportChannel } from "./pdf-processing/persistence.ts";

export interface PdfImportConfig {
  deploymentEnv?: string;
  openAiApiKey?: string;
  productEnabled?: string;
  validationEnabled?: string;
  supabaseUrl?: string;
  supabaseSecretKey?: string;
}

export type ImportOperation = "create" | "batch" | "finalize" | "status" | "cancel";

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
