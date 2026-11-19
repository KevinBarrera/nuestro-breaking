import type { TeamMember } from '@/entities/admin-team';
import type { User } from '@/entities/session';
import { ActionMenu, type ActionMenuItem } from '@/shared/ui';
import { useState, type ReactNode } from 'react';
import { styles } from './catalog-copy';
import {
  accessLines,
  filterTeam,
  memberActions,
  memberInitials,
  memberStatus,
  teamCountText,
  teamCounts,
  type MemberAction,
  type StatusTone,
  type TeamFilter,
} from './team-model';

const statusPillClass: Record<StatusTone, string> = {
  success: 'border-success-fg bg-success text-success-fg',
  warning: 'border-warning-fg bg-warning text-warning-fg',
  neutral: 'border-line bg-chip text-muted',
};

export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs leading-4 font-semibold whitespace-nowrap ${statusPillClass[tone]}`}
    >
      {children}
    </span>
  );
}

const icon = (path: ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {path}
  </svg>
);

const actionIcons: Record<MemberAction, ReactNode> = {
  'change-access': icon(
    <>
      <circle cx="7" cy="12" r="3.5" />
      <path d="M9.5 9.5l7-7M14 5l2 2M12 7l1.5 1.5" />
    </>,
  ),
  regenerate: icon(
    <>
      <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" />
    </>,
  ),
  'cancel-invitation': icon(<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />),
  deactivate: icon(
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M5 5l10 10" />
    </>,
  ),
  reactivate: icon(
    <>
      <path d="M4 10a6 6 0 1 0 1.8-4.3" />
      <path d="M4 3.5v3h3" />
    </>,
  ),
};

function actionLabel(action: MemberAction, member: TeamMember): string {
  if (action === 'regenerate')
    return member.status === 'pending' ? 'Generar nueva invitación' : 'Generar nuevo enlace';
  if (action === 'change-access') return 'Cambiar acceso';
  if (action === 'cancel-invitation') return 'Cancelar invitación';
  if (action === 'deactivate') return 'Desactivar';
  return 'Reactivar';
}

function menuItems(member: TeamMember, actions: MemberAction[]): ActionMenuItem<MemberAction>[] {
  return actions.map((action) => ({
    id: action,
    label: actionLabel(action, member),
    icon: actionIcons[action],
    danger: action === 'deactivate' || action === 'cancel-invitation',
  }));
}

const filters: { id: TeamFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'deactivated', label: 'Desactivados' },
  { id: 'no_access', label: 'Sin acceso' },
];

const chipClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input-line bg-surface px-3.5 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-chip-selected aria-pressed:bg-chip-selected aria-pressed:text-chip-selected-fg aria-pressed:hover:bg-chip-selected';

export function MemberAvatar({ member, isSelf }: { member: TeamMember; isSelf: boolean }) {
  const tone = isSelf
    ? 'bg-nav-active text-nav-active-fg'
    : member.status === 'deactivated'
      ? 'border border-dashed border-input-line bg-surface text-muted'
      : 'bg-chip text-heading';
  return (
    <span
      aria-hidden="true"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone}`}
    >
      {memberInitials(member.displayName)}
    </span>
  );
}

type TeamListProps = {
  members: TeamMember[];
  user: User | null;
  onAction: (action: MemberAction, member: TeamMember) => void;
};

// Wide: one row per person over four columns. Below the container width each row stacks as a
// card (container query), with the actions beside the person and labels over access and status.
const rowGrid =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 p-4 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1.7fr)_170px_132px] @3xl:items-center @3xl:px-6 @3xl:py-3';
const cellLabel = 'mb-0.5 block text-xs leading-4 font-semibold text-muted @3xl:hidden';

