import { apiUrl } from '@/shared/api';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { routes } from '@/shared/config';

type Registration = {
  participant: { id: string; fullName: string; email: string | null; stageName: string | null };
  registration: {
    id: string;
    eventId: string;
    folio: string | null;
    status: string;
    checkedInAt: string | null;
  };
  activities: { id: string; name: string; kind: string; checkedInAt: string | null }[];
};
type SearchState =
  | { status: 'idle' | 'loading' | 'empty' | 'denied' | 'error' }
  | { status: 'ready'; results: Registration[]; total: number };
type Notice = { kind: 'success' | 'duplicate' | 'error'; text: string };

const eligible = new Set(['workshop', 'battle', 'competition']);
const button =
  'min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50';
// Admission is the one action an operator must not miss: larger and full width on phones.
const admitButton = `${button} min-h-14 w-full text-lg font-extrabold sm:w-auto sm:px-6`;
const chip = 'inline-flex rounded-full px-3 py-1 text-sm font-semibold';
const statusBox = 'rounded-lg border p-4';
const noticeStyles: Record<Notice['kind'], string> = {
  success: 'border-success-fg bg-success text-success-fg',
  duplicate: 'border-warning-fg bg-warning text-warning-fg',
  error: 'border-danger-fg bg-danger text-danger-fg',
};

function validRow(value: unknown, eventId: string): value is Registration {
  if (!value || typeof value !== 'object') return false;
  const row = value as Registration;
  return (
    !!row.participant &&
    typeof row.participant.fullName === 'string' &&
    !!row.registration &&
    typeof row.registration.id === 'string' &&
    row.registration.eventId === eventId &&
    typeof row.registration.status === 'string' &&
    (row.registration.checkedInAt === null || typeof row.registration.checkedInAt === 'string') &&
    Array.isArray(row.activities) &&
    row.activities.every(
      (activity) =>
        typeof activity.id === 'string' &&
        typeof activity.name === 'string' &&
        typeof activity.kind === 'string' &&
        (activity.checkedInAt === null || typeof activity.checkedInAt === 'string'),
    )
  );
}

export function AdminCheckInPage() {
  const { eventId } = useParams<'eventId'>();
  return <EventCheckIn key={eventId} eventId={eventId} />;
}

