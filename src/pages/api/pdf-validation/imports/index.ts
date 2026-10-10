import { importApi } from "@/lib/pdf-import-api";

// Creates one import from locally read text. The backend recounts tokens and rebuilds every batch digest.
export const POST = importApi("evaluation").create;
