import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import {
  acceptanceSelfTest,
  acceptanceVerdict,
  compareRecipeIngredients,
  loadRun,
  parseAcceptanceArgs,
  runAcceptance,
  scoreFixture,
} from "./pdf-acceptance.mjs";
import { digest } from "./pdf-extract-review.mjs";

const script = fileURLToPath(new URL("./pdf-acceptance.mjs", import.meta.url));
const entry = (name, quantity, unit, sourceText) => ({ name, quantity, unit, sourceText });
const recipe = (title, ingredientGroups) => ({
  title,
  category: "lunch",
  sourceCategory: null,
  pages: [1],
  sourceStart: { page: 1, itemIndex: 0 },
  ingredientGroups,
  instructions: ["Mix."],
  servings: null,
  footnotes: [],
});
const golden = () => ({
  recipes: [
    recipe("PRIVATE_TITLE", [
      {
        label: null,
        ingredients: [
          entry("PRIVATE_WATER", "100", "ml", "100 ml PRIVATE_WATER"),
          entry("Salt", null, null, "Salt to taste"),
        ],
      },
    ]),
  ],
});
const report = (recipes, status = "complete") => ({
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
});

test("self-test detects every planted blocking failure and passes variant and form-only controls", () => {
  const result = acceptanceSelfTest();
  assert.equal(result.ok, true);
  assert.ok(result.counts.plantedFailures >= 12);
  assert.ok(result.counts.passingControls >= 4);
});

test("ingredient entries match on contained name and exact golden amounts, one-to-one", () => {
  const expected = golden();
  const pass = scoreFixture(expected, report(golden().recipes));
  assert.deepEqual(pass.blocking, { ok: true, reasons: [] });
  assert.equal(pass.reported.counts.fieldDifferences, 0);

  const formOnly = golden().recipes;
  formOnly[0].ingredientGroups[0].ingredients = [
    entry("salt", null, null, "• SALT  to\n taste"),
    entry("water", " 100", "ml ", "- 100 ml private_water (1 glass)"),
  ];
  const tolerated = scoreFixture(expected, report(formOnly));
  assert.equal(tolerated.blocking.ok, true);
  assert.ok(tolerated.reported.counts.fieldDifferences > 0);

  for (const [mutate, code] of [
    [(items) => (items[0].quantity = "10"), "ingredient-amount"],
    [(items) => (items[0].unit = "g"), "ingredient-amount"],
    [(items) => items.push(entry("Oil", "2", "g", "2g Oil")), "ingredient-added"],
    [(items) => items.push(globalThis.structuredClone(items[1])), "ingredient-added"],
    [(items) => items.pop(), "ingredient-missing"],
    [(items) => (items[1].sourceText = "Pepper"), "ingredient-missing"],
  ]) {
    const recipes = golden().recipes;
    mutate(recipes[0].ingredientGroups[0].ingredients);
    const result = scoreFixture(expected, report(recipes));
    assert.equal(result.blocking.ok, false, code);
    assert.ok(
      result.blocking.reasons.some((reason) => reason.code === code),
      code,
    );
  }
});

test("missing, invented, duplicate and incomplete recipes are blocking", () => {
  const expected = golden();
  assert.equal(scoreFixture(expected, report([])).blocking.reasons[0].code, "missing-recipe");
  const invented = [...golden().recipes, { ...golden().recipes[0], title: "Other" }];
  assert.ok(scoreFixture(expected, report(invented)).blocking.reasons.some((r) => r.code === "invented-recipe"));
  const duplicate = [...golden().recipes, ...golden().recipes];
  assert.ok(scoreFixture(expected, report(duplicate)).blocking.reasons.some((r) => r.code === "duplicate-recipe"));
  assert.deepEqual(scoreFixture(expected, report(golden().recipes, "incomplete")).blocking.reasons, [
    { code: "incomplete-recipe", title: "PRIVATE_TITLE", actualIndex: 0 },
  ]);
});

test("variant recipes pass with one golden variant or distinct variant groups, never mixed", () => {
  const variant = (amount) => ({
    label: `${amount} kcal`,
    ingredients: [entry("oats", amount, "g", `${amount} g oats`), entry("milk", "100", "ml", "100 ml milk")],
  });
  const expected = recipe("Bowl", [variant("40"), variant("50"), variant("60")]);
  const actual = (groups) => ({ ...expected, ingredientGroups: groups });
  assert.deepEqual(compareRecipeIngredients(expected, actual([{ ...variant("50"), label: null }])), []);
  assert.deepEqual(compareRecipeIngredients(expected, actual([variant("60"), variant("40")])), []);
  assert.deepEqual(compareRecipeIngredients(expected, actual([variant("60"), variant("50"), variant("40")])), []);
  const mixed = { label: null, ingredients: [variant("40").ingredients[0], variant("50").ingredients[0]] };
  assert.equal(compareRecipeIngredients(expected, actual([mixed]))[0].code, "variant-mismatch");
  assert.equal(compareRecipeIngredients(expected, actual([variant("40"), variant("40")]))[0].code, "variant-mismatch");
  const merged = { label: null, ingredients: [...variant("40").ingredients, ...variant("50").ingredients] };
  assert.equal(compareRecipeIngredients(expected, actual([merged]))[0].code, "variant-mismatch");
});

