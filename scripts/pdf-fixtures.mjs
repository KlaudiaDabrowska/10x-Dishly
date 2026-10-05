import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { hasValidGroupLabels } from "../src/lib/pdf-processing/contracts.ts";
import { fileLimitFailure } from "../src/lib/pdf-processing/limits.ts";

export const evaluationRoot = fileURLToPath(new URL("../evaluation/validate-pdf-processing/", import.meta.url));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const normalizeText = (value) => value.normalize("NFC").replace(/\s+/gu, " ").trim();
const fail = (message) => {
  throw new Error(message);
};
const requireThat = (condition, message) => {
  if (!condition) fail(message);
};

// Small, fail-closed evaluator for the exact JSON Schema vocabulary used by the reference schema.
// Unsupported keywords fail instead of silently weakening reference validation.
export function assertSchema(value, schema, at = "$", schemaRoot = true) {
  const keywords = new Set([
    "$schema",
    "title",
    "type",
    "const",
    "enum",
    "anyOf",
    "minimum",
    "minLength",
    "pattern",
    "minItems",
    "uniqueItems",
    "items",
    "required",
    "properties",
    "additionalProperties",
  ]);
  for (const key of Object.keys(schema)) requireThat(keywords.has(key), "Unsupported schema keyword: " + key);
  if (schemaRoot && schema.$schema)
    requireThat(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "Unsupported schema dialect");
  if (schema.anyOf) {
    requireThat(
      schema.anyOf.some((branch) => {
        try {
          assertSchema(value, branch, at, false);
          return true;
        } catch {
          return false;
        }
      }),
      at + ": no schema alternative matches",
    );
  }
  if ("const" in schema) requireThat(value === schema.const, at + ": incorrect constant");
  if (schema.enum) requireThat(schema.enum.includes(value), at + ": unsupported value");
  if (schema.type) {
    const matches =
      schema.type === "null"
        ? value === null
        : schema.type === "array"
          ? Array.isArray(value)
          : schema.type === "integer"
            ? Number.isSafeInteger(value)
            : schema.type === "object"
              ? value !== null && typeof value === "object" && !Array.isArray(value)
              : typeof value === schema.type;
    requireThat(matches, at + ": expected " + schema.type);
  }
  if (typeof value === "number" && schema.minimum !== undefined)
    requireThat(value >= schema.minimum, at + ": below minimum");
  if (typeof value === "string") {
    if (schema.minLength !== undefined) requireThat([...value].length >= schema.minLength, at + ": empty string");
    if (schema.pattern) requireThat(new RegExp(schema.pattern, "u").test(value), at + ": pattern mismatch");
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) requireThat(value.length >= schema.minItems, at + ": too few items");
    if (schema.uniqueItems)
      requireThat(new Set(value.map((item) => JSON.stringify(item))).size === value.length, at + ": duplicate items");
    if (schema.items) value.forEach((item, index) => assertSchema(item, schema.items, at + "[" + index + "]", false));
  } else if (value && typeof value === "object") {
    for (const key of schema.required ?? []) requireThat(Object.hasOwn(value, key), at + ": missing " + key);
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties && Object.hasOwn(schema.properties, key))
        assertSchema(child, schema.properties[key], at + "." + key, false);
      else requireThat(schema.additionalProperties !== false, at + ": unexpected " + key);
    }
  }
}

function localFile(root, relative) {
  requireThat(
    typeof relative === "string" && relative.startsWith("local/") && !relative.split("/").includes(".."),
    "Fixture path must stay under local/",
  );
  const localRoot = path.resolve(root, "local");
  const target = path.resolve(root, relative);
  let resolved;
  try {
    resolved = realpathSync(target);
  } catch {
    fail("Prerequisite missing: " + relative);
  }
  const actualLocalRoot = realpathSync(localRoot);
  requireThat(resolved.startsWith(actualLocalRoot + path.sep), "Fixture path escapes local/");
  return resolved;
}

export function inspectPdf(filename) {
  try {
    const info = execFileSync("pdfinfo", [filename], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
    });
    const match = /^Pages:\s+(\d+)$/m.exec(info);
    requireThat(match, "No PDF page count");
    const text = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", filename, "-"], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { pageCount: Number(match[1]), pages: text.split("\f") };
  } catch {
    fail("Prerequisite failure: readable PDF and Poppler pdfinfo/pdftotext are required");
  }
}

