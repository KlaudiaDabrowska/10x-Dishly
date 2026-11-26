import type { SupabaseClient } from "@supabase/supabase-js";

import { readRecipeDetail } from "./read.ts";
import { createSupabaseRecipeReadPort } from "./supabase-read.ts";
import type { RecipeUpdateCommand, RecipeUpdateResult, RecipeWritePort } from "./write.ts";

interface RpcRow {
  recipe_id: unknown;
  updated_at: unknown;
}

function updateFailure(error: { message?: string } | null): RecipeUpdateResult {
  if (error?.message === "recipe not found") return { status: "not-found" };
  if (error?.message === "recipe conflict") return { status: "conflict" };
  return { status: "error" };
}

export function createSupabaseRecipeWritePort(reader: SupabaseClient, admin: SupabaseClient): RecipeWritePort {
  const readPort = createSupabaseRecipeReadPort(reader);
  return {
    async findCurrentRecipe(recipeId) {
      const result = await readRecipeDetail(readPort, recipeId);
      if (result.status === "not-found") return { status: "not-found" };
      if (result.status === "error") return result.reason === "query" ? { status: "unavailable" } : { status: "error" };
      return {
        status: "ok",
        recipe: {
          id: result.recipe.id,
          title: result.recipe.title,
          ingredientGroups: result.recipe.ingredientGroups,
          instructions: result.recipe.instructions,
          currentMissingReasonCodes: result.recipe.currentMissingReasonCodes,
          updatedAt: result.recipe.updatedAt,
        },
      };
    },
    async updateRecipe(command: RecipeUpdateCommand) {
      const { data, error } = (await admin.rpc("update_owned_recipe", {
        p_owner_id: command.ownerId,
        p_recipe_id: command.recipeId,
        p_expected_updated_at: command.expectedUpdatedAt,
        p_title: command.title,
        p_ingredient_groups: command.ingredientGroups,
        p_instructions: command.instructions,
        p_current_missing_reason_codes: command.currentMissingReasonCodes,
      })) as unknown as { data: unknown; error: { message?: string } | null };
      if (error) return updateFailure(error);
      if (!Array.isArray(data) || data.length !== 1) return { status: "error" };
      const row = data[0] as RpcRow;
      if (typeof row.recipe_id !== "string" || row.recipe_id !== command.recipeId || typeof row.updated_at !== "string")
        return { status: "error" };
      return { status: "ok", recipeId: row.recipe_id, updatedAt: row.updated_at };
    },
  };
}
