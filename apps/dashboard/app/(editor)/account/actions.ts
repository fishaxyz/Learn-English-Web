"use server";

import { cookies } from "next/headers";
import { serverEnv } from "../../../lib/env";
import { sessionCookieName, setPassword } from "../../../lib/password-login";
import { getViewer } from "../../../lib/viewer";

export type PasswordState = { tone: "good" | "bad"; message: string } | null;

/** Sets or changes the signed-in editor's own password. Only ever their own: the user comes from the session. */
export async function savePassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const viewer = await getViewer();
  const current = form.get("current");
  const next = String(form.get("new") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { tone: "bad", message: "The two new passwords don't match." };
  const secure = serverEnv().AUTH_URL.startsWith("https:");
  const keep = (await cookies()).get(sessionCookieName(secure))?.value ?? null;
  const result = await setPassword(
    { id: viewer.id, email: viewer.email },
    typeof current === "string" ? current : null,
    next,
    keep
  );
  return result.ok
    ? { tone: "good", message: "Password saved. You're still signed in here; other devices were signed out." }
    : { tone: "bad", message: result.message };
}
