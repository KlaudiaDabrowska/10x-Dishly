import type { APIContext } from "astro";
import {
  DEPLOYMENT_ENV,
  OPENAI_API_KEY,
  PDF_VALIDATION_ENABLED,
  PDF_VALIDATION_EVALUATOR_IDS,
  SUPABASE_SECRET_KEY,
  SUPABASE_URL,
} from "astro:env/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase";
import { SpendingControlError } from "@/lib/pdf-processing/import-state";
import { PdfRequestError } from "@/lib/pdf-processing/manifest";
import { OpenAiPdfError } from "@/lib/pdf-processing/openai";
import { PdfReadError } from "@/lib/pdf-processing/reader-core";
import { createValidationService } from "@/lib/pdf-processing/service";
import type { ValidationService } from "@/lib/pdf-processing/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function evaluatorIds(): Set<string> {
  return new Set(
    (PDF_VALIDATION_EVALUATOR_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID.test(value)),
  );
}

// Missing configuration, preview, or the default-off switch all disable the experiment.
export function experimentAvailable(): boolean {
  return (
    DEPLOYMENT_ENV !== "preview" &&
    PDF_VALIDATION_ENABLED === "true" &&
    Boolean(OPENAI_API_KEY?.trim() && SUPABASE_URL && SUPABASE_SECRET_KEY) &&
    evaluatorIds().size > 0
  );
}

export function isEvaluator(userId: string | undefined): boolean {
  return Boolean(userId && experimentAvailable() && evaluatorIds().has(userId.toLowerCase()));
}

export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

const STATUS_BY_CODE: Record<string, number> = {
  "import-not-found": 404,
  "active-import-exists": 409,
  "import-not-processing": 409,
  "batch-already-processed": 409,
  "batch-already-dispatched": 409,
  "batch-results-missing": 409,
  "manifest-mismatch": 409,
  "payload-digest-mismatch": 409,
  "import-budget-insufficient": 409,
  "reservation-failed": 409,
};

// Sanitized error codes only: never provider bodies, source text or database messages.
export function errorResponse(error: unknown): Response {
  if (error instanceof PdfRequestError) return privateJson({ error: error.code }, 400);
  if (error instanceof PdfReadError) return privateJson({ error: error.code }, 422);
  if (error instanceof OpenAiPdfError) return privateJson({ error: error.code }, 502);
  if (error instanceof SpendingControlError)
    return privateJson({ error: error.code }, STATUS_BY_CODE[error.code] ?? 500);
  return privateJson({ error: "internal-error" }, 500);
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes))
    throw new PdfRequestError("request-too-large");
  if (!request.body) throw new PdfRequestError("invalid-request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PdfRequestError("request-too-large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new PdfRequestError("invalid-json");
  }
}

function sameOrigin(context: APIContext): boolean {
  const origin = context.request.headers.get("origin");
  const site = context.request.headers.get("sec-fetch-site");
  return origin === context.url.origin && (site === null || site === "same-origin");
}

export interface GuardedRequest {
  service: ValidationService;
  ownerId: string;
  body: unknown;
}

// Session, evaluator allowlist, same-origin mutation and bounded JSON body, in that order.
export async function guard(
  context: APIContext,
  options: { mutation: boolean; maxBodyBytes?: number },
): Promise<GuardedRequest | Response> {
  if (!experimentAvailable()) return privateJson({ error: "experiment_unavailable" }, 503);
  const user = context.locals.user;
  if (!user) return privateJson({ error: "authentication_required" }, 401);
  if (!isEvaluator(user.id)) return privateJson({ error: "forbidden" }, 403);
  if (options.mutation && !sameOrigin(context)) return privateJson({ error: "cross_origin_forbidden" }, 403);
  const id = context.params.id;
  if (id !== undefined && !UUID.test(id)) return privateJson({ error: "import-not-found" }, 404);
  const client = createAdminClient();
  const apiKey = OPENAI_API_KEY?.trim();
  if (!client || !apiKey) return privateJson({ error: "experiment_unavailable" }, 503);
  let body: unknown = null;
  if (options.maxBodyBytes !== undefined) {
    const contentType = context.request.headers.get("content-type") ?? "";
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim()))
      return privateJson({ error: "unsupported-media-type" }, 415);
    try {
      body = await readBoundedJson(context.request, options.maxBodyBytes);
    } catch (error) {
      if (error instanceof PdfRequestError && error.code === "request-too-large")
        return privateJson({ error: error.code }, 413);
      return errorResponse(error);
    }
  }
  return { service: createValidationService({ client, ownerId: user.id, apiKey }), ownerId: user.id, body };
}

// Owner-scoped read-back through the cookie-bound client and RLS, never the privileged client.
export async function verifyReadBack(context: APIContext, ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .in("id", [...ids]);
  if (error || !Array.isArray(data)) return false;
  const found = new Set(data.map((row: { id: string }) => row.id));
  return ids.every((id) => found.has(id));
}
