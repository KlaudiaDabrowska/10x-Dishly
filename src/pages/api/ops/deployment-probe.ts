import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleProbe } from "@/lib/deployment-probe";

export const POST: APIRoute = ({ request }) => handleProbe(request, env);
