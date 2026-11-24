"use client";

import { useActionState } from "react";
import { savePassword, type PasswordState } from "./actions";

const field = "rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent";

export function PasswordForm({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(savePassword, null);
  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      {/* Lets password managers save the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {hasPassword ? (
        <label htmlFor="current" className="flex flex-col gap-1.5 font-medium">
          Current password
          <input
            id="current"
            name="current"
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
            className={field}
          />
        </label>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new" className="font-medium">
          New password
        </label>
        <input
          id="new"
          name="new"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          aria-describedby="new-help"
          className={field}
        />
        <p id="new-help" className="text-sm text-muted">
          At least 10 characters. A few unrelated words are easy to remember and hard to guess.
        </p>
      </div>
      <label htmlFor="confirm" className="flex flex-col gap-1.5 font-medium">
        New password again
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          className={field}
        />
      </label>
      {state ? (
        <p
          role={state.tone === "bad" ? "alert" : "status"}
          className={`text-sm ${state.tone === "bad" ? "text-bad" : "text-good"}`}
        >
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
      </button>
    </form>
  );
}
