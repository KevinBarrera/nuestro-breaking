import { paymentReturnRegistration } from '@/features/public-purchase';
import { continueButtonClass, PublicFrame } from '@/widgets/public-layout';
import { Link, useParams, useSearchParams } from 'react-router';
import { stepPath } from './purchase-steps';

// Mercado Pago sends the buyer here after every outcome (`back_urls`, #177 D8). Nothing on this
// URL confirms anything: `status=approved` and the other Mercado Pago params can be typed by
// anyone, so they are never read. Only the verified webhook confirms a payment and assigns the
// folio. This minimal screen just says the payment is being confirmed.
// The full result screens (polling the registration, confirmed with its folio, pending OXXO or
// SPEI, rejected with a retry) are #178. It sits outside the purchase layout, so it never loads
// the catalog.
export function PublicPaymentReturnPage() {
  const { slug = '' } = useParams<'slug'>();
  const [params] = useSearchParams();
  const registrationId = paymentReturnRegistration(params);

  return (
    <PublicFrame>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-5 py-10 text-center">
        <h1 className="text-[26px] leading-tight font-extrabold text-heading">
          Estamos confirmando tu pago
        </h1>
        <div role="status" className="flex flex-col gap-3 text-fg">
          {registrationId ? (
            <p>
              En cuanto Mercado Pago nos avise del pago, confirmaremos tu inscripción y te
              enviaremos tu folio por correo.
            </p>
          ) : (
            <p>
              Si hiciste un pago, en cuanto Mercado Pago nos avise confirmaremos tu inscripción y te
              enviaremos tu folio por correo.
            </p>
          )}
          <p className="text-sm text-muted">Esto puede tardar unos minutos.</p>
        </div>
        <Link to={stepPath(slug, 'home')} className={`${continueButtonClass} w-full sm:w-auto`}>
          Volver al inicio
        </Link>
      </main>
    </PublicFrame>
  );
}
