import { formatEventTime, readCatalogEventContext } from '@/entities/event-catalog';
import {
  getRegistrationHistory,
  registrationHistoryFailure,
  type HistoryFilter,
  type HistoryItem,
  type RegistrationHistoryFailure,
} from '@/entities/registration-history';
import { routes } from '@/shared/config';
import { buttonClass, CheckboxField } from '@/shared/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { generatePath, Link, useParams } from 'react-router';
import { styles } from './catalog-copy';
import {
  emptyHistoryMessage,
  folioLabel,
  historyActorLabel,
  historyClockNote,
  historyDetailLine,
  historyTitle,
  reasonLine,
} from './history-model';
import { useEventName } from './use-event-name';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: RegistrationHistoryFailure }
  | {
      status: 'ready';
      items: HistoryItem[];
      nextCursor: string | null;
      timeZone: string | null;
    };

type MoreState = 'idle' | 'loading' | 'failed';

const failureMessages: Record<RegistrationHistoryFailure, string> = {
  denied: 'No tienes acceso al historial de este evento.',
  'not-found': 'No encontramos este evento.',
  error: 'No se pudo cargar el historial. Intenta de nuevo.',
};

// The time zone is a nicety: without it the times use the labeled device clock.
const eventTimeZone = (eventId: string) =>
  readCatalogEventContext(eventId, new AbortController().signal)
    .then((context): string | null => context.timeZone)
    .catch(() => null);

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function AdminHistoryPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <HistoryScreen key={eventId} eventId={eventId} />;
}

// Historial (#104): the event's registration operations, newest first, read only. Each page
// holds 50; "Cargar más" appends the next one.
function HistoryScreen({ eventId }: { eventId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [version, setVersion] = useState(0);
  const [more, setMore] = useState<MoreState>('idle');
  const { name: eventName } = useEventName(eventId);
  const zone = useRef<Promise<string | null> | null>(null);
  const moreRequest = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // The first entry of an appended page takes focus, so "Cargar más" never drops it to the top.
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    zone.current ??= eventTimeZone(eventId);
    Promise.all([getRegistrationHistory(eventId, { filter }, controller.signal), zone.current])
      .then(([page, timeZone]) => {
        if (!controller.signal.aborted) setState({ status: 'ready', ...page, timeZone });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: 'failed', failure: registrationHistoryFailure(error) });
      });
    return () => {
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [eventId, filter, version]);

  useEffect(() => {
    if (pendingFocus.current === null || !listRef.current) return;
    const articles = listRef.current.querySelectorAll<HTMLElement>('article');
    (articles[pendingFocus.current] ?? articles[articles.length - 1])?.focus();
    pendingFocus.current = null;
  });

  function reload(next: HistoryFilter = filter) {
    setState({ status: 'loading' });
    setMore('idle');
    if (next === filter) setVersion((current) => current + 1);
    else setFilter(next);
  }

  function loadMore() {
    if (state.status !== 'ready' || !state.nextCursor) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    const shown = state.items.length;
    setMore('loading');
    getRegistrationHistory(eventId, { filter, cursor: state.nextCursor }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        pendingFocus.current = shown;
        setState((current) =>
          current.status === 'ready'
            ? { ...current, items: [...current.items, ...page.items], nextCursor: page.nextCursor }
            : current,
        );
        setMore('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setMore('failed');
      });
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Historial</h1>
          {eventName && <p className="text-muted">{eventName}</p>}
          <p className="text-sm text-muted">
            Cada operación sobre las inscripciones del evento, de la más reciente a la más antigua:
            cuándo pasó, quién la hizo, qué cambió y el motivo. Esta pantalla no cambia nada.
          </p>
        </header>
        <div className={styles.card}>
          <CheckboxField
            label="Solo correcciones"
            description="Anulaciones, correcciones de nombre, disciplina o efectivo y cambios de competencias en inscripciones confirmadas."
            checked={filter === 'corrections'}
            onChange={(event) => reload(event.target.checked ? 'corrections' : 'all')}
          />
        </div>
        {state.status === 'loading' && <p role="status">Cargando historial…</p>}
        {state.status === 'failed' && (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
          >
            <p>{failureMessages[state.failure]}</p>
            {state.failure !== 'denied' && (
              <button type="button" className={buttonClass('secondary')} onClick={() => reload()}>
                Reintentar
              </button>
            )}
          </div>
        )}
        {state.status === 'ready' &&
          (state.items.length === 0 ? (
            <p className={`${styles.card} text-sm text-muted`}>{emptyHistoryMessage(filter)}</p>
          ) : (
            <>
              <p className="text-sm text-muted">{historyClockNote(state.timeZone)}</p>
              <ol ref={listRef} aria-label="Operaciones" className="space-y-3">
                {state.items.map((item) => (
                  <li key={item.id}>
                    <HistoryEntry
                      eventId={eventId}
                      item={item}
                      timeZone={state.timeZone ?? deviceTimeZone()}
                    />
                  </li>
                ))}
              </ol>
              {state.nextCursor && (
                <div className="space-y-2">
                  {more === 'failed' && (
                    <p role="alert" className="text-sm text-danger-fg">
                      No se pudieron cargar más operaciones. Intenta de nuevo.
                    </p>
                  )}
                  <button
                    type="button"
                    className={buttonClass('secondary')}
                    disabled={more === 'loading'}
                    onClick={loadMore}
                  >
                    Cargar más
                  </button>
                </div>
              )}
            </>
          ))}
      </div>
    </main>
  );
}

type HistoryEntryProps = { eventId: string; item: HistoryItem; timeZone: string };

function HistoryEntry({ eventId, item, timeZone }: HistoryEntryProps) {
  const titleId = useId();
  const detail = historyDetailLine(item.details);
  const reason = reasonLine(item.reason);
  return (
    <article
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`${styles.card} space-y-1.5 text-sm break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={titleId} className="text-lg font-bold text-heading">
          {historyTitle(item.details.kind)}
        </h2>
        <p className="text-muted">
          <time dateTime={item.occurredAt}>{formatEventTime(item.occurredAt, timeZone)}</time>
        </p>
      </div>
      <p>
        <Link
          to={generatePath(routes.adminEventRegistration, {
            eventId,
            registrationId: item.registration.id,
          })}
          className="font-semibold text-link underline hover:text-link-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          {item.registration.participantName}
        </Link>
        <span className="text-muted"> · {folioLabel(item.registration.folio)}</span>
      </p>
      {detail && <p>{detail}</p>}
      {reason && <p>{reason}</p>}
      <p className="text-muted">Por {historyActorLabel(item.actor)}</p>
    </article>
  );
}