test("overall verdict requires three passing runs per fixture on one recorded configuration", () => {
  const run = (runId, ok = true, configDigest = "c") => ({
    runId,
    configDigest,
    fixtures: [{ fixture: "a", blocking: { ok, reasons: [] } }],
  });
  assert.equal(acceptanceVerdict([run("1"), run("2"), run("3")], ["a"]).ok, true);
  assert.deepEqual(acceptanceVerdict([run("1"), run("2")], ["a"]).fixtures[0].reasons, ["fewer-than-three-runs"]);
  assert.deepEqual(acceptanceVerdict([run("1"), run("2"), run("3", false)], ["a"]).fixtures[0].reasons, [
    "blocking-failure",
  ]);
  assert.deepEqual(acceptanceVerdict([run("1"), run("2"), run("3", true, "d")], ["a"]).reasons, [
    "config-digest-mismatch",
  ]);
  assert.equal(acceptanceVerdict([run("1"), run("2"), run("3")], ["a", "b"]).ok, false);
});

function savedRun(root, runId, actualRecipes, tamper = {}) {
  mkdirSync(path.join(root, "local/references"), { recursive: true });
  const referenceBytes = JSON.stringify(golden());
  writeFileSync(path.join(root, "local/references/f.json"), referenceBytes);
  const directory = path.join(root, "local/extraction-review", runId);
  mkdirSync(path.join(directory, "f"), { recursive: true });
  const fixture = {
    id: "f",
    referencePath: "local/references/f.json",
    referenceSha256: tamper.referenceSha256 ?? digest(referenceBytes),
  };
  const runBytes = JSON.stringify({ version: 2, runId, configDigest: "config", fixtures: [{ fixture }] });
  writeFileSync(path.join(directory, "run.json"), runBytes);
  const reportBytes = JSON.stringify(report(actualRecipes));
  writeFileSync(path.join(directory, "f/report.json"), reportBytes);
  writeFileSync(
    path.join(directory, "result.json"),
    JSON.stringify({
      version: 2,
      runId,
      runDigest: digest(runBytes),
      results: [{ fixture: "f", reportDigest: tamper.reportDigest ?? digest(reportBytes) }],
    }),
  );
  return directory;
}

test("saved runs are verified against recorded digests and the pinned reference before scoring", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "pdf-acceptance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directories = ["r1", "r2", "r3"].map((id) => savedRun(root, id, golden().recipes));
  const args = directories.flatMap((directory) => ["--run", directory]);
  assert.deepEqual(runAcceptance(args, root).reasons, ["fixture-not-accepted"]);
  const accepted = runAcceptance(args, root, ["f"]);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.fixtures, [{ fixture: "f", runs: 3, passed: 3, ok: true, reasons: [] }]);
  assert.equal(loadRun("r1", root).fixtures[0].blocking.ok, true);
  assert.throws(() => loadRun(savedRun(root, "bad-report", golden().recipes, { reportDigest: "x" }), root), {
    code: "run-artifact-mismatch",
  });
  assert.throws(() => loadRun(savedRun(root, "bad-reference", golden().recipes, { referenceSha256: "x" }), root), {
    code: "reference-hash-mismatch",
  });
  assert.throws(() => loadRun(root, root), { code: "invalid-run-path" });
  const result = JSON.parse(readFileSync(path.join(directories[0], "result.json")));
  writeFileSync(path.join(directories[0], "result.json"), JSON.stringify({ ...result, runDigest: "x" }));
  assert.throws(() => loadRun(directories[0], root), { code: "incompatible-run" });
});

test("CLI validates arguments, exits nonzero on failure and keeps ingredient text out of output", () => {
  for (const args of [[], ["--run"], ["--self-test", "x"], ["--other", "x"], ["--run", "--self-test"]])
    assert.throws(() => parseAcceptanceArgs(args), { code: "invalid-acceptance-arguments" });
  const selfTest = spawnSync(process.execPath, [script, "--self-test"], { encoding: "utf8" });
  assert.equal(selfTest.status, 0);
  assert.equal(JSON.parse(selfTest.stdout).ok, true);
  const invalid = spawnSync(process.execPath, [script, "--oops"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.deepEqual(JSON.parse(invalid.stderr), { ok: false, error: "invalid-acceptance-arguments" });
  const recipes = golden().recipes;
  recipes[0].ingredientGroups[0].ingredients[0].quantity = "1";
  const scored = scoreFixture(golden(), report(recipes));
  assert.equal(scored.blocking.ok, false);
  assert.doesNotMatch(JSON.stringify(scored), /PRIVATE_WATER|Salt/);
});
