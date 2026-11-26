// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against local Supabase: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { URL } from "node:url";
import { runSmokeSteps } from "./smoke-output.mjs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const applicationUrl = new URL(BASE_URL);
if (applicationUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(applicationUrl.hostname))
  throw new Error("Refusing to run smoke against a non-local application");
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
const privateImportSentinel = `private-import-${runId}`;
const foreignIngredientSentinel = `foreign-ingredient-${runId}`;
const sharedClientImportId = randomUUID();
const fixture = {
  actorA: {
    id: randomUUID(),
    internalImportId: randomUUID(),
    importId: randomUUID(),
    sourceFilename: "smoke-fixture.pdf",
    title: `Smoke owner A recipe ${runId}`,
    updatedAt: "2026-11-24T08:00:00+00:00",
    ingredientName: "water",
    ingredientQuantity: "200",
    ingredientUnit: "ml",
    ingredientSourceText: "200 ml water",
  },
  actorB: {
    id: randomUUID(),
    internalImportId: randomUUID(),
    importId: randomUUID(),
    decisionId: randomUUID(),
    sourceFilename: `${privateImportSentinel}.pdf`,
    title: `Smoke owner B recipe ${runId}`,
    updatedAt: "2026-11-24T08:01:00+00:00",
    ingredientName: foreignIngredientSentinel,
    ingredientQuantity: null,
    ingredientUnit: null,
    ingredientSourceText: foreignIngredientSentinel,
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
  const ingredientGroups = JSON.stringify([
    {
      label: null,
      ingredients: [
        {
          name: recipe.ingredientName,
          quantity: recipe.ingredientQuantity,
          unit: recipe.ingredientUnit,
          sourceText: recipe.ingredientSourceText,
        },
      ],
    },
  ]);
  localAdminSql(`
    do $seed$
    declare v_owner_id uuid;
    begin
      select id into strict v_owner_id from auth.users where email = ${sqlLiteral(ownerEmail)};
      insert into public.pdf_imports (
        id, client_import_id, owner_id, channel, file_fingerprint, manifest_digest, status, expires_at,
        batch_count, manifest, source_filename
      ) values (
        ${sqlLiteral(recipe.internalImportId)}, ${sqlLiteral(recipe.importId)}, v_owner_id, 'product',
        ${sqlLiteral(fingerprint)}, ${sqlLiteral("m".repeat(64))}, 'committed', '2099-01-01T00:00:00Z', 1,
        '{"batches":[],"pageDigests":[]}'::jsonb, ${sqlLiteral(recipe.sourceFilename)}
      );
      insert into public.recipes (
        id, owner_id, file_fingerprint, source_start_page, source_start_item, import_id, source_filename,
        source_pages, title, category, ingredient_groups, instructions, updated_at
      ) values (
        ${sqlLiteral(recipe.id)}, v_owner_id, ${sqlLiteral(fingerprint)}, 1, 0, ${sqlLiteral(recipe.internalImportId)},
        ${sqlLiteral(recipe.sourceFilename)}, array[1], ${sqlLiteral(recipe.title)}, 'lunch',
        ${sqlLiteral(ingredientGroups)}::jsonb,
        '["Mix and serve."]'::jsonb, ${sqlLiteral(recipe.updatedAt)}
      );
    end
    $seed$;
  `);
}

function seedImportIsolationFixtures() {
  const manifest = JSON.stringify({
    batches: [
      {
        batchIndex: 0,
        corePageStart: 1,
        corePageEnd: 1,
        inputDigest: "d".repeat(64),
      },
    ],
    pageDigests: ["0".repeat(64)],
  });
  localAdminSql(`
    do $seed$
    declare
      v_owner_a uuid;
      v_owner_b uuid;
    begin
      select id into strict v_owner_a from auth.users where email = ${sqlLiteral(actorA.email)};
      select id into strict v_owner_b from auth.users where email = ${sqlLiteral(actorB.email)};

      perform public.create_pdf_import(
        v_owner_a, ${sqlLiteral(sharedClientImportId)}, 'product', ${sqlLiteral("c".repeat(64))},
        ${sqlLiteral("e".repeat(64))}, 'shared-a.pdf', ${sqlLiteral(manifest)}::jsonb,
        clock_timestamp() + interval '5 minutes'
      );
      perform public.create_pdf_import(
        v_owner_b, ${sqlLiteral(sharedClientImportId)}, 'product', ${sqlLiteral("f".repeat(64))},
        ${sqlLiteral("a".repeat(64))}, 'shared-b.pdf', ${sqlLiteral(manifest)}::jsonb,
        clock_timestamp() + interval '5 minutes'
      );

      insert into public.pdf_import_outcomes (
        import_id, owner_id, saved_count, existing_count, pending_count, kept_count, discarded_count,
        saved_ids, existing_ids
      ) values (
        ${sqlLiteral(fixture.actorB.internalImportId)}, v_owner_b, 0, 0, 1, 0, 0, '{}', '{}'
      );
      insert into public.pdf_incomplete_recipe_decisions (
        id, owner_id, import_id, source_start_page, source_start_item, payload_digest, missing_reason_codes
      ) values (
        ${sqlLiteral(fixture.actorB.decisionId)}, v_owner_b, ${sqlLiteral(fixture.actorB.internalImportId)},
        1, 1, ${sqlLiteral("b".repeat(64))}, array['missing-title']
      );
    end
    $seed$;
  `);
}

function assertImportIsolationState() {
  localAdminSql(`
    do $assert$
    declare
      v_owner_a uuid;
      v_owner_b uuid;
    begin
      select id into strict v_owner_a from auth.users where email = ${sqlLiteral(actorA.email)};
      select id into strict v_owner_b from auth.users where email = ${sqlLiteral(actorB.email)};
      if (
        select count(*) from public.pdf_imports
        where client_import_id = ${sqlLiteral(sharedClientImportId)}
          and owner_id in (v_owner_a, v_owner_b)
      ) <> 2 then
        raise exception 'owner-scoped create fixture changed';
      end if;
      if (
        select count(distinct id) from public.pdf_imports
        where client_import_id = ${sqlLiteral(sharedClientImportId)}
          and owner_id in (v_owner_a, v_owner_b)
      ) <> 2 then
        raise exception 'owner-scoped create reused an internal id';
      end if;
      if not exists (
        select 1 from public.pdf_incomplete_recipe_decisions
        where id = ${sqlLiteral(fixture.actorB.decisionId)} and owner_id = v_owner_b
          and import_id = ${sqlLiteral(fixture.actorB.internalImportId)} and state = 'pending'
      ) then
        raise exception 'foreign decision was mutated';
      end if;
      if not exists (
        select 1 from public.pdf_import_outcomes
        where import_id = ${sqlLiteral(fixture.actorB.internalImportId)} and owner_id = v_owner_b
          and pending_count = 1 and kept_count = 0 and discarded_count = 0
      ) then
        raise exception 'foreign outcome was mutated';
      end if;
      if (select count(*) from public.recipes where owner_id = v_owner_b) <> 1 then
        raise exception 'foreign recipes were mutated';
      end if;
    end
    $assert$;
  `);
}

function assertRecipeEditState(editedTitle, editedIngredientName, editedIngredientSourceText, editedInstruction) {
  localAdminSql(`
    do $assert$
    declare
      v_owner_a uuid;
      v_owner_b uuid;
    begin
      select id into strict v_owner_a from auth.users where email = ${sqlLiteral(actorA.email)};
      select id into strict v_owner_b from auth.users where email = ${sqlLiteral(actorB.email)};
      if not exists (
        select 1 from public.recipes
        where id = ${sqlLiteral(fixture.actorA.id)} and owner_id = v_owner_a
          and title = ${sqlLiteral(editedTitle)}
          and ingredient_groups = ${sqlLiteral(
            JSON.stringify([
              {
                label: null,
                ingredients: [
                  {
                    name: editedIngredientName,
                    quantity: null,
                    unit: null,
                    sourceText: editedIngredientSourceText,
                  },
                ],
              },
            ]),
          )}::jsonb
          and instructions = ${sqlLiteral(JSON.stringify([editedInstruction]))}::jsonb
      ) then
        raise exception 'own recipe edit did not persist';
      end if;
      if not exists (
        select 1 from public.recipes
        where id = ${sqlLiteral(fixture.actorB.id)} and owner_id = v_owner_b
          and title = ${sqlLiteral(fixture.actorB.title)}
          and ingredient_groups = ${sqlLiteral(
            JSON.stringify([
              {
                label: null,
                ingredients: [
                  {
                    name: fixture.actorB.ingredientName,
                    quantity: fixture.actorB.ingredientQuantity,
                    unit: fixture.actorB.ingredientUnit,
                    sourceText: fixture.actorB.ingredientSourceText,
                  },
                ],
              },
            ]),
          )}::jsonb
          and instructions = '["Mix and serve."]'::jsonb
          and updated_at = ${sqlLiteral(fixture.actorB.updatedAt)}::timestamptz
      ) then
        raise exception 'foreign recipe was mutated';
      end if;
    end
    $assert$;
  `);
}

function cleanupLocalFixtures() {
  localAdminSql(`
    do $cleanup$
    begin
      delete from public.recipes where id in (${sqlLiteral(fixture.actorA.id)}, ${sqlLiteral(fixture.actorB.id)});
      delete from public.pdf_imports where owner_id in (
        select id from auth.users where email in (${sqlLiteral(actorA.email)}, ${sqlLiteral(actorB.email)})
      );
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

async function request(actor, path, { method = "GET", form, json } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: [...actor.jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
  });
  storeCookies(actor.jar, response);
  return {
    status: response.status,
    location: response.headers.get("location"),
    body: await response.text(),
    cacheControl: response.headers.get("cache-control") ?? "",
  };
}

function assertImportNotFound(actual, hidden) {
  assertResponse(actual, { status: 404 });
  check(actual.body === '{"error":"import-not-found"}', "unexpected import 404 body");
  for (const value of hidden) check(!actual.body.includes(value), "import 404 disclosed private request data");
  check(!/cudzy|foreign|nie istnieje|nonexistent|decision/i.test(actual.body), "import 404 disclosed a reason");
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
    detailIngredient = "200 ml water",
    notFound = false,
    filters,
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
    } else if (collection === "filtered-empty") {
      check(actual.body.includes("Brak przepisów pasujących do filtrów"), "missing filtered empty state");
      check(
        !actual.body.includes(fixture.actorA.title) && !actual.body.includes(fixture.actorB.title),
        "filtered empty state exposed a recipe title",
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
  if (filters) {
    const category = filters.category ?? "";
    check(actual.body.includes(`value="${category}" selected=""`), "active category filter was not preserved");
    check(actual.body.includes(`value="${filters.ingredient}"`), "active ingredient filter was not preserved");
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
    check(actual.body.includes(detailIngredient), "missing recipe ingredient source text");
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
    seedImportIsolationFixtures();
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
const editedTitle = `Smoke corrected recipe ${runId}`;
const editedIngredientName = "seltzer";
const editedIngredient = "250 ml seltzer";
const editedInstruction = "Stir and chill.";
let foreignRecipeEditBody = "";
steps.push(
  [
    "A filters own collection before opening a result",
    () => request(actorA, "/dashboard?category=lunch&ingredient=water"),
    {
      status: 200,
      owner: actorA,
      collection: true,
      filters: { category: "lunch", ingredient: "water" },
    },
  ],
  [
    "A opens recipe selected from the filtered collection",
    () => request(actorA, `/dashboard/recipes/${fixture.actorA.id}`),
    { status: 200, owner: actorA, detailTitle: fixture.actorA.title },
  ],
  [
    "A filter cannot discover B's private ingredient canary",
    () => request(actorA, `/dashboard?ingredient=${encodeURIComponent(foreignIngredientSentinel)}`),
    {
      status: 200,
      owner: actorA,
      collection: "filtered-empty",
      filters: { category: null, ingredient: foreignIngredientSentinel },
    },
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
  [
    "A edits and reads back own recipe through the built Worker",
    async () => {
      const edit = await request(actorA, `/api/recipes/${fixture.actorA.id}`, {
        method: "PATCH",
        json: {
          updatedAt: fixture.actorA.updatedAt,
          title: editedTitle,
          ingredientGroups: [
            {
              originIndex: 0,
              label: null,
              ingredients: [
                {
                  originIndex: 0,
                  name: editedIngredientName,
                  sourceText: editedIngredient,
                },
              ],
            },
          ],
          instructions: [{ originIndex: 0, text: editedInstruction }],
        },
      });
      assertResponse(edit, { status: 200 });
      const body = JSON.parse(edit.body);
      check(
        body &&
          typeof body === "object" &&
          Object.keys(body).sort().join(",") === "recipeId,updatedAt" &&
          body.recipeId === fixture.actorA.id &&
          typeof body.updatedAt === "string" &&
          body.updatedAt !== fixture.actorA.updatedAt,
        "unexpected recipe edit success body",
      );
      assertRecipeEditState(editedTitle, editedIngredientName, editedIngredient, editedInstruction);
      fixture.actorA.title = editedTitle;
      return request(actorA, `/dashboard/recipes/${fixture.actorA.id}`);
    },
    { status: 200, owner: actorA, detailTitle: editedTitle, detailIngredient: editedIngredient },
  ],
  [
    "A no longer finds the edited recipe by its old ingredient",
    () => request(actorA, "/dashboard?category=lunch&ingredient=water"),
    {
      status: 200,
      owner: actorA,
      collection: "filtered-empty",
      filters: { category: "lunch", ingredient: "water" },
    },
  ],
  [
    "A immediately finds the edited recipe by its corrected ingredient",
    () => request(actorA, `/dashboard?category=lunch&ingredient=${editedIngredientName}`),
    {
      status: 200,
      owner: actorA,
      collection: true,
      filters: { category: "lunch", ingredient: editedIngredientName },
    },
  ],
  [
    "A receives common 404 for foreign recipe edit",
    async () => {
      const actual = await request(actorA, `/api/recipes/${fixture.actorB.id}`, {
        method: "PATCH",
        json: {
          updatedAt: fixture.actorB.updatedAt,
          title: "Foreign overwrite",
          ingredientGroups: [],
          instructions: [],
        },
      });
      assertResponse(actual, { status: 404 });
      check(actual.body === '{"error":"recipe-not-found"}', "unexpected foreign recipe edit body");
      foreignRecipeEditBody = actual.body;
      assertRecipeEditState(editedTitle, editedIngredientName, editedIngredient, editedInstruction);
      return { status: 204, body: "", cacheControl: "" };
    },
    { status: 204, cache: false },
  ],
  [
    "A receives the same 404 for nonexistent recipe edit",
    async () => {
      const actual = await request(actorA, `/api/recipes/${nonexistentId}`, {
        method: "PATCH",
        json: {
          updatedAt: fixture.actorA.updatedAt,
          title: "Nonexistent overwrite",
          ingredientGroups: [],
          instructions: [],
        },
      });
      assertResponse(actual, { status: 404 });
      check(actual.body === foreignRecipeEditBody, "foreign and nonexistent recipe edit responses differ");
      assertRecipeEditState(editedTitle, editedIngredientName, editedIngredient, editedInstruction);
      return { status: 204, body: "", cacheControl: "" };
    },
    { status: 204, cache: false },
  ],
);
const nonexistentImportId = randomUUID();
const nonexistentDecisionId = randomUUID();
let foreignStatusBody = "";
let foreignDecisionBody = "";
steps.push(
  [
    "owner-scoped create accepts one public import id for two owners",
    async () => {
      assertImportIsolationState();
      return { status: 204, body: "", cacheControl: "" };
    },
    { status: 204, cache: false },
  ],
  [
    "A receives common 404 for foreign import status",
    async () => {
      const actual = await request(actorA, `/api/imports/${fixture.actorB.importId}`);
      foreignStatusBody = actual.body;
      assertImportNotFound(actual, [fixture.actorB.importId, fixture.actorB.title, privateImportSentinel]);
      return { status: 204, body: "", cacheControl: "" };
    },
    { status: 204, cache: false },
  ],
  [
    "A receives common 404 for nonexistent import status",
    async () => {
      const actual = await request(actorA, `/api/imports/${nonexistentImportId}`);
      assertImportNotFound(actual, [nonexistentImportId, privateImportSentinel]);
      check(actual.body === foreignStatusBody, "foreign and nonexistent import status differ");
      return { status: 204, body: "", cacheControl: "" };
    },
    { status: 204, cache: false },
  ],
  [
    "A receives common 404 for foreign decision mutation",
    async () => {
      const actual = await request(
        actorA,
        `/api/imports/${fixture.actorB.importId}/decisions/${fixture.actorB.decisionId}`,
        { method: "POST", json: { action: "discard" } },
      );
      foreignDecisionBody = actual.body;
      assertImportNotFound(actual, [fixture.actorB.importId, fixture.actorB.decisionId, privateImportSentinel]);
      return { status: 204, body: "", cacheControl: "" };
    },
    { status: 204, cache: false },
  ],
  [
    "A receives common 404 for nonexistent decision mutation",
    async () => {
      const actual = await request(actorA, `/api/imports/${nonexistentImportId}/decisions/${nonexistentDecisionId}`, {
        method: "POST",
        json: { action: "discard" },
      });
      assertImportNotFound(actual, [nonexistentImportId, nonexistentDecisionId, privateImportSentinel]);
      check(actual.body === foreignDecisionBody, "foreign and nonexistent decision responses differ");
      assertImportIsolationState();
      return { status: 204, body: "", cacheControl: "" };
    },
    { status: 204, cache: false },
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

const failed = await runSmokeSteps({ steps, assertResponse, cleanup: cleanupLocalFixtures });
process.exit(failed ? 1 : 0);
