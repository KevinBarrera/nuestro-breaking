import { useSessionStore, type User } from '@/entities/session';
import type { ReactNode } from 'react';
import type { TeamMember } from '@/entities/admin-team';
import { styles } from './catalog-copy';
import { teamDenied } from './team-copy';
import { accessSummary, memberStatus, type StatusTone } from './team-model';
import { useTeamLoad } from './use-team-load';

const toneClass: Record<StatusTone, string> = {
  success: 'bg-success text-success-fg',
  warning: 'bg-warning text-warning-fg',
  neutral: 'bg-chip text-fg',
};

export function TeamHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Administración</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-heading">Equipo</h1>
        <p className="max-w-2xl text-muted">
          Personas que pueden entrar al panel y qué eventos operan.
        </p>
      </div>
      {children}
    </header>
  );
}

export function TeamDenied() {
  return (
    <p role="alert" className="rounded-lg border border-warning-fg bg-warning p-4 text-warning-fg">
      {teamDenied}
    </p>
  );
}

// Equipo (#214): the admin team, for global admins only. Others (direct URL) see the same
// "Sin acceso" pattern as the event list; the backend refuses their team requests anyway.
export function AdminTeamPage() {
  const user = useSessionStore((state) => state.session.user);
  const allowed = user?.globalAdmin === true;
  const { state, reload } = useTeamLoad(allowed);

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <TeamHeader />
        {!allowed ? (
          <TeamDenied />
        ) : state.status === 'loading' ? (
          <p role="status">Cargando equipo…</p>
        ) : state.status === 'failed' ? (
          state.failure.kind === 'denied' ? (
            <TeamDenied />
          ) : (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger p-4 text-danger-fg"
            >
              <p>No se pudo cargar el equipo. Inténtalo de nuevo.</p>
              <button type="button" className={styles.secondary} onClick={reload}>
                Reintentar
              </button>
            </div>
          )
        ) : (
          <TeamList members={state.members} user={user} />
        )}
        <p className="max-w-3xl text-sm text-muted">
          Solo quien tiene acceso a <strong className="text-fg">todos los eventos</strong> ve esta
          sección. Nadie puede desactivarse a sí mismo, y siempre queda al menos una persona activa
          con acceso a todos los eventos.
        </p>
      </div>
    </main>
  );
}

function TeamList({ members, user }: { members: TeamMember[]; user: User | null }) {
  const now = new Date();
  return (
    <ul aria-label="Miembros del equipo" className={`${styles.card} divide-y divide-row p-0`}>
      {members.map((member) => {
        const status = memberStatus(member, now);
        const isSelf = member.id === user?.id;
        return (
          <li
            key={member.id}
            className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.3fr)] md:items-start"
          >
            <div className="min-w-0">
              <p className="font-bold break-words">
                {member.displayName}
                {isSelf && <span className="font-medium text-muted"> (tú)</span>}
              </p>
              <p className="text-sm break-words text-muted">{member.email}</p>
            </div>
            <p className="min-w-0 break-words">
              <span className="sr-only">Acceso: </span>
              {accessSummary(member.access)}
            </p>
            <div>
              <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${toneClass[status.tone]}`}
              >
                {status.label}
              </span>
              {status.hint && <p className="mt-1 text-sm text-muted">{status.hint}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
