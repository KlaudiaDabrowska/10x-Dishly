import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeReadPort } from "./read.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSupabaseRecipeReadPort(client: SupabaseClient): RecipeReadPort {
  return {
    async listRecipes(query) {
      let request = client.rpc(query.function, query.parameters, { count: query.count });
      for (const order of query.order) {
        request = request.order(order.column, { ascending: order.ascending });
      }
      const response: unknown = await request.range(query.range.from, query.range.to);
      if (!isRecord(response)) return { status: "error" };
      const { data, count, error } = response;
      if (isRecord(error) && error.code === "PGRST103") return { status: "range-not-satisfiable" };
      if (error !== null) return { status: "error" };
      return { status: "ok", data, count: typeof count === "number" || count === null ? count : null };
    },
    async findRecipe(query) {
      const { data, error } = await client.from("recipes").select(query.select).eq("id", query.id).maybeSingle();
      return { data, error };
    },
  };
}
