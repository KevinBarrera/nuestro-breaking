import {
  adminRegistrationFailure,
  getRegistrationEntitlements,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import { formatMxn } from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { Breadcrumbs, Notice } from '@/shared/ui';
import { useEffect, useId, useState } from 'react';
import { generatePath, useLocation, useParams } from 'react-router';
import { passClassLabels, styles } from './catalog-copy';
import { readRegistrationContext, registrationStatusLabel } from './registration-model';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; entitlements: RegistrationEntitlements };

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

// One registration (#105). For now it shows what it holds; pass selection and the cash payment
// (#105 task 4) build on this screen. The name and status come from the screen that linked
// here, since the entitlements read carries neither.
function RegistrationScreen({
  eventId,
  registrationId,
}: {
  eventId: string;
  registrationId: string;
}) {
  const context = readRegistrationContext(useLocation().state);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const passesTitleId = useId();

  useEffect(() => {
    const controller = new AbortController();
    getRegistrationEntitlements(eventId, registrationId, controller.signal)
      .then((entitlements) => {
        if (!controller.signal.aborted) setState({ status: 'ready', entitlements });
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
  }, [eventId, registrationId]);

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <Breadcrumbs
          items={[
            {
              label: 'Inscripciones',
              to: generatePath(routes.adminEventRegistrations, { eventId }),
            },
            { label: context?.participantName ?? 'Inscripción' },
          ]}
        />
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight break-words text-heading">
            {context ? `Inscripción de ${context.participantName}` : 'Inscripción'}
          </h1>
          {context && (
            <p className="inline-flex rounded bg-chip px-2 py-1 text-sm font-semibold text-fg">
              {registrationStatusLabel(context.status)}
            </p>
          )}
        </header>
        {state.status === 'loading' && <p role="status">Cargando inscripción…</p>}
        {state.status === 'failed' && <Notice tone="danger">{state.message}</Notice>}
        {state.status === 'ready' && (
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
            {context?.status === 'pending_payment' && (
              <p className="rounded-lg bg-surface-inner p-4 text-sm text-fg">
                Siguiente paso: elegir los pases y cobrar en efectivo. Esa parte llega en la próxima
                versión del panel.
              </p>
            )}
          </section>
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