function EventCheckIn({ eventId }: { eventId: string | undefined }) {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    // Cleanup must abort the latest request, not the one active when the effect ran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      controller.current?.abort();
      sequence.current++;
    };
  }, [eventId]);

  const selected =
    searchState.status === 'ready'
      ? searchState.results.find((row) => row.registration.id === selectedId)
      : undefined;

  async function read(
    q: string,
    signal: AbortSignal,
  ): Promise<{ results: Registration[]; total: number }> {
    const response = await fetch(
      apiUrl(
        `/admin/events/${encodeURIComponent(eventId ?? '')}/participants?q=${encodeURIComponent(q)}&limit=20&offset=0`,
      ),
      {
        credentials: 'include',
        signal,
      },
    );
    if (response.status === 401 || response.status === 403) throw new Error('denied');
    if (!response.ok) throw new Error('read failed');
    const page: unknown = await response.json();
    if (
      !page ||
      typeof page !== 'object' ||
      !('results' in page) ||
      !('total' in page) ||
      !Array.isArray(page.results) ||
      typeof page.total !== 'number' ||
      !Number.isSafeInteger(page.total) ||
      !page.results.every((row: unknown) => validRow(row, eventId ?? ''))
    ) {
      throw new Error('invalid event projection');
    }
    return { results: page.results, total: page.total };
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2 || q.length > 200 || busy || !eventId) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const version = ++sequence.current;
    setSelectedId(null);
    setNotice(null);
    setSearched(q);
    setSearchState({ status: 'loading' });
    try {
      const page = await read(q, request.signal);
      if (request.signal.aborted || version !== sequence.current) return;
      setSearchState(page.results.length ? { status: 'ready', ...page } : { status: 'empty' });
    } catch (error) {
      if (!request.signal.aborted && version === sequence.current) {
        setSearchState({
          status: error instanceof Error && error.message === 'denied' ? 'denied' : 'error',
        });
      }
    }
  }

  async function admit(row: Registration, activity?: Registration['activities'][number]) {
    if (
      locked.current ||
      !eventId ||
      !searched ||
      searchState.status !== 'ready' ||
      row.registration.eventId !== eventId ||
      row.registration.status !== 'confirmed' ||
      (!activity && !!row.registration.checkedInAt) ||
      (activity &&
        (!row.registration.checkedInAt ||
          activity.checkedInAt ||
          !eligible.has(activity.kind) ||
          !row.activities.some((item) => item.id === activity.id)))
    )
      return;
    locked.current = true;
    setBusy(true);
    setNotice(null);
    const request = new AbortController();
    controller.current = request;
    const version = ++sequence.current;
    const base = `/admin/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(row.registration.id)}`;
    let outcome: 'success' | 'duplicate' | 'denied' | 'error' = 'error';
    try {
      const session = await fetch(apiUrl('/auth/session'), {
        credentials: 'include',
        signal: request.signal,
      });
      const csrf = session.headers.get('X-CSRF-Token');
      if (!session.ok || !csrf) throw new Error('session unavailable');
      const response = await fetch(
        apiUrl(
          `${base}${activity ? `/activities/${encodeURIComponent(activity.id)}` : ''}/check-in`,
        ),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrf },
          signal: request.signal,
        },
      );
      if (response.status === 409) outcome = 'duplicate';
      else if (response.status === 401 || response.status === 403) outcome = 'denied';
      else if (response.ok) {
        const fact: unknown = await response.json();
        if (
          !fact ||
          typeof fact !== 'object' ||
          !('registrationId' in fact) ||
          fact.registrationId !== row.registration.id ||
          !('eventId' in fact) ||
          fact.eventId !== eventId ||
          !('checkedInAt' in fact) ||
          !fact.checkedInAt ||
          (activity && (!('activityId' in fact) || fact.activityId !== activity.id))
        ) {
          throw new Error('invalid admission response');
        }
        outcome = 'success';
      }
      // Even a denial or a duplicate can race another operator. The protected projection is authoritative.
      const page = await read(searched, request.signal);
      if (request.signal.aborted || version !== sequence.current) return;
      const fresh = page.results.find((item) => item.registration.id === row.registration.id);
      setSearchState(page.results.length ? { status: 'ready', ...page } : { status: 'empty' });
      if (!fresh) {
        setSelectedId(null);
        setNotice({
          kind: 'error',
          text: 'No se pudo verificar el estado. Consulta al responsable antes de continuar.',
        });
        return;
      }
      const admitted = activity
        ? !!fresh.registration.checkedInAt &&
          !!fresh.activities.find((item) => item.id === activity.id)?.checkedInAt
        : !!fresh.registration.checkedInAt;
      if (outcome === 'success' && admitted) {
        setNotice({
          kind: 'success',
          text: activity ? `Entrada a ${activity.name} registrada` : 'Entrada al evento registrada',
        });
      } else if (outcome === 'duplicate' && admitted) {
        setNotice({ kind: 'duplicate', text: 'Ya registrada por otro operador' });
      } else if (outcome === 'denied') {
        setNotice({
          kind: 'error',
          text: 'Acceso denegado para registrar esta entrada. Consulta al responsable.',
        });
      } else {
        setNotice({
          kind: 'error',
          text: 'No se pudo registrar la entrada. Consulta al responsable antes de continuar.',
        });
      }
    } catch {
      if (!request.signal.aborted && version === sequence.current) {
        setSearchState({ status: 'error' });
        setNotice({
          kind: 'error',
          text: 'No se pudo verificar el estado. Consulta al responsable antes de continuar.',
        });
      }
    } finally {
      locked.current = false;
      if (!request.signal.aborted && version === sequence.current) setBusy(false);
    }
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-sm break-all text-muted">Administración · Evento {eventId}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-heading">
            Control de entrada
          </h1>
          <p className="mt-2 text-muted">
            Verifica la inscripción antes de registrar cada entrada.
          </p>
        </header>
        <form
          onSubmit={(event) => void search(event)}
          className="rounded-xl border border-line bg-surface p-4 sm:p-6"
        >
          <label htmlFor="registration-query" className="block font-semibold text-heading">
            Buscar inscripción
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="registration-query"
              value={query}
              disabled={busy}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedId(null);
                setNotice(null);
                controller.current?.abort();
                sequence.current++;
                setSearchState({ status: 'idle' });
              }}
              minLength={2}
              maxLength={200}
              required
              className="min-h-13 min-w-0 flex-1 rounded-lg border-2 border-input-line bg-input px-4 text-lg text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
              placeholder="Nombre, correo o folio"
            />
            <button
              className={`${button} min-h-13 sm:px-6`}
              type="submit"
              disabled={busy || searchState.status === 'loading'}
            >
              Buscar
            </button>
          </div>
        </form>
        {searchState.status === 'loading' && (
          <p role="status" className={`${statusBox} border-line bg-surface text-muted`}>
            Buscando inscripciones…
          </p>
        )}
        {searchState.status === 'empty' && (
          <p role="status" className={`${statusBox} border-line bg-surface text-muted`}>
            No se encontraron inscripciones.
          </p>
        )}
        {searchState.status === 'denied' && (
          <p role="alert" className={`${statusBox} ${noticeStyles.error}`}>
            Acceso denegado para este evento. Consulta al responsable.
          </p>
        )}
        {searchState.status === 'error' && (
          <p role="alert" className={`${statusBox} ${noticeStyles.error}`}>
            No se pudo verificar la inscripción o el estado. Consulta al responsable antes de
            continuar.
          </p>
        )}
        {searchState.status === 'ready' && (
          <section aria-label="Resultados" className="space-y-3">
            <h2 className="text-xl font-bold text-heading">Resultados ({searchState.total})</h2>
            {searchState.results.map((row) => (
              <button
                key={row.registration.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelectedId(row.registration.id);
                  setNotice(null);
                }}
                className={`flex min-h-14 w-full flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-xl border bg-surface p-4 text-left hover:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 ${
                  row.registration.id === selectedId
                    ? 'border-focus ring-2 ring-focus'
                    : 'border-line'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-lg leading-tight font-bold text-heading">
                    {row.participant.fullName}
                  </span>
                  <span className="block text-sm break-words text-muted">
                    {row.participant.stageName ?? row.participant.email ?? 'Sin alias'}
                  </span>
                </span>
                <span className="rounded bg-chip px-2 py-1 font-mono text-sm text-fg">
                  {row.registration.folio ?? 'Sin folio'}
                </span>
              </button>
            ))}
          </section>
        )}
        {selected && (
          <section
            aria-label="Inscripción seleccionada"
            className="space-y-5 rounded-xl border border-line bg-surface p-4 sm:p-6"
          >
            <h2 className="text-2xl leading-tight font-extrabold text-heading">
              {selected.participant.fullName}
            </h2>
            <p
              className={`${chip} ${
                selected.registration.status === 'confirmed'
                  ? 'bg-success text-success-fg'
                  : 'bg-danger text-danger-fg'
              }`}
            >
              {selected.registration.status === 'confirmed'
                ? 'Inscripción confirmada'
                : 'Inscripción no confirmada · No registrar entrada'}
            </p>
            <div className="space-y-3 border-t border-line pt-4">
              <h3 className="font-bold text-heading">Entrada al evento</h3>
              <p
                className={`${chip} ${
                  selected.registration.checkedInAt
                    ? 'bg-success text-success-fg'
                    : 'bg-chip text-fg'
                }`}
              >
                {selected.registration.checkedInAt
                  ? 'Evento: entrada registrada'
                  : 'Evento: entrada pendiente'}
              </p>
              {selected.registration.status === 'confirmed' &&
                !selected.registration.checkedInAt && (
                  <div>
                    <button
                      type="button"
                      className={admitButton}
                      disabled={busy}
                      onClick={() => void admit(selected)}
                    >
                      {busy ? 'Registrando…' : 'Registrar entrada al evento'}
                    </button>
                  </div>
                )}
            </div>
            <div className="space-y-3 border-t border-line pt-4">
              <h3 className="font-bold text-heading">Actividades inscritas</h3>
              {selected.activities.filter((activity) => eligible.has(activity.kind)).length ===
                0 && <p className="text-muted">Sin actividades elegibles.</p>}
              {selected.activities
                .filter((activity) => eligible.has(activity.kind))
                .map((activity) => (
                  <div
                    key={activity.id}
                    className="space-y-3 rounded-lg border border-line bg-surface-inner p-4"
                  >
                    <h4 className="font-bold text-heading">{activity.name}</h4>
                    <p
                      className={`${chip} ${
                        activity.checkedInAt ? 'bg-success text-success-fg' : 'bg-chip text-fg'
                      }`}
                    >
                      {activity.checkedInAt
                        ? 'Actividad: entrada registrada'
                        : 'Actividad pendiente'}
                    </p>
                    {selected.registration.status === 'confirmed' &&
                      !!selected.registration.checkedInAt &&
                      !activity.checkedInAt && (
                        <button
                          type="button"
                          className={admitButton}
                          disabled={busy}
                          onClick={() => void admit(selected, activity)}
                        >
                          {busy ? 'Registrando…' : `Registrar ${activity.name}`}
                        </button>
                      )}
                  </div>
                ))}
            </div>
          </section>
        )}
        {notice && (
          <p
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`${statusBox} font-semibold ${noticeStyles[notice.kind]}`}
          >
            {notice.text}
          </p>
        )}
        <p className="border-t border-line pt-5 text-sm text-muted">
          Si el estado no se puede verificar, no repitas la entrada. Consulta al responsable o
          vuelve a{' '}
          <Link
            className="font-semibold text-link underline hover:text-link-hover focus-visible:outline-2 focus-visible:outline-focus"
            to={routes.admin}
          >
            Inicio
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
