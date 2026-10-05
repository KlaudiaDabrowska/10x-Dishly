import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { calculateCostNanoUsd } from "../src/lib/pdf-processing/budget.ts";
import { createImportState } from "../src/lib/pdf-processing/import-state.ts";
import {
  OPENAI_API,
  OPENAI_MAXIMUM_COST_NANO_USD,
  OPENAI_MODEL,
  OPENAI_PRICING,
  recognizePdfBatch,
} from "../src/lib/pdf-processing/openai.ts";
import { PDF_RECIPE_SCHEMA_NAME } from "../src/lib/pdf-processing/prompt.ts";

if (!process.env.OPENAI_API_KEY) loadEnvFile(".env");
const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) throw new Error("OPENAI_API_KEY is required");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function localSupabase() {
  const raw = execFileSync("npx", ["--no-install", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = JSON.parse(raw);
  const url = status.API_URL;
  const key = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Local Supabase service credentials are unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ownerId = randomUUID();
const importId = randomUUID();
const supabase = localSupabase();
const email = `pdf-provider-smoke-${ownerId}@example.invalid`;
const { error: userError } = await supabase.auth.admin.createUser({ id: ownerId, email, email_confirm: true });
if (userError) throw new Error("Could not create the local smoke owner");

const batch = {
  version: 2,
  index: 0,
  source: {
    version: 1,
    sha256: digest("phase-4-provider-smoke-source"),
    filename: "synthetic-provider-smoke.pdf",
    byteLength: 256,
    pageCount: 1,
  },
  corePages: [1],
  documentContextPages: [1],
  adjacentContextPages: [],
  pages: [
    {
      page: 1,
      width: 100,
      height: 100,
      rotation: 0,
      items: [
        {
          anchor: { page: 1, itemIndex: 0 },
          text: "Dinner",
          transform: [1, 0, 0, 1, 0, 90],
          width: 20,
          height: 10,
          direction: "ltr",
          hasEOL: true,
        },
        {
          anchor: { page: 1, itemIndex: 1 },
          text: "Water soup",
          transform: [1, 0, 0, 1, 0, 70],
          width: 40,
          height: 10,
          direction: "ltr",
          hasEOL: true,
        },
        {
          anchor: { page: 1, itemIndex: 2 },
          text: "Ingredients: 100 ml water",
          transform: [1, 0, 0, 1, 0, 50],
          width: 60,
          height: 10,
          direction: "ltr",
          hasEOL: true,
        },
        {
          anchor: { page: 1, itemIndex: 3 },
          text: "Instructions: Pour the water into a bowl.",
          transform: [1, 0, 0, 1, 0, 30],
          width: 80,
          height: 10,
          direction: "ltr",
          hasEOL: true,
        },
      ],
    },
  ],
};

const result = await recognizePdfBatch({
  apiKey,
  batch,
  state: createImportState(supabase, ownerId),
  reservation: {
    importId,
    batchIndex: 0,
    fileFingerprint: batch.source.sha256,
    manifestDigest: digest("phase-4-provider-smoke-manifest"),
    inputDigest: digest(JSON.stringify(batch)),
    corePageStart: 1,
    corePageEnd: 1,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  },
});

assert.equal(result.duplicate, false);
assert.ok(result.value);
const { data: stateRows, error: stateError } = await supabase.rpc("get_pdf_import_state", {
  p_owner_id: ownerId,
  p_import_id: importId,
});
if (stateError) throw new Error("Could not read the reconciled local ledger state");
const importState = stateRows?.[0];
const ledgerBatch = importState?.batches?.[0];
assert.equal(ledgerBatch?.status, "reconciled");
assert.equal(ledgerBatch?.reservedCostNanoUsd, OPENAI_MAXIMUM_COST_NANO_USD);
assert.equal(ledgerBatch?.inputTokens, result.value.countedInputTokens);
assert.ok(Number.isSafeInteger(ledgerBatch?.outputTokens));
assert.ok(ledgerBatch.outputTokens <= 8_192);
assert.deepEqual(ledgerBatch.pricingSnapshot, OPENAI_PRICING);
assert.equal(
  ledgerBatch.actualCostNanoUsd,
  calculateCostNanoUsd(
    { inputTokens: ledgerBatch.inputTokens, outputTokens: ledgerBatch.outputTokens },
    OPENAI_PRICING,
  ),
);

const evidence = {
  version: 1,
  recordedAt: new Date().toISOString(),
  provider: OPENAI_PRICING.provider,
  requestedModel: OPENAI_MODEL,
  returnedModel: result.value.returnedModel,
  api: OPENAI_API,
  schema: PDF_RECIPE_SCHEMA_NAME,
  strictSchemaAccepted: true,
  pricingVersion: result.value.pricingVersion,
  countedInputTokens: result.value.countedInputTokens,
  usage: { inputTokens: ledgerBatch.inputTokens, outputTokens: ledgerBatch.outputTokens },
  reservedNanoUsd: ledgerBatch.reservedCostNanoUsd,
  actualNanoUsd: ledgerBatch.actualCostNanoUsd,
  ledgerStatus: ledgerBatch.status,
  responseId: result.value.responseId,
};
const outputPath = "evaluation/validate-pdf-processing/local/provider-smoke.json";
mkdirSync("evaluation/validate-pdf-processing/local", { recursive: true });
writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
console.log(
  JSON.stringify({
    ok: true,
    evidence: outputPath,
    model: evidence.returnedModel,
    api: evidence.api,
    schema: evidence.schema,
    usage: evidence.usage,
    reservedNanoUsd: evidence.reservedNanoUsd,
    actualNanoUsd: evidence.actualNanoUsd,
    ledgerStatus: evidence.ledgerStatus,
  }),
);
