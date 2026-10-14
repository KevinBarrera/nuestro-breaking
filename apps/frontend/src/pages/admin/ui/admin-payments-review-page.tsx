import { formatMxn } from '@/entities/event-catalog';
import {
  flaggedPaymentsFailure,
  getFlaggedPayments,
  type FlaggedPayment,
  type FlaggedPaymentsFailure,
} from '@/entities/flagged-payments';
import { useEffect, useId, useState } from 'react';
import { useParams } from 'react-router';
import { styles } from './catalog-copy';
import { formatReceivedAt, reasonCopy, registrationStatusLabel } from './payments-review-model';
import { useEventName } from './use-event-name';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: FlaggedPaymentsFailure }
  | { status: 'ready'; payments: FlaggedPayment[] };

const failureMessages: Record<FlaggedPaymentsFailure, string> = {
  denied: 'No tienes acceso a los pagos de este evento.',
  'not-found': 'No encontramos este evento.',
  error: 'No se pudieron cargar los pagos. Intenta de nuevo en unos minutos.',
};

export function AdminPaymentsReviewPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <PaymentsReview key={eventId} eventId={eventId} />;
}

// Read only (#230): refunds happen in Mercado Pago and corrections belong to #104/#105.
function PaymentsReview({ eventId }: { eventId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const { name: eventName } = useEventName(eventId);
  const listId = useId();

  useEffect(() => {
    const controller = new AbortController();
    getFlaggedPayments(eventId, controller.signal)
      .then(({ payments }) => {
        if (!controller.signal.aborted) setState({ status: 'ready', payments });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: 'failed', failure: flaggedPaymentsFailure(error) });
      });
    return () => controller.abort();
  }, [eventId]);

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 id={listId} className="text-3xl font-extrabold tracking-tight text-heading">
            Pagos por revisar
          </h1>
          {eventName && <p className="text-muted">{eventName}</p>}
          <p className="max-w-3xl text-sm text-muted">
            Pagos de Mercado Pago que el sistema guardó pero no pudo aplicar solo. Los reembolsos se
            hacen en Mercado Pago; esta pantalla no cambia nada.
          </p>
        </header>
        {state.status === 'loading' && <p role="status">Cargando pagos…</p>}
        {state.status === 'failed' && (
          <p
            role="alert"
            className="rounded-lg border border-danger-fg bg-danger px-4 py-3 text-sm text-danger-fg"
          >
            {failureMessages[state.failure]}
          </p>
        )}
        {state.status === 'ready' &&
          (state.payments.length === 0 ? (
            <p className={`${styles.card} text-sm text-muted`}>No hay pagos por revisar.</p>
          ) : (
            <ul aria-labelledby={listId} className="space-y-4">
              {state.payments.map((payment) => (
                <PaymentCard key={payment.providerPaymentId} payment={payment} />
              ))}
            </ul>
          ))}
      </div>
    </main>
  );
}

function PaymentCard({ payment }: { payment: FlaggedPayment }) {
  const titleId = useId();
  const copy = reasonCopy[payment.reason];
  const { registration } = payment;
  const facts: [string, string][] = [
    ['Persona', registration.participantName],
    ['Folio', registration.folio ?? 'Sin folio'],
    ['Inscripción', registrationStatusLabel(registration.status)],
    ['Monto', formatMxn(payment.amountCents)],
    ['Pago en Mercado Pago', payment.providerPaymentId],
    ['Recibido', formatReceivedAt(payment.receivedAt)],
  ];
  return (
    <li aria-labelledby={titleId} className={`${styles.card} space-y-3`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        {copy.title}
      </h2>
      <p className="text-sm text-muted">{copy.detail}</p>
      <p className="rounded-lg border border-warning-fg bg-warning px-4 py-3 text-sm font-semibold text-warning-fg">
        {copy.action}
      </p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
