import type { PropsWithChildren } from 'react';

type PageShellProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Nuestro Breaking
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
        {title}
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-600">{description}</p>
      {children ? <div className="mt-8">{children}</div> : null}
    </main>
  );
}
