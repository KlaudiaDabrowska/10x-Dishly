import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const normalize = (value) => (typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : value);
const titleKey = (recipe) => normalize(recipe?.title);
const sourceKey = (recipe) =>
  recipe?.sourceStart && Number.isInteger(recipe.sourceStart.page) && Number.isInteger(recipe.sourceStart.itemIndex)
    ? `p${recipe.sourceStart.page}:i${recipe.sourceStart.itemIndex}`
    : null;
const buckets = [
  "missing",
  "invented",
  "duplicate",
  "quantitiesUnits",
  "lostVariantsStepsNotes",
  "wrongCategoriesPages",
];
const fields = {
  title: "missing",
  ingredientGroups: "quantitiesUnits",
  instructions: "lostVariantsStepsNotes",
  servings: "lostVariantsStepsNotes",
  footnotes: "lostVariantsStepsNotes",
  category: "wrongCategoriesPages",
  sourceCategory: "wrongCategoriesPages",
  pages: "wrongCategoriesPages",
};

const ALLOWED_CATEGORIES = new Set(["breakfast", "lunch", "dinner", "dessert"]);
// A reference may leave category null only when the source has no meal evidence; then the candidate
// must carry one allowed AI-inferred category. sourceCategory is still compared exactly (null).
const inferredCategoryAccepted = (expected, actual) =>
  expected.category === null && expected.sourceCategory === null && ALLOWED_CATEGORIES.has(actual?.category);

function recipeArray(value, name) {
  if (!value || typeof value !== "object" || !Array.isArray(value.recipes)) throw new Error(`${name}-recipes-required`);
  if (value.recipes.some((recipe) => !recipe || typeof recipe !== "object" || Array.isArray(recipe)))
    throw new Error(`${name}-recipe-invalid`);
  return value.recipes;
}

