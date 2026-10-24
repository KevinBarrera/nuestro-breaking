import { readCatalogEventContext } from '@/entities/event-catalog';
import {
  getRegistrationHistory,
  registrationHistoryFailure,
  type HistoryCounts,
  type HistoryFilter,
  type HistoryItem,
  type RegistrationHistoryFailure,
} from '@/entities/registration-history';
import { routes } from '@/shared/config';
import { buttonClass } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { generatePath, Link, useParams, useSearchParams } from 'react-router';
import {
  historyClockLabel,
  historyDays,
  historyRangeLabel,
  movementsLabel,
  type HistoryEntry,
  type HistoryKind,
} from './history-feed-model';
import {
  historyChips,
  historyNoMatchTitle,
  historyTypeHint,
  readHistoryType,
  typeParam,
} from './history-model';
import { liveSearchQuery } from './registration-model';

type Ready = {
  pages: HistoryItem[][];
  nextCursor: string | null;
  counts: HistoryCounts;
  timeZone: string | null;
};

type Outcome =
  { status: 'failed'; failure: RegistrationHistoryFailure } | { status: 'ready'; data: Ready };

type MoreState = 'idle' | 'loading' | 'failed';

const failureMessages: Record<RegistrationHistoryFailure, string> = {
  denied: 'No tienes acceso al historial de este evento.',
  'not-found': 'No encontramos este evento.',
  error: 'No se pudo cargar el historial. Intenta de nuevo.',
};

// Typing waits this long before it searches, so each key press is not a request.
const searchDelayMs = 300;

const chipClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input-line bg-surface px-3.5 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-chip-selected aria-pressed:bg-chip-selected aria-pressed:text-chip-selected-fg aria-pressed:hover:bg-chip-selected';

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const clockIcon = (size: number) => (
  <svg {...svg} width={size} height={size} strokeWidth="1.75">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6v4l2.5 2" />
  </svg>
);

const kindIcons: Record<HistoryKind, ReactNode> = {
  correction: (
    <>
      <path d="M12.5 4.5l3 3L7 16H4v-3z" />
      <path d="M11 6l3 3" />
    </>
  ),
  registration: (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 6v5M13 8.5h5" />
    </>
  ),
  complimentary: (
    <>
      <rect x="3" y="8" width="14" height="9" rx="1.5" />
      <path d="M2.5 8h15M10 8v9M10 8C8.5 5 5.5 4.5 5.5 6.5S10 8 10 8zM10 8c1.5-3 4.5-3.5 4.5-1.5S10 8 10 8z" />
    </>
  ),
  other: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4l2.5 2" />
    </>
  ),
};

const kindIconClass: Record<HistoryKind, string> = {
  correction: 'bg-warning text-warning-fg',
  registration: 'bg-chip text-heading',
  complimentary: 'border border-line bg-surface-inner text-heading',
  other: 'bg-chip text-heading',
};

