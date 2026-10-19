import {
  adminRegistrationFailure,
  getRegistrationEntitlements,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn, listPassTypes, type CatalogPassType } from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { Breadcrumbs, Notice } from '@/shared/ui';
import { useEffect, useId, useState } from 'react';
import { generatePath, useLocation, useParams } from 'react-router';
import { passClassLabels, styles } from './catalog-copy';
import { readRegistrationContext, registrationStatusLabel } from './registration-model';
import { SalePassPicker } from './sale-pass-picker';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  // `passTypes` is null when the event's pass types could not be read.
  | {
      status: 'ready';
      entitlements: RegistrationEntitlements;
      passTypes: CatalogPassType[] | null;
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
// still get. The name and status come from the entitlements read, so a reload keeps them; the
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
  const passesTitleId = useId();

  // A reload keeps the current data on screen until the new read answers.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getRegistrationEntitlements(eventId, registrationId, controller.signal),
      listPassTypes(eventId, controller.signal).catch(() => null),
    ])
      .then(([entitlements, passTypes]) => {
        if (!controller.signal.aborted) setState({ status: 'ready', entitlements, passTypes });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
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

  const summary = state.status === 'ready' ? state.entitlements.registration : null;
  const participantName = summary?.participant.fullName ?? context?.participantName ?? null;
  const status = summary?.status ?? context?.status ?? null;

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
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
        {state.status === 'failed' && <Notice tone="danger">{state.message}</Notice>}
        {state.status === 'ready' && (
          <>
            <section aria-labelledby={passesTitleId} className={`${styles.card} space-y-3`}>
              <h2 id={passesTitleId} className="text-lg font-bold text-heading">
                Pases
              </h2>
              {state.entitlements.passes.length === 0 ? (
                <p className="text-muted">Aún no tiene pases.</p>
              ) : (
                <ul className="divide-y divide-row">
                  {state.entitlements.passes.map((pass) => (
                    <PassRow key={pass.registrationPassId} pass={pass} />
                  ))}
                </ul>
              )}
            </section>
            {status === 'pending_payment' && (
              <>
                <SalePassPicker
                  eventId={eventId}
                  entitlements={state.entitlements}
                  passTypes={state.passTypes}
                  onAdded={(entitlements) =>
                    setState((previous) =>
                      previous.status === 'ready' ? { ...previous, entitlements } : previous,
                    )
                  }
                  onReload={() => setRevision((value) => value + 1)}
                />
                <p className="rounded-lg bg-surface-inner p-4 text-sm text-fg">
                  Siguiente paso: cobrar en efectivo. Esa parte llega en la próxima versión del
                  panel.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function PassRow({ pass }: { pass: HeldPass }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
      <span className="min-w-0">
        <span className="block font-semibold break-words text-heading">{pass.name}</span>
        <span className="block text-sm text-muted">{passClassLabels[pass.passClass]}</span>
      </span>
      <span className="font-mono font-medium">{formatMxn(pass.priceCents)}</span>
    </li>
  );
}
