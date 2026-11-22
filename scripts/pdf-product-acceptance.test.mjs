import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertProductBudget,
  errorCode,
  parseProductAcceptanceArgs,
  plannedCost,
  productAcceptanceSelfTest,
  recordFailures,
  runProductAcceptance,
  writePrivateRecord,
} from "./pdf-product-acceptance.mjs";

const revision = "a".repeat(40);

test("arguments require a pinned revision and an exact live cost approval", () => {
  assert.deepEqual(parseProductAcceptanceArgs(["--self-test"]), { mode: "self-test" });
  assert.deepEqual(parseProductAcceptanceArgs(["--preflight", "--revision", revision]), {
    mode: "preflight",
    revision,
  });
  assert.deepEqual(
    parseProductAcceptanceArgs(["--live", "--revision", revision, "--approved-max-nano-usd", "294912000"]),
    { mode: "live", revision, approvedMaxNanoUsd: 294_912_000 },
  );
  for (const args of [
    [],
    ["--live", "--revision", revision],
    ["--preflight"],
    ["--preflight", "--revision", "main"],
    ["--preflight", "--revision", revision, "--approved-max-nano-usd", "1"],
  ])
    assert.throws(() => parseProductAcceptanceArgs(args));
});

test("self-test plants every release acceptance failure without private content", async () => {
  const result = productAcceptanceSelfTest();
  assert.equal(result.ok, true);
  assert.equal(result.plantedFailures, 14);
  assert.deepEqual(await runProductAcceptance(["--self-test"]), result);
  assert.doesNotMatch(JSON.stringify(result), /ingredient|instruction|PRIVATE/u);
});

test("record validation rejects all required dishonest-success shapes", () => {
  const record = {
    identity: { approvedRevision: revision, head: revision, dirty: false },
    fixtureIdentity: {
      fixtureSha256: "f".repeat(64),
      sourceSha256: "x".repeat(64),
      referenceSha256: "r".repeat(64),
      approvedReferenceSha256: "r".repeat(64),
      readerSha256: "d".repeat(64),
      manifestSha256: "m".repeat(64),
    },
    expectedRecipes: 1,
    outcome: {
      status: "processing",
      readBack: false,
      pending: 1,
      saved: 0,
      alreadySaved: 1,
      persistedRows: 2,
      unresolvedDecisions: 1,
    },
    semanticBlocking: { ok: false },
    elapsedMs: 300_001,
    usage: { heldNanoUsd: 1 },
    unresolvedHolds: 1,
  };
  assert.deepEqual(recordFailures(record), [
    "fixture-hash-mismatch",
    "not-committed",
    "read-back-unconfirmed",
    "pending-decisions",
    "saved-count-mismatch",
    "persisted-count-mismatch",
    "semantic-mismatch",
    "elapsed-over-300s",
    "unreconciled-cost",
  ]);
});

test("planned cost covers exactly one attempt per fixture and respects import and month caps", () => {
  const plan = plannedCost([
    { fixture: { id: "summer" }, batches: [{}, {}] },
    { fixture: { id: "lunchboxy" }, batches: [{}] },
  ]);
  assert.equal(plan.calls, 3);
  assert.equal(plan.fixtures.length, 2);
  const monthKey = "month:" + new Date().toISOString().slice(0, 7);
  const accepted = assertProductBudget(
    { [monthKey]: { limit_nano_usd: plan.maximumNanoUsd, spent_nano_usd: 0, held_nano_usd: 0 } },
    plan,
  );
  assert.equal(accepted.monthlyAvailableNanoUsd, plan.maximumNanoUsd);
  assert.throws(
    () =>
      assertProductBudget(
        { [monthKey]: { limit_nano_usd: plan.maximumNanoUsd - 1, spent_nano_usd: 0, held_nano_usd: 0 } },
        plan,
      ),
    { code: "monthly-budget-insufficient" },
  );
});

test("preflight rejects missing fixtures and hash errors before service or provider access", async () => {
  for (const code of ["fixture-missing", "fixture-hash-mismatch"]) {
    const calls = [];
    await assert.rejects(
      runProductAcceptance(["--preflight", "--revision", revision], {
        prepareFixtures: () => {
          calls.push("fixtures");
          throw Object.assign(new Error(code), { code });
        },
        localServices: () => calls.push("services"),
        apiKey: "unused",
      }),
      (error) => errorCode(error) === code,
    );
    assert.deepEqual(calls, ["fixtures"]);
  }
});

test("private records use exclusive creation and mode 0600", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "product-acceptance-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "record.json");
  writePrivateRecord(filename, { ok: true });
  chmodSync(filename, 0o600);
  assert.equal(statSync(filename).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(filename, "utf8")), { ok: true });
  assert.throws(() => writePrivateRecord(filename, { ok: false }), { code: "EEXIST" });
});