const kindPills: Partial<Record<HistoryKind, { label: string; className: string }>> = {
  correction: { label: 'Corrección', className: 'border-warning-fg bg-warning text-warning-fg' },
  registration: { label: 'Inscripción', className: 'border-line bg-chip text-muted' },
  complimentary: { label: 'Cortesía', className: 'border-heading bg-surface text-heading' },
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

// Historial (#104, #357): the event's registration operations, newest first and grouped by day,
// read only. The search and the type live in the URL (`?q=…&tipo=…`); each page holds 50 and
// "Cargar días anteriores" appends the next one.
function HistoryScreen({ eventId }: { eventId: string }) {
  const [params, setParams] = useSearchParams();
  const searched = liveSearchQuery(params.get('q') ?? '') ?? '';
  const filter = readHistoryType(params.get('tipo'));
  const [text, setText] = useState(searched);
  // Back and forward change the URL query; the field follows it unless it already says the same.
  const [shownSearch, setShownSearch] = useState(searched);
  if (shownSearch !== searched) {
    setShownSearch(searched);
    if (liveSearchQuery(text) !== searched) setText(searched);
  }
  // Counts "Reintentar" presses, so the same history is read again after an error.
  const [attempt, setAttempt] = useState(0);
  // Each outcome is tagged with its request, so a stale one is never shown for a newer query.
  const [outcome, setOutcome] = useState<{ key: string; result: Outcome } | null>(null);
  // The last history read, kept on screen while the next one loads.
  const [last, setLast] = useState<Ready | null>(null);
  const [more, setMore] = useState<MoreState>('idle');
  const zone = useRef<Promise<string | null> | null>(null);
  const moreRequest = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The first entry of an appended page takes focus, so loading more never drops it to the top.
  const pendingFocus = useRef<number | null>(null);
  const requestKey = `${attempt}:${filter}:${searched}`;
  const current = outcome?.key === requestKey ? outcome.result : null;

  useEffect(() => {
    const controller = new AbortController();
    zone.current ??= eventTimeZone(eventId);
    const settle = (result: Outcome) => {
      if (controller.signal.aborted) return;
      setOutcome({ key: requestKey, result });
      setMore('idle');
      if (result.status === 'ready') setLast(result.data);
    };
    Promise.all([
      getRegistrationHistory(eventId, { filter, q: searched || undefined }, controller.signal),
      zone.current,
    ])
      .then(([page, timeZone]) =>
        settle({
          status: 'ready',
          data: { pages: [page.items], nextCursor: page.nextCursor, counts: page.counts, timeZone },
        }),
      )
      .catch((error: unknown) =>
        settle({ status: 'failed', failure: registrationHistoryFailure(error) }),
      );
    return () => {
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [eventId, requestKey, filter, searched]);

  useEffect(() => {
    if (pendingFocus.current === null || !listRef.current) return;
    const articles = listRef.current.querySelectorAll<HTMLElement>('article');
    (articles[pendingFocus.current] ?? articles[articles.length - 1])?.focus();
    pendingFocus.current = null;
  });

  const go = (change: { q?: string; filter?: HistoryFilter }) => {
    const next = new URLSearchParams();
    const q = change.q ?? searched;
    const tipo = typeParam(change.filter ?? filter);
    if (q) next.set('q', q);
    if (tipo) next.set('tipo', tipo);
    // Typing replaces the entry, so Back leaves the screen instead of undoing letters.
    setParams(next, { replace: change.q !== undefined });
  };

  // The typed text searches once it settles; one character waits for the next.
  useEffect(() => {
    const query = liveSearchQuery(text);
    if (query === null || query === searched) return;
    const timer = setTimeout(() => go({ q: query }), searchDelayMs);
    return () => clearTimeout(timer);
  });

  const data = current?.status === 'ready' ? current.data : last;
  const loading = current === null;
  const timeZone = data?.timeZone ?? deviceTimeZone();
  const days = data ? historyDays(data.pages, timeZone, new Date()) : [];
  const emptyEvent = data !== null && !searched && data.counts.all === 0;
  const shownCount = days.reduce((total, day) => total + day.entries.length, 0);

  function loadMore() {
    if (current?.status !== 'ready' || !current.data.nextCursor) return;
    const key = requestKey;
    const controller = new AbortController();
    moreRequest.current = controller;
    const shown = listRef.current?.querySelectorAll('article').length ?? 0;
    setMore('loading');
    getRegistrationHistory(
      eventId,
      { filter, q: searched || undefined, cursor: current.data.nextCursor },
      controller.signal,
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        pendingFocus.current = shown;
        const append = (ready: Ready): Ready => ({
          ...ready,
          pages: [...ready.pages, page.items],
          nextCursor: page.nextCursor,
        });
        setOutcome((previous) =>
          previous?.key === key && previous.result.status === 'ready'
            ? { key, result: { status: 'ready', data: append(previous.result.data) } }
            : previous,
        );
        setLast((previous) => (previous ? append(previous) : previous));
        setMore('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setMore('failed');
      });
  }

  return (
    <main aria-busy={loading} className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="@container mx-auto max-w-[960px] space-y-5">
        <header className="max-w-[680px] space-y-1.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Historial</h1>
          <p className="text-muted">
            Quién hizo qué con las inscripciones del evento y por qué. Solo consulta: para corregir
            algo, abre la inscripción.
          </p>
        </header>

        {current?.status === 'failed' && (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
          >
            <p>{failureMessages[current.failure]}</p>
            {current.failure !== 'denied' && (
              <button
                type="button"
                className={buttonClass('secondary')}
                onClick={() => setAttempt((count) => count + 1)}
              >
                Reintentar
              </button>
            )}
          </div>
        )}
        {!data && loading && (
          <p role="status" className="text-muted">
            Cargando historial…
          </p>
        )}

        {emptyEvent && current?.status !== 'failed' && <EmptyEvent eventId={eventId} />}

        {data && !emptyEvent && current?.status !== 'failed' && (
          <>
            <label className="flex min-h-13 items-center gap-2.5 rounded-lg border border-input-line bg-input pr-2 pl-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
              <svg
                {...svg}
                width="20"
                height="20"
                strokeWidth="1.75"
                className="shrink-0 text-muted"
              >
                <circle cx="9" cy="9" r="5.5" />
                <path d="M13 13l4 4" />
              </svg>
              <span className="sr-only">Buscar en el historial</span>
              <input
                type="search"
                autoComplete="off"
                maxLength={200}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Nombre, folio, número de recibo o motivo"
                className="min-h-12 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
              />
              {text && (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => {
                    setText('');
                    go({ q: '' });
                  }}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <svg {...svg} width="18" height="18" strokeWidth="1.75">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              )}
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
                {historyChips(data.counts, filter).map((chip) => (
                  <button
                    key={chip.filter}
                    type="button"
                    aria-pressed={chip.selected}
                    className={chipClass}
                    onClick={() => go({ filter: chip.filter })}
                  >
                    {chip.selected && (
                      <svg {...svg} width="14" height="14" strokeWidth="2.25">
                        <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                      </svg>
                    )}
                    {chip.label}
                    <span className="font-mono text-[13px] font-medium">{chip.count}</span>
                  </button>
                ))}
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                {clockIcon(16)}
                {historyClockLabel(data.timeZone)}
              </p>
            </div>
            {historyTypeHint(filter) && (
              <p className="-mt-1 text-sm text-muted">{historyTypeHint(filter)}</p>
            )}
            <p role="status" className="sr-only">
              {movementsLabel(shownCount)}
            </p>

            {days.length > 0 ? (
              <>
                <div ref={listRef} className="space-y-7">
                  {days.map((day) => (
                    <section key={day.key} aria-label={day.label} className="space-y-2.5">
                      <div className="flex items-baseline justify-between gap-3 px-1">
                        <h2 className="text-lg font-bold text-heading">{day.label}</h2>
                        <span className="text-sm text-muted">{day.countLabel}</span>
                      </div>
                      <ol className="overflow-hidden rounded-xl border border-line bg-surface">
                        {day.entries.map((entry) => (
                          <li key={entry.id} className="border-line not-first:border-t">
                            <HistoryRow eventId={eventId} entry={entry} />
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
                  <span className="text-sm text-muted">{historyRangeLabel(days)}</span>
                  {data.nextCursor && (
                    <button
                      type="button"
                      className={buttonClass('secondary')}
                      disabled={more === 'loading'}
                      onClick={loadMore}
                    >
                      Cargar días anteriores
                    </button>
                  )}
                </div>
                {more === 'failed' && (
                  <p role="alert" className="text-sm text-danger-fg">
                    No se pudieron cargar más movimientos. Intenta de nuevo.
                  </p>
                )}
              </>
            ) : (
              !loading && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-10 text-center">
                  <span className="text-base font-bold text-heading">
                    {historyNoMatchTitle(searched)}
                  </span>
                  <span className="max-w-[460px] text-sm text-muted">
                    Prueba con otro nombre, folio o número de recibo, o quita el filtro.
                  </span>
                  <button
                    type="button"
                    className={buttonClass('secondary', 'mt-2')}
                    onClick={() => {
                      setText('');
                      setParams(new URLSearchParams());
                    }}
                  >
                    Ver todo el historial
                  </button>
                </div>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}

function HistoryRow({ eventId, entry }: { eventId: string; entry: HistoryEntry }) {
  const titleId = useId();
  const stepsId = useId();
  const [open, setOpen] = useState(false);
  const pill = kindPills[entry.kind];
  const folio = entry.registration.folio;
  return (
    <article
      aria-labelledby={titleId}
      tabIndex={-1}
      className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 p-4 text-sm break-words focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus @xl:grid-cols-[56px_36px_minmax(0,1fr)] @xl:px-6 @xl:py-5"
    >
      <span className="hidden pt-1.5 font-mono font-medium text-heading @xl:block">
        {entry.time}
      </span>
      <span
        aria-hidden="true"
        className={`flex size-9 items-center justify-center rounded-full ${kindIconClass[entry.kind]}`}
      >
        <svg {...svg} width="18" height="18" strokeWidth="1.75">
          {kindIcons[entry.kind]}
        </svg>
      </span>
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={titleId} className="text-base font-bold text-heading">
              {entry.title}
            </h3>
            {pill && (
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs leading-4 font-semibold whitespace-nowrap ${pill.className}`}
              >
                {pill.label}
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted">
            <Link
              to={generatePath(routes.adminEventRegistration, {
                eventId,
                registrationId: entry.registration.id,
              })}
              aria-label={`${entry.registration.participantName}, ${folio ?? 'Sin folio'}. Ver inscripción`}
              className="font-semibold text-link underline underline-offset-3 hover:text-link-hover focus-visible:outline-2 focus-visible:outline-focus"
            >
              {entry.registration.participantName}
            </Link>
            <span aria-hidden="true">·</span>
            <span className={folio ? 'font-mono text-heading' : ''}>{folio ?? 'Sin folio'}</span>
            <span aria-hidden="true">·</span>
            <span>por {entry.actor}</span>
            <span className="font-mono @xl:hidden">· {entry.time}</span>
          </p>
        </div>

        {entry.summary && <p className="text-fg">{entry.summary}</p>}

        {entry.diff.length > 0 && (
          <dl className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-inner px-3.5 py-3">
            {entry.diff.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted">{row.label}</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {row.before === null ? (
                    <span className="font-bold text-heading">{row.after}</span>
                  ) : (
                    <>
                      <span className={`text-muted line-through ${row.mono ? 'font-mono' : ''}`}>
                        <span className="sr-only">Antes: </span>
                        {row.before}
                      </span>
                      <svg
                        {...svg}
                        width="16"
                        height="16"
                        strokeWidth="1.75"
                        className="text-muted"
                      >
                        <path d="M4 10h12M11 5l5 5-5 5" />
                      </svg>
                      <span className={`font-bold text-heading ${row.mono ? 'font-mono' : ''}`}>
                        <span className="sr-only">Después: </span>
                        {row.after}
                      </span>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {entry.competitions && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-inner px-3.5 py-3">
            {entry.competitions.passName && (
              <span className="text-muted">{entry.competitions.passName}</span>
            )}
            <CompetitionChips label="Agregó" names={entry.competitions.added} added />
            <CompetitionChips label="Quitó" names={entry.competitions.removed} />
          </div>
        )}

        {entry.reason && (
          <p className="flex gap-2">
            <span className="shrink-0 text-muted">Motivo</span>
            <span className="font-semibold text-heading">“{entry.reason}”</span>
          </p>
        )}

        {entry.steps.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={stepsId}
              onClick={() => setOpen((value) => !value)}
              className="-ml-2.5 flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2.5 font-semibold text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-focus"
            >
              <svg
                {...svg}
                width="16"
                height="16"
                strokeWidth="1.75"
                className={open ? '' : '-rotate-90'}
              >
                <path d="M6 8l4 4 4-4" />
              </svg>
              {open ? 'Ocultar' : 'Ver'} {entry.steps.length} operaciones
            </button>
            {open && (
              <ol id={stepsId} className="flex flex-col gap-2 border-l-2 border-line pl-3">
                {entry.steps.map((step) => (
                  <li key={step.id} className="flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-mono text-muted">{step.time}</span>
                    <span className="font-semibold text-heading">{step.label}</span>
                    {step.detail && <span className="text-muted">{step.detail}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function CompetitionChips({
  label,
  names,
  added = false,
}: {
  label: string;
  names: string[];
  added?: boolean;
}) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="min-w-18 font-semibold text-heading">{label}</span>
      <ul className="contents">
        {names.map((name) => (
          <li
            key={name}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs leading-4 font-semibold ${
              added
                ? 'border-success-fg bg-success text-success-fg'
                : 'border-line bg-chip text-muted line-through'
            }`}
          >
            <svg {...svg} width="12" height="12" strokeWidth="2.5">
              <path d={added ? 'M10 4v12M4 10h12' : 'M4 10h12'} />
            </svg>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// An event without any movement yet: what the history will show, and where registering starts.
function EmptyEvent({ eventId }: { eventId: string }) {
  return (
    <section
      aria-labelledby="history-empty-title"
      className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-chip text-heading"
      >
        {clockIcon(28)}
      </span>
      <h2 id="history-empty-title" className="mt-1 text-xl font-bold text-heading">
        Todavía no hay movimientos
      </h2>
      <p className="max-w-[480px] text-[15px] leading-[22px] text-muted">
        Aquí verás cada inscripción, pago, cortesía y corrección del evento: cuándo pasó, quién la
        hizo y el motivo.
      </p>
      <Link
        to={generatePath(routes.adminEventRegistrations, { eventId })}
        className={buttonClass('secondary', 'mt-2 inline-flex min-h-12 items-center px-[18px]')}
      >
        Ir a Inscripciones
      </Link>
    </section>
  );
}
