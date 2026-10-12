import { useCallback, useEffect, useRef, useState } from "react";
import type { RecipeCandidate } from "./contracts.ts";
import { batchFromManifest } from "./manifest.ts";
import type { SourceManifest } from "./manifest.ts";
import type { ReadResult, ReaderFile } from "./reader-core.ts";

export type ClientImportStage = "idle" | "reading" | "recognizing" | "saving" | "done" | "failed" | "cancelled";

export interface ReturnedCandidate {
  batchIndex: number;
  candidateIndex: number;
  status: "complete" | "incomplete";
  candidate: RecipeCandidate;
  warnings: string[];
  explanations: string[];
}

export interface ClientImportOutcome {
  status: string;
  saved: number;
  alreadySaved: number;
  pending: number;
  readBack: boolean;
}

export interface ClientImportState {
  stage: ClientImportStage;
  progress: { done: number; total: number } | null;
  errorCode: string | null;
  outcome: ClientImportOutcome | null;
  candidates: ReturnedCandidate[];
  pending: ReturnedCandidate[];
  importId: string | null;
}

interface ImportCreated {
  importId: string;
  manifestDigest: string;
  manifest: SourceManifest;
}

export type ClientImportEvent =
  | { type: "started"; at: number }
  | { type: "read"; at: number; source: ReadResult["source"] }
  | { type: "manifest"; batchCount: number }
  | { type: "batch"; durationMs: number }
  | { type: "recognized"; at: number }
  | {
      type: "finished";
      at: number;
      stage: ClientImportStage;
      errorCode: string | null;
      importId: string | null;
      outcome: ClientImportOutcome | null;
    };

export class ClientRequestFailure extends Error {
  readonly code: string;
  readonly lost: boolean;

  constructor(code: string, lost = false) {
    super(code);
    this.name = "ClientRequestFailure";
    this.code = code;
    this.lost = lost;
  }
}

type RequestJson = <T>(path: string, init?: RequestInit, signal?: AbortSignal) => Promise<T>;

const INITIAL_STATE: ClientImportState = {
  stage: "idle",
  progress: null,
  errorCode: null,
  outcome: null,
  candidates: [],
  pending: [],
  importId: null,
};

// Private JSON calls only. Bodies stay in memory and are never logged or cached.
export async function requestImportJson<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      ...(signal ? { signal } : {}),
      credentials: "same-origin",
      cache: "no-store",
      headers: init.body ? { "content-type": "application/json" } : {},
    });
  } catch {
    if (signal?.aborted) throw new ClientRequestFailure("cancelled");
    throw new ClientRequestFailure("network-error", true);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new ClientRequestFailure("invalid-response", true);
  }
  if (!response.ok) {
    const code = (body as { error?: unknown } | null)?.error;
    throw new ClientRequestFailure(typeof code === "string" ? code : `http-${response.status}`);
  }
  return body as T;
}

async function recoverStatus(apiBase: string, id: string, request: RequestJson): Promise<ClientImportOutcome | null> {
  try {
    const status = await request<{
      status: string;
      outcome: Omit<ClientImportOutcome, "status" | "readBack"> | null;
      readBack: boolean;
    }>(`${apiBase}/${id}`);
    if (status.status === "committed" && status.outcome)
      return { status: status.status, ...status.outcome, readBack: status.readBack };
    return { status: status.status, saved: 0, alreadySaved: 0, pending: 0, readBack: false };
  } catch {
    return null;
  }
}

const FINALIZE_RECOVERY_DELAYS_MS = [0, 250, 500, 1_000, 2_000] as const;
const NON_TERMINAL_IMPORT_STATUSES = new Set(["created", "processing", "ready"]);

