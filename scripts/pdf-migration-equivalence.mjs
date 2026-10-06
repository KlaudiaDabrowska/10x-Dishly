// Proves that two migration directories produce the same public schema. Each directory is applied
// to its own fresh, separately-named temporary Supabase project (never the primary project), then
// pg_dump output and catalog snapshots are compared. Exits 0 only when everything is identical.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { isolatedSupabaseEnv } from "./pdf-processing-db-runner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const projectParent = join(root, "evaluation/validate-pdf-processing/local/migration-equivalence");
const defaultOldCommit = "f1cdd0beba8181d2730996a834e59129c4c87162";
const excludedServices =
  "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
const projectPattern = /^pdf-mig-eq-[a-f0-9]{24}$/;

const catalogQueries = {
  functions: `select p.proname, pg_get_function_identity_arguments(p.oid) as args, md5(pg_get_functiondef(p.oid)) as def_md5,
      p.prosecdef, p.proconfig, p.provolatile, p.proacl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by 1, 2`,
  tables: `select c.relname, c.relkind, c.relacl, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' order by 1`,
  columns: `select c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull,
      pg_get_expr(d.adbin, d.adrelid) as default_expr, a.attacl
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped
    order by 1, 2`,
  policies: `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies where schemaname = 'public' order by 2, 3`,
  constraints: `select c.relname, k.conname, k.contype, pg_get_constraintdef(k.oid) as def, k.condeferrable, k.condeferred
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' order by 1, 2`,
  indexes: `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`,
  triggers: `select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def, t.tgenabled
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal order by 1, 2`,
  defaultPrivileges: `select pg_get_userbyid(d.defaclrole) as role, d.defaclobjtype, d.defaclacl
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'public' or d.defaclnamespace = 0 order by 1, 2`,
  comments: `select c.relname, d.objsubid, d.description
    from pg_description d join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    union all
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', d.objsubid, d.description
    from pg_description d join pg_proc p on p.oid = d.objoid and d.classoid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    order by 1, 2`,
};

function parseArgs(argv) {
  const options = { old: undefined, new: join(root, "supabase/migrations"), commit: defaultOldCommit };
  for (let i = 0; i < argv.length; i += 1) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (key === "--old") options.old = resolve(value);
    else if (key === "--new") options.new = resolve(value);
    else if (key === "--old-commit") options.commit = value;
    else throw new Error(`Unknown argument ${key}. Usage: [--old <dir> | --old-commit <sha>] [--new <dir>]`);
    i += 1;
  }
  return options;
}

function exportCommitMigrations(commit, target) {
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const files = git("ls-tree", "--name-only", `${commit}:supabase/migrations`).split("\n").filter(Boolean);
  if (files.length === 0) throw new Error(`No migrations found in ${commit}`);
  for (const file of files) writeFileSync(join(target, file), git("show", `${commit}:supabase/migrations/${file}`));
  return files.length;
}

// Same isolation pattern as pdf-processing-db-runner.mjs: copied config with a generated project id
// and shifted ports, so the primary project and its data are never addressed.
function prepareProject(migrationsDir, portOffset) {
  const projectId = `pdf-mig-eq-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  mkdirSync(projectParent, { recursive: true, mode: 0o700 });
  const workdir = join(realpathSync(projectParent), projectId);
  mkdirSync(join(workdir, "supabase"), { recursive: true, mode: 0o700 });
  const original = readFileSync(join(root, "supabase/config.toml"), "utf8");
  if (!/^project_id = "[^"]+"$/m.test(original) || /^\[remotes\./m.test(original)) {
    throw new Error("Cannot safely derive an isolated config from this project configuration");
  }
  const originalPorts = [...original.matchAll(/^(?:port|shadow_port|inspector_port) = (\d+)$/gm)].map((m) =>
    Number(m[1]),
  );
  const config = original
    .replace(/^project_id = "[^"]+"$/m, `project_id = "${projectId}"`)
    .replace(/^(port|shadow_port|inspector_port) = (\d+)$/gm, (_, key, value) => {
      const port = Number(value) + portOffset;
      if (port > 65535 || originalPorts.includes(port)) throw new Error("Test ports overlap primary project ports");
      return `${key} = ${port}`;
    });
  const dbPort = Number(config.match(/\[db\][\s\S]*?^port = (\d+)$/m)?.[1]);
  writeFileSync(join(workdir, "supabase/config.toml"), config, { mode: 0o600, flag: "wx" });
  cpSync(migrationsDir, join(workdir, "supabase/migrations"), { recursive: true });
  return { projectId, workdir, dbPort };
}

function verifyProject({ projectId, workdir }) {
  if (
    !projectPattern.test(projectId) ||
    dirname(workdir) !== realpathSync(projectParent) ||
    basename(workdir) !== projectId ||
    !readFileSync(join(workdir, "supabase/config.toml"), "utf8").includes(`project_id = "${projectId}"`)
  ) {
    throw new Error("Refusing to operate outside a dedicated equivalence project");
  }
}

function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ["ignore", "ignore", "pipe"] });
    let detail = "";
    child.stderr.on("data", (chunk) => {
      detail = (detail + chunk).slice(-8000);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal ?? code}). ${detail}`));
    });
  });
}

