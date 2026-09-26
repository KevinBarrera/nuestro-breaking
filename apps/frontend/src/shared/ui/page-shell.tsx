import type { PropsWithChildren } from 'react';

type PageShellProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16 text-center text-[var(--event-cream)]">
      <p className="mx-auto border-b-2 border-[var(--event-magenta)] pb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--event-cyan)]">
        Nuestro Breaking
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-7">{description}</p>
      <div
        aria-hidden="true"
        className="mx-auto mt-8 h-1 w-16 rounded-full bg-[var(--event-orange)]"
      />
      {children ? <div className="mt-8">{children}</div> : null}
    </main>
  );
}
