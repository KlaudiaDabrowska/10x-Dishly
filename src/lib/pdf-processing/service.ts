import { PDF_RECIPE_CONTRACT_VERSION } from "./contracts.ts";
import type { RecipeCandidate } from "./contracts.ts";
import type { AccountingRpcClient } from "./import-state.ts";
import { SpendingControlError, createImportState } from "./import-state.ts";
import { PDF_LIMITS } from "./limits.ts";
import {
  PdfRequestError,
  assertManifestPartition,
  buildManifest,
  manifestDigest,
  normalizeManifest,
  parseSourcePages,
  verifyBatch,
} from "./manifest.ts";
import type { SourceManifest } from "./manifest.ts";
import { prepareOpenAiPdfBatches, recognizePdfBatch } from "./openai.ts";
import { createPersistence } from "./persistence.ts";
import type { FinalizedRecipe, RecordedCandidate, TerminalOutcome, ValidationImportRecord } from "./persistence.ts";
import { PDF_RECIPE_SCHEMA_NAME } from "./prompt.ts";
import { reconcileCandidates } from "./reconcile.ts";
import { digestValidatedCandidate, explainOmission, validateRecipeCandidate } from "./validation.ts";
import type { CandidateValidation } from "./validation.ts";

export interface ValidationServiceOptions {
  // Privileged backend client; never constructed with user cookies.
  client: AccountingRpcClient;
  // Verified session identity, never browser-supplied metadata.
  ownerId: string;
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  recognize?: typeof recognizePdfBatch;
  prepareBatches?: typeof prepareOpenAiPdfBatches;
}

export interface ReturnedCandidate {
  batchIndex: number;
  candidateIndex: number;
  status: "complete" | "incomplete";
  candidate: RecipeCandidate;
  warnings: string[];
  explanations: string[];
}

