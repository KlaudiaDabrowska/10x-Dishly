import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertSchema, assertAnchors, validateFixtures, sha256, evaluationRoot } from "./pdf-fixtures.mjs";

const schema = JSON.parse(readFileSync(path.join(evaluationRoot, "reference.schema.json"), "utf8"));
function recipe(page = 7) {
  return {
    id: "synthetic-" + page,
    title: "Synthetic dish",
    category: "breakfast",
    sourceCategory: "II Śniadanie",
    pages: [page],
    anchors: [{ page, text: "Synthetic dish", occurrence: 1 }],
    ingredientGroups: ["A", "B", "C"].map((label) => ({
      label,
      ingredients: [{ name: "water", quantity: "100", unit: "ml", sourceText: "water 100 ml" }],
    })),
    instructions: ["Mix."],
    servings: null,
    footnotes: [],
  };
}
function reference() {
  return {
    version: 1,
    fixtureId: "summer",
    sourceSha256: "a".repeat(64),
    review: { status: "pending", approvedBy: null, approvedAt: null },
    recipes: [recipe()],
  };
}

test("the committed JSON Schema rejects malformed golden fields and unknown properties", () => {
  assert.doesNotThrow(() => assertSchema(reference(), schema));
  for (const mutate of [
    (r) => {
      r.version = 2;
    },
    (r) => {
      r.recipes[0].category = "snack";
    },
    (r) => {
      r.recipes[0].ingredientGroups[0].ingredients[0].quantity = 100;
    },
    (r) => {
      r.recipes[0].instructions = [];
    },
    (r) => {
      r.recipes[0].pages = [0];
    },
    (r) => {
      r.recipes[0].pages = [7, 7];
    },
    (r) => {
      r.recipes[0].anchors[0].occurrence = 0;
    },
    (r) => {
      r.recipes[0].title = "  ";
    },
    (r) => {
      delete r.recipes[0].servings;
    },
    (r) => {
      r.recipes[0].owner = "untrusted";
    },
    (r) => {
      r.review.status = "reviewed-by-agent";
    },
  ]) {
    const r = reference();
    mutate(r);
    assert.throws(() => assertSchema(r, schema));
  }
  assert.throws(() => assertSchema({}, { type: "object", unknownConstraint: true }), /Unsupported schema keyword/);
});

test("anchors validate actual page text occurrences independently of runtime reader IDs", () => {
  const r = reference();
  const fixture = { id: "summer", pageCount: 16, recipePages: [7] };
  const pages = Array(16).fill("");
  pages[6] = "Synthetic\n  dish";
  assert.doesNotThrow(() => assertAnchors(r, fixture, pages));
  r.recipes[0].anchors[0].occurrence = 2;
  assert.throws(() => assertAnchors(r, fixture, pages), /not found/);
  pages[6] += " Synthetic dish";
  assert.doesNotThrow(() => assertAnchors(r, fixture, pages));
  r.recipes[0].anchors.push({ page: 3, text: "Category heading", occurrence: 1 });
  pages[2] = "Category heading";
  assert.doesNotThrow(() => assertAnchors(r, fixture, pages));
  r.recipes.push({ ...r.recipes[0], id: "another" });
  assert.throws(() => assertAnchors(r, fixture, pages), /Duplicate recipe source anchor/);

  const multiple = reference();
  multiple.recipes.push({
    ...recipe(),
    id: "another",
    title: "Another dish",
    anchors: [{ page: 7, text: "Another dish", occurrence: 1 }],
  });
  pages[6] += " Another dish";
  assert.doesNotThrow(() => assertAnchors(multiple, fixture, pages));
});

function fixtureSet(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "dishly-pdf-fixtures-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "local"));
  writeFileSync(path.join(root, "reference.schema.json"), JSON.stringify(schema));
  const records = [
    { id: "summer", pageCount: 16, recipePages: [7, 9, 11, 13] },
    { id: "pasta", pageCount: 12, recipePages: [4, 6, 8, 9, 11] },
    { id: "low-gi", pageCount: 116, recipePages: [] },
    { id: "dietetyka-diagnostic", pageCount: 1, recipePages: [1] },
    { id: "lunchboxy", pageCount: 12, recipePages: [4, 6, 8, 10, 12] },
  ];
  const fixtures = records.map((record) => {
    const filename = record.id + ".pdf";
    const source = "synthetic " + record.id;
    const entry = {
      ...record,
      filename,
      localPath: "local/" + filename,
      sha256: sha256(source),
      byteLength: source.length,
      expectation: record.id === "low-gi" ? "reject-page-limit" : "accept",
      referencePath: null,
      referenceSha256: null,
    };
    writeFileSync(path.join(root, entry.localPath), source);
    if (record.id !== "low-gi") {
      const r = {
        ...reference(),
        fixtureId: record.id,
        sourceSha256: entry.sha256,
        recipes: record.recipePages.map(recipe),
      };
      if (record.id === "pasta")
        r.recipes.forEach((item) => {
          item.ingredientGroups = [{ ...item.ingredientGroups[0], label: null }];
        });
      entry.referencePath = "local/" + record.id + ".json";
      const bytes = JSON.stringify(r);
      entry.referenceSha256 = sha256(bytes);
      writeFileSync(path.join(root, entry.referencePath), bytes);
    }
    return entry;
  });
  const manifest = { version: 1, fixtures };
  const save = () => writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
  save();
  const inspect = (filename) => {
    const record = records.find((r) => path.basename(filename) === r.id + ".pdf");
    return { pageCount: record.pageCount, pages: Array(record.pageCount).fill("Synthetic dish") };
  };
  return { root, manifest, save, inspect };
}

