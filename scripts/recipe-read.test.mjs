import assert from "node:assert/strict";
import test from "node:test";
import {
  PAGE_SIZE,
  isRecipeId,
  mapRecipeDetail,
  parsePage,
  readRecipeDetail,
  readRecipePage,
} from "../src/lib/recipes/read.ts";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

function listRow(id, title, createdAt) {
  return { id, title, created_at: createdAt };
}

function detailRow(overrides = {}) {
  return {
    id: firstId,
    title: "Owsianka",
    ingredient_groups: [
      {
        label: "Wariant podstawowy",
        ingredients: [{ name: "Płatki", quantity: "80", unit: "g", sourceText: "80 g płatków" }],
      },
    ],
    instructions: ["Wymieszaj składniki.", "Gotuj przez pięć minut."],
    source_filename: "jadlospis.pdf",
    source_start_page: 7,
    created_at: "2026-10-14T08:00:00.000Z",
    ...overrides,
  };
}

function fakePort({ rows = [], count = rows.length, listError = null, detail = null, detailError = null } = {}) {
  const calls = [];
  return {
    calls,
    async listRecipes(query) {
      calls.push({ type: "list", query });
      if (listError !== null) return { data: null, count: null, error: listError };
      const ordered = [...rows].sort(
        (left, right) => right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id),
      );
      return {
        data: ordered.slice(query.range.from, query.range.to + 1),
        count,
        error: null,
      };
    },
    async findRecipe(query) {
      calls.push({ type: "detail", query });
      return { data: detail, error: detailError };
    },
  };
}

test("page parser defaults to page one and accepts only positive safe integers", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage(null), 1);
  assert.equal(parsePage("1"), 1);
  assert.equal(parsePage("01"), 1);
  assert.equal(parsePage("27"), 27);
  for (const value of ["", "0", "-1", "1.5", " 1", "word", String(Number.MAX_SAFE_INTEGER + 1)])
    assert.equal(parsePage(value), null);
});

test("list requests exact count, 24-row ranges and deterministic newest-first ordering", async () => {
  const tiedAt = "2026-10-14T08:00:00.000Z";
  const rows = [
    listRow(secondId, "Drugi", tiedAt),
    listRow(firstId, "Pierwszy", tiedAt),
    ...Array.from({ length: PAGE_SIZE - 2 }, (_, index) =>
      listRow(
        `00000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`,
        `Przepis ${index + 3}`,
        "2026-10-13T08:00:00.000Z",
      ),
    ),
    listRow("00000000-0000-4000-8000-000000000099", "Następna strona", "2026-10-12T08:00:00.000Z"),
  ];
  const port = fakePort({ rows });

  const first = await readRecipePage(port, null);
  assert.equal(first.status, "ok");
  assert.equal(first.recipes.length, PAGE_SIZE);
  assert.deepEqual(
    first.recipes.slice(0, 2).map((recipe) => recipe.id),
    [firstId, secondId],
  );
  assert.equal(first.totalCount, 25);
  assert.equal(first.totalPages, 2);
  assert.deepEqual(port.calls[0].query, {
    select: "id,title,created_at",
    count: "exact",
    range: { from: 0, to: 23 },
    order: [
      { column: "created_at", ascending: false },
      { column: "id", ascending: true },
    ],
  });

  const second = await readRecipePage(port, "2");
  assert.equal(second.status, "ok");
  assert.deepEqual(
    second.recipes.map((recipe) => recipe.title),
    ["Następna strona"],
  );
  assert.deepEqual(port.calls[1].query.range, { from: 24, to: 47 });
});

test("an out-of-range page is not presented as an empty collection", async () => {
  const port = fakePort({ rows: [listRow(firstId, "Jedyny", "2026-10-14T08:00:00.000Z")] });
  assert.deepEqual(await readRecipePage(port, "2"), { status: "invalid-page" });
});

test("an empty first page remains a successful empty collection", async () => {
  const result = await readRecipePage(fakePort(), "1");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.recipes, []);
  assert.equal(result.totalCount, 0);
  assert.equal(result.totalPages, 0);
});

test("a list query failure is distinct from an empty result", async () => {
  assert.deepEqual(await readRecipePage(fakePort({ listError: new Error("database unavailable") })), {
    status: "error",
    reason: "query",
  });
});

test("UUID validation and malformed detail IDs stop before the query", async () => {
  assert.equal(isRecipeId(firstId), true);
  assert.equal(isRecipeId("not-a-uuid"), false);
  const port = fakePort({ detail: detailRow() });
  assert.deepEqual(await readRecipeDetail(port, "not-a-uuid"), { status: "not-found" });
  assert.equal(port.calls.length, 0);
});

test("detail returns not-found for a zero-row read and error for a failed query", async () => {
  assert.deepEqual(await readRecipeDetail(fakePort(), firstId), { status: "not-found" });
  assert.deepEqual(await readRecipeDetail(fakePort({ detailError: new Error("query failed") }), firstId), {
    status: "error",
    reason: "query",
  });
});

test("detail maps validated nested ingredient variants and ordered instructions", async () => {
  const port = fakePort({ detail: detailRow() });
  const result = await readRecipeDetail(port, firstId);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.recipe.ingredientGroups[0], {
    label: "Wariant podstawowy",
    ingredients: [{ name: "Płatki", quantity: "80", unit: "g", sourceText: "80 g płatków" }],
  });
  assert.deepEqual(result.recipe.instructions, ["Wymieszaj składniki.", "Gotuj przez pięć minut."]);
  assert.deepEqual(port.calls[0].query, {
    select: "id,title,ingredient_groups,instructions,source_filename,source_start_page,created_at",
    id: firstId,
  });
});

test("malformed nested JSON fails mapping instead of being cast into the view model", async () => {
  for (const row of [
    detailRow({ ingredient_groups: [{ label: null, ingredients: [{ name: "Płatki" }] }] }),
    detailRow({ ingredient_groups: "not-an-array" }),
    detailRow({ instructions: ["Poprawny krok", 2] }),
  ]) {
    assert.equal(mapRecipeDetail(row), null);
    assert.deepEqual(await readRecipeDetail(fakePort({ detail: row }), firstId), {
      status: "error",
      reason: "invalid-data",
    });
  }
});
