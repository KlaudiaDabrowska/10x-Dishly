import assert from "node:assert/strict";
import test from "node:test";
import {
  RecipeEditValidationError,
  RecipeWriteError,
  canonicalizeRecipeEdit,
  editRecipe,
} from "../src/lib/recipes/write.ts";
import { createSupabaseRecipeWritePort } from "../src/lib/recipes/supabase-write.ts";

const recipeId = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000099";

function currentRecipe(overrides = {}) {
  return {
    id: recipeId,
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
    instructions: ["Mix."],
    currentMissingReasonCodes: [
      "missing-category",
      "missing-ingredient-content",
      "missing-variant-content",
      "missing-continuation",
      "absent-servings",
    ],
    updatedAt: "2026-11-24T08:00:00.000Z",
    ...overrides,
  };
}

function validEdit(overrides = {}) {
  return {
    updatedAt: "2026-11-24T08:00:00.000Z",
    title: "Pancakes",
    ingredientGroups: [
      {
        originIndex: 0,
        label: "Batter",
        ingredients: [
          { originIndex: 0, name: "flour", sourceText: "200 g flour" },
          { originIndex: 1, name: "milk", sourceText: "300 ml milk" },
        ],
      },
    ],
    instructions: [{ originIndex: 0, text: "Mix." }],
    ...overrides,
  };
}

test("canonical edit preserves only metadata whose source line is unchanged", () => {
  const result = canonicalizeRecipeEdit(currentRecipe(), {
    updatedAt: "2026-11-24T08:00:00.000Z",
    title: "  Pancakes  ",
    ingredientGroups: [
      {
        originIndex: 0,
        label: "  Batter  ",
        ingredients: [
          { originIndex: 0, name: "  wheat flour  ", sourceText: "  200 g flour  " },
          { originIndex: 1, name: "  oat milk  ", sourceText: "  300 ml oat milk  " },
        ],
      },
      {
        originIndex: null,
        label: "  Topping  ",
        ingredients: [{ originIndex: null, name: "  berries  ", sourceText: "  berries  " }],
      },
    ],
    instructions: [
      { originIndex: 0, text: "  Mix.  " },
      { originIndex: null, text: "  Serve with berries.  " },
    ],
  });

  assert.deepEqual(result, {
    expectedUpdatedAt: "2026-11-24T08:00:00.000Z",
    title: "Pancakes",
    ingredientGroups: [
      {
        label: "Batter",
        ingredients: [
          { name: "wheat flour", quantity: "200", unit: "g", sourceText: "200 g flour" },
          { name: "oat milk", quantity: null, unit: null, sourceText: "300 ml oat milk" },
        ],
      },
      {
        label: "Topping",
        ingredients: [{ name: "berries", quantity: null, unit: null, sourceText: "berries" }],
      },
    ],
    instructions: ["Mix.", "Serve with berries."],
    currentMissingReasonCodes: ["missing-category", "absent-servings"],
  });
});

test("invalid edits expose only allowlisted paths and codes", () => {
  const cases = [
    {
      input: { ...validEdit(), ownerId: "private-owner" },
      issue: { path: "$", code: "unexpected-field" },
    },
    {
      input: validEdit({ title: "x".repeat(2001) }),
      issue: { path: "title", code: "too-long" },
    },
    {
      input: validEdit({ title: null }),
      issue: { path: "title", code: "structural-gap" },
    },
    {
      input: validEdit({
        ingredientGroups: [
          { originIndex: 0, label: "Same", ingredients: [] },
          { originIndex: null, label: " Same ", ingredients: [] },
        ],
      }),
      issue: { path: "ingredientGroups[1].label", code: "duplicate-label" },
    },
    {
      input: validEdit({
        ingredientGroups: [
          { originIndex: null, label: "New", ingredients: [] },
          { originIndex: 0, label: "Batter", ingredients: [] },
        ],
      }),
      issue: { path: "ingredientGroups[1].originIndex", code: "out-of-order-origin" },
    },
  ];

  for (const { input, issue } of cases) {
    assert.throws(
      () => canonicalizeRecipeEdit(currentRecipe(), input),
      (error) =>
        error instanceof RecipeEditValidationError &&
        error.issues.some((actual) => actual.path === issue.path && actual.code === issue.code),
    );
  }
});

test("owner-bound adapter sends only the canonical RPC snapshot", async () => {
  const calls = [];
  const row = {
    id: recipeId,
    title: "Pancakes",
    category: "breakfast",
    ingredient_groups: [
      {
        label: "Batter",
        ingredients: [
          { name: "flour", quantity: "200", unit: "g", sourceText: "200 g flour" },
          { name: "milk", quantity: "300", unit: "ml", sourceText: "300 ml milk" },
        ],
      },
    ],
    instructions: ["Mix."],
    source_filename: "recipes.pdf",
    source_start_page: 1,
    incomplete_at_import: false,
    import_missing_reason_codes: [],
    current_missing_reason_codes: [],
    created_at: "2026-11-23T08:00:00.000Z",
    updated_at: "2026-11-24T08:00:00.000Z",
  };
  const reader = {
    from(table) {
      assert.equal(table, "recipes");
      return {
        select(selection) {
          calls.push({ type: "select", selection });
          return {
            eq(column, id) {
              assert.deepEqual([column, id], ["id", recipeId]);
              return {
                async maybeSingle() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  const admin = {
    async rpc(name, parameters) {
      calls.push({ type: "rpc", name, parameters });
      return {
        data: [{ recipe_id: recipeId, updated_at: "2026-11-24T09:00:00.000Z" }],
        error: null,
      };
    },
  };
  const port = createSupabaseRecipeWritePort(reader, admin);

  const result = await editRecipe(port, "00000000-0000-4000-8000-000000000099", recipeId, validEdit());

  assert.deepEqual(result, { recipeId, updatedAt: "2026-11-24T09:00:00.000Z" });
  assert.equal(calls[0].selection.includes("updated_at"), true);
  assert.deepEqual(calls[1], {
    type: "rpc",
    name: "update_owned_recipe",
    parameters: {
      p_owner_id: "00000000-0000-4000-8000-000000000099",
      p_recipe_id: recipeId,
      p_expected_updated_at: "2026-11-24T08:00:00.000Z",
      p_title: "Pancakes",
      p_ingredient_groups: row.ingredient_groups,
      p_instructions: row.instructions,
      p_current_missing_reason_codes: [],
    },
  });
});

test("a stale edit conflicts before origins are interpreted against the newer recipe", async () => {
  let updates = 0;
  const port = {
    async findCurrentRecipe() {
      return { status: "ok", recipe: currentRecipe({ updatedAt: "2026-11-24T10:00:00.000Z" }) };
    },
    async updateRecipe() {
      updates += 1;
      return { status: "error" };
    },
  };
  const stale = validEdit({
    updatedAt: "2026-11-24T08:00:00.000Z",
    ingredientGroups: [
      {
        originIndex: 99,
        label: "Stale group",
        ingredients: [],
      },
    ],
  });

  await assert.rejects(editRecipe(port, ownerId, recipeId, stale), (error) => {
    return error instanceof RecipeWriteError && error.code === "recipe-conflict";
  });
  assert.equal(updates, 0);
});
