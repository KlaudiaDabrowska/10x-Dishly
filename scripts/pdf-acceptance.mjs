import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparedRecipeField, evaluateRecipes } from "./pdf-evaluate.mjs";
import { REVIEW_ROOT, digest, privateFile } from "./pdf-extract-review.mjs";

// Two-tier acceptance (plan Phase 4 §7, 2026-10-05 amendment). Offline: reads saved run evidence only.
// Operational output carries codes, titles and indices; ingredient text never leaves private artifacts.
export const REQUIRED_FIXTURES = ["summer", "lunchboxy"];
export const REQUIRED_RUNS = 3;

class AcceptanceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireThat(condition, code) {
  if (!condition) throw new AcceptanceError(code);
}
function errorCode(error) {
  return typeof error?.code === "string" && /^[a-z][a-z0-9-]{0,99}$/.test(error.code)
    ? error.code
    : "acceptance-failed";
}

const titleKey = (value) => (typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : null);
const entryText = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const amount = (value) => (typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : value);

// Dropped household text: only a single trailing parenthetical group of the golden text may be absent.
const TRAILING_PARENTHETICAL = /\s*\([^()]*\)$/u;
const exactOrDroppedHousehold = (golden, actual, normalize = entryText) => {
  const expected = normalize(golden);
  const received = normalize(actual);
  const shortened = typeof expected === "string" ? expected.replace(TRAILING_PARENTHETICAL, "") : expected;
  return received === expected || (shortened !== expected && shortened !== "" && received === shortened);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const sourceTextShape = (entry) => {
  let text = entryText(entry.sourceText);
  for (const [marker, value] of [
    ["<quantity>", amount(entry.quantity)],
    ["<unit>", amount(entry.unit)],
  ]) {
    if (typeof value === "string" && value !== "") text = text.replace(new RegExp(escapeRegExp(value), "u"), marker);
  }
  return text;
};
const sourceTextMatches = (golden, actual) =>
  exactOrDroppedHousehold(golden.sourceText, actual.sourceText) ||
  (exactOrDroppedHousehold(golden.name, actual.name) &&
    exactOrDroppedHousehold(sourceTextShape(golden), sourceTextShape(actual)));

// Maximum bipartite matching (augmenting paths); deterministic for a given order.
function maximumMatching(rows, columns, compatible) {
  const columnOwner = new Array(columns).fill(-1);
  const augment = (row, visited) => {
    for (let column = 0; column < columns; column++) {
      if (visited[column] || !compatible(row, column)) continue;
      visited[column] = true;
      if (columnOwner[column] < 0 || augment(columnOwner[column], visited)) {
        columnOwner[column] = row;
        return true;
      }
    }
    return false;
  };
  for (let row = 0; row < rows; row++) augment(row, new Array(columns).fill(false));
  const rowMatch = new Array(rows).fill(-1);
  columnOwner.forEach((row, column) => {
    if (row >= 0) rowMatch[row] = column;
  });
  return rowMatch;
}

export function compareEntries(golden, actual) {
  const reasons = [];
  for (let index = 0; index < Math.max(golden.length, actual.length); index++) {
    if (index >= golden.length) {
      reasons.push({ code: "ingredient-added", actualIndex: index });
      continue;
    }
    if (index >= actual.length) {
      reasons.push({ code: "ingredient-missing", goldenIndex: index });
      continue;
    }
    if (!exactOrDroppedHousehold(golden[index].name, actual[index].name))
      reasons.push({ code: "ingredient-name", goldenIndex: index, actualIndex: index });
    if (
      amount(golden[index].quantity) !== amount(actual[index].quantity) ||
      amount(golden[index].unit) !== amount(actual[index].unit)
    )
      reasons.push({ code: "ingredient-amount", goldenIndex: index, actualIndex: index });
    if (!sourceTextMatches(golden[index], actual[index]))
      reasons.push({ code: "ingredient-source-text", goldenIndex: index, actualIndex: index });
  }
  return reasons;
}

function compareGroup(golden, actual) {
  const reasons = [];
  if (amount(golden.label) !== amount(actual.label)) reasons.push({ code: "ingredient-group-label" });
  return [...reasons, ...compareEntries(golden.ingredients, actual.ingredients)];
}

// Summer variants: one complete variant suffices, or each returned group is a distinct golden variant.
export function compareRecipeIngredients(golden, actual) {
  const goldenGroups = golden.ingredientGroups;
  const actualGroups = actual.ingredientGroups;
  if (goldenGroups.length <= 1) {
    if (actualGroups.length === 0) return [{ code: "ingredient-group-missing" }];
    if (actualGroups.length > 1) return [{ code: "ingredient-group-added" }];
    return compareGroup(goldenGroups[0], actualGroups[0]);
  }
  const perVariant = goldenGroups.map((group, variant) => ({
    variant,
    reasons: actualGroups.length === 1 ? compareGroup(group, actualGroups[0]) : [{ code: "variant-mismatch" }],
  }));
  if (perVariant.some((entry) => entry.reasons.length === 0)) return [];
  if (actualGroups.length >= 2 && actualGroups.length <= goldenGroups.length) {
    const fits = actualGroups.map((group) => goldenGroups.map((variant) => compareGroup(variant, group).length === 0));
    const match = maximumMatching(actualGroups.length, goldenGroups.length, (a, g) => fits[a][g]);
    if (match.every((column) => column >= 0)) return [];
  }
  const best = perVariant.reduce((left, right) => (right.reasons.length < left.reasons.length ? right : left));
  return [{ code: "variant-mismatch" }, ...best.reasons.map((reason) => ({ ...reason, variant: best.variant }))];
}

function recipesOf(document, name) {
  requireThat(document && Array.isArray(document.recipes), `invalid-${name}`);
  return document.recipes;
}

export function scoreFixture(goldenDocument, report) {
  const golden = recipesOf(goldenDocument, "reference");
  const actual = recipesOf(report?.actual, "report");
  const candidates = report.reconciliation?.candidates;
  requireThat(Array.isArray(candidates) && candidates.length === actual.length, "invalid-report");
  const reasons = [];
  const evaluation = evaluateRecipes(goldenDocument, report.actual);
  if (report.failure || report.completedBatches !== report.requiredBatches) reasons.push({ code: "run-incomplete" });
  if (
    !Array.isArray(report.ledgerBatches) ||
    report.ledgerBatches.length !== report.requiredBatches ||
    !report.ledgerBatches.every((entry) => entry?.status === "reconciled")
  )
    reasons.push({ code: "accounting-unconfirmed" });
  const goldenTitles = new Set(golden.map((recipe) => titleKey(recipe.title)));
  const seen = new Set();
  for (const [actualIndex, recipe] of actual.entries()) {
    const title = titleKey(recipe.title);
    if (seen.has(title)) reasons.push({ code: "duplicate-recipe", title, actualIndex });
    seen.add(title);
    if (!goldenTitles.has(title)) reasons.push({ code: "invented-recipe", title, actualIndex });
  }
  for (const recipe of golden) {
    const title = titleKey(recipe.title);
    const actualIndex = actual.findIndex((candidate) => titleKey(candidate.title) === title);
    if (actualIndex < 0) {
      reasons.push({ code: "missing-recipe", title });
      continue;
    }
    if (candidates[actualIndex].status !== "complete") reasons.push({ code: "incomplete-recipe", title, actualIndex });
    for (const reason of compareRecipeIngredients(recipe, actual[actualIndex]))
      reasons.push({ ...reason, title, actualRecipeIndex: actualIndex });
  }
  const recordedSemanticDifferences = new Set();
  for (const difference of evaluation.differences) {
    const field = comparedRecipeField(difference);
    if (field === null || field === "ingredientGroups") continue;
    const key = `${difference.expectedIndex ?? "none"}:${difference.actualIndex ?? "none"}:${field}`;
    if (recordedSemanticDifferences.has(key)) continue;
    recordedSemanticDifferences.add(key);
    reasons.push({
      code: "semantic-mismatch",
      field,
      ...(difference.title !== undefined ? { title: difference.title } : {}),
      ...(difference.expectedIndex !== undefined ? { expectedIndex: difference.expectedIndex } : {}),
      ...(difference.actualIndex !== undefined ? { actualIndex: difference.actualIndex } : {}),
    });
  }
  return {
    blocking: { ok: reasons.length === 0, reasons },
    reported: {
      counts: evaluation.counts,
      invalidCandidates: report.reconciliation.invalidCount,
      incompleteCandidates: candidates.filter((item) => item.status !== "complete").length,
      conflicts: report.reconciliation.conflicts?.length ?? 0,
    },
  };
}

export function acceptanceVerdict(runs, requiredFixtures = REQUIRED_FIXTURES) {
  requireThat(new Set(runs.map((run) => run.runId)).size === runs.length, "duplicate-run");
  const ids = [...new Set([...requiredFixtures, ...runs.flatMap((run) => run.fixtures.map((item) => item.fixture))])];
  const configDigests = new Set(runs.map((run) => run.configDigest));
  const fixtures = ids.map((fixture) => {
    const scored = runs.flatMap((run) => run.fixtures.filter((item) => item.fixture === fixture));
    const passed = scored.filter((item) => item.blocking.ok).length;
    const reasons = [];
    if (scored.length < REQUIRED_RUNS) reasons.push("fewer-than-three-runs");
    if (passed < scored.length) reasons.push("blocking-failure");
    return { fixture, runs: scored.length, passed, ok: reasons.length === 0, reasons };
  });
  const reasons = [];
  if (configDigests.size !== 1) reasons.push("config-digest-mismatch");
  if (fixtures.some((item) => !item.ok)) reasons.push("fixture-not-accepted");
  return { ok: reasons.length === 0, reasons, fixtures };
}

const readJson = (filename) => JSON.parse(readFileSync(filename, "utf8"));

export function loadRun(runPath, root = REVIEW_ROOT) {
  const parent = realpathSync(path.join(root, "local/extraction-review"));
  requireThat(typeof runPath === "string" && runPath.length > 0, "invalid-run-path");
  const directory = realpathSync(existsSync(runPath) ? runPath : path.join(parent, runPath));
  requireThat(directory.startsWith(parent + path.sep), "invalid-run-path");
  const runBytes = readFileSync(path.join(directory, "run.json"));
  const run = JSON.parse(runBytes);
  const completed = readJson(path.join(directory, "result.json"));
  requireThat(
    run.version === 2 &&
      completed.version === 2 &&
      run.runId === completed.runId &&
      completed.runDigest === digest(runBytes) &&
      typeof run.configDigest === "string" &&
      Array.isArray(run.fixtures) &&
      run.fixtures.length > 0 &&
      Array.isArray(completed.results),
    "incompatible-run",
  );
  const fixtures = run.fixtures.map((saved) => {
    const id = saved.fixture.id;
    const recorded = completed.results.find((item) => item.fixture === id);
    if (!recorded)
      return { fixture: id, blocking: { ok: false, reasons: [{ code: "fixture-not-run" }] }, reported: null };
    const reportBytes = readFileSync(path.join(directory, id, "report.json"));
    requireThat(digest(reportBytes) === recorded.reportDigest, "run-artifact-mismatch");
    const referenceBytes = readFileSync(privateFile(root, saved.fixture.referencePath));
    requireThat(digest(referenceBytes) === saved.fixture.referenceSha256, "reference-hash-mismatch");
    return { fixture: id, ...scoreFixture(JSON.parse(referenceBytes), JSON.parse(reportBytes)) };
  });
  return { runId: run.runId, configDigest: run.configDigest, fixtures };
}

export function parseAcceptanceArgs(args) {
  if (args.length === 1 && args[0] === "--self-test") return { selfTest: true };
  requireThat(args.length >= 2 && args.length % 2 === 0, "invalid-acceptance-arguments");
  const runs = [];
  for (let index = 0; index < args.length; index += 2) {
    requireThat(
      args[index] === "--run" && args[index + 1] && !args[index + 1].startsWith("--"),
      "invalid-acceptance-arguments",
    );
    runs.push(args[index + 1]);
  }
  return { runs };
}

export function runAcceptance(args, root = REVIEW_ROOT, requiredFixtures = REQUIRED_FIXTURES) {
  const options = parseAcceptanceArgs(args);
  if (options.selfTest) return acceptanceSelfTest();
  const runs = options.runs.map((runPath) => loadRun(runPath, root));
  return { ...acceptanceVerdict(runs, requiredFixtures), runs };
}

function syntheticGolden() {
  const entry = (name, quantity, unit, sourceText) => ({ name, quantity, unit, sourceText });
  const variant = (label, oats, milk) => ({
    label,
    ingredients: [
      entry("płatków owsianych", oats, "g", `${oats} g płatków owsianych (3 łyżki)`),
      entry("mleka", milk, "ml", `${milk} ml mleka`),
      entry("cynamon – szczypta", null, null, "cynamon – szczypta"),
    ],
  });
  const recipe = (title, ingredientGroups) => ({
    title,
    category: "breakfast",
    sourceCategory: "Śniadanie",
    pages: [1],
    ingredientGroups,
    instructions: ["Wymieszaj.", "Podawaj."],
    servings: null,
    footnotes: [],
  });
  return {
    recipes: [
      recipe("Placki", [
        {
          label: null,
          ingredients: [
            entry("mąki", "100", "g", "100g mąki"),
            entry("jajko", "1", "sztuka", "1 sztuka jajko"),
            entry("Szczypta soli", null, null, "Szczypta soli"),
          ],
        },
      ]),
      recipe("Owsianka", [
        variant("300 kcal", "40", "150"),
        variant("350 kcal", "50", "180"),
        variant("400 kcal", "60", "200"),
      ]),
    ],
  };
}

function syntheticReport(recipes, status = "complete") {
  return {
    failure: null,
    completedBatches: 1,
    requiredBatches: 1,
    ledgerBatches: [{ status: "reconciled" }],
    actual: { recipes },
    reconciliation: {
      candidates: recipes.map((candidate) => ({ candidate, status, warnings: [], batches: [0] })),
      invalidCount: 0,
      conflicts: [],
    },
  };
}

export function acceptanceSelfTest() {
  const golden = syntheticGolden();
  const clone = () => globalThis.structuredClone(golden.recipes);
  const score = (recipes, change = (report) => report) => scoreFixture(golden, change(syntheticReport(recipes)));
  const plain = (recipes) => recipes[0].ingredientGroups[0].ingredients;
  const planted = [
    ["missing recipe", (r) => r.splice(0, 1), "missing-recipe"],
    ["invented recipe", (r) => r.push({ ...globalThis.structuredClone(r[0]), title: "Inny" }), "invented-recipe"],
    ["duplicate recipe", (r) => r.push(globalThis.structuredClone(r[0])), "duplicate-recipe"],
    [
      "added entry",
      (r) => plain(r).push({ name: "oleju", quantity: "2", unit: "g", sourceText: "2g oleju" }),
      "ingredient-added",
    ],
    ["missing entry", (r) => plain(r).splice(1, 1), "ingredient-missing"],
    [
      "altered entry",
      (r) => (plain(r)[0] = { name: "cukru", quantity: "100", unit: "g", sourceText: "100g cukru" }),
      "ingredient-name",
    ],
    ["wrong quantity", (r) => (plain(r)[0].quantity = "10"), "ingredient-amount"],
    ["wrong unit", (r) => (plain(r)[1].unit = null), "ingredient-amount"],
    [
      "split continuation",
      (r) =>
        plain(r).splice(
          0,
          1,
          { name: "mą", quantity: "100", unit: "g", sourceText: "100g mą" },
          { name: "ki", quantity: null, unit: null, sourceText: "ki" },
        ),
      "ingredient-name",
    ],
    [
      "mixed-variant recipe",
      (r) => {
        const [first, second] = r[1].ingredientGroups;
        r[1].ingredientGroups = [
          { label: null, ingredients: [first.ingredients[0], second.ingredients[1], first.ingredients[2]] },
        ];
      },
      "variant-mismatch",
    ],
    [
      "repeated variant groups",
      (r) => (r[1].ingredientGroups = [r[1].ingredientGroups[0], globalThis.structuredClone(r[1].ingredientGroups[0])]),
      "variant-mismatch",
    ],
    ["ingredient group label", (r) => (r[0].ingredientGroups[0].label = "Składniki"), "ingredient-group-label"],
    ["ingredient source text", (r) => (plain(r)[0].sourceText = "100 g cukru"), "ingredient-source-text"],
    ["ingredient order", (r) => plain(r).reverse(), "ingredient-name"],
    ["instructions", (r) => (r[0].instructions[0] = "Usmaż."), "semantic-mismatch"],
    ["servings", (r) => (r[0].servings = "2"), "semantic-mismatch"],
    ["footnotes", (r) => (r[0].footnotes = ["Uwaga."]), "semantic-mismatch"],
    ["category", (r) => (r[0].category = "dinner"), "semantic-mismatch"],
    ["source category", (r) => (r[0].sourceCategory = null), "semantic-mismatch"],
    ["pages", (r) => (r[0].pages = [1, 2]), "semantic-mismatch"],
    ["missing metadata", (r) => Reflect.deleteProperty(r[0], "servings"), "semantic-mismatch"],
  ];
  for (const [name, mutate, code] of planted) {
    const recipes = clone();
    mutate(recipes);
    const result = score(recipes);
    assert.equal(result.blocking.ok, false, name);
    assert.ok(
      result.blocking.reasons.some((reason) => reason.code === code),
      name,
    );
  }
  const statusPlants = [
    [
      "incomplete recipe",
      (report) => ((report.reconciliation.candidates[1].status = "incomplete"), report),
      "incomplete-recipe",
    ],
    ["failed run", (report) => ({ ...report, failure: "provider-timeout" }), "run-incomplete"],
    [
      "unconfirmed accounting",
      (report) => ({ ...report, ledgerBatches: [{ status: "dispatch-claimed" }] }),
      "accounting-unconfirmed",
    ],
  ];
  for (const [name, change, code] of statusPlants) {
    const result = score(clone(), change);
    assert.equal(result.blocking.ok, false, name);
    assert.ok(
      result.blocking.reasons.some((reason) => reason.code === code),
      name,
    );
  }
  const controls = [
    ["identical", () => undefined],
    ["one golden variant", (r) => (r[1].ingredientGroups = [r[1].ingredientGroups[1]])],
    ["all variants as distinct groups", (r) => (r[1].ingredientGroups = [...r[1].ingredientGroups].reverse())],
    ["two variants as distinct groups", (r) => (r[1].ingredientGroups = r[1].ingredientGroups.slice(1))],
    [
      "whitespace normalization",
      (r) => {
        r[0].title = " Placki\n";
        r[0].instructions[0] = " Wymieszaj.\n";
        plain(r)[0].sourceText = "100g\n mąki";
        plain(r)[0].quantity = " 100 ";
      },
    ],
  ];
  for (const [name, mutate] of controls) {
    const recipes = clone();
    mutate(recipes);
    const result = score(recipes);
    assert.deepEqual(result.blocking, { ok: true, reasons: [] }, name);
  }
  const household = (name) => [{ name, quantity: "100", unit: "ml", sourceText: `100 ml ${name}` }];
  const dropped = (name, quantity = "100") => [{ name, quantity, unit: "ml", sourceText: `${quantity} ml ${name}` }];
  const householdCases = [
    ["dropped household parenthetical", household("napar z herbaty (pół szklanki)"), dropped("napar z herbaty"), []],
    [
      "dropped household parenthetical, wrong quantity",
      household("napar z herbaty (pół szklanki)"),
      dropped("napar z herbaty", "10"),
      ["ingredient-amount"],
    ],
    [
      "non-trailing parenthetical is not loosened",
      household("napar (pół szklanki) z herbaty"),
      dropped("napar z herbaty"),
      ["ingredient-name", "ingredient-source-text"],
    ],
  ];
  for (const [name, goldenEntries, actualEntries, codes] of householdCases)
    assert.deepEqual(
      compareEntries(goldenEntries, actualEntries).map((reason) => reason.code),
      codes,
      name,
    );
  const householdGolden = syntheticGolden();
  householdGolden.recipes[0].ingredientGroups[0].ingredients = household("napar z herbaty (pół szklanki)");
  const householdActual = globalThis.structuredClone(householdGolden.recipes);
  householdActual[0].ingredientGroups[0].ingredients = dropped("napar z herbaty");
  assert.deepEqual(scoreFixture(householdGolden, syntheticReport(householdActual)).blocking, {
    ok: true,
    reasons: [],
  });
  const run = (runId, ok = true, configDigest = "c") => ({
    runId,
    configDigest,
    fixtures: ["a", "b"].map((fixture) => ({ fixture, blocking: { ok, reasons: [] } })),
  });
  const verdicts = [
    [[run("1"), run("2"), run("3")], true],
    [[run("1"), run("2")], false],
    [[run("1"), run("2"), run("3", false)], false],
    [[run("1"), run("2"), run("3", true, "d")], false],
    [[run("1"), run("2"), run("3")].map((item) => ({ ...item, fixtures: item.fixtures.slice(0, 1) })), false],
  ];
  for (const [runs, ok] of verdicts) assert.equal(acceptanceVerdict(runs, ["a", "b"]).ok, ok);
  assert.throws(() => acceptanceVerdict([run("1"), run("1"), run("2")], ["a", "b"]), { code: "duplicate-run" });
  return {
    ok: true,
    counts: {
      plantedFailures:
        planted.length + statusPlants.length + householdCases.filter(([, , , codes]) => codes.length > 0).length,
      passingControls: controls.length + householdCases.filter(([, , , codes]) => codes.length === 0).length + 1,
      verdictCases: verdicts.length + 1,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runAcceptance(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: errorCode(error) }));
    process.exitCode = 1;
  }
}
