import RecipeDecisionCard from "@/components/pdf-processing/RecipeDecisionCard";
import type { RecipeDecisionViewModel } from "@/components/pdf-processing/RecipeDecisionCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const BASE_DECISION: Omit<RecipeDecisionViewModel, "id" | "status"> = {
  title: "Zupa z pieczonej dyni",
  category: "Obiad",
  pages: [12, 13],
  missingMessages: ["Brakuje dalszej części przepisu."],
  ingredientGroups: [{ label: "Zupa", ingredients: ["1 mała dynia", "500 ml bulionu", "sól i pieprz"] }],
  instructions: ["Upiecz dynię.", "Zblenduj z bulionem."],
};

const DECISIONS: RecipeDecisionViewModel[] = [
  { ...BASE_DECISION, id: "default", status: "pending" },
  { ...BASE_DECISION, id: "hover", status: "pending", title: "Stan hover akcji" },
  { ...BASE_DECISION, id: "focus", status: "pending", title: "Stan focus-visible akcji" },
  { ...BASE_DECISION, id: "keeping", status: "keeping", title: "Zapisywany przepis" },
  { ...BASE_DECISION, id: "discarding", status: "discarding", title: "Odrzucany przepis" },
  { ...BASE_DECISION, id: "kept", status: "kept", title: "Zachowany przepis" },
  { ...BASE_DECISION, id: "discarded", status: "discarded", title: "Odrzucony przepis" },
  { ...BASE_DECISION, id: "error", status: "error", title: "Decyzja z błędem" },
  {
    ...BASE_DECISION,
    id: "missing-content",
    status: "pending",
    title: null,
    category: null,
    missingMessages: [
      "Brakuje tytułu przepisu.",
      "Brakuje składników.",
      "Brakuje przygotowania.",
      "Brakuje kategorii.",
    ],
    ingredientGroups: [],
    instructions: [],
  },
];

export default function RecipeDecisionPreview() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header className="grid gap-2" data-decision-overview>
        <p className="text-primary text-sm font-semibold">Dishly · decyzje o niekompletnych przepisach</p>
        <h1 className="text-3xl font-bold tracking-tight">Zachowaj albo odrzuć</h1>
        <p className="text-muted-foreground text-sm">
          Izolowany podgląd stanów — bez logowania, bazy danych, treści PDF i wywołań modelu.
        </p>
      </header>

      <Alert role="status" data-discard-all>
        <AlertTitle className="line-clamp-none">Import zakończony bez zapisywania przepisów</AlertTitle>
        <AlertDescription>
          Wszystkie niekompletne przepisy zostały odrzucone. Możesz wybrać inny plik albo wrócić do kolekcji.
        </AlertDescription>
      </Alert>

      <Alert role="status" data-mixed-outcome>
        <AlertTitle className="line-clamp-none">Część przepisów wymaga decyzji</AlertTitle>
        <AlertDescription>
          <p>
            Łącznie zapisano nowych: <strong>3</strong> (w tym zachowano decyzją: <strong>1</strong>). Już zapisanych:{" "}
            <strong>1</strong>. Odrzucono: <strong>2</strong>. Do rozstrzygnięcia: <strong>1</strong>.
          </p>
        </AlertDescription>
      </Alert>

      <section className="grid gap-4" aria-label="Stany decyzji" data-decision-states>
        {DECISIONS.map((decision) => (
          <RecipeDecisionCard key={decision.id} decision={decision} />
        ))}
      </section>

      <section className="grid gap-3" aria-labelledby="decision-matrix-title" data-decision-matrix>
        <h2 id="decision-matrix-title" className="text-xl font-semibold">
          Macierz siedmiu stanów
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Default", "Karta pending z niezależnymi akcjami Zachowaj i Odrzuć."],
            ["Hover", "Semantyczne warianty primary i destructive; rzeczywiste najechanie oceniane ręcznie."],
            ["Focus-visible", "Obie akcje mają wspólny ring; kolejność oceniana klawiaturą."],
            ["Disabled", "Tylko para aktywnej karty jest blokowana podczas zapisu decyzji."],
            ["Error", "Błąd pozostaje w karcie, a obie akcje można ponowić."],
            ["Empty", "Brak tytułu, kategorii, składników i instrukcji jest nazwany wprost."],
            ["Loading", "Keeping i discarding mają stabilny układ, komunikat live i spinner."],
          ].map(([term, description]) => (
            <div className="bg-card text-card-foreground shadow-surface rounded-xl border p-4" key={term}>
              <dt className="font-semibold">{term}</dt>
              <dd className="text-muted-foreground mt-1">{description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
