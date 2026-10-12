import { useEffect, useState } from "react";
import ImportOutcomeFeedback from "@/components/dashboard/ImportOutcomeFeedback";
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

  return <ImportOutcomeFeedback state="confirmed" saved={outcome.saved} alreadySaved={outcome.alreadySaved} />;
}
