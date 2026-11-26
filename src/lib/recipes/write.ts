import { PDF_OMISSION_CODES } from "../pdf-processing/contracts.ts";
import type { IngredientGroup, OmissionCode } from "../pdf-processing/contracts.ts";

export interface CurrentEditableRecipe {
  id: string;
  title: string | null;
  ingredientGroups: IngredientGroup[];
  instructions: string[];
  currentMissingReasonCodes: OmissionCode[];
  updatedAt: string;
}

export interface RecipeEditIngredientInput {
  originIndex: number | null;
  name: string;
  sourceText: string;
}

export interface RecipeEditGroupInput {
  originIndex: number | null;
  label: string | null;
  ingredients: RecipeEditIngredientInput[];
}

export interface RecipeEditInstructionInput {
  originIndex: number | null;
  text: string;
}

export interface RecipeEditInput {
  updatedAt: string;
  title: string | null;
  ingredientGroups: RecipeEditGroupInput[];
  instructions: RecipeEditInstructionInput[];
}

export interface CanonicalRecipeEdit {
  expectedUpdatedAt: string;
  title: string | null;
  ingredientGroups: IngredientGroup[];
  instructions: string[];
  currentMissingReasonCodes: OmissionCode[];
}

export interface RecipeUpdateCommand extends CanonicalRecipeEdit {
  ownerId: string;
  recipeId: string;
}

export type RecipeCurrentResult =
  | { status: "ok"; recipe: CurrentEditableRecipe }
  | { status: "not-found" }
  | { status: "unavailable" }
  | { status: "error" };

export type RecipeUpdateResult =
  | { status: "ok"; recipeId: string; updatedAt: string }
  | { status: "not-found" }
  | { status: "conflict" }
  | { status: "unavailable" }
  | { status: "error" };

export interface RecipeWritePort {
  findCurrentRecipe(recipeId: string): Promise<RecipeCurrentResult>;
  updateRecipe(command: RecipeUpdateCommand): Promise<RecipeUpdateResult>;
}

export type RecipeWriteErrorCode =
  "recipe-not-found" | "recipe-conflict" | "infrastructure-unavailable" | "internal-error";

export class RecipeWriteError extends Error {
  readonly code: RecipeWriteErrorCode;

  constructor(code: RecipeWriteErrorCode) {
    super(code);
    this.code = code;
  }
}

export type RecipeEditIssueCode =
  | "blank"
  | "duplicate-label"
  | "duplicate-origin"
  | "invalid-format"
  | "invalid-origin"
  | "invalid-type"
  | "invalid-value"
  | "out-of-order-origin"
  | "required"
  | "structural-gap"
  | "too-long"
  | "too-many-items"
  | "unexpected-field";

export interface RecipeEditIssue {
  path: string;
  code: RecipeEditIssueCode;
}

export class RecipeEditValidationError extends Error {
  readonly code = "invalid-recipe-edit";
  readonly issues: RecipeEditIssue[];

  constructor(issues: RecipeEditIssue[]) {
    super("Invalid recipe edit");
    this.issues = issues;
  }
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ROOT_KEYS = ["updatedAt", "title", "ingredientGroups", "instructions"] as const;
const GROUP_KEYS = ["originIndex", "label", "ingredients"] as const;
const INGREDIENT_KEYS = ["originIndex", "name", "sourceText"] as const;
const INSTRUCTION_KEYS = ["originIndex", "text"] as const;

function invalid(path: string, code: RecipeEditIssueCode): never {
  throw new RecipeEditValidationError([{ path, code }]);
}

function recordWithExactKeys(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(path, "invalid-type");
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.some((key) => !keys.includes(key))) invalid(path, "unexpected-field");
  const missing = keys.find((key) => !Object.hasOwn(record, key));
  if (missing) invalid(path === "$" ? missing : `${path}.${missing}`, "required");
  return record;
}

function boundedText(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string") invalid(path, "invalid-type");
  const text = value.trim();
  if (!text) invalid(path, "blank");
  if (text.length > maximum) invalid(path, "too-long");
  return text;
}

