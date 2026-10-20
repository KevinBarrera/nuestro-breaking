import {
  adminRegistrationFailure,
  searchRegistrations,
  type RegistrationSearchPage,
  type RegistrationSearchResult,
} from '@/entities/admin-registration';
import { routes } from '@/shared/config';
import { buttonClass, Notice, TextField } from '@/shared/ui';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { generatePath, Link, useParams, useSearchParams } from 'react-router';
import { styles } from './catalog-copy';
import {
  activitySummary,
  registrationSearchLimit,
  registrationStatusLabel,
  resultsCount,
  searchPageNavigation,
  searchQueryHint,
  type RegistrationContext,
} from './registration-model';
import { useEventName } from './use-event-name';

type SearchOutcome =
  { status: 'denied' | 'error' } | { status: 'ready'; page: RegistrationSearchPage };

const searchDenied = 'Sin acceso: tu cuenta no puede consultar las inscripciones de este evento.';
const searchError = 'No pudimos buscar las inscripciones. Intenta de nuevo.';

export function AdminRegistrationsPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <RegistrationSearch key={eventId} eventId={eventId} />;
}

// Inscripciones (#105): the search lives in the URL (`?q=…&offset=…`), so coming back from a
// registration shows the same results. A query outside 2 to 200 characters never reaches the API.
function RegistrationSearch({ eventId }: { eventId: string }) {
  const [params, setParams] = useSearchParams();
  const searched = params.get('q') ?? '';
  const offset = Math.max(0, Number.parseInt(params.get('offset') ?? '0', 10) || 0);
  const [query, setQuery] = useState(searched);
  // Back and forward change the URL query; the field follows it.
  const [shownSearch, setShownSearch] = useState(searched);
  if (shownSearch !== searched) {
    setShownSearch(searched);
    setQuery(searched);
  }
  const [hint, setHint] = useState<string | null>(null);
  // Counts submits, so "Buscar" with the same text searches again (for example after an error).
  const [attempt, setAttempt] = useState(0);
  // Each outcome is tagged with its request, so a stale one is never shown for a newer search.
  const [outcome, setOutcome] = useState<{ key: string; result: SearchOutcome } | null>(null);
  const { name: eventName } = useEventName(eventId);
  const titleId = useId();
  const requestKey =
    searched && !searchQueryHint(searched) ? `${attempt}:${offset}:${searched}` : null;
  const state: { status: 'idle' | 'loading' } | SearchOutcome = !requestKey
    ? { status: 'idle' }
    : outcome?.key === requestKey
      ? outcome.result
      : { status: 'loading' };

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    const settle = (result: SearchOutcome) => {
      if (!controller.signal.aborted) setOutcome({ key: requestKey, result });
    };
    searchRegistrations(
      eventId,
      { q: searched, limit: registrationSearchLimit, offset },
      controller.signal,
    )
      .then((page) => settle({ status: 'ready', page }))
      .catch((error: unknown) => {
        const { kind } = adminRegistrationFailure(error);
        settle({ status: kind === 'unauthorized' || kind === 'forbidden' ? 'denied' : 'error' });
      });
    return () => controller.abort();
  }, [eventId, requestKey, searched, offset]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = searchQueryHint(query);
    setHint(found);
    if (found) return;
    setAttempt((count) => count + 1);
    setParams({ q: query.trim() });
  }

  const goTo = (nextOffset: number) =>
    setParams(nextOffset > 0 ? { q: searched, offset: String(nextOffset) } : { q: searched });

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-heading">Inscripciones</h1>
            {eventName && <p className="text-muted">{eventName}</p>}
          </div>
          <Link
            to={generatePath(routes.adminEventRegistrationNew, { eventId })}
            className={buttonClass('primary', 'inline-flex items-center justify-center')}
          >
            Nueva inscripción
          </Link>
        </header>
        <form
          role="search"
          noValidate
          onSubmit={submit}
          className={`${styles.card} flex flex-col gap-3`}
        >
          <TextField
            className="min-w-0"
            label="Buscar inscripción"
            hint="Nombre, correo, AKA, folio o número de recibo."
            name="q"
            type="search"
            autoComplete="off"
            maxLength={200}
            value={query}
            error={hint}
            onChange={(event) => {
              setQuery(event.target.value);
              setHint(null);
            }}
          />
          <button
            type="submit"
            className={buttonClass('primary', 'sm:self-start sm:px-6')}
            disabled={state.status === 'loading'}
          >
            Buscar
          </button>
        </form>
        {state.status === 'loading' && (
          <p role="status" className="text-muted">
            Buscando inscripciones…
          </p>
        )}
        {state.status === 'denied' && <Notice tone="danger">{searchDenied}</Notice>}
        {state.status === 'error' && <Notice tone="danger">{searchError}</Notice>}
        {state.status === 'ready' &&
          (state.page.total === 0 ? (
            <p role="status" className={`${styles.card} text-muted`}>
              Sin resultados para «{searched}».
            </p>
          ) : (
            <section aria-labelledby={titleId} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 id={titleId} className="text-xl font-bold text-heading">
                  Resultados
                </h2>
                <p role="status" className="text-muted">
                  {resultsCount(state.page.total)}
                </p>
              </div>
              <ul className="space-y-3">
                {state.page.results.map((row) => (
                  <li key={row.registration.id}>
                    <ResultCard eventId={eventId} row={row} />
                  </li>
                ))}
              </ul>
              <Pagination page={state.page} onGo={goTo} />
            </section>
          ))}
      </div>
    </main>
  );
}

function ResultCard({ eventId, row }: { eventId: string; row: RegistrationSearchResult }) {
  const context: RegistrationContext = {
    participantName: row.participant.fullName,
    status: row.registration.status,
  };
  return (
    <Link
      to={generatePath(routes.adminEventRegistration, {
        eventId,
        registrationId: row.registration.id,
      })}
      state={context}
      className="flex min-h-11 flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-surface p-4 hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="min-w-0 space-y-1">
        <span className="block text-lg leading-tight font-bold break-words text-heading">
          {row.participant.fullName}
        </span>
        {row.participant.stageName && (
          <span className="block text-sm break-words text-muted">
            AKA {row.participant.stageName}
          </span>
        )}
        <span className="block text-sm break-words text-fg">{activitySummary(row.activities)}</span>
        {/* A sale interrupted after the create left it pending: the card resumes it. */}
        {row.registration.status === 'pending_payment' && (
          <span className="block font-semibold text-link underline">Continuar venta</span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-chip px-2 py-1 font-mono text-sm text-fg">
          {row.registration.folio ?? 'Sin folio'}
        </span>
        <span className="rounded bg-chip px-2 py-1 text-sm font-semibold text-fg">
          {registrationStatusLabel(row.registration.status)}
        </span>
      </span>
    </Link>
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
