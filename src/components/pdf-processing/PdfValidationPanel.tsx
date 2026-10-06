import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FileText, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecipeCandidate } from "@/lib/pdf-processing/contracts";
import { batchFromManifest } from "@/lib/pdf-processing/manifest";
import type { SourceManifest } from "@/lib/pdf-processing/manifest";

type Stage = "idle" | "reading" | "recognizing" | "saving" | "done" | "failed" | "cancelled";

interface ReturnedCandidate {
  batchIndex: number;
  candidateIndex: number;
  status: "complete" | "incomplete";
  candidate: RecipeCandidate;
  warnings: string[];
  explanations: string[];
}

interface Outcome {
  status: string;
  saved: number;
  alreadySaved: number;
  pending: number;
  readBack: boolean;
}

interface ImportCreated {
  importId: string;
  manifestDigest: string;
  manifest: SourceManifest;
}

class RequestFailure extends Error {
  readonly code: string;
  readonly lost: boolean;
  constructor(code: string, lost = false) {
    super(code);
    this.code = code;
    this.lost = lost;
  }
}

const STAGE_LABELS: Record<Stage, string> = {
  idle: "Select a PDF to start.",
  reading: "Reading the PDF on this device…",
  recognizing: "Recognizing recipes…",
  saving: "Saving complete recipes…",
  done: "Finished.",
  failed: "The import did not finish.",
  cancelled: "The import was cancelled.",
};

// Private JSON calls only. Bodies stay in memory and are never logged or cached.
async function api<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
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
    if (signal?.aborted) throw new RequestFailure("cancelled");
    throw new RequestFailure("network-error", true);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new RequestFailure("invalid-response", true);
  }
  if (!response.ok) {
    const code = (body as { error?: unknown } | null)?.error;
    throw new RequestFailure(typeof code === "string" ? code : `http-${response.status}`);
  }
  return body as T;
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1) + " s";
}