// Detailed values are for private local artifacts only. Never print this object to operational logs.
export function evaluateRecipes(expectedDocument, actualDocument) {
  const expected = recipeArray(expectedDocument, "expected");
  const actual = recipeArray(actualDocument, "actual");
  if (expected.some((recipe) => Object.keys(fields).some((field) => !Object.hasOwn(recipe, field))))
    throw new Error("expected-field-missing");
  const differences = [];
  const add = (context, fieldPath, kind, expectedValue, actualValue, extra = {}) => {
    differences.push({
      ...context,
      path: fieldPath,
      kind,
      expectedPresent: expectedValue !== undefined,
      actualPresent: actualValue !== undefined,
      expected: expectedValue === undefined ? null : expectedValue,
      actual: actualValue === undefined ? null : actualValue,
      ...extra,
    });
  };
  const compare = (expectedValue, actualValue, fieldPath, context) => {
    if (expectedValue === undefined || actualValue === undefined) {
      if (expectedValue !== actualValue)
        add(
          context,
          fieldPath,
          actualValue === undefined ? "missing-field" : "unexpected-field",
          expectedValue,
          actualValue,
        );
      return;
    }
    if (Array.isArray(expectedValue) && Array.isArray(actualValue)) {
      if (expectedValue.length !== actualValue.length)
        add(context, `${fieldPath}.length`, "length", expectedValue.length, actualValue.length);
      for (let index = 0; index < Math.max(expectedValue.length, actualValue.length); index++)
        compare(expectedValue[index], actualValue[index], `${fieldPath}[${index}]`, context);
      return;
    }
    if (
      expectedValue !== null &&
      actualValue !== null &&
      typeof expectedValue === "object" &&
      typeof actualValue === "object" &&
      !Array.isArray(expectedValue) &&
      !Array.isArray(actualValue)
    ) {
      for (const key of new Set([...Object.keys(expectedValue), ...Object.keys(actualValue)])) {
        const childContext = key === "label" ? { ...context, bucket: "lostVariantsStepsNotes" } : context;
        compare(expectedValue[key], actualValue[key], `${fieldPath}.${key}`, childContext);
      }
      return;
    }
    if (normalize(expectedValue) !== normalize(actualValue))
      add(context, fieldPath, "value", expectedValue, actualValue);
  };

  const expectedByTitle = new Map(expected.map((recipe, index) => [titleKey(recipe), index]));
  if (expectedByTitle.size !== expected.length) throw new Error("expected-duplicate-title");
  const actualByTitle = new Map();
  const seenSources = new Set();
  for (const [actualIndex, recipe] of actual.entries()) {
    const title = titleKey(recipe);
    const source = sourceKey(recipe);
    const context = { title, actualIndex, bucket: "duplicate" };
    if (actualByTitle.has(title))
      add(context, `recipes[${actualIndex}].title`, "duplicate", undefined, recipe.title, {
        reason: "duplicate-title",
      });
    else actualByTitle.set(title, actualIndex);
    if (source !== null) {
      if (seenSources.has(source))
        add(context, `recipes[${actualIndex}].sourceStart`, "duplicate", undefined, recipe.sourceStart, {
          reason: "duplicate-source-anchor",
          source,
        });
      seenSources.add(source);
    }
    if (!expectedByTitle.has(title))
      add(
        { ...context, bucket: "invented" },
        `recipes[${actualIndex}].title`,
        "invented-recipe",
        undefined,
        recipe.title,
      );
  }
  for (const [expectedIndex, recipe] of expected.entries()) {
    const title = titleKey(recipe);
    const actualIndex = actualByTitle.get(title);
    if (actualIndex === undefined) {
      add(
        { title, expectedIndex, bucket: "missing" },
        `recipes[${expectedIndex}].title`,
        "missing-recipe",
        recipe.title,
        undefined,
      );
      continue;
    }
    for (const [field, bucket] of Object.entries(fields)) {
      if (field === "category" && recipe.category === null && recipe.sourceCategory === null) {
        if (!inferredCategoryAccepted(recipe, actual[actualIndex]))
          add(
            { title, expectedIndex, actualIndex, bucket },
            `recipes[${expectedIndex}].category`,
            "inferred-category-required",
            null,
            actual[actualIndex].category,
          );
        continue;
      }
      compare(recipe[field], actual[actualIndex][field], `recipes[${expectedIndex}].${field}`, {
        title,
        expectedIndex,
        actualIndex,
        bucket,
      });
    }
  }

  const errors = Object.fromEntries(buckets.map((bucket) => [bucket, []]));
  const recorded = new Set();
  for (const difference of differences) {
    const { bucket, title, expectedIndex, reason, source } = difference;
    if (["missing", "invented", "duplicate"].includes(bucket)) {
      errors[bucket].push({ title, ...(reason ? { reason } : {}), ...(source ? { source } : {}) });
    } else {
      const affectedBuckets = [bucket];
      if (/^recipes\[\d+\]\.ingredientGroups(?:\.length|\[\d+\])?$/u.test(difference.path))
        affectedBuckets.push("lostVariantsStepsNotes");
      for (const affectedBucket of affectedBuckets) {
        const key = `${affectedBucket}:${expectedIndex}`;
        if (!recorded.has(key)) errors[affectedBucket].push({ title });
        recorded.add(key);
      }
    }
  }
  const counts = Object.fromEntries(Object.entries(errors).map(([name, records]) => [name, records.length]));
  counts.fieldDifferences = differences.length;
  return { ok: differences.length === 0, counts, errors, differences };
}

