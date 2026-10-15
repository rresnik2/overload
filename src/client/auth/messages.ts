// Friendly text for Better Auth error responses.
export interface AuthErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

export function friendlyAuthError(error: AuthErrorLike | null | undefined, fallback = "Something went wrong. Try again."): string {
  if (!error) return fallback;
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password do not match.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email first. We sent you a new link.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 10 characters.";
    case "PASSWORD_TOO_LONG":
      return "That password is too long.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with that email already exists. Try signing in.";
    case "INVALID_TOKEN":
      return "That link is invalid or has expired. Request a new one.";
    case "AUTH_CANCELLED":
      return "Passkey sign-in was cancelled.";
    default:
      return error.message || fallback;
  }
}