function nullableBoundedText(value: unknown, path: string, maximum: number): string | null {
  return value === null ? null : boundedText(value, path, maximum);
}

function arrayValue(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) invalid(path, "invalid-type");
  if (value.length > maximum) invalid(path, "too-many-items");
  return value;
}

function originValue(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalid(path, "invalid-origin");
  return Number(value);
}

function validateOriginSequence(
  origins: readonly (number | null)[],
  maximum: number,
  pathFor: (index: number) => string,
) {
  const used = new Set<number>();
  let last = -1;
  let appended = false;
  origins.forEach((origin, index) => {
    if (origin === null) {
      appended = true;
      return;
    }
    const path = pathFor(index);
    if (origin >= maximum) invalid(path, "invalid-origin");
    if (used.has(origin)) invalid(path, "duplicate-origin");
    if (appended || origin <= last) invalid(path, "out-of-order-origin");
    used.add(origin);
    last = origin;
  });
}

function recipeEditRecord(value: unknown): Record<string, unknown> & { updatedAt: string } {
  const input = recordWithExactKeys(value, "$", ROOT_KEYS);
  if (
    typeof input.updatedAt !== "string" ||
    !RFC3339.test(input.updatedAt) ||
    !Number.isFinite(Date.parse(input.updatedAt))
  )
    invalid("updatedAt", "invalid-format");
  return input as Record<string, unknown> & { updatedAt: string };
}

function parseIngredientGroups(current: CurrentEditableRecipe, value: unknown): IngredientGroup[] {
  const groups = arrayValue(value, "ingredientGroups", 20).map((entry, groupIndex) => {
    const path = `ingredientGroups[${groupIndex}]`;
    const group = recordWithExactKeys(entry, path, GROUP_KEYS);
    return {
      originIndex: originValue(group.originIndex, `${path}.originIndex`),
      label: nullableBoundedText(group.label, `${path}.label`, 2000),
      ingredients: arrayValue(group.ingredients, `${path}.ingredients`, 200).map((ingredient, ingredientIndex) => {
        const ingredientPath = `${path}.ingredients[${ingredientIndex}]`;
        const item = recordWithExactKeys(ingredient, ingredientPath, INGREDIENT_KEYS);
        return {
          originIndex: originValue(item.originIndex, `${ingredientPath}.originIndex`),
          name: boundedText(item.name, `${ingredientPath}.name`, 500),
          sourceText: boundedText(item.sourceText, `${ingredientPath}.sourceText`, 2000),
        };
      }),
    };
  });

  validateOriginSequence(
    groups.map((group) => group.originIndex),
    current.ingredientGroups.length,
    (index) => `ingredientGroups[${index}].originIndex`,
  );
  const labels = new Set<string>();
  groups.forEach((group, groupIndex) => {
    if (groups.length > 1 && group.label === null) invalid(`ingredientGroups[${groupIndex}].label`, "invalid-value");
    if (group.label !== null) {
      if (labels.has(group.label)) invalid(`ingredientGroups[${groupIndex}].label`, "duplicate-label");
      labels.add(group.label);
    }
    const originalGroup = group.originIndex === null ? null : current.ingredientGroups[group.originIndex];
    validateOriginSequence(
      group.ingredients.map((ingredient) => ingredient.originIndex),
      originalGroup?.ingredients.length ?? 0,
      (index) => `ingredientGroups[${groupIndex}].ingredients[${index}].originIndex`,
    );
  });

  return groups.map((group) => {
    const originalGroup = group.originIndex === null ? null : current.ingredientGroups[group.originIndex];
    return {
      label: group.label,
      ingredients: group.ingredients.map((ingredient) => {
        const original =
          originalGroup && ingredient.originIndex !== null ? originalGroup.ingredients[ingredient.originIndex] : null;
        const preserveParsedParts = original?.sourceText === ingredient.sourceText;
        return {
          name: ingredient.name,
          quantity: preserveParsedParts ? original.quantity : null,
          unit: preserveParsedParts ? original.unit : null,
          sourceText: ingredient.sourceText,
        };
      }),
    };
  });
}

