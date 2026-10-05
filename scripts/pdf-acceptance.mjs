import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRecipes } from "./pdf-evaluate.mjs";
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
    .trim()
    .replace(/^[-•–—*▪●◦·]\s*/u, "")
    .toLowerCase();
const amount = (value) => (typeof value === "string" ? value.trim() : value);

const containsName = (golden, actual) => entryText(actual.sourceText).includes(entryText(golden.name));
function entryMatches(golden, actual) {
  if (!containsName(golden, actual)) return false;
  if (golden.quantity !== null && amount(actual.quantity) !== amount(golden.quantity)) return false;
  if (golden.unit !== null && amount(actual.unit) !== amount(golden.unit)) return false;
  return true;
}

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
  const match = maximumMatching(golden.length, actual.length, (g, a) => entryMatches(golden[g], actual[a]));
  const used = new Set(match.filter((column) => column >= 0));
  const reasons = [];
  for (const [goldenIndex, column] of match.entries()) {
    if (column >= 0) continue;
    const actualIndex = actual.findIndex(
      (entry, index) => !used.has(index) && containsName(golden[goldenIndex], entry),
    );
    if (actualIndex >= 0) {
      used.add(actualIndex);
      reasons.push({ code: "ingredient-amount", goldenIndex, actualIndex });
    } else reasons.push({ code: "ingredient-missing", goldenIndex });
  }
  for (let actualIndex = 0; actualIndex < actual.length; actualIndex++)
    if (!used.has(actualIndex)) reasons.push({ code: "ingredient-added", actualIndex });
  return reasons;
}

// Summer variants: one complete variant suffices, or each returned group is a distinct golden variant.
export function compareRecipeIngredients(golden, actual) {
  const goldenGroups = golden.ingredientGroups;
  const actualGroups = actual.ingredientGroups;
  const flat = actualGroups.flatMap((group) => group.ingredients);
  if (goldenGroups.length <= 1)
    return compareEntries(
      goldenGroups.flatMap((group) => group.ingredients),
      flat,
    );
  const perVariant = goldenGroups.map((group, variant) => ({
    variant,
    reasons: compareEntries(group.ingredients, flat),
  }));
  if (perVariant.some((entry) => entry.reasons.length === 0)) return [];
  if (actualGroups.length >= 2 && actualGroups.length <= goldenGroups.length) {
    const fits = actualGroups.map((group) =>
      goldenGroups.map((variant) => compareEntries(variant.ingredients, group.ingredients).length === 0),
    );
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
  return {
    blocking: { ok: reasons.length === 0, reasons },
    reported: {
      counts: evaluateRecipes(goldenDocument, report.actual).counts,
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
      "ingredient-missing",
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
      "ingredient-missing",
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
    [
      "one golden variant",
      (r) => (r[1].ingredientGroups = [{ label: null, ingredients: r[1].ingredientGroups[1].ingredients }]),
    ],
    [
      "all variants as distinct groups",
      (r) =>
        (r[1].ingredientGroups = [...r[1].ingredientGroups]
          .reverse()
          .map((group, index) => ({ ...group, label: `W${index}` }))),
    ],
    [
      "two variants as distinct groups",
      (r) => (r[1].ingredientGroups = r[1].ingredientGroups.slice(1).map((group) => ({ ...group, label: null }))),
    ],
    [
      "form-only differences",
      (r) => {
        r[0].category = "dinner";
        r[0].sourceCategory = null;
        r[0].instructions = ["Wymieszaj. Podawaj."];
        r[0].servings = "2";
        r[0].footnotes = ["Uwaga."];
        r[0].pages = [1, 2];
        r[0].ingredientGroups = [{ label: "Składniki", ingredients: [...plain(r)].reverse() }];
        plain(r)[0].name = "sól";
        plain(r)[1].sourceText = "• 1  SZTUKA\n jajko (rozmiar M)";
        plain(r)[2].sourceText = "- 100 g MĄKI pszennej";
        plain(r)[2].quantity = " 100 ";
        r[1].title = " Owsianka\n";
        r[1].ingredientGroups[0].label = null;
      },
    ],
  ];
  for (const [name, mutate] of controls) {
    const recipes = clone();
    mutate(recipes);
    const result = score(recipes);
    assert.deepEqual(result.blocking, { ok: true, reasons: [] }, name);
  }
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
      plantedFailures: planted.length + statusPlants.length,
      passingControls: controls.length,
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
