import { formatMxn } from '@/entities/event-catalog';
import {
  flaggedPaymentsFailure,
  getFlaggedPayments,
  type FlaggedPayment,
  type FlaggedPaymentReason,
  type FlaggedPaymentsFailure,
} from '@/entities/flagged-payments';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { CopyIcon } from './copy-text';
import {
  caseChips,
  formatReceivedAt,
  paymentCountText,
  reasonCopy,
  registrationStatusLabel,
  reviewCases,
  startsCollapsed,
  statusTone,
  totalAmountCents,
  visibleCases,
  type CaseFilter,
  type ReviewCase,
} from './payments-review-model';
import { StatusPill } from './team-list';
import { useCopyText } from './use-copy-text';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: FlaggedPaymentsFailure }
  | { status: 'ready'; payments: FlaggedPayment[] };

const failureMessages: Record<FlaggedPaymentsFailure, string> = {
  denied: 'No tienes acceso a los pagos de este evento.',
  'not-found': 'No encontramos este evento.',
  error: 'No se pudieron cargar los pagos. Intenta de nuevo en unos minutos.',
};

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const checkPath = <path d="M4.5 10.5l3.5 3.5 7.5-8" />;

const caseIcons: Record<FlaggedPaymentReason, ReactNode> = {
  approved_after_expiry_duplicate: (
    <>
      <rect x="2.5" y="5" width="11" height="8" rx="1.5" />
      <path d="M6.5 15.5h9a2 2 0 0 0 2-2V8" />
    </>
  ),
  approved_after_expiry_event_ended: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" />
    </>
  ),
  approved_after_confirmation: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5v7M6.5 10h7" />
    </>
  ),
  approved_after_void: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M5 5l10 10" />
    </>
  ),
};

const chipClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input-line bg-surface px-3.5 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-chip-selected aria-pressed:bg-chip-selected aria-pressed:text-chip-selected-fg aria-pressed:hover:bg-chip-selected';

const rowGrid =
  'grid grid-cols-2 gap-x-4 gap-y-2.5 p-4 @3xl:grid-cols-[minmax(0,1.6fr)_160px_150px_110px_170px] @3xl:items-center @3xl:gap-y-0 @3xl:px-6';
const columnHeader = 'text-xs leading-4 font-semibold text-muted';
const cellLabel = 'mb-0.5 block text-xs leading-4 font-semibold text-muted @3xl:hidden';

export function AdminPaymentsReviewPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <PaymentsReview key={eventId} eventId={eventId} />;
}

// Read only (#230, #340): refunds happen in Mercado Pago and corrections belong to #104/#105.
function PaymentsReview({ eventId }: { eventId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

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

  const payments = state.status === 'ready' ? state.payments : [];

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="@container mx-auto max-w-[1080px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="max-w-[640px] flex-[1_1_420px] space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-heading">
              Pagos por revisar
            </h1>
            <p className="text-muted">
              Pagos de Mercado Pago que el sistema guardó pero no pudo aplicar solo. Cada caso dice
              qué hacer.
            </p>
          </div>
          {payments.length > 0 && <Totals payments={payments} />}
        </header>

        <p className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 text-sm text-fg">
          <svg {...svg} width="18" height="18" strokeWidth="1.75" className="mt-px shrink-0">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 9v4.5M10 6.5v.01" />
          </svg>
          <span>
            <strong className="text-heading">Esta pantalla solo informa.</strong> Los reembolsos se
            hacen directamente en Mercado Pago; aquí no se cambia nada. Busca cada pago por su
            número de Mercado Pago.
          </span>
        </p>

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
          (payments.length === 0 ? <AllClear /> : <CaseList payments={payments} />)}
      </div>
    </main>
  );
}

function Totals({ payments }: { payments: FlaggedPayment[] }) {
  return (
    <dl className="flex gap-6 rounded-xl border border-line bg-surface px-5 py-3">
      <div className="flex flex-col">
        <dt className="text-xs leading-4 font-semibold text-muted">Pagos</dt>
        <dd className="font-mono text-xl font-medium text-heading">{payments.length}</dd>
      </div>
      <div aria-hidden="true" className="w-px bg-line" />
      <div className="flex flex-col">
        <dt className="text-xs leading-4 font-semibold text-muted">Monto en total</dt>
        <dd className="font-mono text-xl font-medium text-heading">
          {formatMxn(totalAmountCents(payments))}
        </dd>
      </div>
    </dl>
  );
}

