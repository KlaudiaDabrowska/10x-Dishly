import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const projectParent = join(root, "evaluation/validate-pdf-processing/local/db-test-project");
const configPath = (workdir) => join(workdir, "supabase/config.toml");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const excludedServices =
  "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

export function isolatedSupabaseEnv(projectId) {
  // The CLI lets this variable override config.toml, so never inherit its value.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("SUPABASE_")));
  return { ...env, SUPABASE_PROJECT_ID: projectId };
}

export function verifyIsolatedDbProject(env) {
  const workdir = env.PDF_DB_TEST_WORKDIR;
  const projectId = env.PDF_DB_TEST_PROJECT_ID;
  if (!workdir || !projectId || !env.PDF_DB_TEST_TOKEN) {
    throw new Error(
      "DB tests require the isolated runner. Use npm run test:pdf:db; the primary database is never reset.",
    );
  }
  if (
    !/^pdf-db-test-[a-f0-9]{24}$/.test(projectId) ||
    realpathSync(workdir) !== workdir ||
    dirname(workdir) !== realpathSync(projectParent) ||
    basename(workdir) !== projectId
  ) {
    throw new Error("Refusing DB tests outside their dedicated isolated project");
  }
  const marker = JSON.parse(readFileSync(join(workdir, "test-project.json"), "utf8"));
  const config = readFileSync(configPath(workdir), "utf8");
  if (
    marker.projectId !== projectId ||
    marker.token !== env.PDF_DB_TEST_TOKEN ||
    marker.configHash !== digest(config) ||
    !config.includes(`project_id = "${projectId}"`) ||
    !Number.isInteger(marker.apiPort) ||
    !Number.isInteger(marker.dbPort)
  ) {
    throw new Error("Isolated DB test project identity/configuration mismatch");
  }
  return { ...marker, workdir };
}

async function main() {
  const projectId = `pdf-db-test-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const token = randomUUID();
  mkdirSync(projectParent, { recursive: true, mode: 0o700 });
  const workdir = join(realpathSync(projectParent), projectId);
  mkdirSync(join(workdir, "supabase"), { recursive: true, mode: 0o700 });
  const original = readFileSync(configPath(root), "utf8");
  if (!/^project_id = "[^"]+"$/m.test(original) || /^\[remotes\./m.test(original)) {
    throw new Error("Cannot safely derive an isolated config from this project configuration");
  }
  const originalPorts = [...original.matchAll(/^(?:port|shadow_port|inspector_port) = (\d+)$/gm)].map((m) =>
    Number(m[1]),
  );
  const config = original
    .replace(/^project_id = "[^"]+"$/m, `project_id = "${projectId}"`)
    .replace(/^(port|shadow_port|inspector_port) = (\d+)$/gm, (_, key, value) => {
      const port = Number(value) + 1000;
      if (port > 65535 || originalPorts.includes(port)) throw new Error("Test ports overlap primary project ports");
      return `${key} = ${port}`;
    });
  const apiPort = Number(config.match(/\[api\][\s\S]*?^port = (\d+)$/m)?.[1]);
  const dbPort = Number(config.match(/\[db\][\s\S]*?^port = (\d+)$/m)?.[1]);
  writeFileSync(configPath(workdir), config, { mode: 0o600, flag: "wx" });
  cpSync(join(root, "supabase/migrations"), join(workdir, "supabase/migrations"), { recursive: true });
  writeFileSync(
    join(workdir, "test-project.json"),
    JSON.stringify({ projectId, token, configHash: digest(config), apiPort, dbPort }),
    { mode: 0o600, flag: "wx" },
  );
  const env = {
    ...isolatedSupabaseEnv(projectId),
    PDF_DB_TEST_WORKDIR: workdir,
    PDF_DB_TEST_PROJECT_ID: projectId,
    PDF_DB_TEST_TOKEN: token,
  };
  verifyIsolatedDbProject(env);
  let child;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    child?.kill("SIGTERM");
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const run = (command, args, showOutput = false) =>
    new Promise((resolveRun, reject) => {
      child = spawn(command, args, { cwd: root, env, stdio: showOutput ? "inherit" : ["ignore", "ignore", "pipe"] });
      let detail = "";
      child.stderr?.on("data", (chunk) => {
        detail = (detail + chunk).slice(-8000);
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        child = undefined;
        if (code === 0) resolveRun();
        else reject(new Error(`${command} failed (${signal ?? code}). ${detail}`));
      });
    });
  const cli = (...args) => run(join(root, "node_modules/.bin/supabase"), ["--workdir", workdir, ...args]);
  let failure;
  try {
    console.log(`Starting isolated DB test project ${projectId} (API ${apiPort}, DB ${dbPort}).`);
    // A fresh project applies the copied migrations during startup; no reset is needed.
    await cli("start", "--exclude", excludedServices);
    if (interrupted) throw new Error("DB tests interrupted");
    await run(process.execPath, ["--test", join(root, "scripts/pdf-processing-db.test.mjs")], true);
  } catch (error) {
    failure = error;
  } finally {
    try {
      // Exact generated project ID only: never --all, never the primary workdir.
      verifyIsolatedDbProject(env);
      await cli("stop", "--project-id", projectId, "--no-backup");
      rmSync(workdir, { recursive: true });
      console.log(`Removed isolated DB test project ${projectId}.`);
    } catch (error) {
      console.error(`Isolated test cleanup failed; project retained at ${workdir}.`);
      failure = failure ? new Error(`${failure.message}\nCleanup: ${error.message}`, { cause: failure }) : error;
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
  if (failure) throw failure;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
