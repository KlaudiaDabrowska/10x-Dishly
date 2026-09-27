// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against local Supabase: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const runId = randomUUID();
const password = "Smoke-Test-Passw0rd!";
const actorA = { email: `smoke-a-${runId}@example.com`, jar: new Map() };
const actorB = { email: `smoke-b-${runId}@example.com`, jar: new Map() };
const anonymous = { jar: new Map() };
const malformed = { jar: new Map() };

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
  { status, location, error = false, owner, denied = false, collection = false, home = false },
) {
  check(actual.status === status, "unexpected status");
  const directives = actual.cacheControl
    .toLowerCase()
    .split(",")
    .map((value) => value.trim());
  check(directives.includes("private") && directives.includes("no-store"), "missing private/no-store policy");
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
    check(actual.body.includes("<title>Your recipes | Dishly</title>"), "missing collection document title");
    check(/<h1\b[^>]*>\s*Your recipes\s*<\/h1>/.test(actual.body), "missing collection heading");
    check(actual.body.includes("No recipes yet"), "missing empty collection title");
    check(actual.body.includes("Your saved recipes will appear here."), "missing empty collection message");
    check(
      /<form\b(?=[^>]*\bmethod="POST")(?=[^>]*\baction="\/api\/auth\/signout")[^>]*>/.test(actual.body),
      "missing POST signout form",
    );
    check(actual.body.includes("Sign out"), "missing signout control");
  }
  if (home) {
    check(
      /<a\b[^>]*href="\/dashboard"[^>]*>\s*Your recipes\s*<\/a>/.test(actual.body),
      "missing collection navigation link",
    );
  }
  if (denied) {
    check(!actual.body.includes(actorA.email) && !actual.body.includes(actorB.email), "account identity was exposed");
    check(!actual.body.includes("No recipes yet"), "private collection markup was exposed");
    check(!actual.body.includes("Your saved recipes will appear here."), "private collection markup was exposed");
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
for (const [label, actor, other] of [
  ["A", actorA, actorB],
  ["B", actorB, actorA],
  ["A again", actorA, actorB],
]) {
  for (const path of ["/dashboard", `/dashboard?user_id=${encodeURIComponent(other.email)}`, "/"]) {
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
console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
