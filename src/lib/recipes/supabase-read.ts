import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeReadPort } from "@/lib/recipes/read";

export function createSupabaseRecipeReadPort(client: SupabaseClient): RecipeReadPort {
  return {
    async listRecipes(query) {
      let request = client.from("recipes").select(query.select, { count: query.count });
      for (const order of query.order) {
        request = request.order(order.column, { ascending: order.ascending });
      }
      const { data, count, error } = await request.range(query.range.from, query.range.to);
      return { data, count, error };
    },
    async findRecipe(query) {
      const { data, error } = await client.from("recipes").select(query.select).eq("id", query.id).maybeSingle();
      return { data, error };
    },
  };
}
