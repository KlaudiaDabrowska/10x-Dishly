import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import { handleRecipePatch } from "../src/lib/recipes/api.ts";
import { RecipeEditValidationError, RecipeWriteError } from "../src/lib/recipes/write.ts";

const recipeId = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000099";
const sentinel = "PRIVATE_RECIPE_SENTINEL_DO_NOT_EXPOSE";

function context({ user = { id: ownerId }, id = recipeId, headers = {}, body = "{}" } = {}) {
  const url = new URL(`https://dishly.test/api/recipes/${id}`);
  return {
    locals: { user },
    params: { id },
    url,
    request: new Request(url, {
      method: "PATCH",
      headers: {
        origin: url.origin,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        ...headers,
      },
      body,
    }),
  };
}

async function responseBody(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}

test("PATCH guards in order and returns only exact sanitized bodies", async () => {
  let calls = 0;
  const success = async (actualOwner, actualId, body) => {
    calls += 1;
    assert.deepEqual([actualOwner, actualId, body], [ownerId, recipeId, {}]);
    return { recipeId, updatedAt: "2026-11-24T09:00:00.000Z" };
  };
  const guardedCases = [
    [
      context({ user: null, headers: { origin: "https://attacker.test", "content-type": "text/plain" } }),
      401,
      { error: "authentication_required" },
    ],
    [
      context({ headers: { origin: "https://attacker.test", "content-type": "text/plain" } }),
      403,
      { error: "cross_origin_forbidden" },
    ],
    [context({ id: "not-a-uuid", headers: { "content-type": "text/plain" } }), 404, { error: "recipe-not-found" }],
    [context({ headers: { "content-type": "text/plain" } }), 415, { error: "unsupported-media-type" }],
    [context({ headers: { "content-length": String(256 * 1024 + 1) } }), 413, { error: "request-too-large" }],
    [context({ body: "{" }), 400, { error: "invalid-json" }],
  ];
  for (const [requestContext, status, body] of guardedCases) {
    const response = await handleRecipePatch(requestContext, success);
    assert.equal(response.status, status);
    assert.deepEqual(await responseBody(response), body);
    assert.equal(calls, 0);
  }

  const ok = await handleRecipePatch(context(), success);
  assert.equal(ok.status, 200);
  assert.deepEqual(await responseBody(ok), { recipeId, updatedAt: "2026-11-24T09:00:00.000Z" });
  assert.equal(calls, 1);

  const failures = [
    [
      new RecipeEditValidationError([{ path: "title", code: "blank" }]),
      422,
      { error: "invalid-recipe-edit", issues: [{ path: "title", code: "blank" }] },
    ],
    [new RecipeWriteError("recipe-not-found"), 404, { error: "recipe-not-found" }],
    [new RecipeWriteError("recipe-conflict"), 409, { error: "recipe-conflict" }],
    [new RecipeWriteError("infrastructure-unavailable"), 503, { error: "infrastructure_unavailable" }],
  ];
  for (const [error, status, body] of failures) {
    const response = await handleRecipePatch(context(), async () => {
      throw error;
    });
    assert.equal(response.status, status);
    assert.deepEqual(await responseBody(response), body);
  }

  const logs = [];
  const originalError = console.error;
  console.error = (...values) => logs.push(values.join(" "));
  try {
    const response = await handleRecipePatch(context(), async () => {
      throw new Error(sentinel, { cause: { message: sentinel, recipe: sentinel } });
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await responseBody(response), { error: "internal-error" });
  } finally {
    console.error = originalError;
  }
  assert.equal(JSON.stringify(logs).includes(sentinel), false);
});
