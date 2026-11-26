import { useEffect, useMemo, useReducer, useRef, useState, type SyntheticEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createRecipeEditDraft,
  focusRecipeEditError,
  isRecipeEditDraftDirty,
  recipeEditDraftReducer,
  recipeEditPayload,
  warnBeforeRecipeEditNavigation,
  type RecipeEditStatus,
} from "@/lib/recipes/edit-form";
import type { RecipeDetail } from "@/lib/recipes/read";
import type { RecipeEditIssue } from "@/lib/recipes/write";

export type RecipeEditPreviewState = RecipeEditStatus;

interface Props {
  recipe: RecipeDetail;
  previewState?: RecipeEditPreviewState;
}

const CATEGORY_LABELS = {
  breakfast: "Śniadanie",
  lunch: "Obiad",
  dinner: "Kolacja",
  dessert: "Deser",
} as const;

const ISSUE_LABELS: Record<RecipeEditIssue["code"], string> = {
  blank: "To pole nie może być puste.",
  "duplicate-label": "Nazwy wariantów muszą być różne.",
  "duplicate-origin": "Nie udało się rozpoznać pozycji. Odśwież stronę.",
  "invalid-format": "Wartość ma nieprawidłowy format.",
  "invalid-origin": "Nie udało się rozpoznać pozycji. Odśwież stronę.",
  "invalid-type": "Wartość ma nieprawidłowy format.",
  "invalid-value": "Uzupełnij nazwę każdego wariantu.",
  "out-of-order-origin": "Zmiana kolejności nie jest jeszcze obsługiwana.",
  required: "To pole jest wymagane.",
  "structural-gap": "Zapis nie może usunąć wymaganej części kompletnego przepisu.",
  "too-long": "Wartość jest zbyt długa.",
  "too-many-items": "Dodano zbyt wiele pozycji.",
  "unexpected-field": "Formularz zawiera nieobsługiwaną wartość.",
};

