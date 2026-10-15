import type { APIContext, APIRoute } from "astro";
import { PDF_LIMITS } from "@/lib/pdf-processing/limits";
import type { ImportChannel } from "@/lib/pdf-processing/persistence";
import { errorResponse, guard, privateJson, verifyReadBack } from "@/lib/pdf-validation";

async function createImport(context: APIContext, channel: ImportChannel): Promise<Response> {
  const guarded = await guard(context, {
    channel,
    operation: "create",
    mutation: true,
    maxBodyBytes: PDF_LIMITS.maxImportInputBytes,
  });
  if (guarded instanceof Response) return guarded;
  try {
    return privateJson(await guarded.service.createImport(guarded.body), 201);
  } catch (error) {
    return errorResponse(error, "create", channel);
  }
}

async function processBatch(context: APIContext, channel: ImportChannel): Promise<Response> {
  const guarded = await guard(context, {
    channel,
    operation: "batch",
    mutation: true,
    maxBodyBytes: PDF_LIMITS.maxBatchBodyBytes,
  });
  if (guarded instanceof Response) return guarded;
  try {
    return privateJson(await guarded.service.processBatch(String(context.params.id), guarded.body));
  } catch (error) {
    return errorResponse(error, "batch", channel);
  }
}

async function finalizeImport(context: APIContext, channel: ImportChannel): Promise<Response> {
  const guarded = await guard(context, {
    channel,
    operation: "finalize",
    mutation: true,
    maxBodyBytes: PDF_LIMITS.maxFinalizationBodyBytes,
  });
  if (guarded instanceof Response) return guarded;
  try {
    const outcome = await guarded.service.finalize(String(context.params.id), guarded.body);
    const readBack =
      outcome.status === "committed" && (await verifyReadBack(context, [...outcome.savedIds, ...outcome.existingIds]));
    return privateJson({ ...outcome, readBack });
  } catch (error) {
    return errorResponse(error, "finalize", channel);
  }
}

async function importStatus(context: APIContext, channel: ImportChannel): Promise<Response> {
  const guarded = await guard(context, { channel, operation: "status", mutation: false });
  if (guarded instanceof Response) return guarded;
  try {
    const status = await guarded.service.status(String(context.params.id));
    const readBack =
      status.outcome !== null &&
      (await verifyReadBack(context, [...status.outcome.savedIds, ...status.outcome.existingIds]));
    return privateJson({ ...status, readBack });
  } catch (error) {
    return errorResponse(error, "status", channel);
  }
}

async function cancelImport(context: APIContext, channel: ImportChannel): Promise<Response> {
  const guarded = await guard(context, { channel, operation: "cancel", mutation: true });
  if (guarded instanceof Response) return guarded;
  try {
    return privateJson(await guarded.service.cancel(String(context.params.id)));
  } catch (error) {
    return errorResponse(error, "cancel", channel);
  }
}

async function resolveDecision(context: APIContext, channel: ImportChannel): Promise<Response> {
  if (channel !== "product") return privateJson({ error: "import-not-found" }, 404);
  const guarded = await guard(context, {
    channel,
    operation: "resolve",
    mutation: true,
    maxBodyBytes: PDF_LIMITS.maxDecisionBodyBytes,
  });
  if (guarded instanceof Response) return guarded;
  try {
    const result = await guarded.service.resolve(
      String(context.params.id),
      String(context.params.decisionId),
      guarded.body,
    );
    const readBack = await verifyReadBack(context, [...result.outcome.savedIds, ...result.outcome.existingIds]);
    return privateJson({ ...result, readBack });
  } catch (error) {
    return errorResponse(error, "resolve", channel);
  }
}

export function importApi(channel: ImportChannel): {
  create: APIRoute;
  batch: APIRoute;
  finalize: APIRoute;
  status: APIRoute;
  cancel: APIRoute;
  resolve: APIRoute;
} {
  return {
    create: (context) => createImport(context, channel),
    batch: (context) => processBatch(context, channel),
    finalize: (context) => finalizeImport(context, channel),
    status: (context) => importStatus(context, channel),
    cancel: (context) => cancelImport(context, channel),
    resolve: (context) => resolveDecision(context, channel),
  };
}
