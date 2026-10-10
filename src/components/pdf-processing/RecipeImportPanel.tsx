import { useEffect } from "react";
import type { ChangeEvent } from "react";
import { FileText, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { polishImportError, productCompletion, useClientImport } from "@/lib/pdf-processing/client-import";
import type { ClientImportStage } from "@/lib/pdf-processing/client-import";

const STAGE_LABELS: Record<ClientImportStage, string> = {
  idle: "Wybierz plik PDF, aby rozpocząć.",
  reading: "Odczytywanie pliku na tym urządzeniu…",
  recognizing: "Rozpoznawanie przepisów…",
  saving: "Zapisywanie kompletnych przepisów…",
  done: "Import zakończony.",
  failed: "Import nie został zakończony.",
  cancelled: "Import został anulowany.",
};

export default function RecipeImportPanel() {
  const importFlow = useClientImport({ apiBase: "/api/imports" });
  const { stage, progress, outcome, pending, importId, errorCode, busy } = importFlow;
  const completion = outcome ? productCompletion(outcome) : null;
  const visibleErrorCode =
    completion === "empty"
      ? "no-recipes"
      : completion === "unconfirmed"
        ? "read-back-unconfirmed"
        : stage === "failed" || stage === "cancelled"
          ? errorCode
          : null;
  const error = visibleErrorCode ? polishImportError(visibleErrorCode) : null;

  useEffect(() => {
    if (completion === "redirect" && importId)
      window.location.assign(`/dashboard?import=${encodeURIComponent(importId)}`);
  }, [completion, importId]);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importFlow.run(file);
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/10 p-5 text-sm text-blue-100/80 backdrop-blur-xl sm:p-6">
        <h2 className="text-base font-semibold text-white">Jak działa import</h2>
        <p className="mt-2">
          Plik PDF jest odczytywany lokalnie na tym urządzeniu i nie jest przesyłany. Wyodrębniony tekst trafia do
          naszego serwera i do OpenAI, aby rozpoznać przepisy.
        </p>
        <p className="mt-2">
          Automatycznie zapisujemy wyłącznie kompletne przepisy. Niekompletne wyniki pozostają niezapisane i zobaczysz
          je poniżej. Jeden plik może mieć do 20 MB i 115 stron.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <FileText className="size-4" />
            Wybierz PDF
            <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={onFile} />
          </label>
          {busy && (
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => void importFlow.cancel()}>
              <XCircle /> Anuluj
            </Button>
          )}
          {!busy && stage !== "idle" && completion !== "redirect" && (
            <Button type="button" variant="secondary" className="min-h-11" onClick={importFlow.reset}>
              Wybierz inny plik
            </Button>
          )}
        </div>

        <p className="mt-4 flex items-center gap-2 text-sm text-white" role="status" aria-live="polite">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {completion === "redirect" ? "Przenoszenie do zapisanych przepisów…" : STAGE_LABELS[stage]}
          {stage === "recognizing" && progress && ` Partia ${progress.done} z ${progress.total}.`}
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200/30 bg-red-950/20 p-4 text-sm text-red-100" role="alert">
            <p className="font-semibold">{error.title}</p>
            <p className="mt-1 text-red-100/80">{error.action}</p>
          </div>
        )}
      </section>

      {outcome && completion === "pending" && (
        <section className="rounded-2xl border border-amber-200/30 bg-white/10 p-5 backdrop-blur-xl sm:p-6">
          <h2 className="text-base font-semibold text-white">Część przepisów wymaga uzupełnienia</h2>
          <p className="mt-2 text-sm text-blue-100/80">
            Zapisano nowych: <strong className="text-white">{outcome.saved}</strong>. Już zapisanych:{" "}
            <strong className="text-white">{outcome.alreadySaved}</strong>. Niezapisanych:{" "}
            <strong className="text-white">{outcome.pending}</strong>.
          </p>
        </section>
      )}

      {completion === "pending" && pending.length > 0 && (
        <section className="space-y-3" aria-labelledby="incomplete-title">
          <h2 id="incomplete-title" className="text-base font-semibold text-white">
            Niekompletne przepisy — nie zostały zapisane
          </h2>
          {pending.map((item) => (
            <article
              key={`${item.batchIndex}:${item.candidateIndex}`}
              className="rounded-2xl border border-amber-200/30 bg-white/10 p-4 text-sm text-blue-100/90 backdrop-blur-xl"
            >
              <h3 className="font-semibold break-words text-white">{item.candidate.title ?? "Przepis bez tytułu"}</h3>
              <p className="text-xs text-blue-100/60">Strony: {item.candidate.pages.join(", ")}</p>
              {item.explanations.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-amber-100">
                  {item.explanations.map((explanation) => (
                    <li key={explanation}>{explanation}</li>
                  ))}
                </ul>
              )}
              {item.candidate.ingredientGroups.map((group, groupIndex) => (
                <div key={groupIndex} className="mt-3">
                  {group.label && <p className="font-medium text-white">{group.label}</p>}
                  <ul className="list-disc pl-5">
                    {group.ingredients.map((ingredient, ingredientIndex) => (
                      <li key={ingredientIndex} className="break-words">
                        {ingredient.sourceText}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {item.candidate.instructions.length > 0 && (
                <ol className="mt-3 list-decimal pl-5">
                  {item.candidate.instructions.map((instruction, instructionIndex) => (
                    <li key={instructionIndex} className="break-words">
                      {instruction}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
