import type { Metadata } from "next";
import { hasPassword } from "../../../lib/password-login";
import { getViewer } from "../../../lib/viewer";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Account" };

export default async function Account() {
  const viewer = await getViewer();
  const withPassword = await hasPassword(viewer.id);
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-4xl font-medium tracking-tight">Account</h1>
        <p className="text-muted">{viewer.email}</p>
      </div>
      <section aria-labelledby="roles" className="flex flex-col gap-2">
        <h2 id="roles" className="font-display text-xl font-semibold">
          Your roles
        </h2>
        <ul className="flex flex-col gap-1">
          {viewer.memberships.map((m) => (
            <li key={m.site.id}>
              {m.site.name}: <span className="font-medium">{m.role.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="password" className="flex flex-col gap-3">
        <h2 id="password" className="font-display text-xl font-semibold">
          Password
        </h2>
        <p className="max-w-xl text-muted">
          {withPassword
            ? "Change your password. Other devices will be signed out."
            : "Set a password to sign in without waiting for an email link. Email links keep working too."}
        </p>
        <PasswordForm hasPassword={withPassword} email={viewer.email} />
      </section>
    </div>
  );
}
