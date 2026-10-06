import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { evaluateRecipes, evaluationSelfTest } from "./pdf-evaluate.mjs";

const base = () => ({
  recipes: [
    {
      title: "PRIVATE_RECIPE_MARKER",
      category: "lunch",
      sourceCategory: null,
      pages: [2],
      sourceStart: { page: 2, itemIndex: 3 },
      ingredientGroups: [
        { label: null, ingredients: [{ name: "Water", quantity: "20", unit: "ml", sourceText: "20 ml Water" }] },
      ],
      instructions: ["Mix."],
      servings: null,
      footnotes: [],
    },
  ],
});

test("self-test independently plants every compared field, order and missing-content failure", () => {
  const result = evaluationSelfTest();
  assert.equal(result.ok, true);
  assert.ok(result.counts.mutationCases >= 30);
  assert.equal(result.counts.passingControls, 6);
});

test("null reference category accepts only an allowed inferred category without source meal evidence", () => {
  const expected = base();
  expected.recipes[0].category = null;
  const actual = base();
  actual.recipes[0].category = "dessert";
  assert.equal(evaluateRecipes(expected, actual).ok, true);
  actual.recipes[0].sourceCategory = "Obiad";
  assert.equal(evaluateRecipes(expected, actual).ok, false);
  actual.recipes[0].sourceCategory = null;
  actual.recipes[0].category = null;
  assert.equal(evaluateRecipes(expected, actual).ok, false);
  const categorized = base();
  actual.recipes[0].category = "dinner";
  assert.ok(evaluateRecipes(categorized, actual).differences.some((d) => d.path === "recipes[0].category"));
});

test("a quantity mutation reports the exact indexed field and only its legacy bucket", () => {
  const expected = base();
  const actual = base();
  actual.recipes[0].ingredientGroups[0].ingredients[0].quantity = "21";
  const result = evaluateRecipes(expected, actual);
  assert.equal(result.ok, false);
  assert.deepEqual(result.counts, {
    missing: 0,
    invented: 0,
    duplicate: 0,
    quantitiesUnits: 1,
    lostVariantsStepsNotes: 0,
    wrongCategoriesPages: 0,
    fieldDifferences: 1,
  });
  assert.deepEqual(result.differences, [
    {
      title: "PRIVATE_RECIPE_MARKER",
      expectedIndex: 0,
      actualIndex: 0,
      bucket: "quantitiesUnits",
      path: "recipes[0].ingredientGroups[0].ingredients[0].quantity",
      kind: "value",
      expectedPresent: true,
      actualPresent: true,
      expected: "20",
      actual: "21",
    },
  ]);
});

test("each legacy category and structural bucket identifies the precise differing field", () => {
  for (const [field, replacement, bucket] of [
    ["sourceCategory", "Lunch", "wrongCategoriesPages"],
    ["servings", "1", "lostVariantsStepsNotes"],
  ]) {
    const actual = base();
    actual.recipes[0][field] = replacement;
    const result = evaluateRecipes(base(), actual);
    assert.equal(result.counts[bucket], 1);
    assert.equal(result.differences.length, 1);
    assert.equal(result.differences[0].path, `recipes[0].${field}`);
  }
  const actual = base();
  actual.recipes[0].ingredientGroups[0].label = "Invented label";
  const result = evaluateRecipes(base(), actual);
  assert.equal(result.counts.lostVariantsStepsNotes, 1);
  assert.equal(result.counts.quantitiesUnits, 0);
  assert.equal(result.differences[0].path, "recipes[0].ingredientGroups[0].label");
});

test("missing null fields and empty arrays remain distinct in serialized private evidence", () => {
  for (const field of ["servings", "sourceCategory", "footnotes"]) {
    const actual = base();
    Reflect.deleteProperty(actual.recipes[0], field);
    const result = JSON.parse(JSON.stringify(evaluateRecipes(base(), actual)));
    assert.equal(result.ok, false);
    assert.equal(result.differences.length, 1);
    assert.equal(result.differences[0].expectedPresent, true);
    assert.equal(result.differences[0].actualPresent, false);
    assert.equal(result.differences[0].kind, "missing-field");
  }
});

test("top-level reference/runtime metadata does not enter content comparison", () => {
  const expected = base();
  expected.recipes[0].id = "golden-id";
  expected.recipes[0].anchors = [{ page: 2, text: "PRIVATE_RECIPE_MARKER", occurrence: 1 }];
  delete expected.recipes[0].sourceStart;
  const actual = base();
  actual.recipes[0].version = 2;
  actual.recipes[0].missingFieldReasons = [];
  assert.equal(evaluateRecipes(expected, actual).ok, true);
});

test("title matching is exact after whitespace only", () => {
  const expected = base();
  const actual = base();
  actual.recipes[0].title = actual.recipes[0].title.toLowerCase();
  const result = evaluateRecipes(expected, actual);
  assert.equal(result.counts.missing, 1);
  assert.equal(result.counts.invented, 1);
  assert.ok(result.differences.every((difference) => difference.path === "recipes[0].title"));
});

test("malformed documents and ambiguous reference titles fail rather than pass vacuously", () => {
  assert.throws(() => evaluateRecipes({}, base()), /expected-recipes-required/);
  assert.throws(() => evaluateRecipes({ recipes: [{}] }, { recipes: [{}] }), /expected-field-missing/);
  assert.throws(() => evaluateRecipes(base(), { recipes: [null] }), /actual-recipe-invalid/);
  const duplicateReference = base();
  duplicateReference.recipes.push(globalThis.structuredClone(duplicateReference.recipes[0]));
  assert.throws(() => evaluateRecipes(duplicateReference, base()), /expected-duplicate-title/);
});

test("CLI reports truthful status and aggregate counts without recipe content or parser errors", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pdf-evaluate-"));
  const expectedPath = path.join(directory, "expected.json");
  const actualPath = path.join(directory, "actual.json");
  const script = fileURLToPath(new URL("./pdf-evaluate.mjs", import.meta.url));
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  const args = ["--expected", expectedPath, "--actual", actualPath];
  try {
    writeFileSync(expectedPath, JSON.stringify(base()), { mode: 0o600 });
    writeFileSync(actualPath, JSON.stringify(base()), { mode: 0o600 });
    const passing = run(args);
    assert.equal(passing.status, 0);
    assert.equal(JSON.parse(passing.stdout).ok, true);
    const actual = base();
    actual.recipes[0].instructions = ["PRIVATE_INSTRUCTION_MARKER"];
    writeFileSync(actualPath, JSON.stringify(actual));
    const failing = run(args);
    assert.equal(failing.status, 1);
    assert.deepEqual(Object.keys(JSON.parse(failing.stdout)), ["ok", "counts"]);
    assert.equal(JSON.parse(failing.stdout).ok, false);
    assert.doesNotMatch(passing.stdout + failing.stdout + failing.stderr, /PRIVATE_|Mix/);
    writeFileSync(actualPath, "PRIVATE_MALFORMED_JSON");
    const malformed = run(args);
    assert.equal(malformed.status, 1);
    assert.equal(malformed.stdout, "");
    assert.equal(malformed.stderr, "PDF evaluation failed: evaluation-failed\n");
    for (const invalidArgs of [
      [],
      ["--self-test", "ignored"],
      ["--unexpected", expectedPath, "--actual", actualPath],
    ]) {
      const invalid = run(invalidArgs);
      assert.equal(invalid.status, 1);
      assert.equal(invalid.stderr, "PDF evaluation failed: evaluation-failed\n");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
