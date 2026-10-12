import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { loadDashboardImportOutcome, withoutImportParameter } from "@/lib/pdf-processing/dashboard-import";
import type { DashboardImportOutcome } from "@/lib/pdf-processing/dashboard-import";

interface ImportOutcomeBannerProps {
  importId: string | null;
}

export default function ImportOutcomeBanner({ importId }: ImportOutcomeBannerProps) {
  const [outcome, setOutcome] = useState<DashboardImportOutcome | null>(null);

  useEffect(() => {
    const cleanUrl = withoutImportParameter(window.location.pathname, window.location.search, window.location.hash);
    window.history.replaceState(window.history.state, "", cleanUrl);
    if (!importId) return;

    const controller = new AbortController();
    void loadDashboardImportOutcome(importId, fetch, controller.signal).then((result) => {
      if (!controller.signal.aborted) setOutcome(result);
    });
    return () => {
      controller.abort();
    };
  }, [importId]);

  if (!outcome) return null;

  return (
    <section
      className="mt-8 flex gap-3 rounded-2xl border border-emerald-200/30 bg-emerald-950/20 p-5 text-emerald-50 backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <h2 className="font-semibold">Import zakończony</h2>
        <p className="mt-1 text-sm text-emerald-100/80">
          Dodano nowych przepisów: <strong className="text-white">{outcome.saved}</strong>. Już zapisanych:{" "}
          <strong className="text-white">{outcome.alreadySaved}</strong>.
        </p>
      </div>
    </section>
  );
}
