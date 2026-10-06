import assert from "node:assert/strict";
import test from "node:test";
import {
  RECIPE_CATEGORIES,
  isRecipeCategory,
  sourceItemKey,
  hasValidGroupLabels,
} from "../src/lib/pdf-processing/contracts.ts";
import { fileLimitFailure, PDF_LIMITS } from "../src/lib/pdf-processing/limits.ts";

test("exactly the four categories are accepted, not free text or multiple categories", () => {
  assert.deepEqual(RECIPE_CATEGORIES, ["breakfast", "lunch", "dinner", "dessert"]);
  for (const value of RECIPE_CATEGORIES) assert.equal(isRecipeCategory(value), true);
  for (const value of ["second-breakfast", "", "Lunch", "lunch,dinner", ["lunch"], null])
    assert.equal(isRecipeCategory(value), false);
});

test("variants need unique labels while a single ingredient list may be unlabelled", () => {
  const groups = (labels) => labels.map((label) => ({ label, ingredients: [] }));
  assert.equal(hasValidGroupLabels(groups(["1600 kcal", "1800 kcal", "2000 kcal"])), true);
  assert.equal(hasValidGroupLabels(groups([null])), true);
  for (const labels of [[], [null, "B"], ["A", " A "], ["", "B"], ["  "]])
    assert.equal(hasValidGroupLabels(groups(labels)), false);
});

test("source identity uses 1-based document pages and zero-based text-item indices", () => {
  assert.equal(sourceItemKey({ page: 1, itemIndex: 0 }), "p1:i0");
  assert.notEqual(sourceItemKey({ page: 1, itemIndex: 3 }), sourceItemKey({ page: 3, itemIndex: 1 }));
  for (const anchor of [
    { page: 0, itemIndex: 0 },
    { page: 1, itemIndex: -1 },
    { page: 1.5, itemIndex: 1 },
    { page: 1, itemIndex: NaN },
  ])
    assert.throws(() => sourceItemKey(anchor));
});

test("20 MB means exactly 20,000,000 bytes, not 20 MiB; 115 pages inclusive", () => {
  assert.equal(PDF_LIMITS.maxFileBytes, 20_000_000);
  assert.equal(PDF_LIMITS.maxPages, 115);
  assert.equal(fileLimitFailure(19_999_999, 115), null);
  assert.equal(fileLimitFailure(20_000_000, 115), null);
  assert.equal(fileLimitFailure(20_000_001, 115), "file-too-large");
  assert.equal(fileLimitFailure(20 * 1024 * 1024, 115), "file-too-large");
  assert.equal(fileLimitFailure(1, 116), "too-many-pages");
  assert.equal(fileLimitFailure(10_662_733, 113), null);
  for (const value of [0, -1, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(fileLimitFailure(value), "invalid-file-size");
  for (const value of [0, -1, NaN, Infinity, 1.1]) assert.equal(fileLimitFailure(1, value), "invalid-page-count");
});