function AllClear() {
  return (
    <section
      aria-labelledby="payments-review-empty"
      className="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface px-8 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full border border-success-fg bg-success text-success-fg"
      >
        <svg {...svg} width="26" height="26" strokeWidth="2">
          {checkPath}
        </svg>
      </span>
      <div className="max-w-[520px] space-y-1.5">
        <h2 id="payments-review-empty" className="text-2xl font-extrabold text-heading">
          Todo en orden
        </h2>
        <p className="text-muted">
          No hay pagos por revisar. Si un pago de Mercado Pago no se puede aplicar solo, aparece
          aquí con lo que debes hacer.
        </p>
      </div>
    </section>
  );
}

function CaseList({ payments }: { payments: FlaggedPayment[] }) {
  const [filter, setFilter] = useState<CaseFilter>('all');
  // Cases the admin opened or closed; the rest follow the default for the list size.
  const [toggled, setToggled] = useState<Partial<Record<FlaggedPaymentReason, boolean>>>({});
  const { state: copyState, copy } = useCopyText();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const cases = reviewCases(payments);
  const shown = visibleCases(cases, filter);
  const closedByDefault = startsCollapsed(payments.length);
  const isOpen = (reason: FlaggedPaymentReason) => toggled[reason] ?? !closedByDefault;
  const anyClosed = shown.some(({ reason }) => !isOpen(reason));

  function toggleAll() {
    setToggled(Object.fromEntries(cases.map(({ reason }) => [reason, anyClosed])));
  }

  function copyPaymentId(id: string) {
    setCopiedId(id);
    void copy(id);
  }

  const copied = copyState === 'copied' ? copiedId : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrar por caso" className="flex flex-wrap gap-2">
          {caseChips(cases).map((chip) => {
            const selected = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={selected}
                className={chipClass}
                onClick={() => setFilter(chip.id)}
              >
                {selected && (
                  <svg {...svg} width="14" height="14" strokeWidth="2.25">
                    {checkPath}
                  </svg>
                )}
                {chip.label}
                <span className="font-mono text-[13px] font-medium">{chip.count}</span>
              </button>
            );
          })}
        </div>
        {shown.length > 1 && (
          <button
            type="button"
            onClick={toggleAll}
            className="min-h-11 px-1 text-sm font-semibold text-link underline underline-offset-3 hover:text-link-hover focus-visible:outline-2 focus-visible:outline-focus"
          >
            {anyClosed ? 'Abrir todos los casos' : 'Cerrar todos los casos'}
          </button>
        )}
      </div>

      {shown.map((reviewCase) => (
        <CaseCard
          key={reviewCase.reason}
          reviewCase={reviewCase}
          open={isOpen(reviewCase.reason)}
          onToggle={() =>
            setToggled({ ...toggled, [reviewCase.reason]: !isOpen(reviewCase.reason) })
          }
          copied={copied}
          onCopy={copyPaymentId}
        />
      ))}

      <p role="status" className={copyState === 'failed' ? 'text-sm text-danger-fg' : 'sr-only'}>
        {copied && `Número de pago ${copied} copiado.`}
        {copyState === 'failed' && 'No se pudo copiar. Selecciona el número y cópialo a mano.'}
      </p>
    </>
  );
}

