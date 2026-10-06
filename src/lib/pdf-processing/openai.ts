import type { PdfTextBatch } from "./batching.ts";
import { createTextBatches } from "./batching.ts";
import type { PdfSource, PageText } from "./contracts.ts";
import { calculateCostNanoUsd } from "./budget.ts";
import type { PricingSnapshot, UsageCounts } from "./budget.ts";
import { dispatchWithSpendingControl } from "./import-state.ts";
import type { BatchReservation, DispatchClaim } from "./import-state.ts";
import { PDF_LIMITS } from "./limits.ts";
import {
  PDF_RECIPE_INSTRUCTIONS,
  PDF_RECIPE_RESPONSE_SCHEMA,
  PDF_RECIPE_SCHEMA_NAME,
  createPdfRecipeInput,
} from "./prompt.ts";

export const OPENAI_MODEL = "gpt-5.4-mini";
export const OPENAI_API = "responses-v1";
export const OPENAI_PRICING_VERSION = "standard-2026-10-03";
export const OPENAI_PRICING: PricingSnapshot = Object.freeze({
  provider: "openai",
  model: OPENAI_MODEL,
  inputNanoUsdPerMillionTokens: 750_000_000,
  outputNanoUsdPerMillionTokens: 4_500_000_000,
});
export const OPENAI_MAXIMUM_COST_NANO_USD = calculateCostNanoUsd(
  { inputTokens: PDF_LIMITS.maxInputTokens, outputTokens: PDF_LIMITS.maxOutputTokens },
  OPENAI_PRICING,
);

const BASE_URL = "https://api.openai.com/v1";
const RESPONSE_BODY_LIMIT = 1024 * 1024;
const COUNT_BODY_LIMIT = 64 * 1024;
const COMPATIBLE_MODELS = new Set([OPENAI_MODEL, "gpt-5.4-mini-2026-03-17"]);

