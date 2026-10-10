import type { ImportChannel } from "./pdf-processing/persistence.ts";

export interface PdfImportConfig {
  deploymentEnv?: string;
  openAiApiKey?: string;
  productEnabled?: string;
  validationEnabled?: string;
  supabaseUrl?: string;
  supabaseSecretKey?: string;
}

export function importInfrastructureAvailable(config: PdfImportConfig): boolean {
  return (
    config.deploymentEnv !== "preview" &&
    Boolean(config.openAiApiKey?.trim() && config.supabaseUrl && config.supabaseSecretKey)
  );
}

export function importCreationAvailable(config: PdfImportConfig, channel: ImportChannel): boolean {
  if (!importInfrastructureAvailable(config)) return false;
  return channel === "product" ? config.productEnabled === "true" : config.validationEnabled === "true";
}

export function importUserAuthorized(
  channel: ImportChannel,
  userId: string | undefined,
  evaluationIds: ReadonlySet<string>,
): boolean {
  if (!userId) return false;
  return channel === "product" || evaluationIds.has(userId.toLowerCase());
}
