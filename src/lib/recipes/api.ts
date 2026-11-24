import { importMutationIsSameOrigin, readBoundedImportJson } from "../pdf-import-access.ts";
import { isRecipeId } from "./read.ts";
import { RecipeEditValidationError, RecipeWriteError } from "./write.ts";

export const RECIPE_EDIT_MAX_BODY_BYTES = 256 * 1024;

export interface RecipePatchContext {
  locals: { user: { id: string } | null };
  params: { id?: string };
  request: Request;
  url: URL;
}

export type RecipePatchExecutor = (
  ownerId: string,
  recipeId: string,
  body: unknown,
  context: RecipePatchContext,
) => Promise<{ recipeId: string; updatedAt: string }>;

function privateJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function logRecipeFailure(status: number, code: string) {
  // Content-free by construction: never log the thrown value, request body, recipe, or database message.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: "recipe_edit_error", status, code }));
}

function failure(error: unknown): Response {
  if (error instanceof RecipeEditValidationError)
    return privateJson({ error: "invalid-recipe-edit", issues: error.issues }, 422);
  if (error instanceof RecipeWriteError) {
    if (error.code === "recipe-not-found") return privateJson({ error: error.code }, 404);
    if (error.code === "recipe-conflict") return privateJson({ error: error.code }, 409);
    if (error.code === "infrastructure-unavailable") {
      logRecipeFailure(503, "infrastructure_unavailable");
      return privateJson({ error: "infrastructure_unavailable" }, 503);
    }
  }
  logRecipeFailure(500, "internal-error");
  return privateJson({ error: "internal-error" }, 500);
}

export async function handleRecipePatch(context: RecipePatchContext, execute: RecipePatchExecutor): Promise<Response> {
  const user = context.locals.user;
  if (!user) return privateJson({ error: "authentication_required" }, 401);
  if (!importMutationIsSameOrigin(context.request, context.url))
    return privateJson({ error: "cross_origin_forbidden" }, 403);
  const recipeId = context.params.id;
  if (!recipeId || !isRecipeId(recipeId)) return privateJson({ error: "recipe-not-found" }, 404);
  const contentType = context.request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim()))
    return privateJson({ error: "unsupported-media-type" }, 415);

  let body: unknown;
  try {
    body = await readBoundedImportJson(context.request, RECIPE_EDIT_MAX_BODY_BYTES);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "request-too-large") return privateJson({ error: code }, 413);
    return privateJson({ error: "invalid-json" }, 400);
  }

  try {
    const result = await execute(user.id, recipeId, body, context);
    if (result.recipeId !== recipeId || typeof result.updatedAt !== "string" || result.updatedAt.length === 0)
      throw new RecipeWriteError("internal-error");
    return privateJson({ recipeId: result.recipeId, updatedAt: result.updatedAt }, 200);
  } catch (error) {
    return failure(error);
  }
}
