export const PDF_CONTRACT_VERSION = 1 as const;
export const PDF_RECIPE_CONTRACT_VERSION = 2 as const;
export const PDF_OMISSION_RULES = {
  "missing-title": { fieldPath: "title", required: true, explanation: "Brakuje tytułu przepisu." },
  "missing-ingredients": { fieldPath: "ingredientGroups", required: true, explanation: "Brakuje składników." },
  "missing-instructions": { fieldPath: "instructions", required: true, explanation: "Brakuje przygotowania." },
  "missing-category": { fieldPath: "category", required: true, explanation: "Brakuje kategorii." },
  "missing-source-metadata": { fieldPath: "pages", required: true, explanation: "Metadane źródła są niepełne." },
  "missing-ingredient-content": {
    fieldPath: "ingredientGroups",
    required: true,
    explanation: "Lista składników jest niepełna.",
  },
  "missing-variant-content": {
    fieldPath: "ingredientGroups",
    required: true,
    explanation: "Brakuje części wariantu przepisu.",
  },
  "missing-continuation": { fieldPath: "$", required: true, explanation: "Brakuje dalszej części przepisu." },
  "absent-servings": { fieldPath: "servings", required: false, explanation: "Źródło nie podaje liczby porcji." },
  "absent-footnotes": { fieldPath: "footnotes", required: false, explanation: "Źródło nie zawiera przypisów." },
} as const;
export type OmissionCode = keyof typeof PDF_OMISSION_RULES;
export interface OmissionReason {
  code: OmissionCode;
  fieldPath: string;
}
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
  version: typeof PDF_RECIPE_CONTRACT_VERSION;
  sourceStart: SourceItemAnchor;
  pages: number[];
  title: string | null;
  category: RecipeCategory | null;
  sourceCategory: string | null;
  ingredientGroups: IngredientGroup[];
  instructions: string[];
  servings: string | null;
  footnotes: string[];
  missingFieldReasons: OmissionReason[];
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