function inContainer(project, command, args) {
  verifyProject(project);
  const container = `supabase_db_${project.projectId}`;
  return execFileSync("docker", ["exec", container, command, "-U", "postgres", "-d", "postgres", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function normalizeDump(dump) {
  // Only non-semantic noise: pg_dump's random \restrict key and version banner lines.
  return dump
    .split("\n")
    .filter((line) => !/^\\(un)?restrict /.test(line) && !/^-- Dumped (from|by) /.test(line))
    .join("\n");
}

function snapshot(project) {
  const psql = (sql) => inContainer(project, "psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql]);
  const result = {
    dump: normalizeDump(inContainer(project, "pg_dump", ["--schema-only", "--schema=public", "--no-owner"])),
  };
  for (const [name, sql] of Object.entries(catalogQueries)) {
    result[name] = psql(`select coalesce(json_agg(row_to_json(q)), '[]') from (${sql}) as q`).trim();
  }
  const tables = JSON.parse(result.tables)
    .filter((table) => table.relkind === "r" || table.relkind === "p")
    .map((table) => table.relname);
  result.rows = tables
    .map((table) => {
      const ident = `public.${JSON.stringify(table)}`;
      const out = psql(
        `select count(*) || ' ' || coalesce(md5(string_agg(t::text, E'\\n' order by t::text)), '-') from ${ident} as t`,
      ).trim();
      return `${table} ${out}`;
    })
    .join("\n");
  return result;
}

async function snapshotMigrations(label, migrationsDir, portOffset) {
  const project = prepareProject(migrationsDir, portOffset);
  const env = isolatedSupabaseEnv(project.projectId);
  const cli = (...args) => run(join(root, "node_modules/.bin/supabase"), ["--workdir", project.workdir, ...args], env);
  let failure;
  let result;
  try {
    console.log(`[${label}] starting isolated project ${project.projectId} (DB ${project.dbPort})`);
    verifyProject(project);
    await cli("start", "--exclude", excludedServices);
    result = snapshot(project);
  } catch (error) {
    failure = error;
  } finally {
    try {
      // Exact generated project ID only: never --all, never the primary workdir.
      verifyProject(project);
      await cli("stop", "--project-id", project.projectId, "--no-backup");
      rmSync(project.workdir, { recursive: true });
      console.log(`[${label}] removed isolated project ${project.projectId}`);
    } catch (error) {
      console.error(`[${label}] cleanup failed; project retained at ${project.workdir}.`);
      failure = failure ? new Error(`${failure.message}\nCleanup: ${error.message}`, { cause: failure }) : error;
    }
  }
  if (failure) throw failure;
  return result;
}

function diffLines(a, b, limit = 40) {
  const left = a.split("\n");
  const right = b.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(left.length, right.length) && out.length < limit; i += 1) {
    if (left[i] !== right[i]) {
      out.push(`  line ${i + 1}:`, `    old: ${left[i] ?? "<missing>"}`, `    new: ${right[i] ?? "<missing>"}`);
    }
  }
  return out.join("\n");
}

function describeJsonDiff(a, b) {
  const pretty = (value) =>
    JSON.parse(value)
      .map((row) => JSON.stringify(row))
      .join("\n");
  return diffLines(pretty(a), pretty(b));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scratch = join(projectParent, `sources-${randomUUID()}`);
  try {
    let oldDir = options.old;
    if (!oldDir) {
      oldDir = join(scratch, "old");
      const count = exportCommitMigrations(options.commit, oldDir);
      console.log(`Old migrations: ${count} files from ${options.commit.slice(0, 12)}`);
    }
    for (const dir of [oldDir, options.new]) if (!existsSync(dir)) throw new Error(`Missing directory ${dir}`);
    const before = await snapshotMigrations("old", oldDir, 2000);
    const after = await snapshotMigrations("new", options.new, 3000);

    const differences = [];
    for (const key of Object.keys(before)) {
      if (before[key] === after[key]) continue;
      const detail =
        key === "dump" || key === "rows"
          ? diffLines(before[key], after[key])
          : describeJsonDiff(before[key], after[key]);
      differences.push(`${key} differs:\n${detail}`);
    }
    const count = (key, filter = () => true) => JSON.parse(after[key]).filter(filter).length;
    const summary =
      `${count("functions")} functions, ${count("tables", (t) => t.relkind === "r")} tables, ` +
      `${count("policies")} policies, ${count("constraints")} constraints, ${count("indexes")} indexes, ` +
      `${count("triggers")} triggers, ${count("columns")} columns`;
    if (differences.length > 0) {
      console.error(`FAIL: schemas differ (${summary} in new)\n${differences.join("\n")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS: identical pg_dump, catalogs and table rows (${summary}).`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