export function assertAnchors(reference, fixture, pages) {
  const ids = new Set();
  const starts = new Set();
  for (const recipe of reference.recipes) {
    requireThat(!ids.has(recipe.id), "Duplicate recipe id");
    ids.add(recipe.id);
    requireThat(
      recipe.pages.every((page) => page <= fixture.pageCount),
      "Recipe page outside document",
    );
    requireThat(
      recipe.pages.every((page, index) => index === 0 || recipe.pages[index - 1] < page),
      "Recipe pages must be ordered",
    );
    requireThat(hasValidGroupLabels(recipe.ingredientGroups), "Variants require distinct nonempty labels");
    requireThat(
      recipe.category !== null || recipe.sourceCategory === null,
      "Null category requires absent source category",
    );
    requireThat(recipe.anchors[0].page === recipe.pages[0], "First anchor must locate recipe start");
    const start = recipe.anchors[0];
    const key = JSON.stringify([start.page, normalizeText(start.text), start.occurrence]);
    requireThat(!starts.has(key), "Duplicate recipe source anchor");
    starts.add(key);
    for (const anchor of recipe.anchors) {
      requireThat(anchor.page <= fixture.pageCount, "Anchor page outside document");
      const source = normalizeText(pages[anchor.page - 1] ?? "");
      const needle = normalizeText(anchor.text);
      let position = -1;
      for (let occurrence = 0; occurrence < anchor.occurrence; occurrence++) {
        position = source.indexOf(needle, position + 1);
        requireThat(position !== -1, "Source anchor not found on page " + anchor.page);
      }
    }
  }
  const actualPages = [...new Set(reference.recipes.map((recipe) => recipe.pages[0]))].sort((a, b) => a - b);
  requireThat(
    JSON.stringify(actualPages) === JSON.stringify([...fixture.recipePages].sort((a, b) => a - b)),
    "Expected recipe pages/count differ",
  );
  if (fixture.id === "pasta")
    requireThat(
      reference.recipes.every(
        (recipe) => recipe.ingredientGroups.length === 1 && recipe.ingredientGroups[0].label === null,
      ),
      "Pasta requires one unlabelled ingredient group per recipe",
    );
  if (fixture.id === "summer")
    requireThat(
      reference.recipes.every((recipe) => recipe.ingredientGroups.length === 3),
      "Summer requires three labelled variants per recipe",
    );
}

const string = { type: "string", minLength: 1 };
const nullableString = { anyOf: [string, { type: "null" }] };
const hash = { type: "string", pattern: "^[0-9a-f]{64}$" };
const properties = {
  id: { enum: ["summer", "pasta", "low-gi", "dietetyka-diagnostic", "lunchboxy"] },
  filename: string,
  localPath: string,
  sha256: hash,
  byteLength: { type: "integer", minimum: 1 },
  pageCount: { type: "integer", minimum: 1 },
  expectation: { enum: ["accept", "accept-pending-reference", "reject-page-limit"] },
  recipePages: { type: "array", items: { type: "integer", minimum: 1 }, uniqueItems: true },
  referencePath: nullableString,
  referenceSha256: { anyOf: [hash, { type: "null" }] },
};
const manifestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "fixtures"],
  properties: {
    version: { const: 1 },
    fixtures: {
      type: "array",
      minItems: 3,
      items: { type: "object", additionalProperties: false, required: Object.keys(properties), properties },
    },
  },
};

const observedRecipePages = {
  summer: [7, 9, 11, 13],
  pasta: [4, 6, 8, 9, 11],
  "low-gi": [
    [8, 22],
    [24, 38],
    [40, 69],
    [71, 85],
    [87, 101],
    [103, 112],
  ].flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, index) => first + index)),
  "dietetyka-diagnostic": [1],
  lunchboxy: [4, 6, 8, 10, 12],
};