function parseInstructions(current: CurrentEditableRecipe, value: unknown): string[] {
  const instructions = arrayValue(value, "instructions", 100).map((entry, index) => {
    const path = `instructions[${index}]`;
    const instruction = recordWithExactKeys(entry, path, INSTRUCTION_KEYS);
    return {
      originIndex: originValue(instruction.originIndex, `${path}.originIndex`),
      text: boundedText(instruction.text, `${path}.text`, 8000),
    };
  });
  validateOriginSequence(
    instructions.map((instruction) => instruction.originIndex),
    current.instructions.length,
    (index) => `instructions[${index}].originIndex`,
  );
  return instructions.map((instruction) => instruction.text);
}

export function canonicalizeRecipeEdit(current: CurrentEditableRecipe, value: unknown): CanonicalRecipeEdit {
  const input = recipeEditRecord(value);
  const title = nullableBoundedText(input.title, "title", 2000);
  const ingredientGroups = parseIngredientGroups(current, input.ingredientGroups);
  const instructions = parseInstructions(current, input.instructions);
  const hasIngredientGap =
    ingredientGroups.length === 0 || ingredientGroups.some((group) => group.ingredients.length === 0);
  if (title === null && !current.currentMissingReasonCodes.includes("missing-title"))
    invalid("title", "structural-gap");
  if (hasIngredientGap && !current.currentMissingReasonCodes.includes("missing-ingredients"))
    invalid("ingredientGroups", "structural-gap");
  if (instructions.length === 0 && !current.currentMissingReasonCodes.includes("missing-instructions"))
    invalid("instructions", "structural-gap");

  const ingredientChanged = JSON.stringify(ingredientGroups) !== JSON.stringify(current.ingredientGroups);
  const editableContentChanged =
    title !== current.title ||
    ingredientChanged ||
    JSON.stringify(instructions) !== JSON.stringify(current.instructions);
  const currentMissingReasonCodes = PDF_OMISSION_CODES.filter((code) => {
    if (!current.currentMissingReasonCodes.includes(code)) return false;
    if (title !== null && code === "missing-title") return false;
    if (!hasIngredientGap && code === "missing-ingredients") return false;
    if (instructions.length > 0 && code === "missing-instructions") return false;
    if (ingredientChanged && (code === "missing-ingredient-content" || code === "missing-variant-content"))
      return false;
    if (editableContentChanged && code === "missing-continuation") return false;
    return true;
  });

  return {
    expectedUpdatedAt: input.updatedAt,
    title,
    ingredientGroups,
    instructions,
    currentMissingReasonCodes,
  };
}

export async function editRecipe(
  port: RecipeWritePort,
  ownerId: string,
  recipeId: string,
  input: unknown,
): Promise<{ recipeId: string; updatedAt: string }> {
  const current = await port.findCurrentRecipe(recipeId);
  if (current.status === "not-found") throw new RecipeWriteError("recipe-not-found");
  if (current.status === "unavailable") throw new RecipeWriteError("infrastructure-unavailable");
  if (current.status === "error") throw new RecipeWriteError("internal-error");
  if (recipeEditRecord(input).updatedAt !== current.recipe.updatedAt) throw new RecipeWriteError("recipe-conflict");
  const canonical = canonicalizeRecipeEdit(current.recipe, input);
  const result = await port.updateRecipe({ ownerId, recipeId, ...canonical });
  if (result.status === "ok") return { recipeId: result.recipeId, updatedAt: result.updatedAt };
  if (result.status === "not-found") throw new RecipeWriteError("recipe-not-found");
  if (result.status === "conflict") throw new RecipeWriteError("recipe-conflict");
  if (result.status === "unavailable") throw new RecipeWriteError("infrastructure-unavailable");
  throw new RecipeWriteError("internal-error");
}