function issueFor(issues: RecipeEditIssue[], path: string): RecipeEditIssue | undefined {
  return issues.find((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
}

function FieldIssue({ issue, id }: { issue?: RecipeEditIssue; id: string }) {
  if (!issue) return null;
  return (
    <p id={id} className="text-destructive text-sm font-medium">
      {ISSUE_LABELS[issue.code]}
    </p>
  );
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function RecipeEditForm({ recipe, previewState = "default" }: Props) {
  const initial = useMemo(() => createRecipeEditDraft(recipe), [recipe]);
  const [draft, dispatch] = useReducer(recipeEditDraftReducer, initial);
  const [status, setStatus] = useState<RecipeEditPreviewState>(previewState);
  const [issues, setIssues] = useState<RecipeEditIssue[]>(
    previewState === "validation" ? [{ path: "ingredientGroups[0].ingredients[0].name", code: "blank" }] : [],
  );
  const allowNavigation = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const dirty = isRecipeEditDraftDirty(initial, draft);
  const pending = status === "saving";
  const interactivePreview = previewState !== "default";

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) =>
      warnBeforeRecipeEditNavigation(dirty && !allowNavigation.current, event);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty]);

  useEffect(() => {
    focusRecipeEditError(status, errorSummaryRef.current);
  }, [status]);

  function cancel() {
    if (interactivePreview) {
      setStatus("cancel");
      return;
    }
    if (dirty && !window.confirm("Masz niezapisane zmiany. Czy na pewno chcesz je porzucić?")) return;
    allowNavigation.current = true;
    window.location.assign(`/dashboard/recipes/${recipe.id}`);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (interactivePreview) return;
    setStatus("saving");
    setIssues([]);
    try {
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipeEditPayload(draft)),
      });
      const body = (await responseBody(response)) as { error?: unknown; issues?: unknown } | null;
      if (response.ok) {
        setStatus("success");
        allowNavigation.current = true;
        window.location.assign(`/dashboard/recipes/${recipe.id}?edited=1`);
        return;
      }
      if (response.status === 422 && Array.isArray(body?.issues)) {
        setIssues(body.issues as RecipeEditIssue[]);
        setStatus("validation");
        return;
      }
      setStatus(response.status === 409 ? "conflict" : "failure");
    } catch {
      setStatus("failure");
    }
  }

  const titleIssue = issueFor(issues, "title");

  return (
    <form className="flex flex-col gap-8" onSubmit={submit} aria-busy={pending} noValidate>
      {status === "validation" && (
        <Alert ref={errorSummaryRef} tabIndex={-1} variant="destructive">
          <AlertTitle className="line-clamp-none">Sprawdź zaznaczone pola</AlertTitle>
          <AlertDescription>Popraw dane i spróbuj zapisać przepis ponownie.</AlertDescription>
        </Alert>
      )}
      {status === "saving" && (
        <Alert>
          <AlertTitle className="line-clamp-none">Zapisywanie zmian</AlertTitle>
          <AlertDescription>Nie zamykaj tej strony, dopóki zapis się nie zakończy.</AlertDescription>
        </Alert>
      )}
      {status === "failure" && (
        <Alert ref={errorSummaryRef} tabIndex={-1} variant="destructive">
          <AlertTitle className="line-clamp-none">Nie udało się zapisać zmian</AlertTitle>
          <AlertDescription>Twoje wpisy zostały zachowane. Spróbuj ponownie.</AlertDescription>
        </Alert>
      )}
      {status === "conflict" && (
        <Alert ref={errorSummaryRef} tabIndex={-1} variant="destructive">
          <AlertTitle className="line-clamp-none">Przepis zmienił się w innym miejscu</AlertTitle>
          <AlertDescription>
            <p>Twoje wpisy pozostały w formularzu. Odśwież dane, zanim ponowisz edycję.</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                window.location.reload();
              }}
            >
              Wczytaj aktualny przepis
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {status === "cancel" && (
        <Alert>
          <AlertTitle className="line-clamp-none">Niezapisane zmiany</AlertTitle>
          <AlertDescription>Przed wyjściem poprosimy o potwierdzenie porzucenia zmian.</AlertDescription>
        </Alert>
      )}
      {status === "success" && (
        <Alert>
          <AlertTitle className="line-clamp-none">Zmiany zapisane</AlertTitle>
          <AlertDescription>Za chwilę wrócisz do zaktualizowanego przepisu.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Podstawowe informacje</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="recipe-title">Tytuł przepisu</Label>
            <Input
              id="recipe-title"
              value={draft.title}
              onChange={(event) => {
                dispatch({ type: "set-title", value: event.target.value });
              }}
              disabled={pending}
              aria-invalid={Boolean(titleIssue)}
              aria-describedby={titleIssue ? "recipe-title-issue" : undefined}
            />
            <FieldIssue issue={titleIssue} id="recipe-title-issue" />
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Kategoria (tylko do odczytu)</dt>
              <dd className="text-muted-foreground mt-1">
                {recipe.category ? CATEGORY_LABELS[recipe.category] : "Brak kategorii"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Źródło (tylko do odczytu)</dt>
              <dd className="text-muted-foreground mt-1 break-words">
                {recipe.sourceFilename}, strona {recipe.sourceStartPage}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section className="grid gap-4" aria-labelledby="edit-ingredients-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="edit-ingredients-title" className="text-xl font-semibold sm:text-2xl">
              Składniki
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Możesz dodawać i usuwać pozycje, bez zmiany kolejności.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              dispatch({ type: "add-group" });
            }}
            disabled={pending}
          >
            Dodaj wariant
          </Button>
        </div>

        {draft.ingredientGroups.length === 0 && (
          <Alert>
            <AlertTitle className="line-clamp-none">Brak składników</AlertTitle>
            <AlertDescription>Dodaj wariant, a następnie uzupełnij jego składniki.</AlertDescription>
          </Alert>
        )}

        {draft.ingredientGroups.map((group, groupIndex) => {
          const groupPath = `ingredientGroups[${groupIndex}]`;
          const labelIssue = issueFor(issues, `${groupPath}.label`);
          return (
            <Card key={`${group.originIndex ?? "new"}-${groupIndex}`}>
              <CardHeader className="gap-4 sm:grid-cols-[1fr_auto]">
                <div className="grid gap-2">
                  <Label htmlFor={`group-${groupIndex}-label`}>Nazwa wariantu</Label>
                  <Input
                    id={`group-${groupIndex}-label`}
                    value={group.label}
                    placeholder={draft.ingredientGroups.length === 1 ? "Opcjonalna przy jednym wariancie" : undefined}
                    onChange={(event) => {
                      dispatch({ type: "set-group-label", groupIndex, value: event.target.value });
                    }}
                    disabled={pending}
                    aria-invalid={Boolean(labelIssue)}
                    aria-describedby={labelIssue ? `group-${groupIndex}-label-issue` : undefined}
                  />
                  <FieldIssue issue={labelIssue} id={`group-${groupIndex}-label-issue`} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    dispatch({ type: "remove-group", groupIndex });
                  }}
                  disabled={pending}
                >
                  Usuń wariant
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4">
                {group.ingredients.map((ingredient, ingredientIndex) => {
                  const ingredientPath = `${groupPath}.ingredients[${ingredientIndex}]`;
                  const nameIssue = issueFor(issues, `${ingredientPath}.name`);
                  const sourceIssue = issueFor(issues, `${ingredientPath}.sourceText`);
                  return (
                    <fieldset
                      key={`${ingredient.originIndex ?? "new"}-${ingredientIndex}`}
                      className="grid gap-4 rounded-xl border p-4"
                    >
                      <legend className="px-1 text-sm font-semibold">Składnik {ingredientIndex + 1}</legend>
                      <div className="grid gap-2">
                        <Label htmlFor={`group-${groupIndex}-ingredient-${ingredientIndex}-source`}>
                          Tekst wyświetlany
                        </Label>
                        <Input
                          id={`group-${groupIndex}-ingredient-${ingredientIndex}-source`}
                          value={ingredient.sourceText}
                          onChange={(event) => {
                            dispatch({
                              type: "set-ingredient",
                              groupIndex,
                              ingredientIndex,
                              field: "sourceText",
                              value: event.target.value,
                            });
                          }}
                          disabled={pending}
                          aria-invalid={Boolean(sourceIssue)}
                          aria-describedby={sourceIssue ? `${ingredientPath}-source-issue` : undefined}
                        />
                        <FieldIssue issue={sourceIssue} id={`${ingredientPath}-source-issue`} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`group-${groupIndex}-ingredient-${ingredientIndex}-name`}>
                          Nazwa do wyszukiwania
                        </Label>
                        <Input
                          id={`group-${groupIndex}-ingredient-${ingredientIndex}-name`}
                          value={ingredient.name}
                          onChange={(event) => {
                            dispatch({
                              type: "set-ingredient",
                              groupIndex,
                              ingredientIndex,
                              field: "name",
                              value: event.target.value,
                            });
                          }}
                          disabled={pending}
                          aria-invalid={Boolean(nameIssue)}
                          aria-describedby={nameIssue ? `${ingredientPath}-name-issue` : undefined}
                        />
                        <FieldIssue issue={nameIssue} id={`${ingredientPath}-name-issue`} />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="justify-self-start"
                        onClick={() => {
                          dispatch({ type: "remove-ingredient", groupIndex, ingredientIndex });
                        }}
                        disabled={pending}
                      >
                        Usuń składnik
                      </Button>
                    </fieldset>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() => {
                    dispatch({ type: "add-ingredient", groupIndex });
                  }}
                  disabled={pending}
                >
                  Dodaj składnik
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4" aria-labelledby="edit-instructions-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="edit-instructions-title" className="text-xl font-semibold sm:text-2xl">
            Przygotowanie
          </h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              dispatch({ type: "add-instruction" });
            }}
            disabled={pending}
          >
            Dodaj krok
          </Button>
        </div>
        {draft.instructions.length === 0 && (
          <Alert>
            <AlertTitle className="line-clamp-none">Brak kroków przygotowania</AlertTitle>
            <AlertDescription>Dodaj pierwszy krok, aby uzupełnić przepis.</AlertDescription>
          </Alert>
        )}
        {draft.instructions.map((instruction, instructionIndex) => {
          const path = `instructions[${instructionIndex}].text`;
          const issue = issueFor(issues, path);
          return (
            <Card key={`${instruction.originIndex ?? "new"}-${instructionIndex}`}>
              <CardContent className="grid gap-3">
                <Label htmlFor={`instruction-${instructionIndex}`}>Krok {instructionIndex + 1}</Label>
                <Textarea
                  id={`instruction-${instructionIndex}`}
                  value={instruction.text}
                  onChange={(event) => {
                    dispatch({ type: "set-instruction", instructionIndex, value: event.target.value });
                  }}
                  disabled={pending}
                  aria-invalid={Boolean(issue)}
                  aria-describedby={issue ? `instruction-${instructionIndex}-issue` : undefined}
                />
                <FieldIssue issue={issue} id={`instruction-${instructionIndex}-issue`} />
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-self-start"
                  onClick={() => {
                    dispatch({ type: "remove-instruction", instructionIndex });
                  }}
                  disabled={pending}
                >
                  Usuń krok
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
          Anuluj
        </Button>
        <Button type="submit" disabled={pending || interactivePreview}>
          {pending ? "Zapisywanie…" : "Zapisz zmiany"}
        </Button>
      </div>
    </form>
  );
}
