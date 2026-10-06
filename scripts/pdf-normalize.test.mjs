import assert from "node:assert/strict";
import test from "node:test";
import {
  isIngredientSectionHeading,
  normalizeCandidate,
  sourceIngredientName,
} from "../src/lib/pdf-processing/normalize.ts";
import { validateRecipeCandidate } from "../src/lib/pdf-processing/validation.ts";

// Synthetic geometry: PDF origin bottom-left, rows 20 units apart, 14-unit text.
const line = (itemIndex, text, x, y, width = 300, height = 14) => ({
  anchor: { page: 1, itemIndex },
  text,
  transform: [height, 0, 0, height, x, y],
  width,
  height,
  direction: "ltr",
  hasEOL: true,
});
const page = (items) => ({ page: 1, width: 400, height: 600, rotation: 0, items });
const batch = (items) => ({
  version: 2,
  index: 0,
  source: { version: 1, sha256: "a".repeat(64), filename: "s.pdf", byteLength: 1, pageCount: 1 },
  corePages: [1],
  adjacentContextPages: [],
  documentContextPages: [],
  pages: [page(items)],
});
const recipe = (overrides = {}) => ({
  version: 2,
  sourceStart: { page: 1, itemIndex: 0 },
  pages: [1],
  title: "Soup",
  category: "lunch",
  sourceCategory: null,
  ingredientGroups: [
    { label: null, ingredients: [{ name: "water", quantity: "100", unit: "ml", sourceText: "100ml water" }] },
  ],
  instructions: ["Mix."],
  servings: null,
  footnotes: [],
  missingFieldReasons: [],
  ...overrides,
});

test("only a single ingredient-section heading label becomes null; variant labels stay", () => {
  for (const label of [
    "Składniki:",
    "Składniki",
    "SKŁADNIKI DO PRZYGOTOWANIA 2 PORCJI:",
    "Ingredients:",
    "Składniki na:",
  ])
    assert.equal(isIngredientSectionHeading(label), true, label);
  for (const label of ["311 kcal", "Sos", "Składniki sosu ziołowego extra dodatkowe"])
    assert.equal(isIngredientSectionHeading(label), false, label);
  const single = normalizeCandidate(
    recipe({ ingredientGroups: [{ label: "Składniki:", ingredients: recipe().ingredientGroups[0].ingredients }] }),
    batch([line(0, "Soup", 10, 500)]),
  );
  assert.equal(single.candidate.ingredientGroups[0].label, null);
  assert.deepEqual(single.changes, ["normalized-section-heading-label"]);
  const variants = recipe({
    ingredientGroups: [
      { label: "Składniki:", ingredients: recipe().ingredientGroups[0].ingredients },
      { label: "Sos", ingredients: recipe().ingredientGroups[0].ingredients },
    ],
  });
  assert.deepEqual(normalizeCandidate(variants, batch([])).candidate.ingredientGroups, variants.ingredientGroups);
});

test("ingredient names are restored verbatim from sourceText, without household parentheticals", () => {
  assert.equal(sourceIngredientName("60g makaronu", "60", "g"), "makaronu");
  assert.equal(sourceIngredientName("40g humusu (dowolny smak)", "40", "g"), "humusu (dowolny smak)");
  assert.equal(sourceIngredientName("50 g jajko M (1 sztuka)", "50", "g"), "jajko M");
  assert.equal(sourceIngredientName("5 g majonez lekki (pół łyżeczki)", "5", "g"), "majonez lekki");
  assert.equal(sourceIngredientName("Oliwa – 1 łyżka (10 g)", "10", "g"), null);
  assert.equal(sourceIngredientName("Ulubione przyprawy", null, null), null);
  const ingredients = [
    { name: "makaron", quantity: "60", unit: "g", sourceText: "60g makaronu" },
    { name: "humusu", quantity: "40", unit: "g", sourceText: "40g humusu (dowolny smak)" },
    { name: "Oliwa", quantity: "10", unit: "g", sourceText: "Oliwa – 1 łyżka (10 g)" },
    { name: "flour", quantity: "150", unit: "g", sourceText: "150 g wheat flour" },
  ];
  const result = normalizeCandidate(recipe({ ingredientGroups: [{ label: null, ingredients }] }), batch([]));
  assert.deepEqual(
    result.candidate.ingredientGroups[0].ingredients.map((item) => item.name),
    ["makaronu", "humusu (dowolny smak)", "Oliwa", "flour"],
  );
  assert.deepEqual(result.changes, ["normalized-ingredient-name:0.0", "normalized-ingredient-name:0.1"]);
});

