import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { checkDeployment, requiredSecrets } from "./check-deploy-config.mjs";

function wrangler(args) {
  // Invoke the installed binary directly; never download or silently upgrade it.
  return execFileSync("node_modules/.bin/wrangler", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
  });
}
function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}
function record(label, output, summary, preview = false) {
  const version = output.match(/(?:Current|Worker) Version ID:\s*([0-9a-f-]{36})/i)?.[1];
  assert.ok(version, `${label} may have published, but its version ID could not be parsed. Inspect Wrangler output.`);
  const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0];
  summary(`- ${label}: version \`${version}\`${url ? ` — ${url}` : ""}`);
  if (preview || label === "dishly-web")
    assert.ok(url, "Worker URL was not returned; inspect deployment state before retrying");
}

export function publish(target, wrangler, summary, environment = process.env) {
  assert.ok(["production", "preview"].includes(target));
  assert.ok(environment.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID is missing");
  assert.ok(environment.CLOUDFLARE_API_TOKEN, "CLOUDFLARE_API_TOKEN is missing");
  try {
    if (target === "preview") {
      assert.match(environment.PREVIEW_ALIAS ?? "", /^pr-[0-9]+$/);
      const output = wrangler([
        "versions",
        "upload",
        "--env",
        "preview",
        "--preview-alias",
        environment.PREVIEW_ALIAS,
        "--experimental-provision=false",
      ]);
      console.log(output);
      record("dishly-web-preview", output, summary, true);
    } else {
      assert.match(environment.DEPLOY_COMMIT_SHA ?? "", /^[0-9a-f]{40}$/);
      // Read secret names only before mutating either Worker. Values remain in Cloudflare.
      const secrets = JSON.parse(wrangler(["secret", "list", "--name", "dishly-web", "--format", "json"]));
      const names = new Set(secrets.map((secret) => secret.name));
      assert.ok(
        requiredSecrets.every((name) => names.has(name)),
        "Required production secrets are missing; finish Worker setup before deploying",
      );
      summary(`Production commit: \`${environment.DEPLOY_COMMIT_SHA}\``);
      const consumer = wrangler([
        "deploy",
        "--config",
        "workers/pdf-consumer/wrangler.jsonc",
        "--experimental-provision=false",
      ]);
      console.log(consumer);
      record("dishly-pdf-worker", consumer, summary);
      const web = wrangler(["deploy", "--experimental-provision=false"]);
      console.log(web);
      record("dishly-web", web, summary);
    }
  } catch (error) {
    summary(
      "Deployment/upload stopped. Check the recorded versions and live state before retrying; a partial deployment is possible.",
    );
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkDeployment(process.argv[2]);
  publish(process.argv[2], wrangler, summary);
}
