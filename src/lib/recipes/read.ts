import type { Ingredient, IngredientGroup } from "@/lib/pdf-processing/contracts.ts";

export const PAGE_SIZE = 24;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LIST_SELECT = "id,title,created_at";
const DETAIL_SELECT = "id,title,ingredient_groups,instructions,source_filename,source_start_page,created_at";

export interface RecipeListQuery {
  select: typeof LIST_SELECT;
  count: "exact";
  range: { from: number; to: number };
  order: readonly [{ column: "created_at"; ascending: false }, { column: "id"; ascending: true }];
}

export interface RecipeDetailQuery {
  select: typeof DETAIL_SELECT;
  id: string;
}

export interface RecipeQueryResponse {
  data: unknown;
  error: unknown;
}

export interface RecipeListQueryResponse extends RecipeQueryResponse {
  count: number | null;
}

export interface RecipeReadPort {
  listRecipes(query: RecipeListQuery): Promise<RecipeListQueryResponse>;
  findRecipe(query: RecipeDetailQuery): Promise<RecipeQueryResponse>;
}

export interface RecipeListItem {
  id: string;
  title: string;
  createdAt: string;
}

export interface RecipeDetail extends RecipeListItem {
  ingredientGroups: IngredientGroup[];
  instructions: string[];
  sourceFilename: string;
  sourceStartPage: number;
}

export type RecipePageResult =
  | {
      status: "ok";
      recipes: RecipeListItem[];
      page: number;
      pageSize: typeof PAGE_SIZE;
      totalCount: number;
      totalPages: number;
    }
  | { status: "invalid-page" }
  | { status: "error"; reason: "query" | "invalid-data" };

export type RecipeDetailResult =
  | { status: "ok"; recipe: RecipeDetail }
  | { status: "not-found" }
  | { status: "error"; reason: "query" | "invalid-data" };

export function parsePage(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}

export function isRecipeId(value: string): boolean {
  return UUID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function mapIngredient(value: unknown): Ingredient | null {
  if (!isRecord(value) || !hasExactKeys(value, ["name", "quantity", "unit", "sourceText"])) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  if (!isNullableString(value.quantity) || !isNullableString(value.unit)) return null;
  if (typeof value.sourceText !== "string" || !value.sourceText.trim()) return null;
  return {
    name: value.name,
    quantity: value.quantity,
    unit: value.unit,
    sourceText: value.sourceText,
  };
}

export function mapIngredientGroups(value: unknown): IngredientGroup[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const groups: IngredientGroup[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, ["label", "ingredients"])) return null;
    if (!isNullableString(entry.label) || !Array.isArray(entry.ingredients) || entry.ingredients.length === 0)
      return null;
    const ingredients = entry.ingredients.map(mapIngredient);
    if (ingredients.some((ingredient) => ingredient === null)) return null;
    groups.push({ label: entry.label, ingredients: ingredients as Ingredient[] });
  }
  return groups;
}

export function mapInstructions(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some((instruction) => typeof instruction !== "string" || !instruction.trim())) return null;
  return value as string[];
}

function mapRecipeIdentity(value: unknown): RecipeListItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !isRecipeId(value.id)) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.created_at !== "string" || !value.created_at.trim()) return null;
  return { id: value.id, title: value.title, createdAt: value.created_at };
}

export function mapRecipeListItem(value: unknown): RecipeListItem | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "title", "created_at"])) return null;
  return mapRecipeIdentity(value);
}

export function mapRecipeDetail(value: unknown): RecipeDetail | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "title",
      "ingredient_groups",
      "instructions",
      "source_filename",
      "source_start_page",
      "created_at",
    ])
  )
    return null;
  const identity = mapRecipeIdentity(value);
  const ingredientGroups = mapIngredientGroups(value.ingredient_groups);
  const instructions = mapInstructions(value.instructions);
  if (!identity || !ingredientGroups || !instructions) return null;
  if (typeof value.source_filename !== "string" || !value.source_filename.trim()) return null;
  if (!Number.isSafeInteger(value.source_start_page) || Number(value.source_start_page) < 1) return null;
  return {
    ...identity,
    ingredientGroups,
    instructions,
    sourceFilename: value.source_filename,
    sourceStartPage: Number(value.source_start_page),
  };
}

export async function readRecipePage(port: RecipeReadPort, pageValue?: string | null): Promise<RecipePageResult> {
  const page = parsePage(pageValue);
  if (page === null) return { status: "invalid-page" };
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return { status: "invalid-page" };

  const response = await port.listRecipes({
    select: LIST_SELECT,
    count: "exact",
    range: { from, to },
    order: [
      { column: "created_at", ascending: false },
      { column: "id", ascending: true },
    ],
  });
  if (response.error !== null) return { status: "error", reason: "query" };
  const totalCount = response.count;
  if (typeof totalCount !== "number" || !Number.isSafeInteger(totalCount) || totalCount < 0)
    return { status: "error", reason: "invalid-data" };
  if (!Array.isArray(response.data)) return { status: "error", reason: "invalid-data" };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if ((totalPages === 0 && page !== 1) || (totalPages > 0 && page > totalPages)) return { status: "invalid-page" };
  if (response.data.length > PAGE_SIZE) return { status: "error", reason: "invalid-data" };
  const expectedMaximum = Math.max(0, Math.min(PAGE_SIZE, totalCount - from));
  if (response.data.length > expectedMaximum || (expectedMaximum > 0 && response.data.length === 0))
    return { status: "error", reason: "invalid-data" };

  const recipes = response.data.map(mapRecipeListItem);
  if (recipes.some((recipe) => recipe === null)) return { status: "error", reason: "invalid-data" };
  return {
    status: "ok",
    recipes: recipes as RecipeListItem[],
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages,
  };
}

export async function readRecipeDetail(port: RecipeReadPort, id: string): Promise<RecipeDetailResult> {
  if (!isRecipeId(id)) return { status: "not-found" };
  const response = await port.findRecipe({ select: DETAIL_SELECT, id });
  if (response.error !== null) return { status: "error", reason: "query" };
  if (response.data === null) return { status: "not-found" };
  const recipe = mapRecipeDetail(response.data);
  return recipe ? { status: "ok", recipe } : { status: "error", reason: "invalid-data" };
}