export function evaluationSelfTest() {
  const base = {
    title: "Recipe A",
    category: "breakfast",
    sourceCategory: "Breakfast",
    pages: [1, 2],
    sourceStart: { page: 1, itemIndex: 0 },
    ingredientGroups: [
      {
        label: "small",
        ingredients: [
          { name: "Water", quantity: "100", unit: "ml", sourceText: "100 ml Water" },
          { name: "Salt", quantity: null, unit: null, sourceText: "Salt to taste" },
        ],
      },
      { label: "large", ingredients: [{ name: "Water", quantity: "200", unit: "ml", sourceText: "200 ml Water" }] },
    ],
    instructions: ["Mix well.", "Serve cold."],
    servings: null,
    footnotes: ["Keep cold.", "Do not freeze."],
  };
  const document = { recipes: [base] };
  const clone = () => globalThis.structuredClone(document);
  const mutations = [
    [
      "title",
      (r) => {
        r.title = "Recipe B";
      },
      "recipes[0].title",
    ],
    [
      "group count",
      (r) => {
        r.ingredientGroups.pop();
      },
      "recipes[0].ingredientGroups.length",
    ],
    [
      "group label",
      (r) => {
        r.ingredientGroups[0].label = null;
      },
      "recipes[0].ingredientGroups[0].label",
    ],
    [
      "group order",
      (r) => {
        r.ingredientGroups.reverse();
      },
      "recipes[0].ingredientGroups[0].label",
    ],
    [
      "ingredient count",
      (r) => {
        r.ingredientGroups[0].ingredients.pop();
      },
      "recipes[0].ingredientGroups[0].ingredients.length",
    ],
    [
      "ingredient order",
      (r) => {
        r.ingredientGroups[0].ingredients.reverse();
      },
      "recipes[0].ingredientGroups[0].ingredients[0].name",
    ],
    ...["name", "quantity", "unit", "sourceText"].map((field) => [
      field,
      (r) => {
        r.ingredientGroups[0].ingredients[0][field] = "changed";
      },
      `recipes[0].ingredientGroups[0].ingredients[0].${field}`,
    ]),
    [
      "instructions",
      (r) => {
        r.instructions[0] = "Stir well.";
      },
      "recipes[0].instructions[0]",
    ],
    [
      "instruction boundary",
      (r) => {
        r.instructions = [r.instructions.join(" ")];
      },
      "recipes[0].instructions.length",
    ],
    [
      "instruction order",
      (r) => {
        r.instructions.reverse();
      },
      "recipes[0].instructions[0]",
    ],
    [
      "servings",
      (r) => {
        r.servings = "1";
      },
      "recipes[0].servings",
    ],
    [
      "footnotes",
      (r) => {
        r.footnotes[0] = "Keep warm.";
      },
      "recipes[0].footnotes[0]",
    ],
    [
      "footnote order",
      (r) => {
        r.footnotes.reverse();
      },
      "recipes[0].footnotes[0]",
    ],
    [
      "category",
      (r) => {
        r.category = "dinner";
      },
      "recipes[0].category",
    ],
    [
      "sourceCategory",
      (r) => {
        r.sourceCategory = "Second breakfast";
      },
      "recipes[0].sourceCategory",
    ],
    [
      "page",
      (r) => {
        r.pages[0] = 3;
      },
      "recipes[0].pages[0]",
    ],
    [
      "page order",
      (r) => {
        r.pages.reverse();
      },
      "recipes[0].pages[0]",
    ],
    [
      "null versus missing",
      (r) => {
        delete r.servings;
      },
      "recipes[0].servings",
    ],
    [
      "null versus empty",
      (r) => {
        r.servings = "";
      },
      "recipes[0].servings",
    ],
    [
      "quantity type",
      (r) => {
        r.ingredientGroups[0].ingredients[0].quantity = 100;
      },
      "recipes[0].ingredientGroups[0].ingredients[0].quantity",
    ],
  ];
  for (const [name, mutate, fieldPath] of mutations) {
    const actual = clone();
    mutate(actual.recipes[0]);
    const result = evaluateRecipes(document, actual);
    assert.equal(result.ok, false, name);
    assert.ok(
      result.differences.some((difference) => difference.path === fieldPath),
      name,
    );
  }
  for (const field of Object.keys(fields)) {
    const actual = clone();
    Reflect.deleteProperty(actual.recipes[0], field);
    assert.equal(evaluateRecipes(document, actual).ok, false, `missing ${field}`);
  }
  for (const field of ["name", "quantity", "unit", "sourceText"]) {
    const actual = clone();
    Reflect.deleteProperty(actual.recipes[0].ingredientGroups[0].ingredients[1], field);
    assert.equal(evaluateRecipes(document, actual).ok, false, `missing ingredient ${field}`);
  }
  const missing = evaluateRecipes(document, { recipes: [] });
  assert.equal(missing.counts.missing, 1);
  const invented = clone();
  invented.recipes.push({
    ...globalThis.structuredClone(base),
    title: "Invented",
    sourceStart: { page: 3, itemIndex: 0 },
  });
  assert.equal(evaluateRecipes(document, invented).counts.invented, 1);
  const duplicate = clone();
  duplicate.recipes.push(globalThis.structuredClone(base));
  assert.equal(
    evaluateRecipes(document, duplicate).errors.duplicate.filter((record) => record.reason === "duplicate-title")
      .length,
    1,
  );
  const duplicateAnchor = clone();
  duplicateAnchor.recipes.push({ ...globalThis.structuredClone(base), title: "Different title" });
  assert.equal(
    evaluateRecipes(document, duplicateAnchor).errors.duplicate.filter(
      (record) => record.reason === "duplicate-source-anchor",
    ).length,
    1,
  );
  const uncategorized = clone();
  uncategorized.recipes[0].category = null;
  uncategorized.recipes[0].sourceCategory = null;
  for (const category of ALLOWED_CATEGORIES) {
    const inferred = globalThis.structuredClone(uncategorized);
    inferred.recipes[0].category = category;
    assert.equal(evaluateRecipes(uncategorized, inferred).ok, true, `inferred ${category}`);
  }
  for (const [name, mutate] of [
    ["inferred invalid category", (r) => (r.category = "snack")],
    ["inferred null category", (r) => (r.category = null)],
    ["inferred with invented sourceCategory", (r) => (r.sourceCategory = "Obiad")],
  ]) {
    const actual = globalThis.structuredClone(uncategorized);
    actual.recipes[0].category = "lunch";
    mutate(actual.recipes[0]);
    assert.equal(evaluateRecipes(uncategorized, actual).ok, false, name);
  }
  assert.equal(evaluateRecipes(document, clone()).ok, true);
  const whitespace = JSON.parse(
    JSON.stringify(document, (_key, value) =>
      typeof value === "string" ? ` \n${value.replace(/ /gu, " \n\t ")}\t ` : value,
    ),
  );
  assert.equal(evaluateRecipes(document, whitespace).ok, true);
  return {
    ok: true,
    counts: {
      mutationCases: mutations.length + Object.keys(fields).length + 4 + 4 + 3,
      passingControls: 2 + ALLOWED_CATEGORIES.size,
    },
  };
}

function argumentsForEvaluation(argv) {
  if (argv.length === 1 && argv[0] === "--self-test") return { selfTest: true };
  if (argv.length !== 4) throw new Error("invalid-arguments");
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (
      !["--expected", "--actual"].includes(key) ||
      result[key] ||
      !argv[index + 1] ||
      argv[index + 1].startsWith("--")
    )
      throw new Error("invalid-arguments");
    result[key] = argv[index + 1];
  }
  if (!result["--expected"] || !result["--actual"]) throw new Error("invalid-arguments");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = argumentsForEvaluation(process.argv.slice(2));
    const report = args.selfTest
      ? evaluationSelfTest()
      : evaluateRecipes(
          JSON.parse(readFileSync(args["--expected"], "utf8")),
          JSON.parse(readFileSync(args["--actual"], "utf8")),
        );
    console.log(JSON.stringify({ ok: report.ok, counts: report.counts }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch {
    console.error("PDF evaluation failed: evaluation-failed");
    process.exitCode = 1;
  }
}
