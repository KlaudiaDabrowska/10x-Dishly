export const PROBE_PDF = "%PDF-1.4\n% Dishly deployment probe\n%%EOF\n";
export const PROBE_QUEUE = "dishly-pdf-imports";
export const PROBE_DLQ = "dishly-pdf-imports-dlq";

export interface ProbeMessage {
  version: 1;
  kind: "deployment_probe";
  jobId: string;
  objectKey: string;
  requestedAt: string;
}

export interface ProbeBucket {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<{ size: number; text(): Promise<string> } | null>;
  delete(key: string): Promise<void>;
}

export interface ProbeEnvironment {
  DEPLOYMENT_ENV?: string;
  DEPLOY_PROBE_TOKEN?: string;
  PDF_BUCKET?: ProbeBucket;
  PDF_IMPORT_QUEUE?: { send(message: ProbeMessage): Promise<void> };
}

export interface ProbeLog {
  event: string;
  job_id: string | null;
  attempt: number;
  object_deleted: boolean;
  duration_ms: number;
  outcome: string;
}

export function logProbe(entry: ProbeLog) {
  // Only the explicitly constructed fields below reach logs, never provider errors or message bodies.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

export function probeObjectKey(jobId: string) {
  return `deployment-probes/${jobId}.pdf`;
}

export function isProbeMessage(value: unknown): value is ProbeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.version === 1 &&
    message.kind === "deployment_probe" &&
    typeof message.jobId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(message.jobId) &&
    message.objectKey === probeObjectKey(message.jobId) &&
    typeof message.requestedAt === "string" &&
    Number.isFinite(Date.parse(message.requestedAt))
  );
}

async function authorized(header: string | null, token: string | undefined) {
  if (!header?.startsWith("Bearer ") || !token) return false;
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all(
    [header.slice(7), token].map(
      async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
    ),
  );
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export async function handleProbe(request: Request, env: ProbeEnvironment, log = logProbe) {
  if (env.DEPLOYMENT_ENV === "preview") {
    return Response.json({ error: "infrastructure_unavailable" }, { status: 503 });
  }
  if (!(await authorized(request.headers.get("Authorization"), env.DEPLOY_PROBE_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const bucket = env.PDF_BUCKET;
  const queue = env.PDF_IMPORT_QUEUE;
  if (!bucket || !queue) return Response.json({ error: "infrastructure_unavailable" }, { status: 503 });

  const started = Date.now();
  const jobId = crypto.randomUUID();
  const message: ProbeMessage = {
    version: 1,
    kind: "deployment_probe",
    jobId,
    objectKey: probeObjectKey(jobId),
    requestedAt: new Date().toISOString(),
  };
  try {
    await bucket.put(message.objectKey, PROBE_PDF);
    await queue.send(message);
    log({
      event: "probe_queued",
      job_id: jobId,
      attempt: 0,
      object_deleted: false,
      duration_ms: Date.now() - started,
      outcome: "queued",
    });
    return Response.json({ jobId, status: "queued" }, { status: 202 });
  } catch {
    // A failed send can have an ambiguous outcome. This diagnostic has no business side effects;
    // a later delivery of a deleted object is intentionally an idempotent success.
    let deleted = false;
    try {
      await bucket.delete(message.objectKey);
      deleted = true;
    } catch {
      // The one-day bucket lifecycle is the final safety net if storage is unavailable.
    }
    log({
      event: "probe_enqueue_failed",
      job_id: jobId,
      attempt: 0,
      object_deleted: deleted,
      duration_ms: Date.now() - started,
      outcome: "retryable_failure",
    });
    return Response.json({ error: "infrastructure_unavailable" }, { status: 503 });
  }
}

export interface ProbeDelivery {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options: { delaySeconds: number }): void;
}

export async function consumeProbe(queue: string, message: ProbeDelivery, bucket: ProbeBucket, log = logProbe) {
  const started = Date.now();
  const body = message.body;
  const valid = isProbeMessage(body);
  let deleted = false;
  let outcome = "terminal_failure";
  try {
    if (queue !== PROBE_QUEUE && queue !== PROBE_DLQ) throw new Error("Unexpected queue");
    if (!valid) {
      // Never trust a malformed message's object key. Lifecycle expiry covers unidentified objects.
      message.ack();
      return;
    }
    let terminal = queue === PROBE_DLQ;
    try {
      if (!terminal) {
        const object = await bucket.get(body.objectKey);
        if (!object) {
          outcome = "already_deleted";
        } else if (object.size !== PROBE_PDF.length || (await object.text()) !== PROBE_PDF) {
          outcome = "terminal_failure";
        } else {
          outcome = "success";
        }
        terminal = true;
      }
    } finally {
      if (terminal) {
        await bucket.delete(body.objectKey);
        deleted = true;
      }
    }
    message.ack();
  } catch {
    outcome = "retryable_failure";
    message.retry({ delaySeconds: 60 });
  } finally {
    log({
      event: outcome === "terminal_failure" ? "terminal_failure" : "probe_processed",
      job_id: valid ? body.jobId : null,
      attempt: message.attempts,
      object_deleted: deleted,
      duration_ms: Date.now() - started,
      outcome,
    });
  }
}
