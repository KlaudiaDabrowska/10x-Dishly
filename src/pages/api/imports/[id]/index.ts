import { importApi } from "@/lib/pdf-import-api";

export const GET = importApi("product").status;
export const DELETE = importApi("product").cancel;
