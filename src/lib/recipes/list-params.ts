import type { RecipeCategory } from "../pdf-processing/contracts.ts";

export interface RecipeFilters {
  category: RecipeCategory | null;
  ingredient: string | null;
}

export function buildRecipeListHref(page: number, filters: RecipeFilters): string {
  const searchParams = new URLSearchParams();
  if (filters.category !== null) searchParams.set("category", filters.category);
  if (filters.ingredient !== null) searchParams.set("ingredient", filters.ingredient);
  if (page > 1) searchParams.set("page", String(page));
  const query = searchParams.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}
