import {
  createCheckout,
  getPaymentStatus,
  PublicEventError,
  publicEventFailure,
} from '@/entities/public-event';
import {
  checkoutFailure,
  nextPollDelay,
  paymentPollStep,
  paymentPollView,
  paymentReturnRegistration,
  safeCheckoutUrl,
  startPaymentPoll,
  type CheckoutFailure,
  type PaymentView,
} from '@/features/public-purchase';
import { continueButtonClass, PublicFrame } from '@/widgets/public-layout';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  ConfirmedView,
  ConfirmingView,
  PendingView,
  RejectedView,
  TakingLongerView,
  UnavailableView,
} from './payment-result-views';
import { stepPath } from './purchase-steps';

const mainClass = 'mx-auto flex w-full max-w-xl flex-1 flex-col gap-[18px] px-5 py-7';

// Mercado Pago sends the buyer here after every outcome (`back_urls`, #177 D8). Nothing on this
// URL confirms anything: `status=approved` and the other Mercado Pago params can be typed by
// anyone, so they are never read. Only the verified webhook confirms a payment and assigns the
// folio; this page polls the payment status endpoint (#178) and shows only what it answers. It
// sits outside the purchase layout, so it never loads the catalog.
export function PublicPaymentReturnPage() {
  const { slug = '' } = useParams<'slug'>();
  const [params] = useSearchParams();
  const registrationId = paymentReturnRegistration(params);

  return (
    <PublicFrame>
      {registrationId ? (
        <PaymentResult key={registrationId} slug={slug} registrationId={registrationId} />
      ) : (
        <NoRegistration slug={slug} />
      )}
    </PublicFrame>
  );
}

// Short announcements for the live region; the views themselves carry the details.
const announcements: Record<PaymentView, string> = {
  confirming: 'Confirmando tu pago.',
  'taking-longer': 'Tu pago está tardando más de lo normal.',
  confirmed: 'Pago aprobado. Tu inscripción está confirmada.',
  pending: 'Pago pendiente.',
  rejected: 'Pago no aprobado.',
  unavailable: 'No podemos mostrar este pago.',
};

type PaymentResultProps = { slug: string; registrationId: string };

function PaymentResult({ slug, registrationId }: PaymentResultProps) {
  const [poll, setPoll] = useState(startPaymentPoll);
  const [retrying, setRetrying] = useState(false);
  const [retryFailure, setRetryFailure] = useState<CheckoutFailure | null>(null);
  // Synchronous guard: two clicks in one frame must not start two checkouts.
  const sending = useRef(false);
  const checkout = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const view = paymentPollView(poll);
  const shownView = useRef(view);

  // One request per poll state: the next one is scheduled only after the previous answer.
  useEffect(() => {
    const delay = nextPollDelay(poll);
    if (delay === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getPaymentStatus(slug, registrationId, controller.signal).then(
        (status) => setPoll((current) => paymentPollStep(current, { type: 'answer', status })),
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const failure = publicEventFailure(error);
          setPoll((current) => paymentPollStep(current, { type: 'failure', failure }));
        },
      );
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [poll, slug, registrationId]);

  // A new result moves focus to its heading, so screen readers start from the top of it.
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    headingRef.current?.focus();
  }, [view]);

  useEffect(() => () => checkout.current?.abort(), []);
  // "Back" from Mercado Pago can restore this page from the back/forward cache, still retrying.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      sending.current = false;
      setRetrying(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const retryCheckout = async () => {
    if (sending.current) return;
    sending.current = true;
    setRetrying(true);
    setRetryFailure(null);
    const controller = new AbortController();
    checkout.current = controller;
    try {
      const answer = await createCheckout(slug, registrationId, controller.signal);
      const url = safeCheckoutUrl(answer.checkoutUrl);
      if (!url) throw new PublicEventError({ kind: 'error' });
      // A full page load: Mercado Pago's hosted page is another site. Stays retrying meanwhile.
      window.location.assign(url);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRetryFailure(checkoutFailure(publicEventFailure(error)));
      sending.current = false;
      setRetrying(false);
    }
  };

  const viewProps = { headingRef, slug };
  return (
    <main className={mainClass}>
      <p role="status" className="sr-only">
        {announcements[view]}
      </p>
      {view === 'confirming' ? (
        <ConfirmingView headingRef={headingRef} maskedEmail={poll.status?.maskedEmail} />
      ) : null}
      {view === 'taking-longer' ? (
        <TakingLongerView
          {...viewProps}
          maskedEmail={poll.status?.maskedEmail}
          onCheckAgain={() => setPoll((current) => paymentPollStep(current, { type: 'retry' }))}
        />
      ) : null}
      {view === 'confirmed' && poll.status ? (
        <ConfirmedView {...viewProps} status={poll.status} />
      ) : null}
      {view === 'pending' && poll.status ? (
        <PendingView {...viewProps} status={poll.status} />
      ) : null}
      {view === 'rejected' ? (
        <RejectedView
          {...viewProps}
          retrying={retrying}
          failure={retryFailure}
          onRetry={() => void retryCheckout()}
        />
      ) : null}
      {view === 'unavailable' ? <UnavailableView {...viewProps} /> : null}
    </main>
  );
}

// Without a registration id there is nothing to ask; the message claims nothing.
function NoRegistration({ slug }: { slug: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-5 py-10 text-center">
      <h1 className="text-[26px] leading-tight font-extrabold text-heading">
        Estamos confirmando tu pago
      </h1>
      <div role="status" className="flex flex-col gap-3 text-fg">
        <p>
          Si hiciste un pago, en cuanto Mercado Pago nos avise confirmaremos tu inscripción y te
          enviaremos tu folio por correo.
        </p>
        <p className="text-sm text-muted">Esto puede tardar unos minutos.</p>
      </div>
      <Link to={stepPath(slug, 'home')} className={`${continueButtonClass} w-full sm:w-auto`}>
        Volver al inicio
      </Link>
    </main>
  );
}
