import type { APIRoute } from "astro";
import { PDF_LIMITS } from "@/lib/pdf-processing/limits";
import { errorResponse, guard, privateJson, verifyReadBack } from "@/lib/pdf-validation";

export const POST: APIRoute = async (context) => {
  const guarded = await guard(context, { mutation: true, maxBodyBytes: PDF_LIMITS.maxFinalizationBodyBytes });
  if (guarded instanceof Response) return guarded;
  try {
    const outcome = await guarded.service.finalize(String(context.params.id), guarded.body);
    const readBack =
      outcome.status === "committed" && (await verifyReadBack(context, [...outcome.savedIds, ...outcome.existingIds]));
    return privateJson({ ...outcome, readBack });
  } catch (error) {
    return errorResponse(error, "finalize");
  }
};
