import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecipeEditDraft,
  focusRecipeEditError,
  isRecipeEditDraftDirty,
  recipeEditDraftReducer,
  recipeEditPayload,
  warnBeforeRecipeEditNavigation,
} from "../src/lib/recipes/edit-form.ts";

function recipe() {
  return {
    updatedAt: "2026-11-24T08:00:00.000Z",
    title: "Pancakes",
    ingredientGroups: [
      {
        label: "Batter",
        ingredients: [
          { name: "flour", quantity: "200", unit: "g", sourceText: "200 g flour" },
          { name: "milk", quantity: "300", unit: "ml", sourceText: "300 ml milk" },
        ],
      },
    ],
    instructions: ["Mix.", "Cook."],
  };
}

test("draft mutations preserve existing origins and mark appended rows as new", () => {
  const initial = createRecipeEditDraft(recipe());
  assert.equal(isRecipeEditDraftDirty(initial, initial), false);
  assert.deepEqual(
    initial.ingredientGroups[0].ingredients.map((ingredient) => ingredient.originIndex),
    [0, 1],
  );

  const appended = recipeEditDraftReducer(initial, { type: "add-ingredient", groupIndex: 0 });
  const edited = recipeEditDraftReducer(appended, {
    type: "set-ingredient",
    groupIndex: 0,
    ingredientIndex: 2,
    field: "sourceText",
    value: "berries",
  });
  const named = recipeEditDraftReducer(edited, {
    type: "set-ingredient",
    groupIndex: 0,
    ingredientIndex: 2,
    field: "name",
    value: "berries",
  });
  const removed = recipeEditDraftReducer(named, { type: "remove-ingredient", groupIndex: 0, ingredientIndex: 0 });
  const withInstruction = recipeEditDraftReducer(removed, { type: "add-instruction" });
  assert.equal(isRecipeEditDraftDirty(initial, withInstruction), true);

  assert.deepEqual(recipeEditPayload(withInstruction), {
    updatedAt: "2026-11-24T08:00:00.000Z",
    title: "Pancakes",
    ingredientGroups: [
      {
        originIndex: 0,
        label: "Batter",
        ingredients: [
          { originIndex: 1, name: "milk", sourceText: "300 ml milk" },
          { originIndex: null, name: "berries", sourceText: "berries" },
        ],
      },
    ],
    instructions: [
      { originIndex: 0, text: "Mix." },
      { originIndex: 1, text: "Cook." },
      { originIndex: null, text: "" },
    ],
  });
});

test("only a dirty recipe draft warns before browser navigation", () => {
  const event = {
    prevented: false,
    returnValue: undefined,
    preventDefault() {
      this.prevented = true;
    },
  };
  assert.equal(warnBeforeRecipeEditNavigation(false, event), false);
  assert.equal(event.prevented, false);
  assert.equal(warnBeforeRecipeEditNavigation(true, event), true);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, "");
});

test("rejected saves move focus to the error summary", () => {
  for (const status of ["validation", "conflict", "failure"]) {
    let focusCalls = 0;
    assert.equal(
      focusRecipeEditError(status, {
        focus() {
          focusCalls += 1;
        },
      }),
      true,
    );
    assert.equal(focusCalls, 1);
  }

  let focusCalls = 0;
  assert.equal(
    focusRecipeEditError("saving", {
      focus() {
        focusCalls += 1;
      },
    }),
    false,
  );
  assert.equal(focusCalls, 0);
  assert.equal(focusRecipeEditError("failure", null), false);
});
