import { restoreEvent, adminEventFailure, type AdminEvent } from '@/entities/admin-event';
import { useSessionStore } from '@/entities/session';
import { isEventListRequest } from '@/widgets/admin-shell';
import { routes } from '@/shared/config';
import { Notice } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { styles } from './catalog-copy';
import {
  eventDates,
  eventDateTile,
  eventFailureMessage,
  eventLocation,
  landingRedirect,
  restoredNotice,
  salesChip,
  splitEvents,
} from './event-model';
import { listNotice } from './event-lifecycle-model';
import { useEventList } from './use-event-list';

const eventPath = (pattern: string, eventId: string) => pattern.replace(':eventId', eventId);

const createLink = `${styles.primary} inline-flex items-center justify-center gap-2 px-[18px]`;

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function CreateEventLink({ large = false }: { large?: boolean }) {
  return (
    <Link
      to={routes.adminEventNew}
      className={large ? `${createLink} min-h-12 px-6 text-[15px]` : createLink}
    >
      <PlusIcon />
      Crear evento
    </Link>
  );
}

type Tab = 'active' | 'archived';

type Message = { tone: 'info' | 'danger'; text: string };

// The /admin landing: the events this account may operate, from GET /admin/events only.
// Global admins also create events here and restore archived ones (#213). For everyone else,
// exactly one event means nothing to choose, so it opens that event's overview, unless they
// asked for the list from the shell ("Todos los eventos" or the brand).
export function AdminPage() {
  const globalAdmin = useSessionStore((state) => state.session.user?.globalAdmin === true);
  const { state, reload } = useEventList(globalAdmin);
  const [tab, setTab] = useState<Tab>('active');
  const [restoring, setRestoring] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  // Datos del evento comes back here after archiving or deleting, with a notice (#213 T10).
  const arrivalNotice = listNotice(location.state);
  const [message, setMessage] = useState<Message | null>(() =>
    arrivalNotice ? { tone: 'info', text: arrivalNotice } : null,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const tabsId = useId();

  // The notice is shown once: it is dropped from the history entry, so a reload does not
  // repeat it.
  useEffect(() => {
    if (arrivalNotice) void navigate('.', { replace: true, state: null });
  }, [arrivalNotice, navigate]);

  const { active, archived } =
    state.status === 'ready' ? splitEvents(state.events) : { active: [], archived: [] };
  const redirect =
    state.status === 'ready' && !isEventListRequest(location.state)
      ? landingRedirect(active, globalAdmin)
      : null;
  if (redirect) return <Navigate replace to={eventPath(routes.adminEventOverview, redirect)} />;

  const empty = state.status === 'ready' && active.length === 0;

  async function restore(event: AdminEvent) {
    if (restoring) return;
    setRestoring(event.id);
    setMessage(null);
    try {
      await restoreEvent(event.id);
      setMessage({ tone: 'info', text: restoredNotice(event.name) });
      // The restored event is active again: show it there, and move focus to a stable target.
      setTab('active');
      heading.current?.focus();
    } catch (error) {
      setMessage({ tone: 'danger', text: eventFailureMessage(adminEventFailure(error)) });
    } finally {
      setRestoring(null);
      reload();
    }
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1
              ref={heading}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight text-heading outline-none"
            >
              Eventos
            </h1>
            <p className="max-w-2xl text-muted">
              {globalAdmin
                ? 'Elige el evento que vas a operar o crea uno nuevo.'
                : 'Elige el evento que vas a operar. Todo lo demás del panel trabaja dentro de ese evento.'}
            </p>
          </div>
          {globalAdmin && !empty && <CreateEventLink />}
        </header>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {state.status === 'ready' && state.refreshFailed && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-fg bg-warning p-4 text-warning-fg"
          >
            <p>No se pudo actualizar la lista de eventos; puede no estar al día.</p>
            <button type="button" className={styles.secondary} onClick={reload}>
              Reintentar
            </button>
          </div>
        )}
        {state.status === 'loading' && <p role="status">Cargando eventos…</p>}
        {state.status === 'failed' &&
          (state.failure.kind === 'unauthorized' || state.failure.kind === 'forbidden' ? (
            <p
              role="alert"
              className="rounded-lg border border-warning-fg bg-warning p-4 text-warning-fg"
            >
              Sin acceso: tu cuenta no puede ver la lista de eventos.
            </p>
          ) : (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-fg bg-danger p-4 text-danger-fg"
            >
              <p>No se pudieron cargar los eventos. Inténtalo de nuevo.</p>
              <button type="button" className={styles.secondary} onClick={reload}>
                Reintentar
              </button>
            </div>
          ))}
        {state.status === 'ready' &&
          (globalAdmin && (archived.length > 0 || !empty) ? (
            <EventTabs
              id={tabsId}
              tab={tab}
              onTab={setTab}
              counts={{ active: active.length, archived: archived.length }}
            >
              {tab === 'active' ? (
                <ActiveEvents events={active} globalAdmin hasArchived={archived.length > 0} />
              ) : (
                <ArchivedEvents
                  events={archived}
                  restoring={restoring}
                  onRestore={(event) => void restore(event)}
                />
              )}
            </EventTabs>
          ) : (
            <ActiveEvents events={active} globalAdmin={globalAdmin} hasArchived={false} />
          ))}
      </div>
    </main>
  );
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Activos' },
  { id: 'archived', label: 'Archivados' },
];

