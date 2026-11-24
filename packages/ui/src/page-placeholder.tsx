import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: string;
  children?: ReactNode;
};

/** A calm holding page while a section is being built. Server-renderable: no client state. */
export function PagePlaceholder({ eyebrow, title, children }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-16">
      <p className="text-sm font-medium uppercase tracking-wider text-teal-700 dark:text-teal-300">{eyebrow}</p>
      <h1 className="text-4xl font-semibold text-balance text-slate-900 dark:text-slate-50">{title}</h1>
      {children ? <div className="text-lg text-slate-600 dark:text-slate-300">{children}</div> : null}
    </main>
  );
}
