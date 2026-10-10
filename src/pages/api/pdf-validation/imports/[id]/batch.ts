import { importApi } from "@/lib/pdf-import-api";

// Candidates are returned only after their digests are durably recorded for this owner/import/batch.
export const POST = importApi("evaluation").batch;