type EventTabsProps = {
  id: string;
  tab: Tab;
  onTab: (tab: Tab) => void;
  counts: Record<Tab, number>;
  children: ReactNode;
};

// "Activos" / "Archivados" (#323), for global admins: only they see archived events. Arrow
// keys move between the two tabs, as in the WAI-ARIA tabs pattern.
function EventTabs({ id, tab, onTab, counts, children }: EventTabsProps) {
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: Tab = tab === 'active' ? 'archived' : 'active';
    onTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Filtrar eventos"
        onKeyDown={onKeyDown}
        className="flex gap-6 border-b border-line"
      >
        {tabs.map(({ id: tabId, label }) => {
          const selected = tab === tabId;
          return (
            <button
              key={tabId}
              ref={(node) => {
                tabRefs.current[tabId] = node;
              }}
              type="button"
              role="tab"
              id={`${id}-${tabId}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTab(tabId)}
              className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-0.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                selected
                  ? 'border-primary text-heading'
                  : 'border-transparent text-muted hover:text-heading'
              }`}
            >
              {label}
              <span className="rounded-full bg-chip px-2 text-xs leading-[18px] text-heading">
                {counts[tabId]}
              </span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {children}
      </div>
    </div>
  );
}

type ActiveEventsProps = { events: AdminEvent[]; globalAdmin: boolean; hasArchived: boolean };

function ActiveEvents({ events, globalAdmin, hasArchived }: ActiveEventsProps) {
  if (events.length > 0)
    return (
      <ul aria-label="Eventos" className="flex flex-col gap-3">
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
    );
  if (globalAdmin) return <FirstEvent hasArchived={hasArchived} />;
  return (
    <div className="space-y-1 text-muted">
      <p>No hay eventos disponibles para tu cuenta.</p>
      <p>Pide a una persona con acceso a todos los eventos que te dé acceso.</p>
    </div>
  );
}

type ArchivedEventsProps = {
  events: AdminEvent[];
  restoring: string | null;
  onRestore: (event: AdminEvent) => void;
};

function ArchivedEvents({ events, restoring, onRestore }: ArchivedEventsProps) {
  if (events.length === 0)
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-dashed border-input-line px-6 py-10 text-center">
        <p className="font-bold text-heading">No hay eventos archivados</p>
        <p className="text-sm text-muted">
          Los eventos que archives desde Datos del evento aparecen aquí y se pueden restaurar.
        </p>
      </div>
    );
  return (
    <ul aria-label="Eventos archivados" className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id}>
          <ArchivedEventCard
            event={event}
            restoring={restoring === event.id}
            disabled={restoring !== null}
            onRestore={() => onRestore(event)}
          />
        </li>
      ))}
    </ul>
  );
}

const steps = [
  {
    title: 'Agrega competencias y workshops',
    detail: 'Las actividades que va a tener el evento.',
  },
  { title: 'Crea los pases y sus precios', detail: 'Lo que el público va a comprar.' },
  { title: 'Abre la venta y opera el check-in', detail: 'Cuando el catálogo esté listo.' },
];

// First run: no event yet, so the next step is creating one. With archived events, the copy
// also points to restoring one.
function FirstEvent({ hasArchived }: { hasArchived: boolean }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col items-center gap-7 rounded-2xl border border-line bg-surface px-6 py-12 text-center sm:px-8"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-2xl bg-chip-selected text-chip-selected-fg"
      >
        <CalendarPlusIcon />
      </span>
      <div className="flex max-w-[520px] flex-col gap-2">
        <h2 id={titleId} className="text-2xl font-extrabold text-heading">
          {hasArchived ? 'No hay eventos activos' : 'Aún no hay eventos'}
        </h2>
        <p className="text-muted">
          {hasArchived
            ? 'Crea uno nuevo o restaura uno archivado. Después lo dejas listo en tres pasos.'
            : 'Crea el primero para empezar. Después lo dejas listo en tres pasos.'}
        </p>
      </div>
      <ol className="flex w-full max-w-[840px] flex-wrap gap-4 text-left">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-[1_1_220px] flex-col gap-3 rounded-xl bg-surface-inner p-5"
          >
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-chip-selected text-sm font-bold text-chip-selected-fg"
            >
              {index + 1}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[15px] leading-[22px] font-bold text-heading">
                {step.title}
              </span>
              <span className="text-sm text-muted">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <CreateEventLink large />
    </section>
  );
}

