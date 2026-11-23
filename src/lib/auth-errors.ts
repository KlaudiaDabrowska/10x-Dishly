export type AuthFlow = "signin" | "signup";
export const AUTH_FAILURE_CODE = "auth_failed" as const;

const AUTH_FAILURE_MESSAGES: Record<AuthFlow, string> = {
  signin: "Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.",
  signup: "Nie udało się utworzyć konta. Sprawdź dane i spróbuj ponownie.",
};

export function publicAuthError(flow: AuthFlow, code: string | null): string | null {
  return code === AUTH_FAILURE_CODE ? AUTH_FAILURE_MESSAGES[flow] : null;
}

export function authFailureLocation(flow: AuthFlow): string {
  return `/auth/${flow}?error=${AUTH_FAILURE_CODE}`;
}
