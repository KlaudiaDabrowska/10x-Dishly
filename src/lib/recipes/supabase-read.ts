import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeReadPort } from "./read.ts";

export function createSupabaseRecipeReadPort(client: SupabaseClient): RecipeReadPort {
  return {
    async listRecipes(query) {
      let request = client.from("recipes").select(query.select, { count: query.count });
      for (const order of query.order) {
        request = request.order(order.column, { ascending: order.ascending });
      }
      const { data, count, error } = await request.range(query.range.from, query.range.to);
      if (error?.code === "PGRST103") return { status: "range-not-satisfiable" };
      if (error) return { status: "error" };
      return { status: "ok", data, count };
    },
    async findRecipe(query) {
      const { data, error } = await client.from("recipes").select(query.select).eq("id", query.id).maybeSingle();
      return { data, error };
    },
  };
}
