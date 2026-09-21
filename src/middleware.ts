import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

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
    return Response.json({ error: "infrastructure_unavailable" }, { status: 503 });
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
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
