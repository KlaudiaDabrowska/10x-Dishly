// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against local Supabase: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { URL } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const TEST_DB_URL = process.env.SUPABASE_DB_URL;
if (!TEST_DB_URL) throw new Error("SUPABASE_DB_URL is required for the local test-only recipe seed");
const databaseUrl = new URL(TEST_DB_URL);
if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname))
  throw new Error("Refusing to seed recipes outside local Supabase");
const runId = randomUUID();
const password = "Smoke-Test-Passw0rd!";
const actorA = { email: `smoke-a-${runId}@example.com`, jar: new Map() };
const actorB = { email: `smoke-b-${runId}@example.com`, jar: new Map() };
const anonymous = { jar: new Map() };
const malformed = { jar: new Map() };
const fixture = {
  actorA: {
    id: randomUUID(),
    importId: randomUUID(),
    title: `Smoke owner A recipe ${runId}`,
  },
  actorB: {
    id: randomUUID(),
    importId: randomUUID(),
    title: `Smoke owner B recipe ${runId}`,
  },
};

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function localAdminSql(statement) {
  execFileSync("npx", ["--no-install", "supabase", "db", "query", "--db-url", TEST_DB_URL, statement], {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: "ignore",
  });
}

function seedRecipe(ownerEmail, recipe, fingerprint) {
  localAdminSql(`
    do $seed$
    declare v_owner_id uuid;
    begin
      select id into strict v_owner_id from auth.users where email = ${sqlLiteral(ownerEmail)};
      insert into public.pdf_imports (
        id, owner_id, channel, file_fingerprint, manifest_digest, status, expires_at, source_filename
      ) values (
        ${sqlLiteral(recipe.importId)}, v_owner_id, 'product', ${sqlLiteral(fingerprint)}, ${sqlLiteral("m".repeat(64))},
        'committed', '2099-01-01T00:00:00Z', 'smoke-fixture.pdf'
      );
      insert into public.recipes (
        id, owner_id, file_fingerprint, source_start_page, source_start_item, import_id, source_filename,
        source_pages, title, category, ingredient_groups, instructions
      ) values (
        ${sqlLiteral(recipe.id)}, v_owner_id, ${sqlLiteral(fingerprint)}, 1, 0, ${sqlLiteral(recipe.importId)},
        'smoke-fixture.pdf', array[1], ${sqlLiteral(recipe.title)}, 'lunch',
        '[{"label":null,"ingredients":[{"name":"water","quantity":"200","unit":"ml","sourceText":"200 ml water"}]}]'::jsonb,
        '["Mix and serve."]'::jsonb
      );
    end
    $seed$;
  `);
}

function cleanupLocalFixtures() {
  localAdminSql(`
    do $cleanup$
    begin
      delete from public.recipes where id in (${sqlLiteral(fixture.actorA.id)}, ${sqlLiteral(fixture.actorB.id)});
      delete from public.pdf_imports where id in (${sqlLiteral(fixture.actorA.importId)}, ${sqlLiteral(fixture.actorB.importId)});
      delete from auth.users where email in (${sqlLiteral(actorA.email)}, ${sqlLiteral(actorB.email)});
    end
    $cleanup$;
  `);
}