export function validateFixtures(root = evaluationRoot, inspect = inspectPdf) {
  let manifest, schema;
  try {
    manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
    schema = JSON.parse(readFileSync(path.join(root, "reference.schema.json"), "utf8"));
  } catch {
    fail("Prerequisite missing: readable manifest.json and reference.schema.json");
  }
  assertSchema(manifest, manifestSchema);
  requireThat(
    manifest.fixtures.length === 5 &&
      new Set(manifest.fixtures.map((fixture) => fixture.id)).size === 5 &&
      ["summer", "pasta", "low-gi", "dietetyka-diagnostic", "lunchboxy"].every((id) =>
        manifest.fixtures.some((fixture) => fixture.id === id),
      ),
    "Expected summer, pasta, low-gi, dietetyka-diagnostic and lunchboxy fixtures",
  );
  const results = [];
  for (const fixture of manifest.fixtures) {
    const file = localFile(root, fixture.localPath);
    requireThat(path.basename(file) === fixture.filename, "Source filename mismatch: " + fixture.id);
    const bytes = readFileSync(file);
    requireThat(
      bytes.length === fixture.byteLength && sha256(bytes) === fixture.sha256,
      "Source bytes/hash mismatch: " + fixture.id,
    );
    const inspected = inspect(file);
    requireThat(inspected.pageCount === fixture.pageCount, "Source page count mismatch: " + fixture.id);
    const limit = fileLimitFailure(bytes.length, inspected.pageCount);
    if (fixture.expectation === "reject-page-limit") {
      requireThat(limit === "too-many-pages", "Expected page-limit rejection");
      requireThat(
        fixture.referencePath === null && fixture.referenceSha256 === null && fixture.recipePages.length === 0,
        "Rejected fixture cannot be an accepted recipe reference",
      );
      results.push({
        id: fixture.id,
        pageCount: fixture.pageCount,
        expectedRejection: limit,
        readyForExtraction: false,
      });
      continue;
    }
    requireThat(limit === null, "Accepted fixture exceeds product limits");
    const expectedPages = observedRecipePages[fixture.id];
    requireThat(
      JSON.stringify(fixture.recipePages) === JSON.stringify(expectedPages),
      "Recipe-page observation changed; resolve against source before updating the contract",
    );
    if (fixture.expectation === "accept-pending-reference") {
      requireThat(
        fixture.referencePath === null && fixture.referenceSha256 === null,
        "Pending-reference fixture cannot claim a reference or hash",
      );
      results.push({
        id: fixture.id,
        pageCount: fixture.pageCount,
        observedRecipePages: fixture.recipePages.length,
        review: "pending",
        referenceStatus: "missing",
        referenceSha256: null,
        readyForExtraction: false,
      });
      continue;
    }
    requireThat(
      fixture.referencePath !== null && fixture.referenceSha256 !== null,
      "Accepted fixture requires reference and hash",
    );
    const referenceBytes = readFileSync(localFile(root, fixture.referencePath));
    requireThat(sha256(referenceBytes) === fixture.referenceSha256, "Reference hash mismatch: " + fixture.id);
    const reference = JSON.parse(referenceBytes);
    assertSchema(reference, schema);
    requireThat(
      reference.fixtureId === fixture.id && reference.sourceSha256 === fixture.sha256,
      "Reference source identity mismatch",
    );
    if (reference.review.status === "approved") {
      requireThat(
        reference.review.approvedBy !== null &&
          reference.review.approvedAt !== null &&
          Number.isFinite(Date.parse(reference.review.approvedAt)),
        "Approval requires reviewer and date",
      );
    } else
      requireThat(
        reference.review.approvedBy === null && reference.review.approvedAt === null,
        "Pending reference cannot claim approval metadata",
      );
    assertAnchors(reference, fixture, inspected.pages);
    results.push({
      id: fixture.id,
      pageCount: fixture.pageCount,
      recipes: reference.recipes.length,
      review: reference.review.status,
      referenceStatus: "validated",
      referenceSha256: fixture.referenceSha256,
      readyForExtraction: reference.review.status === "approved",
    });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(
        {
          status: "valid",
          fixtures: validateFixtures(),
          note: "Structural integrity only; missing references or pending user approval block live ebook extraction and accuracy acceptance.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("PDF fixture validation failed: " + error.message);
    process.exitCode = 1;
  }
}