export function TeamList({ members, user, onAction }: TeamListProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TeamFilter>('all');
  const counts = teamCounts(members);
  const shown = filterTeam(members, query, filter);
  const now = new Date();
  const visibleFilters = filters.filter(
    (entry) => entry.id !== 'no_access' || counts.no_access > 0,
  );

  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <label className="flex min-h-11 max-w-[420px] min-w-0 flex-[1_1_280px] items-center gap-2 rounded-lg border border-input-line bg-input px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="shrink-0 text-muted"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13 13l4 4" />
          </svg>
          <span className="sr-only">Buscar en el equipo</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca por nombre, correo o evento"
            className="-my-px min-h-11 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
          />
        </label>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {visibleFilters.map((entry) => {
            const selected = filter === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                className={chipClass}
                onClick={() => setFilter(entry.id)}
              >
                {selected && (
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                  </svg>
                )}
                {entry.label}
                <span className="font-mono text-[13px] font-medium">{counts[entry.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div role="table" aria-label="Equipo" aria-describedby="team-count">
          <div role="rowgroup" className="sr-only @3xl:not-sr-only">
            <div
              role="row"
              className={`${rowGrid} min-h-11 rounded-t-xl bg-surface-inner @3xl:py-0 [&>*]:text-xs [&>*]:leading-4 [&>*]:font-semibold [&>*]:text-muted`}
            >
              <span role="columnheader">Persona</span>
              <span role="columnheader">Acceso</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader">
                <span className="sr-only">Acciones</span>
              </span>
            </div>
          </div>
          <div role="rowgroup">
            {shown.map((member, index) => {
              const isSelf = member.id === user?.id;
              const status = memberStatus(member, now);
              const access = accessLines(member.access);
              const actions = memberActions(member, isSelf, now);
              const off = member.status === 'deactivated';
              return (
                <div
                  key={member.id}
                  role="row"
                  className={`${rowGrid} min-h-18 border-line hover:bg-surface-inner ${index > 0 ? 'border-t' : '@3xl:border-t'}`}
                >
                  <div
                    role="cell"
                    className="col-start-1 row-start-1 flex min-w-0 items-center gap-3"
                  >
                    <MemberAvatar member={member} isSelf={isSelf} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`truncate text-[15px] leading-[22px] font-bold ${off ? 'text-muted' : 'text-heading'}`}
                        >
                          {member.displayName}
                        </span>
                        {isSelf && (
                          <span className="shrink-0 rounded-full bg-nav-active px-2 text-xs leading-[18px] font-semibold text-nav-active-fg">
                            Tú
                          </span>
                        )}
                      </span>
                      <span className="truncate text-sm text-muted">{member.email}</span>
                    </span>
                  </div>
                  <div role="cell" className="col-span-2 min-w-0 @3xl:col-span-1">
                    <span className={cellLabel}>Acceso</span>
                    <span
                      title={access.main}
                      className="block truncate text-sm font-semibold text-fg"
                    >
                      {access.main}
                    </span>
                    {access.sub && <span className="block text-sm text-muted">{access.sub}</span>}
                  </div>
                  <div role="cell" className="col-span-2 @3xl:col-span-1">
                    <span className={cellLabel}>Estado</span>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    {status.hint && (
                      <span className="mt-1 block text-sm text-muted">{status.hint}</span>
                    )}
                  </div>
                  <div
                    role="cell"
                    className="col-start-2 row-start-1 flex justify-end @3xl:col-start-auto @3xl:row-start-auto"
                  >
                    {isSelf ? (
                      <span className="text-sm text-muted">Tu cuenta</span>
                    ) : (
                      <ActionMenu
                        label={`Acciones para ${member.displayName}`}
                        items={menuItems(member, actions)}
                        onAction={(action) => onAction(action, member)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 border-t border-line px-6 py-10 text-center">
            <p className="font-bold text-heading">Nadie coincide con la búsqueda</p>
            <p className="text-sm text-muted">
              Prueba con otro nombre o correo, o cambia el filtro de estado.
            </p>
            <button
              type="button"
              className={`${styles.secondary} mt-2`}
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Limpiar filtros
            </button>
          </div>
        )}

        <p
          id="team-count"
          aria-live="polite"
          className="rounded-b-xl border-t border-line bg-surface-inner px-6 py-3 text-sm text-muted"
        >
          {teamCountText(shown.length, members.length)}
        </p>
      </div>
    </div>
  );
}
