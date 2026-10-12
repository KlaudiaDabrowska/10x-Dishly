import { importApi } from "@/lib/pdf-import-api";

// Non-content status; recovers a committed outcome after a lost finalization response.
export const GET = importApi("evaluation").status;

// Cancellation before commit prevents all recipe writes; after commit it returns the committed outcome.
export const DELETE = importApi("evaluation").cancel;
