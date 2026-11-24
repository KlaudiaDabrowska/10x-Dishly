import type { APIRoute } from "astro";

import { handleRecipePatch } from "@/lib/recipes/api";
import { createSupabaseRecipeWritePort } from "@/lib/recipes/supabase-write";
import { RecipeWriteError, editRecipe } from "@/lib/recipes/write";
import { createClient } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase-admin";

export const PATCH: APIRoute = (context) =>
  handleRecipePatch(context, async (ownerId, recipeId, body) => {
    const reader = createClient(context.request.headers, context.cookies);
    const admin = createAdminClient();
    if (!reader || !admin) throw new RecipeWriteError("infrastructure-unavailable");
    return editRecipe(createSupabaseRecipeWritePort(reader, admin), ownerId, recipeId, body);
  });
