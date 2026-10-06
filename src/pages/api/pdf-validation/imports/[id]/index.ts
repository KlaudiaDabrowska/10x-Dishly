import type { APIRoute } from "astro";
import { errorResponse, guard, privateJson, verifyReadBack } from "@/lib/pdf-validation";

// Non-content status; recovers a committed outcome after a lost finalization response.
export const GET: APIRoute = async (context) => {
  const guarded = await guard(context, { mutation: false });
  if (guarded instanceof Response) return guarded;
  try {
    const status = await guarded.service.status(String(context.params.id));
    const readBack =
      status.outcome !== null &&
      (await verifyReadBack(context, [...status.outcome.savedIds, ...status.outcome.existingIds]));
    return privateJson({ ...status, readBack });
  } catch (error) {
    return errorResponse(error);
  }
};

// Cancellation before commit prevents all recipe writes; after commit it returns the committed outcome.
export const DELETE: APIRoute = async (context) => {
  const guarded = await guard(context, { mutation: true });
  if (guarded instanceof Response) return guarded;
  try {
    return privateJson(await guarded.service.cancel(String(context.params.id)));
  } catch (error) {
    return errorResponse(error);
  }
};
