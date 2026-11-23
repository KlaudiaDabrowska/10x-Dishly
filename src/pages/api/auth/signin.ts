import type { APIRoute } from "astro";
import { authFailureLocation } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "infrastructure_unavailable" }, { status: 503 });
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(authFailureLocation("signin"));
  }

  return context.redirect("/dashboard");
};
