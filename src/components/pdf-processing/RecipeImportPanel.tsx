import { useEffect } from "react";
import type { ChangeEvent } from "react";
import { CircleAlert, FileText, Info, Loader2, XCircle } from "lucide-react";

import RecipeDecisionCard from "@/components/pdf-processing/RecipeDecisionCard";
import type { RecipeDecisionViewModel } from "@/components/pdf-processing/RecipeDecisionCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { polishImportError, productCompletion, useClientImport } from "@/lib/pdf-processing/client-import";
import type { ClientImportStage, ClientRecipeDecision } from "@/lib/pdf-processing/client-import";

const CATEGORY_LABELS = {
  breakfast: "Śniadanie",
  lunch: "Obiad",
  dinner: "Kolacja",
  dessert: "Deser",
} as const;

const STAGE_LABELS: Record<ClientImportStage, string> = {
  idle: "Wybierz plik PDF, aby rozpocząć.",
  reading: "Odczytywanie pliku na tym urządzeniu…",
  recognizing: "Rozpoznawanie przepisów…",
  saving: "Zapisywanie kompletnych przepisów…",
  done: "Import zakończony.",
  failed: "Import nie został zakończony.",
  cancelled: "Import został anulowany.",
};

function decisionView(decision: ClientRecipeDecision): RecipeDecisionViewModel {
  return {
    id: decision.decisionId,
    title: decision.candidate.title,
    category: decision.candidate.category ? CATEGORY_LABELS[decision.candidate.category] : null,
    pages: decision.candidate.pages,
    missingMessages: decision.missingMessages,
    ingredientGroups: decision.candidate.ingredientGroups.map((group) => ({
      label: group.label,
      ingredients: group.ingredients.map((ingredient) => ingredient.sourceText),
    })),
    instructions: decision.candidate.instructions,
    status: decision.status,
  };
}

export default function RecipeImportPanel() {
  const importFlow = useClientImport({ apiBase: "/api/imports", decisionCapability: "product" });
  const { stage, progress, outcome, decisions, importId, errorCode, busy } = importFlow;
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
    <div className="mt-8 grid gap-6">
      <Alert role="status">
        <Info aria-hidden="true" />
        <AlertTitle>Jak działa import</AlertTitle>
        <AlertDescription>
          <p>
            Plik PDF jest odczytywany lokalnie na tym urządzeniu i nie jest przesyłany. Wyodrębniony tekst trafia do
            naszego serwera i do OpenAI, aby rozpoznać przepisy.
          </p>
          <p>
            Kompletne przepisy zapisujemy automatycznie. Przy niekompletnych zdecydujesz osobno, czy chcesz je zachować.
            Jeden plik może mieć do 20 MB i 115 stron.
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild className={busy ? "pointer-events-none opacity-50" : undefined}>
              <label aria-disabled={busy}>
                <FileText aria-hidden="true" />
                Wybierz PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  disabled={busy}
                  onChange={onFile}
                />
              </label>
            </Button>
            {busy && (
              <Button type="button" variant="destructive" onClick={() => void importFlow.cancel()}>
                <XCircle aria-hidden="true" /> Anuluj
              </Button>
            )}
            {!busy && stage !== "idle" && completion !== "redirect" && (
              <Button type="button" variant="secondary" onClick={importFlow.reset}>
                Wybierz inny plik
              </Button>
            )}
          </div>

          <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {completion === "redirect" ? "Przenoszenie do zapisanych przepisów…" : STAGE_LABELS[stage]}
            {stage === "recognizing" && progress && ` Partia ${progress.done} z ${progress.total}.`}
          </p>

          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>{error.action}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {outcome && completion === "pending" && (
        <Alert role="status" aria-live="polite">
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">Część przepisów wymaga decyzji</AlertTitle>
          <AlertDescription>
            <p>
              Łącznie zapisano nowych: <strong>{outcome.saved}</strong> (w tym zachowano decyzją:{" "}
              <strong>{outcome.kept ?? 0}</strong>). Już zapisanych: <strong>{outcome.alreadySaved}</strong>. Odrzucono:{" "}
              <strong>{outcome.discarded ?? 0}</strong>. Do rozstrzygnięcia: <strong>{outcome.pending}</strong>.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {outcome && completion === "discarded" && (
        <Alert role="status" aria-live="polite">
          <Info aria-hidden="true" />
          <AlertTitle className="line-clamp-none">Import zakończony bez zapisywania przepisów</AlertTitle>
          <AlertDescription>
            Wszystkie niekompletne przepisy zostały odrzucone. Możesz wybrać inny plik albo wrócić do kolekcji.
          </AlertDescription>
        </Alert>
      )}

      {decisions.length > 0 && (
        <section className="grid gap-4" aria-labelledby="incomplete-title">
          <div className="grid gap-1">
            <h2 id="incomplete-title" className="text-xl font-semibold">
              Niekompletne przepisy
            </h2>
            <p className="text-muted-foreground text-sm">
              Sprawdź brakujące elementy. Każdy przepis możesz zachować bez uzupełniania albo odrzucić.
            </p>
          </div>
          {decisions.map((decision) => (
            <RecipeDecisionCard
              key={decision.decisionId}
              decision={decisionView(decision)}
              onKeep={(id) => void importFlow.resolveDecision(id, "keep")}
              onDiscard={(id) => void importFlow.resolveDecision(id, "discard")}
            />
          ))}
        </section>
      )}
    </div>
  );
}
