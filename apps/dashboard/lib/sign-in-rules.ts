/**
 * Who may sign in to the dashboard, in one place (AGENTS.md §10). Pure, so it's tested without Auth.js or Google.
 *
 * - Email link, when asking for a link: invited → send it; not invited → show the same "check your email" page
 *   and send nothing, so the form reveals nothing about who has an account.
 * - Email link, when following it: invited only (Auth.js only issues links to invited addresses anyway).
 * - Google: Google must have verified the address, and that address must be invited. An uninvited Google
 *   account gets a clear "not invited" page: it's the person's own account, so there's nothing to hide from them.
 */
export type SignInAttempt = {
  provider: string;
  /** Asking for an email link, rather than following one. */
  requestingLink: boolean;
  email: string | null | undefined;
  /** Google's `email_verified` claim. */
  emailVerified?: boolean | null;
  invited: boolean;
};

export const NOT_INVITED = "/sign-in/error?reason=not-invited";
export const UNVERIFIED = "/sign-in/error?reason=unverified";

export function decideSignIn(a: SignInAttempt): true | false | string {
  if (a.provider === "nodemailer") {
    if (a.requestingLink) return a.invited ? true : "/sign-in/check-email";
    return a.invited;
  }
  if (a.provider === "google") {
    if (!a.email || a.emailVerified !== true) return UNVERIFIED;
    return a.invited ? true : NOT_INVITED;
  }
  return false; // any other provider: refused until it's deliberately added
}