test("wrapped unnumbered paragraph lines merge; numbered steps and separate paragraphs do not", () => {
  const paragraph = batch([
    line(0, "Boil the water and add salt.", 10, 300),
    line(1, "Then add the pasta. Stir well.", 10, 280),
    line(2, "Serve warm.", 10, 260, 100),
  ]);
  const merged = normalizeCandidate(
    recipe({ instructions: ["Boil the water and add salt.", "Then add the pasta. Stir well. Serve warm."] }),
    paragraph,
  );
  assert.deepEqual(merged.candidate.instructions, [
    "Boil the water and add salt. Then add the pasta. Stir well. Serve warm.",
  ]);
  assert.deepEqual(merged.changes, ["merged-wrapped-instruction:0"]);

  const numbered = batch([
    line(0, "1.", 10, 300, 10),
    line(1, "Boil the water.", 30, 300),
    line(2, "2.", 10, 280, 10),
    line(3, "Add the pasta.", 30, 280),
    line(4, "3. Serve warm right away.", 10, 260),
  ]);
  const steps = ["Boil the water.", "Add the pasta.", "Serve warm right away."];
  assert.deepEqual(normalizeCandidate(recipe({ instructions: steps }), numbered).candidate.instructions, steps);

  const separated = batch([line(0, "Boil the water first.", 10, 300), line(1, "Later serve it warm.", 10, 200)]);
  const apart = ["Boil the water first.", "Later serve it warm."];
  assert.deepEqual(normalizeCandidate(recipe({ instructions: apart }), separated).candidate.instructions, apart);

  const columns = batch([
    line(0, "Boil the water first.", 10, 300, 150),
    line(1, "Later serve it warm.", 250, 280, 140),
  ]);
  assert.deepEqual(normalizeCandidate(recipe({ instructions: apart }), columns).candidate.instructions, apart);

  const unknown = ["Text not in the source.", "Also invented."];
  assert.deepEqual(normalizeCandidate(recipe({ instructions: unknown }), paragraph).candidate.instructions, unknown);
});

test("geometry-derived ingredient continuation lines merge into the previous entry", () => {
  const list = batch([
    line(0, "40g humusu", 40, 300, 70),
    line(1, "(dowolny smak)", 40, 284, 90),
    line(2, "90g tofu", 40, 268, 50),
    line(3, "wędzononego", 40, 252, 80),
    line(4, "Kilka listków sałaty", 40, 236, 115),
    line(5, "Ulubione przyprawy", 40, 220, 110),
    line(6, "szczypta soli", 40, 204, 80),
  ]);
  const ingredients = [
    { name: "humusu", quantity: "40", unit: "g", sourceText: "40g humusu" },
    { name: "(dowolny smak)", quantity: null, unit: null, sourceText: "(dowolny smak)" },
    { name: "tofu", quantity: "90", unit: "g", sourceText: "90g tofu" },
    { name: "wędzononego", quantity: null, unit: null, sourceText: "wędzononego" },
    { name: "sałaty", quantity: null, unit: null, sourceText: "Kilka listków sałaty" },
    { name: "Ulubione przyprawy", quantity: null, unit: null, sourceText: "Ulubione przyprawy" },
    { name: "szczypta soli", quantity: null, unit: null, sourceText: "szczypta soli" },
  ];
  const result = normalizeCandidate(recipe({ ingredientGroups: [{ label: null, ingredients }] }), list);
  assert.deepEqual(result.candidate.ingredientGroups[0].ingredients, [
    { name: "humusu (dowolny smak)", quantity: "40", unit: "g", sourceText: "40g humusu (dowolny smak)" },
    { name: "tofu wędzononego", quantity: "90", unit: "g", sourceText: "90g tofu wędzononego" },
    ingredients[4],
    {
      name: "Ulubione przyprawy szczypta soli",
      quantity: null,
      unit: null,
      sourceText: "Ulubione przyprawy szczypta soli",
    },
  ]);
  assert.deepEqual(result.changes, [
    "merged-ingredient-continuation:0.0",
    "merged-ingredient-continuation:0.1",
    "merged-ingredient-continuation:0.3",
  ]);
});

