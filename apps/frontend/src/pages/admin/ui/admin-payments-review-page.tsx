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
import {
  formatReceivedAt,
  reasonCopy,
  reasonSummary,
  registrationStatusLabel,
} from './payments-review-model';
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
  const titleId = useId();

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
          <h1 id={titleId} className="text-3xl font-extrabold tracking-tight text-heading">
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
            <>
              <ReasonGuide payments={state.payments} />
              <PaymentTable payments={state.payments} titleId={titleId} />
            </>
          ))}
      </div>
    </main>
  );
}

// Each action is written once per reason present, so the table stays one line per payment.
function ReasonGuide({ payments }: { payments: FlaggedPayment[] }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`${styles.card} space-y-3`}>
      <h2 id={titleId} className="text-lg font-bold text-heading">
        Qué hacer en cada caso
      </h2>
      <ul className="space-y-3 text-sm">
        {reasonSummary(payments).map(({ reason, count }) => {
          const copy = reasonCopy[reason];
          return (
            <li key={reason} className="space-y-1">
              <p className="font-bold text-heading">
                {copy.title} ({count})
              </p>
              <p className="text-muted">{copy.detail}</p>
              <p className="font-semibold text-warning-fg">{copy.action}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const headerCell = 'px-3 py-2.5 font-bold first:pl-5 last:pr-5';
const cell = 'px-3 py-3 align-top first:pl-5 last:pr-5';

function PaymentTable({ payments, titleId }: { payments: FlaggedPayment[]; titleId: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table aria-labelledby={titleId} className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs tracking-[0.06em] text-muted uppercase">
            <th scope="col" className={headerCell}>
              Recibido
            </th>
            <th scope="col" className={headerCell}>
              Caso
            </th>
            <th scope="col" className={headerCell}>
              Persona
            </th>
            <th scope="col" className={headerCell}>
              Inscripción
            </th>
            <th scope="col" className={`${headerCell} text-right`}>
              Monto
            </th>
            <th scope="col" className={headerCell}>
              Pago en Mercado Pago
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.providerPaymentId} className="border-b border-row last:border-b-0">
              <td className={`${cell} whitespace-nowrap text-muted`}>
                {formatReceivedAt(payment.receivedAt)}
              </td>
              <th scope="row" className={`${cell} text-left font-semibold text-heading`}>
                {reasonCopy[payment.reason].title}
              </th>
              <td className={cell}>
                <p className="font-medium break-words">{payment.registration.participantName}</p>
                <p className="text-muted">{payment.registration.folio ?? 'Sin folio'}</p>
              </td>
              <td className={cell}>{registrationStatusLabel(payment.registration.status)}</td>
              <td className={`${cell} text-right font-mono font-medium whitespace-nowrap`}>
                {formatMxn(payment.amountCents)}
              </td>
              <td className={`${cell} font-mono break-all`}>{payment.providerPaymentId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