function EventMeta({ event, id }: { event: AdminEvent; id?: string }) {
  const location = eventLocation(event);
  return (
    <span
      id={id}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-5 text-muted"
    >
      <span>{eventDates(event)}</span>
      {location && (
        <span className="inline-flex items-center gap-1.5">
          <PlaceIcon />
          {location}
        </span>
      )}
      <span className="max-w-full truncate font-mono text-[13px]">/e/{event.slug}</span>
    </span>
  );
}

// The month and days of the event, or a dashed "Por definir" tile while its dates are not set.
// Decorative: the card's description already reads the dates.
function DateTileBadge({ event }: { event: AdminEvent }) {
  const tile = eventDateTile(event);
  if (!tile)
    return (
      <span
        aria-hidden="true"
        className="flex size-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-input-line bg-surface-inner text-center text-xs leading-[14px] font-semibold text-muted"
      >
        <CalendarIcon />
        Por definir
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className="flex size-[72px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] bg-chip-selected text-chip-selected-fg"
    >
      <span className="text-xs leading-4 font-semibold opacity-85">{tile.month}</span>
      <span className="text-xl leading-6 font-extrabold tracking-tight">{tile.days}</span>
    </span>
  );
}

// The whole card opens the event's overview. Its name is the link name; the dates, location,
// address and sales pill describe it.
function EventCard({ event }: { event: AdminEvent }) {
  const nameId = useId();
  const metaId = useId();
  const salesId = useId();
  return (
    <Link
      to={eventPath(routes.adminEventOverview, event.id)}
      aria-labelledby={nameId}
      aria-describedby={`${metaId} ${salesId}`}
      className="flex items-center gap-5 rounded-xl border border-line bg-surface py-4 pr-5 pl-4 text-heading hover:border-input-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <DateTileBadge event={event} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span id={nameId} className="text-[17px] leading-6 font-bold break-words">
          {event.name}
        </span>
        <EventMeta event={event} id={metaId} />
      </span>
      <SalesPill salesEnabled={event.salesEnabled} id={salesId} />
      <ChevronIcon />
    </Link>
  );
}

const pillTone = {
  open: { pill: 'border-success-fg bg-success text-success-fg', dot: 'bg-success-fg' },
  closed: { pill: 'border-line bg-chip text-muted', dot: 'bg-muted' },
} as const;

function SalesPill({ salesEnabled, id }: { salesEnabled: boolean; id?: string }) {
  const chip = salesChip(salesEnabled);
  const tone = pillTone[chip.tone];
  return (
    <span
      id={id}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-[3px] text-xs leading-4 font-semibold whitespace-nowrap ${tone.pill}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
      {chip.label}
    </span>
  );
}

type ArchivedEventCardProps = {
  event: AdminEvent;
  restoring: boolean;
  disabled: boolean;
  onRestore: () => void;
};

function ArchivedEventCard({ event, restoring, disabled, onRestore }: ArchivedEventCardProps) {
  const nameId = useId();
  return (
    <article
      aria-labelledby={nameId}
      className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-surface py-4 pr-5 pl-4"
    >
      <DateTileBadge event={event} />
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
        <h3 id={nameId} className="text-[17px] leading-6 font-bold break-words text-heading">
          {event.name}
        </h3>
        <EventMeta event={event} />
      </div>
      <span className="rounded-full border border-line bg-chip px-3 py-[3px] text-xs leading-4 font-semibold whitespace-nowrap text-muted">
        Archivado
      </span>
      <button
        type="button"
        aria-label={`Restaurar ${event.name}`}
        disabled={disabled}
        onClick={onRestore}
        className={styles.secondary}
      >
        {restoring ? 'Restaurando…' : 'Restaurar'}
      </button>
    </article>
  );
}

const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ChevronIcon = () => (
  <svg {...iconProps} width="18" height="18" className="shrink-0 text-muted">
    <path d="M8 5l5 5-5 5" />
  </svg>
);

const PlaceIcon = () => (
  <svg {...iconProps} width="14" height="14" className="shrink-0">
    <path d="M10 17.5s5.5-4.8 5.5-9a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9 5.5 9z" />
    <circle cx="10" cy="8.5" r="2" />
  </svg>
);

const CalendarIcon = () => (
  <svg {...iconProps} width="18" height="18">
    <rect x="3" y="4.5" width="14" height="13" rx="2" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
  </svg>
);

const CalendarPlusIcon = () => (
  <svg {...iconProps} width="30" height="30" strokeWidth={1.5}>
    <rect x="3" y="4.5" width="14" height="13" rx="2" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4M10 11v4M8 13h4" />
  </svg>
);
