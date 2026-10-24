import { attendeeListsFailure, fetchAttendeeLists } from '@/entities/attendee-list';
import { apiUrl } from '@/shared/api';
import { routes } from '@/shared/config';
import { buttonClass } from '@/shared/ui';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  admissionNotice,
  readAdmission,
  type AdmissionOutcome,
  type CheckInNotice,
} from './admin-check-in-model';
import { CheckInDialog } from './check-in-dialog';
import { CheckInList, CheckInProgress, type CheckInFilters } from './check-in-list';
import { buildRoster, type RosterCheck, type RosterPerson } from './check-in-roster-model';

type LoadState =
  { status: 'loading' | 'denied' | 'error' } | { status: 'ready'; roster: RosterPerson[] };

const statusBox = 'rounded-xl border p-4';
const errorBox = `${statusBox} border-danger-fg bg-danger text-danger-fg`;
const verifyFailure = 'No se pudo verificar el estado. Consulta al responsable antes de continuar.';
const linkClass =
  'font-semibold text-link underline underline-offset-3 hover:text-link-hover focus-visible:outline-2 focus-visible:outline-focus';

const eventPath = (route: string, eventId: string) => route.replace(':eventId', eventId);

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-px shrink-0"
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5M10 6.5v.01" />
    </svg>
  );
}

// The screen never lists or acts on another event's registrations.
async function readRoster(eventId: string, signal: AbortSignal): Promise<RosterPerson[]> {
  const lists = await fetchAttendeeLists(eventId, signal);
  if (lists.event.id !== eventId) throw new Error('foreign event snapshot');
  return buildRoster(lists);
}

export function AdminCheckInPage() {
  const { eventId } = useParams<'eventId'>();
  return <EventCheckIn key={eventId} eventId={eventId ?? ''} />;
}

