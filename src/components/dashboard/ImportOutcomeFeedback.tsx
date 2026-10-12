import { CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ImportOutcomeFeedbackProps {
  state: "confirmed";
  saved: number;
  alreadySaved: number;
}

export default function ImportOutcomeFeedback({ saved, alreadySaved }: ImportOutcomeFeedbackProps) {
  return (
    <Alert className="mt-8" role="status" aria-live="polite">
      <CheckCircle2 aria-hidden="true" />
      <AlertTitle>Import zakończony</AlertTitle>
      <AlertDescription>
        <p>
          Dodano nowych przepisów: <strong className="text-foreground">{saved}</strong>. Już zapisanych:{" "}
          <strong className="text-foreground">{alreadySaved}</strong>.
        </p>
      </AlertDescription>
    </Alert>
  );
}
