import { formatMxn } from '@/entities/event-catalog';
import type { PaymentStatus } from '@/entities/public-event';
import type { CheckoutFailure } from '@/features/public-purchase';
import { Notice } from '@/shared/ui';
import { continueButtonClass } from '@/widgets/public-layout';
import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router';
import { stepPath } from './purchase-steps';

// The result screens of the payment return page (#178, design screens 6, 7, 7b and 7c). They show
// only what the payment status endpoint answered: a first name and a masked email (D1), and the
// folio only when the registration is confirmed.

export const secondaryButtonClass =
  'inline-flex min-h-12 items-center justify-center rounded-xl border-[1.5px] border-heading px-7 text-base font-bold text-heading outline-none hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type HeadingProps = { headingRef: Ref<HTMLHeadingElement>; children: ReactNode };

// `tabIndex={-1}` lets the page move focus here when the result changes.
function Heading({ headingRef, children }: HeadingProps) {
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="text-[28px] leading-tight font-extrabold text-heading outline-none"
    >
      {children}
    </h1>
  );
}

const iconPaths = {
  check: <path d="M5 12l5 5L20 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  cross: <path d="M6 6l12 12M18 6L6 18" />,
};

const badgeTones = {
  success: 'bg-success text-success-fg',
  warning: 'bg-warning text-warning-fg',
  danger: 'bg-danger text-danger-fg',
};

type BadgeProps = { tone: keyof typeof badgeTones; icon: keyof typeof iconPaths; label: string };

