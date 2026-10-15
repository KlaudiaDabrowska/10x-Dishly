import { CircleAlert, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export type RecipeDecisionViewStatus = "pending" | "keeping" | "discarding" | "kept" | "discarded" | "error";

export interface RecipeDecisionViewModel {
  id: string;
  title: string | null;
  category: string | null;
  pages: number[];
  missingMessages: string[];
  ingredientGroups: { label: string | null; ingredients: string[] }[];
  instructions: string[];
  status: RecipeDecisionViewStatus;
}

interface RecipeDecisionCardProps {
  decision: RecipeDecisionViewModel;
  onKeep?: (id: string) => void;
  onDiscard?: (id: string) => void;
}

const STATUS_MESSAGES: Record<RecipeDecisionViewStatus, string | null> = {
  pending: null,
  keeping: "Zapisywanie przepisu…",
  discarding: "Odrzucanie przepisu…",
  kept: "Przepis został zachowany w kolekcji.",
  discarded: "Przepis został odrzucony i nie trafił do kolekcji.",
  error: "Nie udało się zapisać decyzji. Spróbuj ponownie.",
};

export default function RecipeDecisionCard({ decision, onKeep, onDiscard }: RecipeDecisionCardProps) {
  const submitting = decision.status === "keeping" || decision.status === "discarding";
  const resolved = decision.status === "kept" || decision.status === "discarded";
  const statusMessage = STATUS_MESSAGES[decision.status];
  const title = decision.title ?? "Przepis bez tytułu";

  return (
    <article
      aria-labelledby={`decision-${decision.id}-title`}
      data-recipe-decision={decision.id}
      data-decision-status={decision.status}
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 id={`decision-${decision.id}-title`} className="break-words">
              {title}
            </h3>
          </CardTitle>
          <CardDescription>
            Strony: {decision.pages.join(", ")} · Kategoria: {decision.category ?? "brak kategorii"}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5 text-sm">
          <Alert role="status">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Ten przepis jest niekompletny</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {decision.missingMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>

          <div className="grid gap-3">
            <h4 className="font-semibold">Składniki</h4>
            {decision.ingredientGroups.length === 0 ? (
              <p className="text-muted-foreground">Brak rozpoznanych składników.</p>
            ) : (
              decision.ingredientGroups.map((group, groupIndex) => (
                <div className="grid gap-1" key={`${group.label ?? "group"}-${groupIndex}`}>
                  {group.label && <p className="font-medium">{group.label}</p>}
                  {group.ingredients.length === 0 ? (
                    <p className="text-muted-foreground">Brak składników w tej grupie.</p>
                  ) : (
                    <ul className="list-disc pl-5">
                      {group.ingredients.map((ingredient, ingredientIndex) => (
                        <li className="break-words" key={`${ingredient}-${ingredientIndex}`}>
                          {ingredient}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="grid gap-3">
            <h4 className="font-semibold">Przygotowanie</h4>
            {decision.instructions.length === 0 ? (
              <p className="text-muted-foreground">Brak rozpoznanego sposobu przygotowania.</p>
            ) : (
              <ol className="list-decimal pl-5">
                {decision.instructions.map((instruction, instructionIndex) => (
                  <li className="break-words" key={`${instruction}-${instructionIndex}`}>
                    {instruction}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {statusMessage && (
            <Alert
              variant={decision.status === "error" ? "destructive" : "default"}
              role={decision.status === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {(submitting || decision.status === "error") &&
                (submitting ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <CircleAlert aria-hidden="true" />
                ))}
              <AlertTitle className="line-clamp-none">{statusMessage}</AlertTitle>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex-wrap gap-3">
          <Button
            type="button"
            disabled={submitting || resolved}
            aria-busy={decision.status === "keeping"}
            onClick={() => onKeep?.(decision.id)}
          >
            {decision.status === "keeping" ? "Zachowywanie…" : decision.status === "kept" ? "Zachowano" : "Zachowaj"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || resolved}
            aria-busy={decision.status === "discarding"}
            onClick={() => onDiscard?.(decision.id)}
          >
            {decision.status === "discarding"
              ? "Odrzucanie…"
              : decision.status === "discarded"
                ? "Odrzucono"
                : "Odrzuć"}
          </Button>
        </CardFooter>
      </Card>
    </article>
  );
}
