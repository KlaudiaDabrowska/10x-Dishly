import { useEffect, useState } from "react";
import ImportOutcomeFeedback from "@/components/dashboard/ImportOutcomeFeedback";
import {
  dashboardImportId,
  loadDashboardImportOutcome,
  withoutImportParameter,
} from "@/lib/pdf-processing/dashboard-import";
import type { DashboardImportOutcome } from "@/lib/pdf-processing/dashboard-import";

interface ImportOutcomeBannerProps {
  importId: string | null;
}

function ImportOutcomeRequest({ importId }: { importId: string }) {
  const [outcome, setOutcome] = useState<DashboardImportOutcome | null | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboardImportOutcome(importId, fetch, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setOutcome(result);
    });
    return () => {
      controller.abort();
    };
  }, [importId]);

  if (outcome === undefined) return <ImportOutcomeFeedback state="pending" />;
  if (outcome === null) return <ImportOutcomeFeedback state="unavailable" />;

  return <ImportOutcomeFeedback state="confirmed" saved={outcome.saved} alreadySaved={outcome.alreadySaved} />;
}

export default function ImportOutcomeBanner({ importId }: ImportOutcomeBannerProps) {
  const validImportId =
    importId && dashboardImportId(`?import=${encodeURIComponent(importId)}`) === importId ? importId : null;

  useEffect(() => {
    const cleanUrl = withoutImportParameter(window.location.pathname, window.location.search, window.location.hash);
    window.history.replaceState(window.history.state, "", cleanUrl);
  }, [importId]);

  if (!validImportId) return null;
  return <ImportOutcomeRequest key={validImportId} importId={validImportId} />;
}