async function recoverFinalizedStatus(
  apiBase: string,
  id: string,
  request: RequestJson,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<ClientImportOutcome | null> {
  let lastKnown: ClientImportOutcome | null = null;
  for (const delay of FINALIZE_RECOVERY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    const recovered = await recoverStatus(apiBase, id, request);
    if (!recovered) continue;
    lastKnown = recovered;
    if (!NON_TERMINAL_IMPORT_STATUSES.has(recovered.status)) return recovered;
  }
  return lastKnown;
}

export interface ExecuteClientImportOptions {
  apiBase: string;
  file: ReaderFile;
  signal: AbortSignal;
  importId: string;
  read: (file: ReaderFile, options: { signal: AbortSignal }) => Promise<ReadResult>;
  request?: RequestJson;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onImportDispatched?: () => void;
  update: (state: Partial<ClientImportState>) => void;
  event?: (event: ClientImportEvent) => void;
}

export async function executeClientImport(options: ExecuteClientImportOptions): Promise<{
  outcome: ClientImportOutcome;
  candidates: ReturnedCandidate[];
}> {
  const request = options.request ?? requestImportJson;
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  options.update({ stage: "reading" });
  let created: ImportCreated;
  let candidates: ReturnedCandidate[] = [];
  {
    const read = await options.read(options.file, { signal: options.signal });
    options.event?.({ type: "read", at: now(), source: read.source });
    options.update({ stage: "recognizing", importId: options.importId });
    options.onImportDispatched?.();
    created = await request<ImportCreated>(
      options.apiBase,
      {
        method: "POST",
        body: JSON.stringify({ importId: options.importId, source: read.source, pages: read.pages }),
      },
      options.signal,
    );
    if (created.importId !== options.importId) throw new ClientRequestFailure("invalid-response");
    const total = created.manifest.batches.length;
    options.event?.({ type: "manifest", batchCount: total });
    options.update({ progress: { done: 0, total } });
    for (const entry of created.manifest.batches) {
      if (options.signal.aborted) throw new ClientRequestFailure("cancelled");
      const startedAt = now();
      const batch = batchFromManifest(read.source, read.pages, entry);
      const result = await request<{ candidates: ReturnedCandidate[] }>(
        `${options.apiBase}/${options.importId}/batch`,
        { method: "POST", body: JSON.stringify(batch) },
        options.signal,
      );
      options.event?.({ type: "batch", durationMs: now() - startedAt });
      candidates = [...candidates, ...result.candidates];
      options.update({ candidates, progress: { done: entry.batchIndex + 1, total } });
    }
  }
  // The block above releases extracted source text before finalization.
  options.event?.({ type: "recognized", at: now() });
  options.update({ stage: "saving" });
  let outcome: ClientImportOutcome;
  try {
    outcome = await request<ClientImportOutcome>(
      `${options.apiBase}/${options.importId}/finalize`,
      {
        method: "POST",
        body: JSON.stringify({
          manifestDigest: created.manifestDigest,
          candidates: candidates.map(({ batchIndex, candidateIndex, candidate }) => ({
            batchIndex,
            candidateIndex,
            candidate,
          })),
        }),
      },
      options.signal,
    );
  } catch (failure) {
    // A lost response is resolved by status lookup, never by another model call.
    if (!(failure instanceof ClientRequestFailure && failure.lost)) throw failure;
    const recovered = await recoverFinalizedStatus(options.apiBase, options.importId, request, sleep);
    if (!recovered) throw failure;
    outcome = recovered;
  }
  return { outcome, candidates };
}

export type ProductCompletion = "redirect" | "pending" | "empty" | "unconfirmed" | "failure";

export function importIdForEvidence(importId: string, dispatched: boolean): string | null {
  return dispatched ? importId : null;
}

export function productCompletion(outcome: ClientImportOutcome): ProductCompletion {
  if (NON_TERMINAL_IMPORT_STATUSES.has(outcome.status)) return "unconfirmed";
  if (outcome.status !== "committed") return "failure";
  if (!outcome.readBack) return "unconfirmed";
  if (outcome.pending > 0) return "pending";
  if (outcome.saved === 0 && outcome.alreadySaved === 0) return "empty";
  return "redirect";
}

const FILE_CODES = new Set(["file-too-large", "invalid-file-size", "file-size-changed"]);
const PAGE_CODES = new Set(["too-many-pages", "invalid-page-count"]);
const UNREADABLE_CODES = new Set([
  "encrypted-document",
  "invalid-document",
  "invalid-layout",
  "unreadable-document",
  "worker-origin",
]);
const SESSION_CODES = new Set(["authentication_required", "authentication-required", "http-401"]);
const UNAVAILABLE_CODES = new Set(["import_unavailable", "http-503"]);
const ACTIVE_CODES = new Set(["active-import-exists", "import-not-processing"]);
const BUDGET_CODES = new Set(["import-budget-insufficient", "reservation-failed"]);
const TIMEOUT_CODES = new Set(["reader-timeout", "processing-timeout", "provider-timeout"]);
const PROVIDER_CODES = new Set([
  "provider-blocked",
  "provider-configuration-error",
  "provider-http-error",
  "provider-incomplete-response",
  "provider-invalid-structured-output",
  "provider-malformed-json",
  "provider-malformed-response",
  "provider-missing-candidates",
  "provider-missing-output",
  "provider-missing-usage",
  "provider-rate-limited",
  "provider-refused",
  "provider-response-too-large",
  "provider-server-error",
  "provider-transport-error",
  "output-token-limit-exceeded",
]);

export interface PolishImportError {
  title: string;
  action: string;
}

export function polishImportError(code: string | null): PolishImportError {
  if (FILE_CODES.has(code ?? ""))
    return { title: "Plik jest za duży.", action: "Wybierz plik PDF o rozmiarze do 20 MB." };
  if (PAGE_CODES.has(code ?? ""))
    return { title: "Dokument ma za dużo stron.", action: "Wybierz plik PDF zawierający maksymalnie 115 stron." };
  if (UNREADABLE_CODES.has(code ?? ""))
    return {
      title: "Nie udało się odczytać tekstu z tego PDF-a.",
      action: "Wybierz niezaszyfrowany PDF z tekstem. Skan dokumentu nie jest jeszcze obsługiwany.",
    };
  if (code === "network-error")
    return { title: "Utracono połączenie z serwerem.", action: "Sprawdź internet i wybierz plik ponownie." };
  if (UNAVAILABLE_CODES.has(code ?? ""))
    return { title: "Import PDF jest teraz niedostępny.", action: "Spróbuj ponownie później." };
  if (SESSION_CODES.has(code ?? ""))
    return { title: "Twoja sesja wygasła.", action: "Zaloguj się ponownie, a następnie ponownie wybierz plik." };
  if (ACTIVE_CODES.has(code ?? ""))
    return { title: "Masz już rozpoczęty import.", action: "Odczekaj chwilę i ponownie wybierz plik." };
  if (BUDGET_CODES.has(code ?? ""))
    return { title: "Limit importów został wykorzystany.", action: "Spróbuj ponownie w przyszłym miesiącu." };
  if (TIMEOUT_CODES.has(code ?? ""))
    return { title: "Przetwarzanie trwało zbyt długo.", action: "Wybierz plik ponownie i spróbuj jeszcze raz." };
  if (PROVIDER_CODES.has(code ?? ""))
    return { title: "Nie udało się rozpoznać przepisów.", action: "Wybierz plik ponownie i spróbuj później." };
  if (code === "cancelled")
    return { title: "Import został anulowany.", action: "Aby spróbować ponownie, ponownie wybierz plik." };
  if (code === "no-recipes")
    return { title: "Nie rozpoznano żadnych przepisów.", action: "Wybierz inny plik PDF i spróbuj ponownie." };
  if (code === "read-back-unconfirmed")
    return {
      title: "Nie udało się potwierdzić zapisu przepisów.",
      action: "Sprawdź swoją kolekcję przed ponownym importem.",
    };
  return { title: "Import nie został zakończony.", action: "Wybierz plik ponownie i spróbuj jeszcze raz." };
}

export function useClientImport(options: { apiBase: string; onEvent?: (event: ClientImportEvent) => void }) {
  const [state, setState] = useState<ClientImportState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const activeImport = useRef<string | null>(null);
  const unconfirmedImport = useRef<string | null>(null);
  const eventRef = useRef(options.onEvent);

  useEffect(() => {
    eventRef.current = options.onEvent;
  }, [options.onEvent]);

  const update = useCallback((change: Partial<ClientImportState>) => {
    setState((current) => ({ ...current, ...change }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    const id = activeImport.current;
    if (!id) return;
    try {
      const outcome = await requestImportJson<ClientImportOutcome>(`${options.apiBase}/${id}`, { method: "DELETE" });
      update({ outcome: { ...outcome, readBack: false } });
    } catch {
      // The run loop resolves the confirmed status after aborting.
    }
  }, [options.apiBase, update]);

  useEffect(() => {
    const cancelOnClose = () => {
      const id = activeImport.current ?? unconfirmedImport.current;
      if (id) void fetch(`${options.apiBase}/${id}`, { method: "DELETE", keepalive: true });
    };
    window.addEventListener("pagehide", cancelOnClose);
    return () => {
      window.removeEventListener("pagehide", cancelOnClose);
    };
  }, [options.apiBase]);

  const run = useCallback(
    async (file: File) => {
      setState(INITIAL_STATE);
      const startedAt = performance.now();
      eventRef.current?.({ type: "started", at: startedAt });
      const abort = new AbortController();
      abortRef.current = abort;
      const previous = unconfirmedImport.current;
      unconfirmedImport.current = null;
      if (previous)
        await requestImportJson(`${options.apiBase}/${previous}`, { method: "DELETE" }).catch(() => undefined);
      const id = crypto.randomUUID();
      const importLifecycle = { dispatched: false };
      try {
        const { readPdf } = await import("./browser-reader.ts");
        const result = await executeClientImport({
          apiBase: options.apiBase,
          file,
          signal: abort.signal,
          importId: id,
          read: readPdf,
          onImportDispatched: () => {
            importLifecycle.dispatched = true;
            activeImport.current = id;
          },
          update,
          event: (event) => eventRef.current?.(event),
        });
        if (NON_TERMINAL_IMPORT_STATUSES.has(result.outcome.status)) unconfirmedImport.current = id;
        activeImport.current = null;
        const pending = result.candidates.filter((candidate) => candidate.status !== "complete");
        const terminal =
          result.outcome.status === "committed"
            ? "done"
            : result.outcome.status === "cancelled"
              ? "cancelled"
              : "failed";
        update({ stage: terminal, outcome: result.outcome, candidates: result.candidates, pending });
        eventRef.current?.({
          type: "finished",
          at: performance.now(),
          stage: terminal,
          errorCode: null,
          importId: importIdForEvidence(id, importLifecycle.dispatched),
          outcome: result.outcome,
        });
      } catch (failure) {
        const code = failure instanceof Error && "code" in failure ? String(failure.code) : "unexpected-error";
        const recovered = importLifecycle.dispatched
          ? await recoverStatus(options.apiBase, id, requestImportJson)
          : null;
        if (recovered?.status === "committed") {
          activeImport.current = null;
          update({ stage: "done", outcome: recovered, errorCode: code });
          eventRef.current?.({
            type: "finished",
            at: performance.now(),
            stage: "done",
            errorCode: code,
            importId: importIdForEvidence(id, importLifecycle.dispatched),
            outcome: recovered,
          });
          return;
        }
        if (recovered?.status === "processing")
          await requestImportJson(`${options.apiBase}/${id}`, { method: "DELETE" }).catch(() => undefined);
        if (!recovered && importLifecycle.dispatched) unconfirmedImport.current = id;
        activeImport.current = null;
        const terminal = code === "cancelled" ? "cancelled" : "failed";
        update({ stage: terminal, outcome: recovered, errorCode: code });
        eventRef.current?.({
          type: "finished",
          at: performance.now(),
          stage: terminal,
          errorCode: code,
          importId: importIdForEvidence(id, importLifecycle.dispatched),
          outcome: recovered,
        });
      } finally {
        abortRef.current = null;
      }
    },
    [options.apiBase, update],
  );

  return {
    ...state,
    busy: state.stage === "reading" || state.stage === "recognizing" || state.stage === "saving",
    run,
    cancel,
    reset,
  };
}