function Badge({ tone, icon, label }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm font-bold ${badgeTones[tone]}`}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {iconPaths[icon]}
      </svg>
      {label}
    </span>
  );
}

function HomeLink({ slug, className = '' }: { slug: string; className?: string }) {
  return (
    <Link to={stepPath(slug, 'home')} className={`${secondaryButtonClass} ${className}`}>
      Volver al inicio
    </Link>
  );
}

const emailTarget = (maskedEmail: string | null | undefined) =>
  maskedEmail ? <strong className="text-heading">{maskedEmail}</strong> : 'tu correo';

type ViewProps = { headingRef: Ref<HTMLHeadingElement>; slug: string };

// Screen 6. The spinner is hidden under reduced motion.
export function ConfirmingView({
  headingRef,
  maskedEmail,
}: Omit<ViewProps, 'slug'> & { maskedEmail: string | null | undefined }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div
        aria-hidden="true"
        className="size-16 rounded-full border-[6px] border-line border-t-primary motion-safe:animate-spin motion-reduce:hidden"
      />
      <Heading headingRef={headingRef}>Estamos confirmando tu pago</Heading>
      <p className="max-w-sm text-base leading-relaxed text-muted">
        Mercado Pago nos está avisando el resultado. Suele tardar unos segundos; no cierres esta
        página.
      </p>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        Si cierras la página, no pasa nada: te enviaremos el resultado a {emailTarget(maskedEmail)}.
      </p>
    </div>
  );
}

// Screen 7. Only reached when the API answered `confirmed`.
export function ConfirmedView({ headingRef, slug, status }: ViewProps & { status: PaymentStatus }) {
  return (
    <>
      <Badge tone="success" icon="check" label="Pago aprobado" />
      <Heading headingRef={headingRef}>
        {status.firstName ? `¡Listo, ${status.firstName}!` : '¡Listo!'} Tu inscripción está
        confirmada
      </Heading>
      <section
        aria-label="Tu folio"
        className="flex flex-col gap-1.5 rounded-2xl bg-header p-5 text-header-fg"
      >
        <p className="font-mono text-xs tracking-[0.1em] text-header-muted uppercase">Tu folio</p>
        <p className="font-mono text-[40px] leading-none font-medium tracking-[0.04em] break-all">
          {status.folio}
        </p>
        <p className="text-sm leading-relaxed text-header-muted">
          En la entrada te buscamos por este folio, tu nombre o tu correo.
        </p>
      </section>
      <section
        aria-labelledby="payment-passes"
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <h2 id="payment-passes" className="text-base font-extrabold text-heading">
          Tus pases
        </h2>
        <ul className="flex flex-col gap-3">
          {status.passes.map((pass, index) => (
            <li key={`${pass.name}-${index}`} className="flex flex-col">
              <span className="font-semibold text-heading">{pass.name}</span>
              {pass.competitions.length > 0 ? (
                <span className="text-sm text-muted">
                  Competencias: {pass.competitions.join(', ')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="flex items-baseline justify-between gap-3 border-t border-line pt-3 text-fg">
          <span>Pagado</span>
          <span className="font-mono">{formatMxn(status.totalCents)} MXN</span>
        </p>
      </section>
      <p className="text-sm leading-relaxed text-muted">
        {status.maskedEmail ? (
          <>Enviamos esta confirmación a {emailTarget(status.maskedEmail)}. </>
        ) : null}
        Los workshops se anunciarán más adelante.
      </p>
      <HomeLink slug={slug} className="mt-auto w-full" />
    </>
  );
}

const stepNumberClass =
  'flex size-8 flex-none items-center justify-center rounded-full bg-header font-mono text-[15px] text-header-fg';

// Screen 7b: the payment is in process, either an OXXO/SPEI voucher waiting for the money or a
// card payment Mercado Pago is still reviewing, so the copy covers both.
export function PendingView({ headingRef, slug, status }: ViewProps & { status: PaymentStatus }) {
  return (
    <>
      <Badge tone="warning" icon="clock" label="Pago pendiente" />
      <Heading headingRef={headingRef}>Tu pago está en proceso</Heading>
      <p className="text-base leading-relaxed text-muted">
        Tu inscripción se confirmará cuando Mercado Pago apruebe el pago.
      </p>
      <ol className="flex flex-col gap-3.5">
        <li className="flex items-start gap-3.5">
          <span aria-hidden="true" className={stepNumberClass}>
            1
          </span>
          <span className="pt-1 leading-relaxed text-fg">
            Si elegiste efectivo o transferencia, paga con la referencia que te dio Mercado Pago;
            también te llegó a tu correo. Si pagaste con tarjeta, Mercado Pago la está revisando.
          </span>
        </li>
        <li className="flex items-start gap-3.5">
          <span aria-hidden="true" className={stepNumberClass}>
            2
          </span>
          <span className="pt-1 leading-relaxed text-fg">
            Cuando se apruebe, te enviaremos tu confirmación y tu folio a{' '}
            {emailTarget(status.maskedEmail)}.
          </span>
        </li>
      </ol>
      <p
        role="note"
        className="rounded-xl border border-line bg-surface px-4 py-3.5 text-sm leading-relaxed text-muted"
      >
        Mientras tanto tu inscripción queda apartada como{' '}
        <strong className="text-heading">pendiente de pago</strong>. Si la referencia vence sin
        pagar, puedes volver a comprar.
      </p>
      <HomeLink slug={slug} className="mt-auto w-full" />
    </>
  );
}

type RejectedViewProps = ViewProps & {
  retrying: boolean;
  failure: CheckoutFailure | null;
  onRetry: () => void;
};

// Screen 7c. "Intentar de nuevo" asks for a new checkout for the same pending registration (D5).
// The design's "Escríbenos a …" line is left out until the organizer's email is known (D6).
export function RejectedView({ headingRef, slug, retrying, failure, onRetry }: RejectedViewProps) {
  const canRetry = !failure || failure.retry;
  return (
    <>
      <Badge tone="danger" icon="cross" label="Pago no aprobado" />
      <Heading headingRef={headingRef}>No se pudo completar tu pago</Heading>
      <p className="text-base leading-relaxed text-muted">
        Tu banco o Mercado Pago no aprobó el pago, así que no se hizo ningún cargo. Tus pases y tus
        datos siguen guardados.
      </p>
      <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm leading-relaxed text-fg">
        <p className="text-[15px] font-bold text-heading">Puedes intentar:</p>
        <ul className="list-disc pl-5">
          <li>Revisar los datos de tu tarjeta o que tenga saldo.</li>
          <li>Pagar con otra tarjeta o con otro medio de pago.</li>
        </ul>
      </div>
      {failure ? (
        <Notice tone="danger">
          <p>{failure.message}</p>
        </Notice>
      ) : null}
      {canRetry ? (
        <button
          type="button"
          disabled={retrying}
          onClick={onRetry}
          className={`${continueButtonClass} mt-auto w-full`}
        >
          {retrying ? 'Te estamos llevando a Mercado Pago…' : 'Intentar de nuevo'}
        </button>
      ) : (
        // Home is a full page load, so the catalog (and the sales state that closed) is read again.
        <a href={stepPath(slug, 'home')} className={`${secondaryButtonClass} mt-auto w-full`}>
          Volver al inicio
        </a>
      )}
    </>
  );
}

// Polling stopped without a final answer: the payment may still be processing.
export function TakingLongerView({
  headingRef,
  slug,
  maskedEmail,
  onCheckAgain,
}: ViewProps & { maskedEmail: string | null | undefined; onCheckAgain: () => void }) {
  return (
    <>
      <Badge tone="warning" icon="clock" label="Sin respuesta todavía" />
      <Heading headingRef={headingRef}>Tu pago está tardando más de lo normal</Heading>
      <p className="text-base leading-relaxed text-muted">
        Mercado Pago todavía no nos confirma el resultado. Tu pago puede seguir procesándose, así
        que no vuelvas a pagar por ahora.
      </p>
      <p className="text-sm leading-relaxed text-muted">
        En cuanto tengamos el resultado te lo enviaremos a {emailTarget(maskedEmail)}. También
        puedes revisar de nuevo en un momento.
      </p>
      <div className="mt-auto flex flex-col gap-2.5">
        <button type="button" onClick={onCheckAgain} className={`${continueButtonClass} w-full`}>
          Revisar de nuevo
        </button>
        <HomeLink slug={slug} className="w-full" />
      </div>
    </>
  );
}

// A voided registration or an unknown one: nothing about it is shown.
export function UnavailableView({ headingRef, slug }: ViewProps) {
  return (
    <>
      <Heading headingRef={headingRef}>No podemos mostrar este pago</Heading>
      <p className="text-base leading-relaxed text-muted">
        No encontramos un pago que podamos mostrar con este enlace. Si pagaste, revisa tu correo:
        ahí te enviaremos el resultado. Si tienes dudas, comunícate con la organización.
      </p>
      <HomeLink slug={slug} className="mt-auto w-full" />
    </>
  );
}