export interface SubmittedCandidate {
  batchIndex: number;
  candidateIndex: number;
  candidate: RecipeCandidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function processingStart(record: Pick<ValidationImportRecord, "expiresAt">, now: () => number): number {
  // Import expiry is created as start + end-to-end bound; never place the start in the future.
  return Math.min(Date.parse(record.expiresAt) - PDF_LIMITS.endToEndDeadlineMs, now());
}

function terminalOutcome(record: ValidationImportRecord): TerminalOutcome {
  return {
    status: record.status,
    saved: record.outcome?.saved ?? 0,
    alreadySaved: record.outcome?.alreadySaved ?? 0,
    pending: record.outcome?.pending ?? 0,
    savedIds: record.outcome?.savedIds ?? [],
    existingIds: record.outcome?.existingIds ?? [],
  };
}

function isOpen(record: ValidationImportRecord, now: () => number): boolean {
  return record.status === "processing" && Date.parse(record.expiresAt) > now();
}

export function createValidationService(options: ValidationServiceOptions) {
  const now = options.now ?? Date.now;
  const persistence = createPersistence(options.client, options.ownerId);
  const ownerId = persistence.ownerId;

  async function requireImport(importId: string): Promise<ValidationImportRecord> {
    const record = await persistence.getImport(importId);
    if (!record) throw new SpendingControlError("import-not-found");
    return record;
  }

  return {
    // Token counting is non-generative. The backend rebuilds batches/digests from the supplied text;
    // nothing the browser claims about batches, digests or cost authorizes spending.
    async createImport(body: unknown) {
      const startedAt = now();
      const { source, pages } = parseSourcePages(body);
      const batches = await (options.prepareBatches ?? prepareOpenAiPdfBatches)(source, pages, {
        apiKey: options.apiKey,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        now,
        processingStartedAt: startedAt,
      });
      const { manifest, manifestDigest: digest } = await buildManifest(source, pages, batches);
      assertManifestPartition(manifest);
      const created = await persistence.createImport({
        importId: crypto.randomUUID(),
        fileFingerprint: source.sha256,
        manifestDigest: digest,
        sourceFilename: source.filename,
        manifest,
        expiresAt: new Date(startedAt + PDF_LIMITS.endToEndDeadlineMs).toISOString(),
      });
      return {
        importId: created.importId,
        status: created.status,
        expiresAt: created.expiresAt,
        manifestDigest: digest,
        manifest,
      };
    },

    async processBatch(
      importId: string,
      body: unknown,
    ): Promise<{ batchIndex: number; invalidCount: number; candidates: ReturnedCandidate[] }> {
      const record = await requireImport(importId);
      if (!isOpen(record, now)) throw new SpendingControlError("import-not-processing");
      const manifest = normalizeManifest(record.manifest);
      if ((await manifestDigest(manifest)) !== record.manifestDigest)
        throw new SpendingControlError("manifest-mismatch");
      const batch = await verifyBatch(body, manifest);
      if (record.results.some((result) => result.batchIndex === batch.index))
        throw new SpendingControlError("batch-already-processed");
      const entry = manifest.batches[batch.index];
      const startedAt = processingStart(record, now);
      let recognized: Awaited<ReturnType<typeof recognizePdfBatch>>;
      try {
        recognized = await (options.recognize ?? recognizePdfBatch)({
          apiKey: options.apiKey,
          ...(options.fetch ? { fetch: options.fetch } : {}),
          ...(options.sleep ? { sleep: options.sleep } : {}),
          now,
          processingStartedAt: startedAt,
          batch,
          state: createImportState(options.client, ownerId),
          reservation: {
            importId,
            batchIndex: batch.index,
            fileFingerprint: record.fileFingerprint,
            manifestDigest: record.manifestDigest,
            inputDigest: entry.inputDigest,
            corePageStart: entry.corePageStart,
            corePageEnd: entry.corePageEnd,
            expiresAt: new Date(startedAt + PDF_LIMITS.processingDeadlineMs).toISOString(),
          },
        });
      } catch (error) {
        // Any charge remains held/reconciled in the ledger; the import can no longer be finalized.
        await persistence.failImport(importId).catch(() => undefined);
        throw error;
      }
      // Another request already claimed this batch; its outcome is not repeatable without a new call.
      if (recognized.duplicate || !recognized.value) throw new SpendingControlError("batch-already-dispatched");
      const validations: CandidateValidation[] = recognized.value.recipes.map((raw) =>
        validateRecipeCandidate(raw, batch),
      );
      const candidates: ReturnedCandidate[] = [];
      const recorded: RecordedCandidate[] = [];
      for (const validation of validations) {
        if (validation.status === "invalid") continue;
        const candidateIndex = candidates.length;
        const digest = await digestValidatedCandidate({
          candidate: validation.candidate,
          ownerId,
          importId,
          batchIndex: batch.index,
          schemaName: PDF_RECIPE_SCHEMA_NAME,
        });
        recorded.push({
          candidateIndex,
          sourceStartPage: validation.candidate.sourceStart.page,
          sourceStartItem: validation.candidate.sourceStart.itemIndex,
          status: validation.status,
          digest,
        });
        candidates.push({
          batchIndex: batch.index,
          candidateIndex,
          status: validation.status,
          candidate: validation.candidate,
          warnings: validation.warnings,
          explanations: validation.candidate.missingFieldReasons.map(explainOmission),
        });
      }
      const invalidCount = validations.length - candidates.length;
      // Durable owner/import/batch/schema-bound digests precede any candidate leaving the backend.
      try {
        await persistence.recordBatchResult({
          importId,
          batchIndex: batch.index,
          schemaName: PDF_RECIPE_SCHEMA_NAME,
          contractVersion: PDF_RECIPE_CONTRACT_VERSION,
          invalidCount,
          candidates: recorded,
        });
      } catch (error) {
        await persistence.failImport(importId).catch(() => undefined);
        throw error;
      }
      return { batchIndex: batch.index, invalidCount, candidates };
    },

    async finalize(importId: string, body: unknown): Promise<TerminalOutcome> {
      if (!isRecord(body) || typeof body.manifestDigest !== "string" || !Array.isArray(body.candidates))
        throw new PdfRequestError("invalid-request");
      const record = await requireImport(importId);
      // Lost-response replay: a terminal import returns its recorded outcome without new writes.
      if (record.status !== "processing") return terminalOutcome(record);
      if (body.manifestDigest !== record.manifestDigest) throw new SpendingControlError("manifest-mismatch");
      const recordedByKey = new Map<string, RecordedCandidate>();
      for (const result of record.results)
        for (const candidate of result.candidates)
          recordedByKey.set(`${result.batchIndex}:${candidate.candidateIndex}`, candidate);
      const submitted: { batchIndex: number; candidateIndex: number; digest: string; candidate: RecipeCandidate }[] =
        [];
      for (const raw of body.candidates as unknown[]) {
        if (
          !isRecord(raw) ||
          !Number.isSafeInteger(raw.batchIndex) ||
          !Number.isSafeInteger(raw.candidateIndex) ||
          !isRecord(raw.candidate)
        )
          throw new PdfRequestError("invalid-request");
        const batchIndex = Number(raw.batchIndex);
        const candidateIndex = Number(raw.candidateIndex);
        const expected = recordedByKey.get(`${batchIndex}:${candidateIndex}`);
        if (!expected) throw new SpendingControlError("payload-digest-mismatch");
        let digest: string;
        try {
          digest = await digestValidatedCandidate({
            candidate: raw.candidate as unknown as RecipeCandidate,
            ownerId,
            importId,
            batchIndex,
            schemaName: PDF_RECIPE_SCHEMA_NAME,
          });
        } catch {
          throw new SpendingControlError("payload-digest-mismatch");
        }
        if (digest !== expected.digest) throw new SpendingControlError("payload-digest-mismatch");
        submitted.push({ batchIndex, candidateIndex, digest, candidate: raw.candidate as unknown as RecipeCandidate });
      }
      if (submitted.length !== recordedByKey.size) throw new SpendingControlError("payload-digest-mismatch");

      // Status comes from the server record; content is now proven identical to the validated payload.
      const byBatch = new Map<number, { batchIndex: number; validations: CandidateValidation[] }>();
      for (const item of submitted) {
        const status = recordedByKey.get(`${item.batchIndex}:${item.candidateIndex}`)?.status ?? "incomplete";
        const group = byBatch.get(item.batchIndex) ?? { batchIndex: item.batchIndex, validations: [] };
        group.validations.push({ status, candidate: item.candidate, warnings: [] });
        byBatch.set(item.batchIndex, group);
      }
      const reconciled = reconcileCandidates([...byBatch.values()]);
      const recipes: FinalizedRecipe[] = [];
      for (const entry of reconciled.candidates) {
        if (entry.status !== "complete") continue;
        const { candidate } = entry;
        const owner = submitted.find(
          (item) =>
            item.batchIndex === entry.batches[0] &&
            item.candidate.sourceStart.page === candidate.sourceStart.page &&
            item.candidate.sourceStart.itemIndex === candidate.sourceStart.itemIndex,
        );
        if (!owner || candidate.title === null || candidate.category === null)
          throw new SpendingControlError("payload-digest-mismatch");
        recipes.push({
          batchIndex: owner.batchIndex,
          candidateIndex: owner.candidateIndex,
          digest: owner.digest,
          sourceStartPage: candidate.sourceStart.page,
          sourceStartItem: candidate.sourceStart.itemIndex,
          pages: candidate.pages,
          title: candidate.title,
          category: candidate.category,
          sourceCategory: candidate.sourceCategory,
          ingredientGroups: candidate.ingredientGroups,
          instructions: candidate.instructions,
          servings: candidate.servings,
          footnotes: candidate.footnotes,
        });
      }
      return persistence.finalizeImport({
        importId,
        manifestDigest: record.manifestDigest,
        submitted: submitted.map(({ batchIndex, candidateIndex, digest }) => ({ batchIndex, candidateIndex, digest })),
        recipes,
      });
    },

    async cancel(importId: string): Promise<TerminalOutcome> {
      return persistence.cancelImport(importId);
    },

    // Non-content status: recovers a committed outcome after a lost response.
    async status(importId: string) {
      let record = await requireImport(importId);
      if (record.status === "processing" && Date.parse(record.expiresAt) <= now()) {
        await options.client.rpc("close_expired_pdf_import", { p_owner_id: ownerId, p_import_id: importId });
        record = await requireImport(importId);
      }
      return {
        importId: record.importId,
        status: record.status,
        expiresAt: record.expiresAt,
        batchCount: record.batchCount,
        recordedBatches: record.results.map((result) => result.batchIndex),
        outcome: record.outcome,
      };
    },
  };
}

export type ValidationService = ReturnType<typeof createValidationService>;
export type { SourceManifest };
