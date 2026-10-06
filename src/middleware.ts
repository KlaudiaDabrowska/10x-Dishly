import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

function privateResponse(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  // The operational probe uses its own bearer token and must work independently of Supabase.
  if (context.url.pathname.replace(/\/$/, "") === "/api/ops/deployment-probe") {
    context.locals.user = null;
    return next();
  }
  const supabase = createClient(context.request.headers, context.cookies);

  if (
    !supabase &&
    (context.url.pathname.startsWith("/api/") ||
      PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route)))
  ) {
    // Preview and unconfigured environments cannot reach the model or privileged database.
    const error = context.url.pathname.startsWith("/api/pdf-validation/")
      ? "experiment_unavailable"
      : "infrastructure_unavailable";
    return privateResponse(Response.json({ error }, { status: 503 }));
  }

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return privateResponse(context.redirect("/auth/signin"));
    }
  }

  return privateResponse(await next());
});
