import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, URL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createTextBatches } from "../src/lib/pdf-processing/batching.ts";
import { ClientRequestFailure, executeClientImport } from "../src/lib/pdf-processing/client-import.ts";
import { dispatchWithSpendingControl } from "../src/lib/pdf-processing/import-state.ts";
import { createValidationService } from "../src/lib/pdf-processing/service.ts";

const PASS_MESSAGE = "PASS  product import finalize/status recovery bridge";
const FAIL_MESSAGE = "FAIL  product import finalize/status recovery bridge";

function localHttpUrl(raw, name) {
  if (!raw) throw new Error(`${name} is required`);
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error(`${name} must target a local service`);
  return url;
}

function localDatabaseUrl(raw) {
  if (!raw) throw new Error("SUPABASE_DB_URL is required");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("SUPABASE_DB_URL must target local Postgres");
  return url;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function storeCookies(jar, response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attributes] = raw.split(";");
    const [name, ...value] = pair.split("=");
    const expired = attributes.some((attribute) => {
      const [key, ...parts] = attribute.trim().split("=");
      if (key.toLowerCase() === "max-age") return Number(parts.join("=")) <= 0;
      if (key.toLowerCase() === "expires") return Date.parse(parts.join("=")) <= Date.now();
      return false;
    });
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), value.join("="));
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function signIn(baseUrl, actor, fetchImpl) {
  const response = await fetchImpl(new URL("/api/auth/signin", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { Origin: baseUrl.origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: actor.email, password: actor.password }).toString(),
  });
  storeCookies(actor.jar, response);
  assert.equal(response.status, 302, "local smoke sign-in failed");
  assert.ok(actor.jar.size > 0, "local smoke sign-in returned no session cookie");
}

function privateNoStore(response) {
  const directives = (response.headers.get("cache-control") ?? "")
    .toLowerCase()
    .split(",")
    .map((value) => value.trim());
  return directives.includes("private") && directives.includes("no-store");
}

