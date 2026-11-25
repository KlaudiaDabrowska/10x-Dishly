import type { RecipeDetail } from "./read.ts";
import type { RecipeEditInput } from "./write.ts";

export interface RecipeEditDraftIngredient {
  originIndex: number | null;
  name: string;
  sourceText: string;
}

export interface RecipeEditDraftGroup {
  originIndex: number | null;
  label: string;
  ingredients: RecipeEditDraftIngredient[];
}

export interface RecipeEditDraftInstruction {
  originIndex: number | null;
  text: string;
}

export interface RecipeEditDraft {
  updatedAt: string;
  title: string;
  ingredientGroups: RecipeEditDraftGroup[];
  instructions: RecipeEditDraftInstruction[];
}

export type RecipeEditStatus = "default" | "validation" | "saving" | "failure" | "conflict" | "cancel" | "success";

export type RecipeEditDraftAction =
  | { type: "set-title"; value: string }
  | { type: "add-group" }
  | { type: "remove-group"; groupIndex: number }
  | { type: "set-group-label"; groupIndex: number; value: string }
  | { type: "add-ingredient"; groupIndex: number }
  | { type: "remove-ingredient"; groupIndex: number; ingredientIndex: number }
  | {
      type: "set-ingredient";
      groupIndex: number;
      ingredientIndex: number;
      field: "name" | "sourceText";
      value: string;
    }
  | { type: "add-instruction" }
  | { type: "remove-instruction"; instructionIndex: number }
  | { type: "set-instruction"; instructionIndex: number; value: string };

type EditableRecipe = Pick<RecipeDetail, "updatedAt" | "title" | "ingredientGroups" | "instructions">;

export function createRecipeEditDraft(recipe: EditableRecipe): RecipeEditDraft {
  return {
    updatedAt: recipe.updatedAt,
    title: recipe.title ?? "",
    ingredientGroups: recipe.ingredientGroups.map((group, groupIndex) => ({
      originIndex: groupIndex,
      label: group.label ?? "",
      ingredients: group.ingredients.map((ingredient, ingredientIndex) => ({
        originIndex: ingredientIndex,
        name: ingredient.name,
        sourceText: ingredient.sourceText,
      })),
    })),
    instructions: recipe.instructions.map((text, originIndex) => ({ originIndex, text })),
  };
}

function updateGroup(
  draft: RecipeEditDraft,
  groupIndex: number,
  update: (group: RecipeEditDraftGroup) => RecipeEditDraftGroup,
): RecipeEditDraft {
  if (!draft.ingredientGroups[groupIndex]) return draft;
  return {
    ...draft,
    ingredientGroups: draft.ingredientGroups.map((group, index) => (index === groupIndex ? update(group) : group)),
  };
}

export function recipeEditDraftReducer(draft: RecipeEditDraft, action: RecipeEditDraftAction): RecipeEditDraft {
  switch (action.type) {
    case "set-title":
      return { ...draft, title: action.value };
    case "add-group":
      return {
        ...draft,
        ingredientGroups: [...draft.ingredientGroups, { originIndex: null, label: "", ingredients: [] }],
      };
    case "remove-group":
      return {
        ...draft,
        ingredientGroups: draft.ingredientGroups.filter((_, index) => index !== action.groupIndex),
      };
    case "set-group-label":
      return updateGroup(draft, action.groupIndex, (group) => ({ ...group, label: action.value }));
    case "add-ingredient":
      return updateGroup(draft, action.groupIndex, (group) => ({
        ...group,
        ingredients: [...group.ingredients, { originIndex: null, name: "", sourceText: "" }],
      }));
    case "remove-ingredient":
      return updateGroup(draft, action.groupIndex, (group) => ({
        ...group,
        ingredients: group.ingredients.filter((_, index) => index !== action.ingredientIndex),
      }));
    case "set-ingredient":
      return updateGroup(draft, action.groupIndex, (group) => ({
        ...group,
        ingredients: group.ingredients.map((ingredient, index) =>
          index === action.ingredientIndex ? { ...ingredient, [action.field]: action.value } : ingredient,
        ),
      }));
    case "add-instruction":
      return { ...draft, instructions: [...draft.instructions, { originIndex: null, text: "" }] };
    case "remove-instruction":
      return {
        ...draft,
        instructions: draft.instructions.filter((_, index) => index !== action.instructionIndex),
      };
    case "set-instruction":
      return {
        ...draft,
        instructions: draft.instructions.map((instruction, index) =>
          index === action.instructionIndex ? { ...instruction, text: action.value } : instruction,
        ),
      };
  }
}

export function recipeEditPayload(draft: RecipeEditDraft): RecipeEditInput {
  return {
    updatedAt: draft.updatedAt,
    title: draft.title.trim() ? draft.title : null,
    ingredientGroups: draft.ingredientGroups.map((group) => ({
      originIndex: group.originIndex,
      label: group.label.trim() ? group.label : null,
      ingredients: group.ingredients.map((ingredient) => ({
        originIndex: ingredient.originIndex,
        name: ingredient.name,
        sourceText: ingredient.sourceText,
      })),
    })),
    instructions: draft.instructions.map((instruction) => ({
      originIndex: instruction.originIndex,
      text: instruction.text,
    })),
  };
}

export function isRecipeEditDraftDirty(initial: RecipeEditDraft, current: RecipeEditDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

export function warnBeforeRecipeEditNavigation(
  dirty: boolean,
  event: Pick<BeforeUnloadEvent, "preventDefault" | "returnValue">,
): boolean {
  if (!dirty) return false;
  event.preventDefault();
  // Legacy browser support still requires returnValue in addition to preventDefault.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  event.returnValue = "";
  return true;
}

export function focusRecipeEditError(status: RecipeEditStatus, target: Pick<HTMLElement, "focus"> | null): boolean {
  if (!target || !["validation", "conflict", "failure"].includes(status)) return false;
  target.focus();
  return true;
}