function EventCheckIn({ eventId }: { eventId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [filters, setFilters] = useState<CheckInFilters>({
    query: '',
    status: 'pending',
    activity: 'all',
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<CheckInNotice | null>(null);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    readRoster(eventId, request.signal)
      .then((roster) => setLoad({ status: 'ready', roster }))
      .catch((error: unknown) => {
        if (request.signal.aborted) return;
        setLoad({ status: attendeeListsFailure(error) === 'denied' ? 'denied' : 'error' });
      });
    // Cleanup must abort the latest request, not the one active when the effect ran.
    return () => controller.current?.abort();
  }, [eventId]);

  const roster = load.status === 'ready' ? load.roster : [];
  const open = roster.find((person) => person.registrationId === openId);

  function close() {
    if (locked.current) return;
    setOpenId(null);
    setNotice(null);
  }

  function next() {
    refocus.current = true;
    close();
    setFilters((current) => ({ ...current, query: '' }));
  }

  // The dialog hands focus back to the row that opened it; the next search wants the field.
  // Its restore runs in an animation frame after unmount, so this runs one frame later.
  useEffect(() => {
    if (openId || !refocus.current) return;
    refocus.current = false;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [openId]);

  async function admit(person: RosterPerson, check: RosterCheck) {
    if (locked.current || !person.confirmed || check.checkedInAt) return;
    locked.current = true;
    setBusy(true);
    setNotice(null);
    const request = new AbortController();
    controller.current = request;
    const activityId = check.activityId ?? undefined;
    const base = `/admin/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(person.registrationId)}`;
    let outcome: AdmissionOutcome = { kind: 'error' };
    try {
      const session = await fetch(apiUrl('/auth/session'), {
        credentials: 'include',
        signal: request.signal,
      });
      const csrf = session.headers.get('X-CSRF-Token');
      if (!session.ok || !csrf) throw new Error('session unavailable');
      const response = await fetch(
        apiUrl(
          `${base}${activityId ? `/activities/${encodeURIComponent(activityId)}` : ''}/check-in`,
        ),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrf },
          signal: request.signal,
        },
      );
      if (response.status === 400) outcome = { kind: 'rejected' };
      else if (response.status === 401 || response.status === 403) outcome = { kind: 'denied' };
      else if (response.ok) {
        const admission = readAdmission(await response.json(), {
          eventId,
          registrationId: person.registrationId,
          activityId,
        });
        if (!admission) throw new Error('invalid admission response');
        outcome = {
          kind: admission.alreadyCheckedIn ? 'repeat' : 'recorded',
          checkedInAt: admission.checkedInAt,
        };
      }
      // Even a denial or a rejection can race another operator. The snapshot is authoritative.
      const fresh = await readRoster(eventId, request.signal);
      if (request.signal.aborted) return;
      setLoad({ status: 'ready', roster: fresh });
      const refreshed = fresh.find((item) => item.registrationId === person.registrationId);
      const target = refreshed?.checks.find((item) => item.activityId === check.activityId);
      if (!refreshed || !target) {
        setNotice({ kind: 'error', text: verifyFailure });
        return;
      }
      setNotice(admissionNotice(outcome, check, target.checkedInAt));
    } catch {
      if (!request.signal.aborted) setNotice({ kind: 'error', text: verifyFailure });
    } finally {
      locked.current = false;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  const hasData = load.status === 'ready' && roster.length > 0;

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="mx-auto max-w-[1080px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-heading">Check-in</h1>
            <p className="text-muted">Busca a la persona, abre su ficha y registra su entrada.</p>
          </div>
          {hasData && <CheckInProgress roster={roster} activity={filters.activity} />}
        </header>

        {load.status === 'loading' && (
          <p role="status" className={`${statusBox} border-line bg-surface text-muted`}>
            Cargando inscripciones…
          </p>
        )}
        {load.status === 'denied' && (
          <p role="alert" className={errorBox}>
            Acceso denegado para este evento. Consulta al responsable.
          </p>
        )}
        {load.status === 'error' && (
          <p role="alert" className={errorBox}>
            No se pudo verificar la inscripción o el estado. Consulta al responsable antes de
            continuar.
          </p>
        )}

        {load.status === 'ready' && !roster.length && (
          <section
            aria-labelledby="check-in-empty"
            className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center"
          >
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full bg-chip text-heading"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 17V3.5h9V17" />
                <path d="M13 5.5h3V17" />
                <path d="M2.5 17h15" />
                <path d="M10 10.5v.01" />
              </svg>
            </span>
            <h2 id="check-in-empty" className="mt-1 text-xl font-bold text-heading">
              Aún no hay a quién registrar
            </h2>
            <p className="max-w-[480px] text-[15px] leading-[22px] text-muted">
              Cuando alguien compre un pase en línea o lo inscribas en mesa, aparecerá aquí para
              registrar su entrada.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Link
                to={eventPath(routes.adminEventRegistrationNew, eventId)}
                className={buttonClass(
                  'primary',
                  'flex min-h-12 items-center gap-2 px-5 text-[15px] font-bold',
                )}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M10 4v12M4 10h12" />
                </svg>
                Nueva inscripción
              </Link>
              <Link
                to={eventPath(routes.adminEventOverview, eventId)}
                className={buttonClass('secondary', 'flex min-h-12 items-center bg-surface')}
              >
                Revisar la venta en línea
              </Link>
            </div>
            <p className="mt-4 flex max-w-[480px] items-start gap-2 text-left text-sm text-muted">
              <InfoIcon />
              <span>
                Antes de abrir puertas, imprime las{' '}
                <Link to={eventPath(routes.adminEventLists, eventId)} className={linkClass}>
                  listas de respaldo
                </Link>{' '}
                por si el sistema falla.
              </span>
            </p>
          </section>
        )}

        {hasData && (
          <>
            <CheckInList
              roster={roster}
              filters={filters}
              onFiltersChange={setFilters}
              onOpen={(person) => {
                setNotice(null);
                setOpenId(person.registrationId);
              }}
              searchRef={searchRef}
            />
            <p className="flex items-start gap-2.5 text-sm text-muted">
              <InfoIcon />
              <span>
                Si no puedes verificar a alguien, no registres la entrada: consulta al responsable o
                revisa el{' '}
                <Link to={eventPath(routes.adminEventOverview, eventId)} className={linkClass}>
                  resumen del evento
                </Link>
                .
              </span>
            </p>
          </>
        )}

        {open && (
          <CheckInDialog
            person={open}
            paymentsReviewHref={eventPath(routes.adminEventPaymentsReview, eventId)}
            busy={busy}
            notice={notice}
            onAdmit={(check) => void admit(open, check)}
            onClose={close}
            onNext={next}
          />
        )}
      </div>
    </main>
  );
}
