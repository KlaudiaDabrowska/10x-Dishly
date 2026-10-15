import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardImportId,
  loadDashboardImportOutcome,
  withoutImportParameter,
} from "../src/lib/pdf-processing/dashboard-import.ts";

const importId = "db09814a-c362-4d45-95f0-6204e9070491";

test("dashboard accepts only a UUID import parameter and removes it from the visible URL", () => {
  assert.equal(dashboardImportId(`?import=${importId}&saved=999`), importId);
  assert.equal(dashboardImportId("?import=not-an-id&saved=999"), null);
  assert.equal(dashboardImportId("?saved=999"), null);
  assert.equal(
    withoutImportParameter("/dashboard", `?import=${importId}&view=all`, "#recipes"),
    "/dashboard?view=all#recipes",
  );
});

test("dashboard outcome comes only from the owner-scoped status response", async () => {
  const calls = [];
  const result = await loadDashboardImportOutcome(importId, async (path, options) => {
    calls.push({ path, options });
    return globalThis.Response.json({
      status: "committed",
      readBack: true,
      outcome: { saved: 2, alreadySaved: 3, pending: 0 },
    });
  });

  assert.deepEqual(result, { saved: 2, alreadySaved: 3 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, `/api/imports/${importId}`);
  assert.equal(calls[0].options.headers.accept, "application/json");
});

test("dashboard hides invalid, foreign and unconfirmed outcomes", async () => {
  let calls = 0;
  assert.equal(
    await loadDashboardImportOutcome("not-an-id", async () => {
      calls++;
      return globalThis.Response.json({});
    }),
    null,
  );
  assert.equal(calls, 0);

  for (const response of [
    new globalThis.Response(null, { status: 404 }),
    globalThis.Response.json({
      status: "committed",
      readBack: false,
      outcome: { saved: 1, alreadySaved: 0, pending: 0 },
    }),
    globalThis.Response.json({
      status: "committed",
      readBack: true,
      outcome: { saved: 1, alreadySaved: 0, pending: 1 },
    }),
    globalThis.Response.json({
      status: "committed",
      readBack: true,
      outcome: { saved: 0, alreadySaved: 0, pending: 0, kept: 0, discarded: 2 },
    }),
  ]) {
    assert.equal(await loadDashboardImportOutcome(importId, async () => response), null);
  }
});