export class OpenAiPdfError extends Error {
  readonly code: string;
  // Only set for HTTP 429: the provider-requested wait, already bounded to a finite non-negative value.
  readonly retryAfterMs?: number;
  constructor(code: string, retryAfterMs?: number) {
    super(code);
    this.name = "OpenAiPdfError";
    this.code = code;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export interface ProviderAttemptEvidence {
  attempt: number;
  reservationId: string;
  error: string | null;
  retryAfterMs: number | null;
  delayMs: number | null;
}

export interface OpenAiRecognitionResult {
  recipes: unknown[];
  responseId: string;
  requestedModel: typeof OPENAI_MODEL;
  returnedModel: string;
  api: typeof OPENAI_API;
  pricingVersion: typeof OPENAI_PRICING_VERSION;
  countedInputTokens: number;
}

interface AdapterOptions {
  apiKey: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  now?: () => number;
  // Shared across every batch in one import; never reset between provider requests.
  processingStartedAt?: number;
  // Evaluation-only private evidence sink; never operational logging.
  onProviderResponse?: (response: unknown, attempt: number) => void;
  onProviderAttempt?: (evidence: ProviderAttemptEvidence) => void;
  onInputCount?: (measurement: { inputTokens: number; limit: number }) => void;
  sleep?: (milliseconds: number) => Promise<void>;
}

function retryAfterMs(headers: Headers, now: number): number | undefined {
  const header = headers.get("retry-after-ms")?.trim();
  const milliseconds = header ? Number(header) : Number.NaN;
  if (Number.isFinite(milliseconds) && milliseconds >= 0) return milliseconds;
  const value = headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function requestBody(batch: PdfTextBatch) {
  return {
    model: OPENAI_MODEL,
    store: false,
    background: false,
    tools: [],
    reasoning: { effort: PDF_LIMITS.reasoningEffort },
    instructions: PDF_RECIPE_INSTRUCTIONS,
    input: createPdfRecipeInput(batch),
    max_output_tokens: PDF_LIMITS.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: PDF_RECIPE_SCHEMA_NAME,
        strict: true,
        schema: PDF_RECIPE_RESPONSE_SCHEMA,
      },
    },
  } as const;
}

function inputTokenRequestBody(batch: PdfTextBatch) {
  const { model, tools, reasoning, instructions, input, text } = requestBody(batch);
  return { model, tools, reasoning, instructions, input, text };
}

export function createOpenAiPdfRequest(batch: PdfTextBatch) {
  return requestBody(batch);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}

async function readBounded(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) throw new OpenAiPdfError("provider-response-too-large");
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    if (size > maximumBytes) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function providerPost(
  path: string,
  body: unknown,
  options: AdapterOptions,
  remainingMs: number,
  bodyLimit: number,
): Promise<unknown> {
  const apiKey = options.apiKey.trim();
  if (!apiKey || !/^[\x21-\x7e]+$/.test(apiKey)) throw new OpenAiPdfError("provider-configuration-error");
  if (options.signal?.aborted) throw new OpenAiPdfError("cancelled");
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () => {
      controller.abort();
    },
    Math.max(1, Math.min(PDF_LIMITS.providerDeadlineMs, remainingMs)),
  );
  try {
    const response = await (options.fetch ?? fetch)(BASE_URL + path, {
      method: "POST",
      // Workers rejects redirect "error"; a manual 3xx is not ok and fails as provider-http-error.
      redirect: "manual",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await readBounded(response, bodyLimit);
    if (!response.ok) {
      if (response.status === 429)
        throw new OpenAiPdfError("provider-rate-limited", retryAfterMs(response.headers, (options.now ?? Date.now)()));
      if (response.status >= 500) throw new OpenAiPdfError("provider-server-error");
      throw new OpenAiPdfError("provider-http-error");
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new OpenAiPdfError("provider-malformed-json");
    }
  } catch (error) {
    if (error instanceof OpenAiPdfError) throw error;
    if (options.signal?.aborted) throw new OpenAiPdfError("cancelled");
    if (controller.signal.aborted) throw new OpenAiPdfError("provider-timeout");
    throw new OpenAiPdfError("provider-transport-error");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

function remaining(startedAt: number, now: () => number): number {
  const value = PDF_LIMITS.processingDeadlineMs - (now() - startedAt);
  if (value <= 0) throw new OpenAiPdfError("processing-timeout");
  return value;
}

export async function countOpenAiPdfInput(
  batch: PdfTextBatch,
  options: AdapterOptions,
  startedAt = (options.now ?? Date.now)(),
): Promise<number> {
  const now = options.now ?? Date.now;
  let raw: unknown;
  try {
    raw = await providerPost(
      "/responses/input_tokens",
      inputTokenRequestBody(batch),
      options,
      remaining(startedAt, now),
      COUNT_BODY_LIMIT,
    );
  } catch (error) {
    if (error instanceof OpenAiPdfError && ["cancelled", "provider-timeout", "processing-timeout"].includes(error.code))
      throw error;
    if (error instanceof OpenAiPdfError) throw new OpenAiPdfError(`input-token-count-${error.code}`);
    throw new OpenAiPdfError("input-token-count-unavailable");
  }
  if (
    !isRecord(raw) ||
    raw.object !== "response.input_tokens" ||
    !safeInteger(raw.input_tokens, Number.MAX_SAFE_INTEGER)
  )
    throw new OpenAiPdfError("input-token-count-incompatible");
  options.onInputCount?.({ inputTokens: raw.input_tokens, limit: PDF_LIMITS.maxInputTokens });
  if (raw.input_tokens > PDF_LIMITS.maxInputTokens) throw new OpenAiPdfError("input-token-limit-exceeded");
  return raw.input_tokens;
}

// Counting is non-generative. Rebuild the complete manifest before reserving any paid batch.
// Byte limits and repeated context are rechecked by the shared builder on every split.
export async function prepareOpenAiPdfBatches(
  source: PdfSource,
  pages: readonly PageText[],
  options: AdapterOptions & {
    onCountAttempt?: (batch: PdfTextBatch, attempt: number) => void;
    countInput?: typeof countOpenAiPdfInput;
  },
): Promise<PdfTextBatch[]> {
  const startedAt = options.processingStartedAt ?? (options.now ?? Date.now)();
  let attempt = 0;
  for (let corePages: number = PDF_LIMITS.corePagesPerBatch; corePages >= 1; corePages = Math.floor(corePages / 2)) {
    const batches = createTextBatches(source, pages, { corePagesPerBatch: corePages });
    let oversize = false;
    for (const batch of batches) {
      options.onCountAttempt?.(batch, attempt++);
      try {
        await (options.countInput ?? countOpenAiPdfInput)(batch, options, startedAt);
      } catch (error) {
        if (!(error instanceof OpenAiPdfError) || error.code !== "input-token-limit-exceeded") throw error;
        oversize = true;
        break;
      }
    }
    if (!oversize) return batches;
  }
  throw new OpenAiPdfError("input-token-limit-exceeded");
}

function parseResponse(
  raw: unknown,
  countedInputTokens: number,
): {
  value: OpenAiRecognitionResult;
  usage: UsageCounts;
  outputText: string;
} {
  if (!isRecord(raw)) throw new OpenAiPdfError("provider-malformed-response");
  if (raw.status === "incomplete") {
    const details = raw.incomplete_details;
    if (isRecord(details) && details.reason === "max_output_tokens")
      throw new OpenAiPdfError("output-token-limit-exceeded");
    if (isRecord(details) && details.reason === "content_filter") throw new OpenAiPdfError("provider-blocked");
    throw new OpenAiPdfError("provider-incomplete-response");
  }
  if (raw.status !== "completed") throw new OpenAiPdfError("provider-incomplete-response");
  if (typeof raw.id !== "string" || !raw.id || typeof raw.model !== "string")
    throw new OpenAiPdfError("provider-malformed-response");
  if (!COMPATIBLE_MODELS.has(raw.model)) throw new OpenAiPdfError("pricing-model-incompatible");
  if (!Array.isArray(raw.output) || raw.output.length === 0) throw new OpenAiPdfError("provider-missing-output");
  const output = raw.output as unknown[];
  const content: Record<string, unknown>[] = output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return [];
    return (item.content as unknown[]).filter(isRecord);
  });
  if (content.some((item) => isRecord(item) && item.type === "refusal")) throw new OpenAiPdfError("provider-refused");
  const texts = content.filter(
    (item): item is Record<string, unknown> & { type: "output_text"; text: string } =>
      item.type === "output_text" && typeof item.text === "string",
  );
  if (texts.length !== 1) throw new OpenAiPdfError("provider-missing-output");
  const usage = raw.usage;
  if (!isRecord(usage) || !safeInteger(usage.input_tokens, PDF_LIMITS.maxInputTokens))
    throw new OpenAiPdfError("provider-missing-usage");
  if (!safeInteger(usage.output_tokens, PDF_LIMITS.maxOutputTokens)) throw new OpenAiPdfError("provider-missing-usage");
  if (usage.input_tokens !== countedInputTokens) throw new OpenAiPdfError("input-token-accounting-mismatch");
  if (isRecord(usage.output_tokens_details)) {
    const reasoning = usage.output_tokens_details.reasoning_tokens;
    if (!safeInteger(reasoning, usage.output_tokens)) throw new OpenAiPdfError("output-token-accounting-mismatch");
  }
  if (isRecord(usage.input_tokens_details)) {
    const cached = usage.input_tokens_details.cached_tokens;
    if (!safeInteger(cached, usage.input_tokens)) throw new OpenAiPdfError("input-token-accounting-mismatch");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(texts[0].text) as unknown;
  } catch {
    throw new OpenAiPdfError("provider-invalid-structured-output");
  }
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.recipes))
    throw new OpenAiPdfError("provider-missing-candidates");
  const recipes = parsed.recipes as unknown[];
  return {
    value: {
      recipes,
      responseId: raw.id,
      requestedModel: OPENAI_MODEL,
      returnedModel: raw.model,
      api: OPENAI_API,
      pricingVersion: OPENAI_PRICING_VERSION,
      countedInputTokens,
    },
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    outputText: texts[0].text,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function recognizePdfBatch(
  options: AdapterOptions & {
    batch: PdfTextBatch;
    state: Parameters<typeof dispatchWithSpendingControl>[0]["state"];
    reservation: Omit<BatchReservation, "maximumCostNanoUsd" | "pricing">;
  },
): Promise<{ claim: DispatchClaim; value?: OpenAiRecognitionResult; duplicate: boolean }> {
  const now = options.now ?? Date.now;
  const startedAt = options.processingStartedAt ?? now();
  if (!Number.isFinite(startedAt) || startedAt > now()) throw new OpenAiPdfError("invalid-processing-start");
  const countedInputTokens = await countOpenAiPdfInput(options.batch, options, startedAt);
  const request = requestBody(options.batch);
  remaining(startedAt, now); // Counting must not consume the deadline and still reserve a paid attempt.
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    let reservationId = "";
    try {
      const result = await dispatchWithSpendingControl({
        state: options.state,
        reservation: {
          ...options.reservation,
          maximumCostNanoUsd: OPENAI_MAXIMUM_COST_NANO_USD,
          pricing: OPENAI_PRICING,
        },
        dispatch: async (claim) => {
          reservationId = claim.reservation_id;
          let raw: unknown;
          try {
            raw = await providerPost("/responses", request, options, remaining(startedAt, now), RESPONSE_BODY_LIMIT);
          } catch (error) {
            // Only an HTTP 429 response is a proven unbilled rejection; every other failure stays held.
            if (error instanceof OpenAiPdfError && error.code === "provider-rate-limited")
              await options.state.reconcileRateLimited(claim.reservation_id, crypto.randomUUID());
            throw error;
          }
          options.onProviderResponse?.(raw, attempt);
          const parsed = parseResponse(raw, countedInputTokens);
          return {
            value: parsed.value,
            usage: parsed.usage,
            outputDigest: await sha256(parsed.outputText),
            reportId: crypto.randomUUID(),
          };
        },
      });
      if (result.claim.claimed)
        options.onProviderAttempt?.({ attempt, reservationId, error: null, retryAfterMs: null, delayMs: null });
      return result;
    } catch (error) {
      const rateLimited = error instanceof OpenAiPdfError && error.code === "provider-rate-limited";
      const requested = rateLimited ? (error.retryAfterMs ?? null) : null;
      let delayMs: number | null = null;
      if (rateLimited && attempt <= PDF_LIMITS.rateLimitRetries) {
        const wait = Math.min(requested ?? PDF_LIMITS.rateLimitDefaultDelayMs, PDF_LIMITS.rateLimitMaxDelayMs);
        // The retry must still have import time left after waiting; otherwise the 429 ends the import.
        if (wait < PDF_LIMITS.processingDeadlineMs - (now() - startedAt)) delayMs = wait;
      }
      if (reservationId)
        options.onProviderAttempt?.({
          attempt,
          reservationId,
          error: error instanceof OpenAiPdfError ? error.code : "provider-dispatch-failed",
          retryAfterMs: requested,
          delayMs,
        });
      if (delayMs === null) throw error;
      await sleep(delayMs);
      remaining(startedAt, now);
    }
  }
}