test("fixture validation checks all three hashes, schemas, page counts, anchors and expected rejection", (t) => {
  const f = fixtureSet(t);
  const result = validateFixtures(f.root, f.inspect);
  assert.equal(result.length, 5);
  assert.equal(result[0].recipes, 4);
  assert.equal(result[1].recipes, 5);
  assert.equal(result[2].expectedRejection, "too-many-pages");
  assert.equal(result[0].review, "pending");
  assert.equal(result[3].recipes, 1);
  assert.equal(result[4].recipes, 5);
});

test("a null reference category is allowed only without source meal evidence", (t) => {
  const f = fixtureSet(t);
  const id = "lunchboxy";
  const entry = f.manifest.fixtures.find((fixture) => fixture.id === id);
  const file = path.join(f.root, entry.referencePath);
  const r = JSON.parse(readFileSync(file, "utf8"));
  const write = () => {
    const bytes = JSON.stringify(r);
    writeFileSync(file, bytes);
    entry.referenceSha256 = sha256(bytes);
    f.save();
  };
  r.recipes.forEach((item) => {
    item.category = null;
    item.sourceCategory = null;
  });
  write();
  assert.doesNotThrow(() => validateFixtures(f.root, f.inspect));
  r.recipes[0].sourceCategory = "Obiad";
  write();
  assert.throws(() => validateFixtures(f.root, f.inspect), /Null category requires absent source category/);
});

test("missing local files fail explicitly without weakening the offline prerequisite", (t) => {
  const f = fixtureSet(t);
  f.manifest.fixtures[0].localPath = "local/missing.pdf";
  f.save();
  assert.throws(() => validateFixtures(f.root, f.inspect), /Prerequisite missing/);
});

test("tampering with file, reference, declared page count or local path fails", (t) => {
  for (const mutate of [
    (f) => {
      f.manifest.fixtures[0].sha256 = "0".repeat(64);
    },
    (f) => {
      f.manifest.fixtures[0].referenceSha256 = "0".repeat(64);
    },
    (f) => {
      f.manifest.fixtures[0].pageCount = 15;
    },
    (f) => {
      f.manifest.fixtures[0].localPath = "local/../manifest.json";
    },
    (f) => {
      f.manifest.fixtures[2].expectation = "accept";
    },
  ]) {
    const f = fixtureSet(t);
    mutate(f);
    f.save();
    assert.throws(() => validateFixtures(f.root, f.inspect));
  }
});

test("a rehashed but invalid reference is still rejected by schema, anchors and approval metadata", (t) => {
  for (const mutate of [
    (r) => {
      r.recipes[0].category = "snack";
    },
    (r) => {
      r.recipes[0].anchors[0].text = "invented";
    },
    (r) => {
      r.recipes[0].ingredientGroups[1].label = "A";
    },
    (r) => {
      r.review.status = "approved";
    },
    (r) => {
      r.recipes.pop();
    },
  ]) {
    const f = fixtureSet(t),
      entry = f.manifest.fixtures[0],
      file = path.join(f.root, entry.referencePath);
    const r = JSON.parse(readFileSync(file, "utf8"));
    mutate(r);
    const bytes = JSON.stringify(r);
    writeFileSync(file, bytes);
    entry.referenceSha256 = sha256(bytes);
    f.save();
    assert.throws(() => validateFixtures(f.root, f.inspect));
  }
});

test("pasta rejects spurious labelled variants even when the reference hash is updated", (t) => {
  const f = fixtureSet(t),
    entry = f.manifest.fixtures[1],
    file = path.join(f.root, entry.referencePath);
  const r = JSON.parse(readFileSync(file, "utf8"));
  r.recipes[0].ingredientGroups[0].label = "Invented variant";
  const bytes = JSON.stringify(r);
  writeFileSync(file, bytes);
  entry.referenceSha256 = sha256(bytes);
  f.save();
  assert.throws(() => validateFixtures(f.root, f.inspect), /Pasta requires one unlabelled/);
});
