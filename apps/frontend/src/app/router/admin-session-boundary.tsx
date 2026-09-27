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
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <form onSubmit={(event) => void submit(event)} className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        <label className="block">
          Correo electrónico
          <input
            className="block w-full text-slate-950"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </label>
        <label className="block">
          Contraseña
          <input
            className="block w-full text-slate-950"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">No se pudo iniciar sesión.</p>}
        <button type="submit" disabled={submitting}>
          Iniciar sesión
        </button>
      </form>
    </main>
  );
}