export function createHttpJsonRequest({ baseUrl, jar, fetchImpl = fetch }) {
  return async (path, init = {}) => {
    const response = await fetchImpl(new URL(path, baseUrl), {
      ...init,
      redirect: "manual",
      headers: {
        Cookie: cookieHeader(jar),
        Origin: baseUrl.origin,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    storeCookies(jar, response);
    assert.ok(privateNoStore(response), "product import response is not private/no-store");
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("product import response was not JSON");
    }
    if (!response.ok) throw new Error("product import HTTP request failed");
    return body;
  };
}

export function createProductRequestAdapter({ service, apiBase, requestHttp }) {
  const stats = { finalizeCalls: 0, statusCalls: 0, lostResponseInjected: false };
  const prefix = `${apiBase}/`;

  return {
    stats,
    async request(path, init = {}) {
      const body = init.body ? JSON.parse(String(init.body)) : null;
      if (path === apiBase) return service.createImport(body);
      if (path.startsWith(prefix) && path.endsWith("/batch")) {
        const importId = path.slice(prefix.length, -"/batch".length);
        return service.processBatch(importId, body);
      }
      if (path.startsWith(prefix) && path.endsWith("/finalize")) {
        stats.finalizeCalls++;
        await requestHttp(path, init);
        stats.lostResponseInjected = true;
        throw new ClientRequestFailure("network-error", true);
      }
      if (path.startsWith(prefix) && init.method === undefined) stats.statusCalls++;
      return requestHttp(path, init);
    },
  };
}

export async function withCleanup(work, cleanup) {
  try {
    return await work();
  } finally {
    await cleanup();
  }
}

function cleanupSmokeOwner(databaseUrl, actor) {
  if (!actor.id) return;
  const clientImportId = actor.importId ?? randomUUID();
  execFileSync(
    "npx",
    [
      "--no-install",
      "supabase",
      "db",
      "query",
      "--db-url",
      databaseUrl.href,
      `
        do $cleanup$
        declare v_internal_import_id uuid;
        begin
          select id into v_internal_import_id from public.pdf_imports
          where owner_id = ${sqlLiteral(actor.id)} and client_import_id = ${sqlLiteral(clientImportId)};
          update public.pdf_import_batches set reservation_id = null where import_id = v_internal_import_id;
          delete from public.pdf_usage_reports where reservation_id in (
            select id from public.pdf_budget_reservations where import_id = v_internal_import_id
          );
          delete from public.pdf_budget_reservations where import_id = v_internal_import_id;
          delete from public.recipes where owner_id = ${sqlLiteral(actor.id)};
          delete from public.pdf_imports where owner_id = ${sqlLiteral(actor.id)};
          delete from public.pdf_budget_scopes where scope_key = 'import:' || v_internal_import_id::text;
          delete from auth.users where id = ${sqlLiteral(actor.id)};
        end
        $cleanup$;
      `,
    ],
    { cwd: new URL("..", import.meta.url), env: process.env, stdio: "ignore" },
  );
}

function fixtureDocument(runId) {
  const textItem = (itemIndex, text, y) => ({
    anchor: { page: 1, itemIndex },
    text,
    transform: [10, 0, 0, 10, 50, y],
    width: 80,
    height: 10,
    direction: "ltr",
    hasEOL: true,
  });
  return {
    source: {
      version: 1,
      sha256: createHash("sha256").update(`product-http-${runId}`).digest("hex"),
      filename: "product-http-smoke.pdf",
      byteLength: 512,
      pageCount: 1,
    },
    pages: [
      {
        page: 1,
        width: 600,
        height: 800,
        rotation: 0,
        items: [textItem(0, "Bridge soup", 700), textItem(1, "200 ml water", 600), textItem(2, "Mix and serve.", 500)],
      },
    ],
  };
}

function fixtureRecipe() {
  return {
    version: 2,
    sourceStart: { page: 1, itemIndex: 0 },
    pages: [1],
    title: "Bridge soup",
    category: "lunch",
    sourceCategory: null,
    ingredientGroups: [
      { label: null, ingredients: [{ name: "water", quantity: "200", unit: "ml", sourceText: "200 ml water" }] },
    ],
    instructions: ["Mix and serve."],
    servings: null,
    footnotes: [],
    missingFieldReasons: [],
  };
}

function deterministicRecognize(calls) {
  const pricing = {
    provider: "local-test",
    model: "none",
    inputNanoUsdPerMillionTokens: 1,
    outputNanoUsdPerMillionTokens: 1,
  };
  return (options) => {
    calls.push(options.batch.index);
    return dispatchWithSpendingControl({
      state: options.state,
      reservation: { ...options.reservation, maximumCostNanoUsd: 1000, pricing },
      dispatch: async () => ({
        value: { recipes: [fixtureRecipe()] },
        usage: { inputTokens: 10, outputTokens: 10 },
        outputDigest: "o".repeat(64),
        reportId: randomUUID(),
      }),
    });
  };
}

export async function runProductHttpSmoke(options = {}) {
  const baseUrl = localHttpUrl(options.baseUrl ?? process.env.BASE_URL ?? "http://localhost:4321", "BASE_URL");
  const supabaseUrl = localHttpUrl(options.supabaseUrl ?? process.env.SUPABASE_URL, "SUPABASE_URL");
  const databaseUrl = localDatabaseUrl(options.databaseUrl ?? process.env.SUPABASE_DB_URL);
  const secretKey = options.secretKey ?? process.env.SUPABASE_SECRET_KEY;
  const publicKey = options.publicKey ?? process.env.SUPABASE_KEY;
  if (!secretKey || !publicKey) throw new Error("Local Supabase credentials are required");

  const fetchImpl = options.fetchImpl ?? fetch;
  const clientFactory = options.clientFactory ?? createClient;
  const admin = clientFactory(supabaseUrl.href, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = randomUUID();
  const actor = {
    id: null,
    email: `pdf-product-http-${runId}@example.invalid`,
    password: `Local-smoke-${runId}!`,
    jar: new Map(),
  };

  return withCleanup(
    async () => {
      const createdUser = await admin.auth.admin.createUser({
        email: actor.email,
        password: actor.password,
        email_confirm: true,
      });
      if (createdUser.error || !createdUser.data.user) throw new Error("Could not create local smoke owner");
      actor.id = createdUser.data.user.id;
      await signIn(baseUrl, actor, fetchImpl);

      const recognizeCalls = [];
      const service = createValidationService({
        client: admin,
        ownerId: actor.id,
        channel: "product",
        apiKey: "unused-local-test-key",
        prepareBatches: async (source, pages) => createTextBatches(source, pages, { corePagesPerBatch: 1 }),
        recognize: deterministicRecognize(recognizeCalls),
      });
      const requestHttp = createHttpJsonRequest({ baseUrl, jar: actor.jar, fetchImpl });
      const adapter = createProductRequestAdapter({ service, apiBase: "/api/imports", requestHttp });
      const document = fixtureDocument(runId);
      const importId = randomUUID();
      actor.importId = importId;
      const result = await executeClientImport({
        apiBase: "/api/imports",
        file: {
          name: document.source.filename,
          size: document.source.byteLength,
          arrayBuffer: async () => new ArrayBuffer(0),
        },
        signal: new globalThis.AbortController().signal,
        importId,
        read: async () => document,
        request: adapter.request,
        sleep: async () => undefined,
        update: () => undefined,
      });

      assert.equal(result.outcome.status, "committed");
      assert.equal(result.outcome.readBack, true);
      assert.equal(result.outcome.pending, 0);
      assert.equal(result.outcome.saved, 1);
      assert.equal(result.outcome.alreadySaved, 0);
      assert.equal(adapter.stats.finalizeCalls, 1);
      assert.ok(adapter.stats.statusCalls >= 1);
      assert.equal(adapter.stats.lostResponseInjected, true);
      assert.deepEqual(recognizeCalls, [0]);

      const browser = clientFactory(supabaseUrl.href, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const login = await browser.auth.signInWithPassword({ email: actor.email, password: actor.password });
      if (login.error) throw new Error("Could not verify owner-scoped recipe read-back");
      const recipes = await browser.from("recipes").select("id").order("source_start_page");
      if (recipes.error) throw new Error("Could not verify owner-scoped recipe read-back");
      assert.deepEqual(
        recipes.data.map((row) => row.id),
        result.outcome.savedIds,
      );
      assert.equal(recipes.data.length, 1, "status recovery created a duplicate recipe");

      return {
        status: result.outcome.status,
        saved: result.outcome.saved,
        recognitionCalls: recognizeCalls.length,
      };
    },
    () => cleanupSmokeOwner(databaseUrl, actor),
  );
}

export async function runCli(run = runProductHttpSmoke, write = console.log) {
  try {
    await run();
    write(PASS_MESSAGE);
    return 0;
  } catch {
    write(FAIL_MESSAGE);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runCli();
}
