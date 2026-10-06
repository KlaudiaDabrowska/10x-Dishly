import type { AccountingRpcClient } from "./import-state.ts";
import { SpendingControlError } from "./import-state.ts";
import type { SourceManifest } from "./manifest.ts";

export interface RecordedCandidate {
  candidateIndex: number;
  sourceStartPage: number;
  sourceStartItem: number;
  status: "complete" | "incomplete";
  digest: string;
}

export interface ValidationImportRecord {
  importId: string;
  status: string;
  fileFingerprint: string;
  manifestDigest: string;
  batchCount: number;
  manifest: SourceManifest;
  sourceFilename: string;
  createdAt: string;
  expiresAt: string;
  batches: { batchIndex: number; status: string }[];
  results: { batchIndex: number; invalidCount: number; candidates: RecordedCandidate[] }[];
  outcome: ImportOutcome | null;
}

export interface ImportOutcome {
  saved: number;
  alreadySaved: number;
  pending: number;
  savedIds: string[];
  existingIds: string[];
}

export interface TerminalOutcome extends ImportOutcome {
  status: string;
}

export interface FinalizedRecipe {
  batchIndex: number;
  candidateIndex: number;
  digest: string;
  sourceStartPage: number;
  sourceStartItem: number;
  pages: number[];
  title: string;
  category: string;
  sourceCategory: string | null;
  ingredientGroups: unknown;
  instructions: string[];
  servings: string | null;
  footnotes: string[];
}

const RPC_REJECTIONS: Record<string, string> = {
  "active import exists": "active-import-exists",
  "import not found": "import-not-found",
  "import id conflict": "import-id-conflict",
  "import is not processing": "import-not-processing",
  "payload digest mismatch": "payload-digest-mismatch",
  "recipe is not a recorded complete candidate": "payload-digest-mismatch",
  "batch results missing": "batch-results-missing",
  "batch is not reconciled": "batch-results-missing",
  "manifest mismatch": "manifest-mismatch",
  "invalid finalization": "invalid-request",
  "invalid batch result": "invalid-request",
  "invalid validation import": "invalid-request",
};

// Narrow, typed access to the backend-only finalization RPCs. Never constructed with user cookies.
export function createPersistence(client: AccountingRpcClient, authenticatedOwnerId: string | null | undefined) {
  const ownerId = authenticatedOwnerId?.trim();
  if (!ownerId) throw new SpendingControlError("authentication-required");

  async function call(name: string, parameters: Record<string, unknown>, code: string): Promise<unknown> {
    const { data, error } = await client.rpc(name, { p_owner_id: ownerId, ...parameters });
    if (error) {
      // Deterministic rejections raised by the RPCs map to client-facing codes; anything else stays generic.
      const known = RPC_REJECTIONS[error.message];
      if (known) throw new SpendingControlError(known, { cause: error });
      throw new SpendingControlError(code, { cause: error });
    }
    return data;
  }

  function outcome(data: unknown): TerminalOutcome {
    const row = (data as Record<string, unknown>[] | null)?.[0];
    if (!row) throw new SpendingControlError("outcome-missing");
    return {
      status: String(row.status),
      saved: Number(row.saved_count),
      alreadySaved: Number(row.existing_count),
      pending: Number(row.pending_count),
      savedIds: (row.saved_ids as string[] | null) ?? [],
      existingIds: (row.existing_ids as string[] | null) ?? [],
    };
  }

  return {
    ownerId,

    async createImport(input: {
      importId: string;
      fileFingerprint: string;
      manifestDigest: string;
      sourceFilename: string;
      manifest: SourceManifest;
      expiresAt: string;
    }): Promise<{ importId: string; status: string; expiresAt: string }> {
      const data = await call(
        "create_pdf_validation_import",
        {
          p_import_id: input.importId,
          p_file_fingerprint: input.fileFingerprint,
          p_manifest_digest: input.manifestDigest,
          p_source_filename: input.sourceFilename,
          p_manifest: input.manifest,
          p_expires_at: input.expiresAt,
        },
        "import-creation-failed",
      );
      const row = (data as Record<string, unknown>[] | null)?.[0];
      if (!row) throw new SpendingControlError("import-creation-failed");
      return { importId: String(row.import_id), status: String(row.status), expiresAt: String(row.expires_at) };
    },

    async getImport(importId: string): Promise<ValidationImportRecord | null> {
      const data = await call("get_pdf_validation_import", { p_import_id: importId }, "import-read-failed");
      const row = (data as Record<string, unknown>[] | null)?.[0];
      if (!row) return null;
      return {
        importId: String(row.import_id),
        status: String(row.status),
        fileFingerprint: String(row.file_fingerprint),
        manifestDigest: String(row.manifest_digest),
        batchCount: Number(row.batch_count),
        manifest: row.manifest as SourceManifest,
        sourceFilename: String(row.source_filename),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        batches: row.batches as ValidationImportRecord["batches"],
        results: row.results as ValidationImportRecord["results"],
        outcome: (row.outcome as ImportOutcome | null) ?? null,
      };
    },

    // Must succeed before any candidate content is returned to the browser.
    async recordBatchResult(input: {
      importId: string;
      batchIndex: number;
      schemaName: string;
      contractVersion: number;
      invalidCount: number;
      candidates: RecordedCandidate[];
    }): Promise<void> {
      const data = await call(
        "record_pdf_batch_result",
        {
          p_import_id: input.importId,
          p_batch_index: input.batchIndex,
          p_schema_name: input.schemaName,
          p_contract_version: input.contractVersion,
          p_invalid_count: input.invalidCount,
          p_candidates: input.candidates,
        },
        "batch-result-recording-failed",
      );
      if (data !== true) throw new SpendingControlError("batch-result-recording-failed");
    },

    async failImport(importId: string): Promise<string> {
      return String(await call("fail_pdf_validation_import", { p_import_id: importId }, "import-update-failed"));
    },

    async cancelImport(importId: string): Promise<TerminalOutcome> {
      return outcome(await call("cancel_pdf_validation_import", { p_import_id: importId }, "import-cancel-failed"));
    },

    async finalizeImport(input: {
      importId: string;
      manifestDigest: string;
      submitted: { batchIndex: number; candidateIndex: number; digest: string }[];
      recipes: FinalizedRecipe[];
    }): Promise<TerminalOutcome> {
      return outcome(
        await call(
          "finalize_pdf_validation_import",
          {
            p_import_id: input.importId,
            p_manifest_digest: input.manifestDigest,
            p_submitted: input.submitted,
            p_recipes: input.recipes,
          },
          "finalization-failed",
        ),
      );
    },
  };
}

export type Persistence = ReturnType<typeof createPersistence>;
