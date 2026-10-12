import { CheckCircle2, Info, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ImportOutcomeFeedbackProps =
  | { state: "pending" | "unavailable"; saved?: never; alreadySaved?: never }
  | { state: "confirmed"; saved: number; alreadySaved: number };

export default function ImportOutcomeFeedback({ state, saved, alreadySaved }: ImportOutcomeFeedbackProps) {
  if (state === "pending") {
    return (
      <Alert className="mt-8 min-h-24" role="status" aria-live="polite" aria-busy="true">
        <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <AlertTitle className="line-clamp-none">Sprawdzanie wyniku importu…</AlertTitle>
      </Alert>
    );
  }

  if (state === "unavailable") {
    return (
      <Alert className="mt-8 min-h-24" role="status" aria-live="polite">
        <Info aria-hidden="true" />
        <AlertTitle className="line-clamp-none">Nie udało się potwierdzić wyniku importu.</AlertTitle>
      </Alert>
    );
  }

  return (
    <Alert className="mt-8 min-h-24" role="status" aria-live="polite">
      <CheckCircle2 aria-hidden="true" />
      <AlertTitle className="line-clamp-none">Import zakończony</AlertTitle>
      <AlertDescription>
        <p>
          Dodano nowych przepisów: <strong className="text-foreground">{saved}</strong>. Już zapisanych:{" "}
          <strong className="text-foreground">{alreadySaved}</strong>.
        </p>
      </AlertDescription>
    </Alert>
  );
}