function CaseCard({
  reviewCase: { reason, payments, amountCents },
  open,
  onToggle,
  copied,
  onCopy,
}: {
  reviewCase: ReviewCase<FlaggedPayment>;
  open: boolean;
  onToggle: () => void;
  copied: string | null;
  onCopy: (id: string) => void;
}) {
  const copy = reasonCopy[reason];
  const headingId = `case-${reason}`;
  const bodyId = `case-body-${reason}`;

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-line bg-surface"
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 px-6 py-5 @3xl:grid-cols-2 max-@3xl:p-4">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-chip-selected text-chip-selected-fg"
          >
            <svg {...svg} width="20" height="20" strokeWidth="1.75">
              {caseIcons[reason]}
            </svg>
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={headingId} className="text-lg font-bold text-heading">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={onToggle}
                className="-mt-[9px] -ml-2 flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg px-2 text-left hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span>{copy.title}</span>
                <span className="inline-flex items-center gap-2 font-mono text-[13px] leading-[18px] font-medium">
                  <span className="rounded-full border border-line bg-chip px-2">
                    {paymentCountText(payments.length)}
                  </span>
                  <span>{formatMxn(amountCents)}</span>
                </span>
                <svg
                  {...svg}
                  width="18"
                  height="18"
                  strokeWidth="1.75"
                  className={`shrink-0 text-muted transition-transform ${open ? '' : '-rotate-90'}`}
                >
                  <path d="M6 8l4 4 4-4" />
                </svg>
              </button>
            </h2>
            <p className="text-sm text-muted">{copy.detail}</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-inner px-4 py-3">
          <svg
            {...svg}
            width="18"
            height="18"
            strokeWidth="1.75"
            className="mt-px shrink-0 text-heading"
          >
            <path d="M4 10h10M10 5l5 5-5 5" />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs leading-4 font-semibold text-muted">Qué hacer</span>
            <span className="text-sm font-semibold text-heading">{copy.action}</span>
          </div>
        </div>
      </div>

      {open && (
        <div id={bodyId} role="table" aria-labelledby={headingId}>
          <div role="rowgroup" className="hidden @3xl:block">
            <div
              role="row"
              className={`${rowGrid} border-y border-line bg-surface-inner @3xl:min-h-10 @3xl:py-0`}
            >
              <span role="columnheader" className={columnHeader}>
                Persona
              </span>
              <span role="columnheader" className={columnHeader}>
                Inscripción
              </span>
              <span role="columnheader" className={columnHeader}>
                Recibido
              </span>
              <span role="columnheader" className={`${columnHeader} text-right`}>
                Monto
              </span>
              <span role="columnheader" className={columnHeader}>
                Pago en Mercado Pago
              </span>
            </div>
          </div>
          <div role="rowgroup" className="border-t border-line @3xl:border-t-0">
            {payments.map((payment) => (
              <PaymentRow
                key={payment.providerPaymentId}
                payment={payment}
                copied={copied === payment.providerPaymentId}
                onCopy={onCopy}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PaymentRow({
  payment: { providerPaymentId, receivedAt, amountCents, registration },
  copied,
  onCopy,
}: {
  payment: FlaggedPayment;
  copied: boolean;
  onCopy: (id: string) => void;
}) {
  return (
    <div role="row" className={`${rowGrid} border-line not-first:border-t @3xl:min-h-16 @3xl:py-3`}>
      <div role="cell" className="col-span-2 flex min-w-0 flex-col @3xl:col-span-1">
        <span className="text-[15px] leading-[22px] font-bold break-words text-heading">
          {registration.participantName}
        </span>
        <span className={`text-sm text-muted ${registration.folio ? 'font-mono' : ''}`}>
          {registration.folio ?? 'Sin folio'}
        </span>
      </div>
      <div role="cell">
        <span className={cellLabel}>Inscripción</span>
        <StatusPill tone={statusTone(registration.status)}>
          {registrationStatusLabel(registration.status)}
        </StatusPill>
      </div>
      <div role="cell">
        <span className={cellLabel}>Recibido</span>
        <span className="font-mono text-sm">{formatReceivedAt(receivedAt)}</span>
      </div>
      <div role="cell" className="@3xl:text-right">
        <span className={cellLabel}>Monto</span>
        <span className="font-mono text-sm font-medium">{formatMxn(amountCents)}</span>
      </div>
      <div role="cell">
        <span className={cellLabel}>Pago en Mercado Pago</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm break-all">{providerPaymentId}</span>
          <button
            type="button"
            aria-label={
              copied
                ? `Número de pago ${providerPaymentId} copiado`
                : `Copiar número de pago ${providerPaymentId}`
            }
            onClick={() => onCopy(providerPaymentId)}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-row hover:text-heading focus-visible:outline-2 focus-visible:outline-focus"
          >
            {copied ? (
              <svg {...svg} width="16" height="16" strokeWidth="2.25" className="text-success-fg">
                {checkPath}
              </svg>
            ) : (
              <CopyIcon />
            )}
          </button>
        </span>
      </div>
    </div>
  );
}
