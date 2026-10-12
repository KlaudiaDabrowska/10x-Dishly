const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface DashboardImportOutcome {
  saved: number;
  alreadySaved: number;
}

type Request = (input: string, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function dashboardImportId(search: string): string | null {
  const value = new URLSearchParams(search).get("import");
  return value && UUID.test(value) ? value : null;
}

export function withoutImportParameter(pathname: string, search: string, hash: string): string {
  const parameters = new URLSearchParams(search);
  parameters.delete("import");
  const query = parameters.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

// The banner trusts only an owner-scoped status response. URL parameters never supply result counts.
export async function loadDashboardImportOutcome(
  importId: string,
  request: Request = fetch,
  signal?: AbortSignal,
): Promise<DashboardImportOutcome | null> {
  if (!UUID.test(importId)) return null;

  try {
    const response = await request(`/api/imports/${importId}`, {
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (!isRecord(body) || body.status !== "committed" || body.readBack !== true || !isRecord(body.outcome))
      return null;

    const { saved, alreadySaved, pending } = body.outcome;
    if (!isCount(saved) || !isCount(alreadySaved) || !isCount(pending) || pending !== 0 || saved + alreadySaved < 1)
      return null;

    return { saved, alreadySaved };
  } catch {
    return null;
  }
}