function storeCookies(jar, response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((attribute) => {
      const [key, ...value] = attribute.trim().split("=");
      if (key.toLowerCase() === "max-age") return Number(value.join("=")) <= 0;
      if (key.toLowerCase() === "expires") return Date.parse(value.join("=")) <= Date.now();
      return false;
    });
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(actor, path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: [...actor.jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(actor.jar, response);
  return {
    status: response.status,
    location: response.headers.get("location"),
    body: await response.text(),
    cacheControl: response.headers.get("cache-control") ?? "",
  };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function assertResponse(
  actual,
  {
    status,
    location,
    error = false,
    owner,
    denied = false,
    collection = false,
    home = false,
    detailTitle,
    notFound = false,
    hidden = [],
    cache = true,
  },
) {
  check(actual.status === status, "unexpected status");
  if (cache) {
    const directives = actual.cacheControl
      .toLowerCase()
      .split(",")
      .map((value) => value.trim());
    check(directives.includes("private") && directives.includes("no-store"), "missing private/no-store policy");
  }
  if (location !== undefined) {
    check(Boolean(actual.location), "missing redirect");
    const target = new URL(actual.location, BASE_URL);
    check(target.origin === new URL(BASE_URL).origin && target.pathname === location, "incorrect redirect destination");
    check(
      error ? Boolean(target.searchParams.get("error")?.trim()) : !target.searchParams.has("error"),
      "incorrect error parameter",
    );
  }
  if (owner) {
    check(actual.body.includes(owner.email), "missing current account identity");
    const other = owner === actorA ? actorB : actorA;
    check(!actual.body.includes(other.email), "another account identity was exposed");
  }
  if (collection) {
    check(/<html\b[^>]*\blang=(?:"pl"|'pl'|pl)(?:\s|>)/.test(actual.body), "missing dashboard language");
    check(actual.body.includes("<title>Twoje przepisy | Dishly</title>"), "missing collection document title");
    check(/<h1\b[^>]*>\s*Twoje przepisy\s*<\/h1>/.test(actual.body), "missing collection heading");
    check(actual.body.includes("Twoja kolekcja przepisów"), "missing collection title");
    if (collection === "empty") {
      check(actual.body.includes("Nie masz jeszcze zapisanych przepisów"), "missing real empty collection state");
      check(
        !actual.body.includes(fixture.actorA.title) && !actual.body.includes(fixture.actorB.title),
        "recipe title was exposed",
      );
    } else {
      const ownFixture = owner === actorA ? fixture.actorA : fixture.actorB;
      const foreignFixture = owner === actorA ? fixture.actorB : fixture.actorA;
      check(actual.body.includes(ownFixture.title), "missing own recipe title");
      check(!actual.body.includes(foreignFixture.title), "foreign recipe title was exposed");
    }
    check(
      /<form\b(?=[^>]*\bmethod="POST")(?=[^>]*\baction="\/api\/auth\/signout")[^>]*>/.test(actual.body),
      "missing POST signout form",
    );
    check(actual.body.includes("Wyloguj się"), "missing signout control");
  }
  if (home) {
    check(
      /<a\b[^>]*href="\/dashboard"[^>]*>\s*Your recipes\s*<\/a>/.test(actual.body),
      "missing collection navigation link",
    );
  }
  if (detailTitle) {
    check(actual.body.includes(detailTitle), "missing own recipe detail title");
    check(actual.body.includes("smoke-fixture.pdf"), "missing recipe source filename");
    check(actual.body.includes("200 ml water"), "missing recipe ingredient source text");
  }
  if (notFound) {
    check(actual.body.includes("Przepis niedostępny"), "missing common recipe 404 marker");
    check(
      !actual.body.includes(fixture.actorA.id) && !actual.body.includes(fixture.actorB.id),
      "recipe id was exposed",
    );
    check(!actual.body.includes(fixture.actorB.title), "foreign recipe title was exposed");
    check(!/cudzy|nie istnieje|nieprawidłow/i.test(actual.body), "recipe 404 disclosed a reason");
    for (const value of hidden) check(!actual.body.includes(value), "recipe 404 disclosed request data");
  }
  if (denied) {
    check(!actual.body.includes(actorA.email) && !actual.body.includes(actorB.email), "account identity was exposed");
    check(!actual.body.includes("Twoja kolekcja przepisów"), "private collection markup was exposed");
    check(
      !actual.body.includes(fixture.actorA.title) && !actual.body.includes(fixture.actorB.title),
      "recipe title was exposed",
    );
  }
}

const steps = [
  ["home renders", () => request(anonymous, "/"), { status: 200, denied: true }],
  [
    "dashboard redirects anonymous user",
    () => request(anonymous, "/dashboard"),
    { status: 302, location: "/auth/signin", denied: true },
  ],
];
for (const [label, actor] of [
  ["A", actorA],
  ["B", actorB],
]) {
  steps.push(
    [
      `signup creates account ${label}`,
      () => request(actor, "/api/auth/signup", { method: "POST", form: { email: actor.email, password } }),
      { status: 302, location: "/auth/confirm-email" },
    ],
    [
      `signin rejects wrong password for ${label}`,
      () => request(actor, "/api/auth/signin", { method: "POST", form: { email: actor.email, password: "wrong" } }),
      { status: 302, location: "/auth/signin", error: true },
    ],
    [
      `signin accepts correct password for ${label}`,
      () => request(actor, "/api/auth/signin", { method: "POST", form: { email: actor.email, password } }),
      { status: 302, location: "/dashboard" },
    ],
  );
}
for (const [label, actor] of [
  ["A", actorA],
  ["B", actorB],
])
  steps.push([
    `${label} sees the real empty collection before seeding`,
    () => request(actor, "/dashboard"),
    { status: 200, owner: actor, collection: "empty" },
  ]);
steps.push([
  "local admin seeds distinct owner recipe fixtures",
  async () => {
    seedRecipe(actorA.email, fixture.actorA, "a".repeat(64));
    seedRecipe(actorB.email, fixture.actorB, "b".repeat(64));
    return { status: 204, body: "", cacheControl: "" };
  },
  { status: 204, cache: false },
]);
for (const [label, actor, other] of [
  ["A", actorA, actorB],
  ["B", actorB, actorA],
  ["A again", actorA, actorB],
]) {
  for (const path of [
    "/dashboard",
    `/dashboard?user_id=${encodeURIComponent(other.email)}`,
    `/dashboard?owner_id=${encodeURIComponent(other.email)}`,
    "/",
  ]) {
    const page = path.includes("?") ? "dashboard with untrusted ownership hint" : path;
    steps.push([
      `${label} sees only own identity on ${page}`,
      () => request(actor, path),
      {
        status: 200,
        owner: actor,
        ...(path.startsWith("/dashboard") ? { collection: true } : { home: true }),
      },
    ]);
  }
}
const nonexistentId = randomUUID();
steps.push(
  [
    "A opens own recipe detail",
    () => request(actorA, `/dashboard/recipes/${fixture.actorA.id}`),
    { status: 200, owner: actorA, detailTitle: fixture.actorA.title },
  ],
  [
    "A receives common 404 for foreign recipe detail",
    () => request(actorA, `/dashboard/recipes/${fixture.actorB.id}`),
    { status: 404, owner: actorA, notFound: true, hidden: [fixture.actorB.id, fixture.actorB.title] },
  ],
  [
    "A receives common 404 for nonexistent recipe detail",
    () => request(actorA, `/dashboard/recipes/${nonexistentId}`),
    { status: 404, owner: actorA, notFound: true, hidden: [nonexistentId] },
  ],
  [
    "A receives common 404 for malformed recipe detail",
    () => request(actorA, "/dashboard/recipes/not-a-uuid"),
    { status: 404, owner: actorA, notFound: true, hidden: ["not-a-uuid"] },
  ],
);
steps.push(
  [
    "malformed session cannot access dashboard",
    () => {
      malformed.jar = new Map(actorA.jar);
      const sessionNames = [...malformed.jar.keys()].filter((name) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
      check(sessionNames.length > 0, "no session cookies available to corrupt");
      for (const name of sessionNames) malformed.jar.set(name, "malformed-session");
      return request(malformed, "/dashboard");
    },
    { status: 302, location: "/auth/signin", denied: true },
  ],
  [
    "A remains authenticated after malformed session",
    () => request(actorA, "/dashboard"),
    { status: 200, owner: actorA, collection: true },
  ],
  [
    "anonymous session remains isolated",
    () => request(anonymous, "/dashboard"),
    { status: 302, location: "/auth/signin", denied: true },
  ],
);
for (const [label, actor] of [
  ["A", actorA],
  ["B", actorB],
]) {
  steps.push(
    [
      `signout clears ${label} session`,
      () => request(actor, "/api/auth/signout", { method: "POST" }),
      { status: 302, location: "/" },
    ],
    [
      `dashboard redirects ${label} after signout`,
      () => request(actor, "/dashboard"),
      { status: 302, location: "/auth/signin", denied: true },
    ],
    [`home contains no identity after ${label} signout`, () => request(actor, "/"), { status: 200, denied: true }],
  );
  if (actor === actorA)
    steps.push([
      "B remains authenticated after A signout",
      () => request(actorB, "/dashboard"),
      { status: 200, owner: actorB, collection: true },
    ]);
}

let failed = 0;
try {
  for (const [name, run, expected] of steps) {
    try {
      const actual = await run();
      assertResponse(actual, expected);
      console.log(`PASS  ${name}`);
    } catch {
      failed++;
      // Never log responses, redirect queries or exception details that could contain session secrets.
      console.log(`FAIL  ${name} (request or assertion failed)`);
    }
  }
} finally {
  try {
    cleanupLocalFixtures();
    console.log("PASS  local smoke fixtures and accounts cleaned up");
  } catch {
    failed++;
    console.log("FAIL  local smoke cleanup failed");
  }
}
console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
