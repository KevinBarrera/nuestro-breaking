import {
  adminRegistrationFailure,
  searchRegistrations,
  type RegistrationSearchPage,
  type RegistrationSearchResult,
  type RegistrationStatus,
} from '@/entities/admin-registration';
import { routes } from '@/shared/config';
import { buttonClass, Notice } from '@/shared/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { generatePath, Link, useParams, useSearchParams } from 'react-router';
import { statusTone } from './payments-review-model';
import {
  listCountText,
  liveSearchQuery,
  noMatchTitle,
  readStatusFilter,
  registrationRow,
  registrationSearchLimit,
  searchPageNavigation,
  statusChips,
  type RegistrationContext,
} from './registration-model';
import { StatusPill } from './team-list';

type ListOutcome =
  { status: 'denied' | 'error' } | { status: 'ready'; page: RegistrationSearchPage };

const listDenied = 'Sin acceso: tu cuenta no puede consultar las inscripciones de este evento.';
const listError = 'No pudimos cargar las inscripciones. Intenta de nuevo.';

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

const plusIcon = (
  <svg {...svg} width="16" height="16" strokeWidth="2">
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export function AdminRegistrationsPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <RegistrationList key={eventId} eventId={eventId} />;
}

// Inscripciones (#105, #345): the event's roster, searched live and filtered by status. The search,
// the status and the page live in the URL (`?q=…&estado=…&offset=…`), so coming back from a
// registration shows the same list.
function RegistrationList({ eventId }: { eventId: string }) {
  const [params, setParams] = useSearchParams();
  const searched = params.get('q')?.trim() ?? '';
  const status = readStatusFilter(params.get('estado'));
  const offset = Math.max(0, Number.parseInt(params.get('offset') ?? '0', 10) || 0);
  const [text, setText] = useState(searched);
  // Back and forward change the URL query; the field follows it unless it already says the same.
  const [shownSearch, setShownSearch] = useState(searched);
  if (shownSearch !== searched) {
    setShownSearch(searched);
    if (liveSearchQuery(text) !== searched) setText(searched);
  }
  // Counts "Reintentar" presses, so the same list is read again after an error.
  const [attempt, setAttempt] = useState(0);
  // Each outcome is tagged with its request, so a stale one is never shown for a newer list.
  const [outcome, setOutcome] = useState<{ key: string; result: ListOutcome } | null>(null);
  // The last list read, kept on screen while the next one loads.
  const [lastPage, setLastPage] = useState<RegistrationSearchPage | null>(null);
  const requestKey = `${attempt}:${offset}:${status ?? ''}:${searched}`;
  const current = outcome?.key === requestKey ? outcome.result : null;

  useEffect(() => {
    const controller = new AbortController();
    const settle = (result: ListOutcome) => {
      if (controller.signal.aborted) return;
      setOutcome({ key: requestKey, result });
      if (result.status === 'ready') setLastPage(result.page);
    };
    searchRegistrations(
      eventId,
      {
        q: searched || undefined,
        status: status ?? undefined,
        limit: registrationSearchLimit,
        offset,
      },
      controller.signal,
    )
      .then((page) => settle({ status: 'ready', page }))
      .catch((error: unknown) => {
        const { kind } = adminRegistrationFailure(error);
        settle({ status: kind === 'unauthorized' || kind === 'forbidden' ? 'denied' : 'error' });
      });
    return () => controller.abort();
  }, [eventId, requestKey, searched, status, offset]);

  const go = (change: { q?: string; status?: RegistrationStatus | null; offset?: number }) => {
    const next = new URLSearchParams();
    const q = change.q ?? searched;
    const nextStatus = change.status === undefined ? status : change.status;
    if (q) next.set('q', q);
    if (nextStatus) next.set('estado', nextStatus);
    if (change.offset) next.set('offset', String(change.offset));
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

  const page = current?.status === 'ready' ? current.page : lastPage;
  const loading = current === null;
  const emptyEvent = page !== null && !searched && page.counts.all === 0;

  return (
    <main aria-busy={loading} className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="@container mx-auto max-w-[1080px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[640px] space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-heading">Inscripciones</h1>
            <p className="text-muted">
              Busca una inscripción para revisarla o corregirla. Para inscribir a alguien en la
              entrada, usa Nueva inscripción.
            </p>
          </div>
          <Link
            to={generatePath(routes.adminEventRegistrationNew, { eventId })}
            className={buttonClass('primary', 'inline-flex min-h-12 items-center gap-2 px-5')}
          >
            {plusIcon}
            Nueva inscripción
          </Link>
        </header>

        {current?.status === 'denied' && <Notice tone="danger">{listDenied}</Notice>}
        {current?.status === 'error' && (
          <Notice tone="danger">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {listError}
              <button
                type="button"
                className="min-h-11 font-semibold underline underline-offset-3"
                onClick={() => setAttempt((count) => count + 1)}
              >
                Reintentar
              </button>
            </span>
          </Notice>
        )}
        {!page && loading && (
          <p role="status" className="text-muted">
            Cargando inscripciones…
          </p>
        )}

        {emptyEvent && <EmptyEvent eventId={eventId} />}

        {page && !emptyEvent && current?.status !== 'denied' && (
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
              <span className="sr-only">Buscar inscripción</span>
              <input
                type="search"
                autoComplete="off"
                maxLength={200}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Nombre, correo, AKA, folio o número de recibo"
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

            <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
              {statusChips(page.counts, status).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  aria-pressed={chip.selected}
                  className={chipClass}
                  onClick={() => go({ status: chip.status })}
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

            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <p
                role="status"
                className="border-b border-line bg-surface-inner px-5 py-3 text-sm font-semibold text-heading"
              >
                {listCountText(page.total, !!searched)}
              </p>
              {page.results.length > 0 ? (
                <ul aria-label="Inscripciones">
                  {page.results.map((result) => (
                    <li key={result.registration.id} className="border-line not-first:border-t">
                      <RegistrationRowLink eventId={eventId} result={result} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <span className="text-base font-bold text-heading">{noMatchTitle(searched)}</span>
                  <span className="max-w-[460px] text-sm text-muted">
                    Revisa cómo se escribe o busca por folio, correo o número de recibo. Si no está
                    inscrita, regístrala con Nueva inscripción.
                  </span>
                  <Link
                    to={generatePath(routes.adminEventRegistrationNew, { eventId })}
                    className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-link underline underline-offset-3"
                  >
                    Inscribir a una persona nueva
                  </Link>
                </div>
              )}
            </div>
            <Pagination page={page} onGo={(nextOffset) => go({ offset: nextOffset })} />
          </>
        )}
      </div>
    </main>
  );
}

function RegistrationRowLink({
  eventId,
  result,
}: {
  eventId: string;
  result: RegistrationSearchResult;
}) {
  const row = registrationRow(result);
  const context: RegistrationContext = {
    participantName: result.participant.fullName,
    status: result.registration.status,
  };
  return (
    <Link
      to={generatePath(routes.adminEventRegistration, {
        eventId,
        registrationId: result.registration.id,
      })}
      state={context}
      aria-label={row.accessibleName}
      className="grid min-h-18 grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-x-4 px-4 py-3 text-sm text-fg hover:bg-surface-inner focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus @3xl:grid-cols-[minmax(0,1.3fr)_96px_minmax(0,1.6fr)_150px_20px] @3xl:px-5"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] leading-[22px] font-bold text-heading">
          {row.name}
        </span>
        <span className="truncate text-muted">{row.aka}</span>
      </span>
      <span className={`hidden @3xl:block ${row.folio ? 'font-mono' : 'text-muted'}`}>
        {row.folio ?? 'Sin folio'}
      </span>
      <span className="hidden min-w-0 flex-col @3xl:flex">
        <span className="truncate font-semibold text-heading">{row.passes}</span>
        <span className="truncate text-muted">{row.competitions}</span>
      </span>
      <span className="flex">
        <StatusPill tone={statusTone(result.registration.status)}>{row.status}</StatusPill>
      </span>
      <svg {...svg} width="18" height="18" strokeWidth="1.75" className="text-muted">
        <path d="M8 5l5 5-5 5" />
      </svg>
    </Link>
  );
}

// An event without registrations: how to register someone now and how online sales start.
function EmptyEvent({ eventId }: { eventId: string }) {
  const link = (to: string, children: ReactNode) => (
    <Link to={to} className="text-link underline underline-offset-3">
      {children}
    </Link>
  );
  const steps: { title: string; text: ReactNode }[] = [
    {
      title: 'Crea las actividades',
      text: (
        <>
          {link(generatePath(routes.adminEventActivities, { eventId }), 'Catálogo › Actividades')}:
          competencias, talleres y sociales.
        </>
      ),
    },
    {
      title: 'Arma los pases con su precio',
      text: (
        <>
          {link(generatePath(routes.adminEventPasses, { eventId }), 'Catálogo › Pases')}: qué
          incluye cada uno y cuánto cuesta.
        </>
      ),
    },
    {
      title: 'Abre la venta en línea',
      text: (
        <>
          {link(generatePath(routes.adminEventOverview, { eventId }), 'Resumen del evento')} › Venta
          en línea.
        </>
      ),
    },
  ];
  return (
    <section
      aria-labelledby="registrations-empty-title"
      className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-chip text-heading"
      >
        <svg {...svg} width="28" height="28" strokeWidth="1.5">
          <circle cx="8" cy="7" r="3" />
          <path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <path d="M15.5 6v5M13 8.5h5" />
        </svg>
      </span>
      <h2 id="registrations-empty-title" className="mt-1 text-xl font-bold text-heading">
        Aún no hay inscripciones
      </h2>
      <p className="max-w-[480px] text-[15px] leading-[22px] text-muted">
        Aparecen aquí cuando alguien compra un pase en línea o cuando inscribes a alguien en mesa
        con pago en efectivo.
      </p>
      <Link
        to={generatePath(routes.adminEventRegistrationNew, { eventId })}
        className={buttonClass('primary', 'mt-2 inline-flex min-h-12 items-center gap-2 px-5')}
      >
        {plusIcon}
        Inscribir a alguien en mesa
      </Link>
      <div className="mt-6 flex w-full max-w-[560px] flex-col gap-4 border-t border-line pt-6 text-left">
        <h3 className="text-[15px] leading-[22px] font-bold text-heading">
          Para recibir inscripciones en línea
        </h3>
        <ol className="flex flex-col gap-4 text-sm">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3"
            >
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center rounded-full bg-chip-selected font-mono text-xs font-medium text-chip-selected-fg"
              >
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="leading-6 font-bold text-heading">{step.title}</span>
                <span className="text-muted">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pagination({
  page,
  onGo,
}: {
  page: RegistrationSearchPage;
  onGo: (offset: number) => void;
}) {
  const { range, previousOffset, nextOffset } = searchPageNavigation({
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    shown: page.results.length,
  });
  if (!range) return null;
  return (
    <nav aria-label="Páginas de resultados" className="flex flex-wrap items-center gap-3">
      {previousOffset !== null && (
        <button
          type="button"
          className={buttonClass('secondary')}
          onClick={() => onGo(previousOffset)}
        >
          Anteriores
        </button>
      )}
      <p className="text-sm text-muted">{range}</p>
      {nextOffset !== null && (
        <button type="button" className={buttonClass('secondary')} onClick={() => onGo(nextOffset)}>
          Siguientes
        </button>
      )}
    </nav>
  );
}
