import type { APIRoute } from "astro";
import { PDF_LIMITS } from "@/lib/pdf-processing/limits";
import { errorResponse, guard, privateJson } from "@/lib/pdf-validation";

// Creates one import from locally read text. The backend recounts tokens and rebuilds every batch digest.
export const POST: APIRoute = async (context) => {
  const guarded = await guard(context, { mutation: true, maxBodyBytes: PDF_LIMITS.maxImportInputBytes });
  if (guarded instanceof Response) return guarded;
  try {
    return privateJson(await guarded.service.createImport(guarded.body), 201);
  } catch (error) {
    return errorResponse(error);
  }
};
