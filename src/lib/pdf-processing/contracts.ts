export const PDF_CONTRACT_VERSION = 1 as const;
export const RECIPE_CATEGORIES = ["breakfast", "lunch", "dinner", "dessert"] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export function isRecipeCategory(value: unknown): value is RecipeCategory {
  return typeof value === "string" && RECIPE_CATEGORIES.some((category) => category === value);
}

// PDF page position is 1-based; itemIndex is zero-based in the reader's original text items.
export interface SourceItemAnchor {
  page: number;
  itemIndex: number;
}
export function sourceItemKey(anchor: SourceItemAnchor): string {
  if (
    !Number.isSafeInteger(anchor.page) ||
    anchor.page < 1 ||
    !Number.isSafeInteger(anchor.itemIndex) ||
    anchor.itemIndex < 0
  ) {
    throw new Error("Invalid source item anchor");
  }
  return `p${anchor.page}:i${anchor.itemIndex}`;
}
export interface PdfSource {
  version: typeof PDF_CONTRACT_VERSION;
  sha256: string;
  filename: string;
  byteLength: number;
  pageCount: number;
}
export interface PageTextItem {
  anchor: SourceItemAnchor;
  text: string;
  transform: [number, number, number, number, number, number];
  width: number;
  height: number;
  direction: string;
  hasEOL: boolean;
}
export interface PageText {
  page: number;
  width: number;
  height: number;
  rotation: number;
  items: PageTextItem[];
}
export interface Ingredient {
  name: string;
  quantity: string | null;
  unit: string | null;
  sourceText: string;
}
export interface IngredientGroup {
  label: string | null;
  ingredients: Ingredient[];
}
export function hasValidGroupLabels(groups: IngredientGroup[]): boolean {
  if (groups.length === 0) return false;
  const labels = groups.map((group) => group.label?.trim() ?? "");
  if (groups.length === 1) return groups[0].label === null || labels[0].length > 0;
  return labels.every(Boolean) && new Set(labels).size === groups.length;
}
export interface RecipeCandidate {
  version: typeof PDF_CONTRACT_VERSION;
  sourceStart: SourceItemAnchor;
  pages: number[];
  title: string | null;
  category: RecipeCategory | null;
  sourceCategory: string | null;
  ingredientGroups: IngredientGroup[];
  instructions: string[];
  servings: string | null;
  footnotes: string[];
  missingFieldReasons: string[];
}
export type ImportStatus = "created" | "processing" | "ready" | "committed" | "failed" | "cancelled";
export type AccountingStatus = "not-dispatched" | "reserved" | "confirmed" | "unknown";
export interface ConfirmedImportCounts {
  status: "committed";
  saved: number;
  alreadySaved: number;
  pending: number;
}
// Local golden anchors intentionally use Poppler text, independently of the future PDF.js reader.
export interface ReferenceAnchor {
  page: number;
  text: string;
  occurrence: number;
}
