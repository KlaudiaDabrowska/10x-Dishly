import type { APIRoute } from "astro";
import { PDF_LIMITS } from "@/lib/pdf-processing/limits";
import { errorResponse, guard, privateJson } from "@/lib/pdf-validation";

// Candidates are returned only after their digests are durably recorded for this owner/import/batch.
export const POST: APIRoute = async (context) => {
  const guarded = await guard(context, { mutation: true, maxBodyBytes: PDF_LIMITS.maxBatchBodyBytes });
  if (guarded instanceof Response) return guarded;
  try {
    return privateJson(await guarded.service.processBatch(String(context.params.id), guarded.body));
  } catch (error) {
    return errorResponse(error);
  }
};
