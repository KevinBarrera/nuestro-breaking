import { getSession, signIn, signOut, useSessionStore } from '@/entities/session';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';

type Status = 'loading' | 'signed-out' | 'signed-in';

function canAccessAdmin(roles: string[]) {
  return roles.includes('admin') || roles.includes('judge');
}

export function AdminSessionBoundary() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);

  useEffect(() => {
    const controller = new AbortController();
    void getSession(controller.signal)
      .then((session) => {
        if (controller.signal.aborted) return;
        if (session.user && canAccessAdmin(session.user.roles)) {
          setSession(session);
          setStatus('signed-in');
        } else {
          clearSession();
          setStatus('signed-out');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          clearSession();
          setStatus('signed-out');
        }
      });
    return () => controller.abort();
  }, [clearSession, setSession]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(false);
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = fields.get('email');
    const password = fields.get('password');
    try {
      if (typeof email !== 'string' || typeof password !== 'string')
        throw new Error('Invalid form');
      const session = await signIn(email, password);
      if (!session.user || !canAccessAdmin(session.user.roles)) throw new Error('Not authorized');
      setSession(session);
      setStatus('signed-in');
    } catch {
      clearSession();
      form.reset();
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function leave() {
    if (submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      await signOut();
      clearSession();
      setStatus('signed-out');
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading') return <p role="status">Comprobando sesión…</p>;
  if (status === 'signed-in')
    return (
      <>
        <button type="button" disabled={submitting} onClick={() => void leave()}>
          Cerrar sesión
        </button>
        {error && <p role="alert">No se pudo cerrar sesión.</p>}
        <Outlet />
      </>
    );
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-[var(--event-cream)] sm:px-6">
      <section
        aria-label="Acceso administrativo"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--event-dusk)] bg-slate-950/90 p-6 shadow-2xl shadow-black/40 sm:p-10"
      >
        <div aria-hidden="true" className="mb-8 h-1 w-16 rounded-full bg-[var(--event-magenta)]" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--event-cyan)]">
          Nuestro Breaking · Administración
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Iniciar sesión</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Accede con tu cuenta del equipo organizador o de jueces.
        </p>
        <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-5">
          <label className="block text-sm font-semibold text-slate-100">
            Correo electrónico
            <input
              className="mt-2 block min-h-12 w-full rounded-lg border border-slate-500 bg-slate-900 px-4 py-3 text-base text-white outline-none placeholder:text-slate-400 focus-visible:border-[var(--event-cyan)] focus-visible:ring-2 focus-visible:ring-[var(--event-cyan)]"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-100">
            Contraseña
            <input
              className="mt-2 block min-h-12 w-full rounded-lg border border-slate-500 bg-slate-900 px-4 py-3 text-base text-white outline-none focus-visible:border-[var(--event-cyan)] focus-visible:ring-2 focus-visible:ring-[var(--event-cyan)]"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-400 bg-rose-950/70 p-3 text-sm text-rose-100"
            >
              No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-12 w-full rounded-lg bg-[var(--event-cyan)] px-5 py-3 text-base font-bold text-[var(--event-ink)] transition-colors hover:bg-[var(--event-cream)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--event-cream)] disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
        <p className="mt-8 border-t border-slate-700 pt-5 text-xs leading-5 text-slate-300">
          Acceso exclusivo para el equipo autorizado.
        </p>
      </section>
    </main>
  );
}