test("independent, bulleted, quantified, distant or other-column ingredient lines never merge", () => {
  const base = { name: "humusu", quantity: "40", unit: "g", sourceText: "40g humusu" };
  const tail = (sourceText, quantity = null, unit = null) => ({ name: sourceText, quantity, unit, sourceText });
  const cases = [
    // Capitalized independent item directly below.
    [[line(0, "40g humusu", 40, 300, 70), line(1, "Kilka listków sałaty", 40, 284, 115)], tail("Kilka listków sałaty")],
    // Bulleted list item directly below.
    [[line(0, "40g humusu", 40, 300, 70), line(1, "- rukola – szczypta", 40, 284, 100)], tail("- rukola – szczypta")],
    // Lowercase but carries its own amount.
    [[line(0, "40g humusu", 40, 300, 70), line(1, "sól 2 g", 40, 284, 60)], tail("sól 2 g", "2", "g")],
    // Far below, not the next visual line.
    [[line(0, "40g humusu", 40, 300, 70), line(1, "(dowolny smak)", 40, 200, 90)], tail("(dowolny smak)")],
    // Next row, but in another column.
    [[line(0, "40g humusu", 40, 300, 70), line(1, "(dowolny smak)", 250, 284, 90)], tail("(dowolny smak)")],
    // Overlapping but indented: not left-aligned with the line it would continue.
    [[line(0, "40g humusu", 40, 300, 70), line(1, "(dowolny smak)", 80, 284, 90)], tail("(dowolny smak)")],
    // Text not present in the source at all.
    [[line(0, "40g humusu", 40, 300, 70)], tail("(invented)")],
  ];
  for (const [items, entry] of cases) {
    const ingredients = [base, entry];
    const result = normalizeCandidate(recipe({ ingredientGroups: [{ label: null, ingredients }] }), batch(items));
    assert.deepEqual(result.candidate.ingredientGroups[0].ingredients, ingredients, entry.sourceText);
    assert.deepEqual(result.changes, [], entry.sourceText);
  }
  // Groups are independent: a group's first entry never merges into the previous group.
  const groups = [
    { label: "A", ingredients: [base] },
    { label: "B", ingredients: [tail("(dowolny smak)")] },
  ];
  const grouped = normalizeCandidate(
    recipe({ ingredientGroups: groups }),
    batch([line(0, "40g humusu", 40, 300, 70), line(1, "(dowolny smak)", 40, 284, 90)]),
  );
  assert.deepEqual(grouped.candidate.ingredientGroups, groups);
});

test("validation applies the normalization once and reports it as warnings", () => {
  const result = validateRecipeCandidate(
    recipe({ ingredientGroups: [{ label: "Składniki:", ingredients: recipe().ingredientGroups[0].ingredients }] }),
    batch([line(0, "Soup", 10, 500)]),
  );
  assert.equal(result.status, "complete");
  assert.equal(result.candidate.ingredientGroups[0].label, null);
  assert.ok(result.warnings.includes("normalized-section-heading-label"));
});
