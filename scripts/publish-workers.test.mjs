import assert from "node:assert/strict";
import { test } from "node:test";
import { publish } from "./publish-workers.mjs";
import { requiredSecrets } from "./check-deploy-config.mjs";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "test",
  CLOUDFLARE_API_TOKEN: "test",
  DEPLOY_COMMIT_SHA: "a".repeat(40),
  PREVIEW_ALIAS: "pr-12",
};
const version = "11111111-1111-4111-8111-111111111111";
const output = `Current Version ID: ${version}\nhttps://dishly-web.example.workers.dev`;
test("missing secrets prevent either production Worker deployment", () => {
  const calls = [];
  const notes = [];
  assert.throws(
    () =>
      publish(
        "production",
        (args) => {
          calls.push(args);
          return "[]";
        },
        (text) => notes.push(text),
        env,
      ),
    /secrets are missing/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "secret");
});
test("consumer deployment precedes web and version evidence survives a web failure", () => {
  const calls = [];
  const notes = [];
  assert.throws(
    () =>
      publish(
        "production",
        (args) => {
          calls.push(args);
          if (args[0] === "secret") return JSON.stringify(requiredSecrets.map((name) => ({ name })));
          if (args.includes("workers/pdf-consumer/wrangler.jsonc")) return output;
          throw new Error("web deployment failed");
        },
        (text) => notes.push(text),
        env,
      ),
    /web deployment failed/,
  );
  assert.equal(calls.length, 3);
  assert.ok(notes.some((text) => text.includes("dishly-pdf-worker") && text.includes(version)));
  assert.ok(notes.at(-1).includes("partial deployment"));
});
test("preview uploads only an isolated version and records its URL", () => {
  const calls = [];
  const notes = [];
  publish(
    "preview",
    (args) => {
      calls.push(args);
      return output.replace("Current", "Worker");
    },
    (text) => notes.push(text),
    env,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 4), ["versions", "upload", "--env", "preview"]);
  assert.ok(notes[0].includes("workers.dev"));
});
