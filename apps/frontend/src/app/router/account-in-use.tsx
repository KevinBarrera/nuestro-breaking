// Shown when this browser's one admin session (#392) is not the account this tab expects:
// right after activating another account, or after another account signed in elsewhere.
export type AccountInUseReason = { kind: 'activated'; email: string } | { kind: 'changed' };

type Props = {
  reason: AccountInUseReason;
  name: string;
  busy: boolean;
  failed: boolean;
  onContinue: () => void;
  onSignOut: () => void;
};

const button =
  'min-h-12 w-full rounded-lg px-5 py-3 text-base font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--event-cream)] disabled:cursor-wait disabled:opacity-60';

export function AccountInUse({ reason, name, busy, failed, onContinue, onSignOut }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-[var(--event-cream)] sm:px-6">
      <section
        aria-labelledby="account-in-use-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--event-dusk)] bg-slate-950/90 p-6 shadow-2xl shadow-black/40 sm:p-10"
      >
        <div aria-hidden="true" className="mb-8 h-1 w-16 rounded-full bg-[var(--event-magenta)]" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--event-cyan)]">
          Los más pesados · Administración
        </p>
        <h1
          id="account-in-use-title"
          className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Hay otra sesión abierta
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {reason.kind === 'activated'
            ? `Activaste la cuenta ${reason.email}, pero este navegador tiene abierta la sesión de ${name}. Ciérrala para entrar con tu cuenta nueva.`
            : `La sesión de este navegador cambió: ahora es la de ${name}. Lo que tenías abierto en esta pestaña era de otra cuenta.`}
        </p>
        {failed && (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-rose-400 bg-rose-950/70 p-3 text-sm text-rose-100"
          >
            No se pudo cerrar la sesión. Inténtalo de nuevo.
          </p>
        )}
        <div className="mt-8 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={onSignOut}
            className={`${button} bg-[var(--event-cyan)] text-[var(--event-ink)] hover:bg-[var(--event-cream)]`}
          >
            {busy ? 'Cerrando sesión…' : `Cerrar la sesión de ${name}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onContinue}
            className={`${button} border border-slate-500 text-slate-100 hover:border-[var(--event-cyan)]`}
          >
            Continuar como {name}
          </button>
        </div>
      </section>
    </main>
  );
}