export default function PdfValidationPanel() {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState<ReturnedCandidate[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const activeImport = useRef<string | null>(null);
  const busy = stage === "reading" || stage === "recognizing" || stage === "saving";

  useEffect(() => {
    // Best effort only: provider calls already submitted can still incur cost.
    const cancelOnClose = () => {
      const id = activeImport.current;
      if (id) void fetch(`/api/pdf-validation/imports/${id}`, { method: "DELETE", keepalive: true });
    };
    window.addEventListener("pagehide", cancelOnClose);
    return () => {
      window.removeEventListener("pagehide", cancelOnClose);
    };
  }, []);

  function reset() {
    setStage("idle");
    setProgress(null);
    setError(null);
    setOutcome(null);
    setPending([]);
    setElapsedMs(null);
    setImportId(null);
  }

  async function recoverStatus(id: string): Promise<Outcome | null> {
    try {
      const status = await api<{
        status: string;
        outcome: Omit<Outcome, "status" | "readBack"> | null;
        readBack: boolean;
      }>(`/api/pdf-validation/imports/${id}`);
      if (status.status === "committed" && status.outcome)
        return { status: status.status, ...status.outcome, readBack: status.readBack };
      return { status: status.status, saved: 0, alreadySaved: 0, pending: 0, readBack: false };
    } catch {
      return null;
    }
  }

  async function run(file: File) {
    reset();
    const startedAt = performance.now(); // Before hashing/reading; stops after commit read-back.
    const abort = new AbortController();
    controller.current = abort;
    let id: string | null = null;
    let candidates: ReturnedCandidate[] = [];
    try {
      setStage("reading");
      const { readPdf } = await import("@/lib/pdf-processing/browser-reader");
      let read: Awaited<ReturnType<typeof readPdf>> | null = await readPdf(file, { signal: abort.signal });
      setStage("recognizing");
      const created = await api<ImportCreated>(
        "/api/pdf-validation/imports",
        { method: "POST", body: JSON.stringify({ source: read.source, pages: read.pages }) },
        abort.signal,
      );
      id = created.importId;
      activeImport.current = id;
      setImportId(id);
      const total = created.manifest.batches.length;
      setProgress({ done: 0, total });
      for (const entry of created.manifest.batches) {
        if (abort.signal.aborted) throw new RequestFailure("cancelled");
        const batch = batchFromManifest(read.source, read.pages, entry);
        const result = await api<{ candidates: ReturnedCandidate[] }>(
          `/api/pdf-validation/imports/${id}/batch`,
          { method: "POST", body: JSON.stringify(batch) },
          abort.signal,
        );
        candidates = [...candidates, ...result.candidates];
        setProgress({ done: entry.batchIndex + 1, total });
      }
      read = null; // Release source text once recognition has finished.
      setStage("saving");
      let finalized: Outcome;
      try {
        finalized = await api<Outcome>(
          `/api/pdf-validation/imports/${id}/finalize`,
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
          abort.signal,
        );
      } catch (failure) {
        // A lost response is resolved by status lookup, never by another model call.
        if (!(failure instanceof RequestFailure && failure.lost)) throw failure;
        const recovered = await recoverStatus(id);
        if (!recovered) throw failure;
        finalized = recovered;
      }
      activeImport.current = null;
      setElapsedMs(performance.now() - startedAt);
      setOutcome(finalized);
      if (finalized.status === "committed") {
        setPending(candidates.filter((item) => item.status !== "complete"));
        setStage("done");
      } else {
        setStage(finalized.status === "cancelled" ? "cancelled" : "failed");
      }
    } catch (failure) {
      const code =
        failure instanceof RequestFailure || failure instanceof Error ? (failure as { code?: string }).code : null;
      setError(code ?? "unexpected-error");
      if (id) {
        const recovered = await recoverStatus(id);
        if (recovered) setOutcome(recovered);
        if (recovered?.status === "committed") {
          activeImport.current = null;
          setElapsedMs(performance.now() - startedAt);
          setStage("done");
          return;
        }
        if (recovered?.status === "processing")
          await api(`/api/pdf-validation/imports/${id}`, { method: "DELETE" }).catch(() => undefined);
      }
      activeImport.current = null;
      setElapsedMs(performance.now() - startedAt);
      setStage(code === "cancelled" ? "cancelled" : "failed");
    } finally {
      controller.current = null;
    }
  }

  async function cancel() {
    controller.current?.abort();
    const id = activeImport.current;
    if (!id) return;
    try {
      const result = await api<Outcome>(`/api/pdf-validation/imports/${id}`, { method: "DELETE" });
      setOutcome({ ...result, readBack: false });
    } catch {
      // The run loop reports the confirmed status after aborting.
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void run(file);
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/10 p-5 text-sm text-blue-100/80 backdrop-blur-xl sm:p-6">
        <h2 className="text-base font-semibold text-white">How your PDF is processed</h2>
        <p className="mt-2">
          The PDF file is read on this device and is not uploaded. Its extracted text is sent to our server and to the
          OpenAI API (model gpt-5.4-mini) to recognize recipes. Requests use store=false and OpenAI does not use API
          data for training by default, but this is not zero retention: OpenAI may keep request data for up to 30 days
          for abuse monitoring (with legal exceptions) and separately for prompt caching.
        </p>
        <p className="mt-2">
          Only complete recipes are saved automatically. Incomplete results are shown below for evaluation and are not
          saved. Closing the tab cancels on a best-effort basis; recognition already sent can still incur cost.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <FileText className="size-4" />
            Select PDF
            <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={onFile} />
          </label>
          {busy && (
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => void cancel()}>
              <XCircle /> Cancel
            </Button>
          )}
          {!busy && stage !== "idle" && (
            <Button type="button" variant="secondary" className="min-h-11" onClick={reset}>
              Dismiss result
            </Button>
          )}
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-white" role="status" aria-live="polite">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {STAGE_LABELS[stage]}
          {stage === "recognizing" && progress && ` Batch ${progress.done}/${progress.total}.`}
        </p>
        {error && <p className="mt-2 text-sm text-red-200">Error: {error}</p>}
        {importId && <p className="mt-1 text-xs break-all text-blue-100/50">Import {importId}</p>}
        {elapsedMs !== null && <p className="mt-1 text-xs text-blue-100/70">Elapsed: {seconds(elapsedMs)}</p>}
      </section>

      {outcome && (
        <section className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl sm:p-6">
          <h2 className="text-base font-semibold text-white">Confirmed outcome ({outcome.status})</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-xs text-blue-100/70">Newly saved</dt>
              <dd className="text-2xl font-bold text-white">{outcome.saved}</dd>
            </div>
            <div>
              <dt className="text-xs text-blue-100/70">Already saved</dt>
              <dd className="text-2xl font-bold text-white">{outcome.alreadySaved}</dd>
            </div>
            <div>
              <dt className="text-xs text-blue-100/70">Not saved</dt>
              <dd className="text-2xl font-bold text-white">{outcome.pending}</dd>
            </div>
          </dl>
          {outcome.status === "committed" && (
            <p className="mt-3 text-xs text-blue-100/70">
              {outcome.readBack
                ? "Saved recipes were read back from your collection."
                : "Saved recipes could not be read back; check your collection."}{" "}
              These counts cover recognized recipes only; this check cannot prove that every recipe in the PDF was
              found.
            </p>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">Incomplete results (not saved)</h2>
          {pending.map((item) => (
            <article
              key={`${item.batchIndex}:${item.candidateIndex}`}
              className="rounded-2xl border border-amber-200/30 bg-white/10 p-4 text-sm text-blue-100/90 backdrop-blur-xl"
            >
              <h3 className="font-semibold break-words text-white">{item.candidate.title ?? "(no title)"}</h3>
              <p className="text-xs text-blue-100/60">Pages {item.candidate.pages.join(", ")}</p>
              <ul className="mt-2 list-disc pl-5 text-amber-100">
                {item.explanations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              {item.candidate.ingredientGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="mt-2">
                  {group.label && <p className="font-medium text-white">{group.label}</p>}
                  <ul className="list-disc pl-5">
                    {group.ingredients.map((ingredient, index) => (
                      <li key={index} className="break-words">
                        {ingredient.sourceText}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {item.candidate.instructions.length > 0 && (
                <ol className="mt-2 list-decimal pl-5">
                  {item.candidate.instructions.map((step, index) => (
                    <li key={index} className="break-words">
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              {item.warnings.length > 0 && (
                <p className="mt-2 text-xs break-words text-blue-100/60">Warnings: {item.warnings.join(", ")}</p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
