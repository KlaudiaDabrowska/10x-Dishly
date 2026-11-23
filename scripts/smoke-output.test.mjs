import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { URL } from "node:url";

test("smoke output hides private step and cleanup failures from stdout and stderr", () => {
  const sentinel = "PRIVATE_SMOKE_PAYLOAD_DO_NOT_EXPOSE";
  const helper = new URL("./smoke-output.mjs", import.meta.url).href;
  const program = `
    import { runSmokeSteps } from ${JSON.stringify(helper)};
    const sentinel = process.env.SMOKE_PRIVATE_SENTINEL;
    const failed = await runSmokeSteps({
      steps: [["owner isolation", async () => { throw new Error(sentinel); }, {}]],
      assertResponse: () => { throw new Error(sentinel); },
      cleanup: async () => { throw new Error(sentinel); },
    });
    process.exitCode = failed ? 1 : 0;
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8",
    env: { ...process.env, SMOKE_PRIVATE_SENTINEL: sentinel },
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    "FAIL  owner isolation (request or assertion failed)\nFAIL  local smoke cleanup failed\n\n2 step(s) failed\n",
  );
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
});
