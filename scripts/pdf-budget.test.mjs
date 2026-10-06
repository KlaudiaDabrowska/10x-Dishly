import assert from "node:assert/strict";
import test from "node:test";
import { calculateCostNanoUsd } from "../src/lib/pdf-processing/budget.ts";
import {
  SpendingControlError,
  createImportState,
  dispatchWithSpendingControl,
} from "../src/lib/pdf-processing/import-state.ts";

const pricing = {
  provider: "test",
  model: "test",
  inputNanoUsdPerMillionTokens: 1_250_000,
  outputNanoUsdPerMillionTokens: 10_000_000,
};
const reservation = {
  importId: "00000000-0000-4000-8000-000000000001",
  batchIndex: 0,
  fileFingerprint: "f".repeat(64),
  manifestDigest: "m".repeat(64),
  inputDigest: "i".repeat(64),
  corePageStart: 1,
  corePageEnd: 2,
  maximumCostNanoUsd: 100_000_000,
  pricing,
  expiresAt: "2099-01-01T00:00:00.000Z",
};

test("token prices use upward-rounded integer nano-USD", () => {
  assert.equal(calculateCostNanoUsd({ inputTokens: 1, outputTokens: 1 }, pricing), 12);
  assert.equal(calculateCostNanoUsd({ inputTokens: 800_000, outputTokens: 100_000 }, pricing), 2_000_000);
  assert.equal(calculateCostNanoUsd({ inputTokens: 0, outputTokens: 0 }, pricing), 0);
});

test("authentication and database admission are required before dispatch", async () => {
  assert.throws(() => createImportState({ rpc: async () => ({ data: null, error: null }) }, null), {
    code: "authentication-required",
  });
  let dispatched = false;
  const state = createImportState(
    { rpc: async () => ({ data: null, error: { message: "budget exceeded" } }) },
    "00000000-0000-4000-8000-000000000010",
  );
  await assert.rejects(
    dispatchWithSpendingControl({
      state,
      reservation,
      dispatch: async () => {
        dispatched = true;
        throw new Error("must not run");
      },
    }),
    (error) => error instanceof SpendingControlError && error.code === "reservation-failed",
  );
  assert.equal(dispatched, false);
});

test("a crash after dispatch claim remains fail-closed", async () => {
  const calls = [];
  const client = {
    async rpc(name) {
      calls.push(name);
      return {
        data: [
          {
            claimed: true,
            import_id: reservation.importId,
            batch_index: 0,
            attempt_id: "00000000-0000-4000-8000-000000000020",
            reservation_id: "00000000-0000-4000-8000-000000000021",
            status: "dispatch-claimed",
          },
        ],
        error: null,
      };
    },
  };
  await assert.rejects(
    dispatchWithSpendingControl({
      state: createImportState(client, "00000000-0000-4000-8000-000000000010"),
      reservation,
      dispatch: async () => {
        throw new Error("provider outcome unknown");
      },
    }),
    /provider outcome unknown/,
  );
  assert.deepEqual(calls, ["reserve_pdf_batch"]);
});

test("a duplicate claim does not dispatch again", async () => {
  let dispatched = false;
  const state = createImportState(
    {
      async rpc() {
        return {
          data: [
            {
              claimed: false,
              import_id: reservation.importId,
              batch_index: 0,
              attempt_id: "00000000-0000-4000-8000-000000000020",
              reservation_id: "00000000-0000-4000-8000-000000000021",
              status: "dispatch-claimed",
            },
          ],
          error: null,
        };
      },
    },
    "00000000-0000-4000-8000-000000000010",
  );
  const result = await dispatchWithSpendingControl({
    state,
    reservation,
    dispatch: async () => {
      dispatched = true;
      throw new Error("must not run");
    },
  });
  assert.equal(result.duplicate, true);
  assert.equal(dispatched, false);
});
