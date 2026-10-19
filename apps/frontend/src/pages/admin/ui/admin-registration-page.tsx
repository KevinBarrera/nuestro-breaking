import {
  adminRegistrationFailure,
  getRegistrationEntitlements,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import {
  formatMxn,
  listActivities,
  listPassTypes,
  type CatalogActivity,
  type CatalogPassType,
} from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { Breadcrumbs, Notice } from '@/shared/ui';
import { useEffect, useId, useState } from 'react';
import { generatePath, useLocation, useParams } from 'react-router';
import { passClassLabels, styles } from './catalog-copy';
import { readRegistrationContext, registrationStatusLabel } from './registration-model';
import { SaleCash } from './sale-cash';
import { registrationViewMode, selectionSummary } from './sale-cash-model';
import { SaleCompetitions } from './sale-competitions';
import { SalePassPicker } from './sale-pass-picker';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  // `passTypes` and `activities` are null when the event's catalog could not be read.
  | {
      status: 'ready';
      entitlements: RegistrationEntitlements;
      passTypes: CatalogPassType[] | null;
      activities: CatalogActivity[] | null;
    };

const loadMessages = {
  denied: 'Sin acceso: tu cuenta no puede consultar las inscripciones de este evento.',
  notFound: 'No encontramos esta inscripción en este evento.',
  error: 'No pudimos cargar la inscripción. Intenta de nuevo.',
};

export function AdminRegistrationPage() {
  const { eventId, registrationId } = useParams<'eventId' | 'registrationId'>();
  if (!eventId || !registrationId) return null;
  return (
    <RegistrationScreen
      key={`${eventId}/${registrationId}`}
      eventId={eventId}
      registrationId={registrationId}
    />
  );
}

// One registration (#105): what it holds and, while it is pending payment, the passes it can
// still get, the competitions of each held pass and the cash payment. Confirmed and voided
// registrations are read-only, the confirmed one led by its folio. The name and status come from the entitlements read, so a reload keeps them; the
// screen that linked here passes them along to show before that read answers.
function RegistrationScreen({
  eventId,
  registrationId,
}: {
  eventId: string;
  registrationId: string;
}) {
  const context = readRegistrationContext(useLocation().state);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  // The revision whose read last answered; behind `revision` while a reload is on its way.
  const [answered, setAnswered] = useState(0);
  const passesTitleId = useId();

  // A reload keeps the current data on screen until the new read answers.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getRegistrationEntitlements(eventId, registrationId, controller.signal),
      listPassTypes(eventId, controller.signal).catch(() => null),
      listActivities(eventId, controller.signal).catch(() => null),
    ])
      .then(([entitlements, passTypes, activities]) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', entitlements, passTypes, activities });
        setAnswered(revision);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAnswered(revision);
        const { kind } = adminRegistrationFailure(error);
        const message =
          kind === 'unauthorized' || kind === 'forbidden'
            ? loadMessages.denied
            : kind === 'not_found'
              ? loadMessages.notFound
              : loadMessages.error;
        setState({ status: 'failed', message });
      });
    return () => controller.abort();
  }, [eventId, registrationId, revision]);

  // Writes answer with the registration's current entitlements, which replace the shown ones.
  const updateEntitlements = (entitlements: RegistrationEntitlements) =>
    setState((previous) =>
      previous.status === 'ready' ? { ...previous, entitlements } : previous,
    );
  const reload = () => setRevision((value) => value + 1);
  const reloading = state.status === 'ready' && answered !== revision;
  const [paid, setPaid] = useState(false);

  const summary = state.status === 'ready' ? state.entitlements.registration : null;
  const participantName = summary?.participant.fullName ?? context?.participantName ?? null;
  const status = summary?.status ?? context?.status ?? null;
  const mode = summary ? registrationViewMode(summary.status) : null;

  return (
    <main aria-busy={reloading} className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <Breadcrumbs
          items={[
            {
              label: 'Inscripciones',
              to: generatePath(routes.adminEventRegistrations, { eventId }),
            },
            { label: participantName ?? 'Inscripción' },
          ]}
        />
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight break-words text-heading">
            {participantName ? `Inscripción de ${participantName}` : 'Inscripción'}
          </h1>
          {status && (
            <p className="inline-flex rounded bg-chip px-2 py-1 text-sm font-semibold text-fg">
              {registrationStatusLabel(status)}
            </p>
          )}
        </header>
        {state.status === 'loading' && <p role="status">Cargando inscripción…</p>}
        {/* Shown next to the current data, which stays until the new read answers. */}
        <p role="status" className="text-sm text-muted empty:hidden">
          {reloading ? 'Actualizando…' : ''}
        </p>
        {state.status === 'failed' && <Notice tone="danger">{state.message}</Notice>}
        {state.status === 'ready' && (
          <>
            {mode === 'confirmed' && (
              <ConfirmedNotice folio={state.entitlements.registration.folio} paid={paid} />
            )}
            {mode === 'voided' && (
              <Notice title="Inscripción anulada">
                Esta inscripción está anulada: no admite pases, competencias ni pagos.
              </Notice>
            )}
            <section aria-labelledby={passesTitleId} className={`${styles.card} space-y-3`}>
              <h2 id={passesTitleId} className="text-lg font-bold text-heading">
                Pases
              </h2>
              {state.entitlements.passes.length === 0 ? (
                <p className="text-muted">Aún no tiene pases.</p>
              ) : (
                <ul className="divide-y divide-row">
                  {state.entitlements.passes.map((pass) => (
                    <PassRow
                      key={pass.registrationPassId}
                      pass={pass}
                      // While selling, the competitions section shows them with their controls.
                      competitions={
                        mode === 'sale' ? null : selectionSummary(pass.selections, state.activities)
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
            {mode === 'sale' && (
              <>
                <SalePassPicker
                  eventId={eventId}
                  entitlements={state.entitlements}
                  passTypes={state.passTypes}
                  onAdded={updateEntitlements}
                  onReload={reload}
                />
                <SaleCompetitions
                  eventId={eventId}
                  entitlements={state.entitlements}
                  passTypes={state.passTypes}
                  activities={state.activities}
                  onSaved={updateEntitlements}
                  onReload={reload}
                />
                <SaleCash
                  eventId={eventId}
                  entitlements={state.entitlements}
                  onConfirmed={(entitlements) => {
                    updateEntitlements(entitlements);
                    setPaid(true);
                  }}
                  onReload={reload}
                />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// The folio is what the participant shows at check-in, so it leads the confirmed view. `paid` is
// true right after this screen recorded the payment.
function ConfirmedNotice({ folio, paid }: { folio: string | null; paid: boolean }) {
  return (
    <section
      aria-label="Folio"
      className="rounded-xl border border-success-fg bg-success p-5 text-success-fg"
    >
      {paid && (
        <p role="status" className="font-semibold">
          Pago registrado. La inscripción quedó confirmada.
        </p>
      )}
      <p className="text-sm font-semibold">Folio</p>
      <p className="font-mono text-3xl font-extrabold tracking-wider break-all">
        {folio ?? 'Sin folio'}
      </p>
      <p className="mt-1 text-sm">Inscripción confirmada: ya no admite cambios.</p>
    </section>
  );
}

function PassRow({ pass, competitions }: { pass: HeldPass; competitions: string | null }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
      <span className="min-w-0">
        <span className="block font-semibold break-words text-heading">{pass.name}</span>
        <span className="block text-sm text-muted">{passClassLabels[pass.passClass]}</span>
        {competitions && (
          <span className="block text-sm break-words text-fg">Competencias: {competitions}</span>
        )}
      </span>
      <span className="font-mono font-medium">{formatMxn(pass.priceCents)}</span>
    </li>
  );
}
