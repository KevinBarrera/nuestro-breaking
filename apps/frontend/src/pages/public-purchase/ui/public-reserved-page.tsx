import { formatMxn } from '@/entities/event-catalog';
import { readReserved } from '@/features/public-purchase';
import { Notice } from '@/shared/ui';
import { continueButtonClass, PublicFrame } from '@/widgets/public-layout';
import { useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { readStoredReserved, sessionDraftStorage } from './draft-storage';
import { stepPath } from './purchase-steps';

// TEMPORARY (D1 of #176): until Mercado Pago exists, "Pagar" only reserves the registration and
// lands here. #177 replaces this route and screen with the Mercado Pago redirect.
// It reads the reservation from router state, else from the `sessionStorage` copy (a refresh);
// with neither (a direct visit) it goes to the event home. It sits outside the purchase layout,
// so it never loads the catalog.
export function PublicReservedPage() {
  const { slug = '' } = useParams<'slug'>();
  const state: unknown = useLocation().state;
  const [reserved] = useState(
    () => readReserved(state) ?? readStoredReserved(sessionDraftStorage(), slug),
  );
  const home = stepPath(slug, 'home');
  if (!reserved) return <Navigate replace to={home} />;

  return (
    <PublicFrame>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-5 py-10 text-center">
        <span
          aria-hidden="true"
          className="inline-flex size-16 items-center justify-center rounded-full bg-chip-selected text-chip-selected-fg"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 className="text-[26px] leading-tight font-extrabold text-heading">
          Reservamos tu inscripción
        </h1>
        <p className="break-words text-fg">Te escribiremos a {reserved.email}.</p>
        <section
          aria-label="Tu inscripción"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-left"
        >
          <ul className="flex flex-col gap-2">
            {reserved.passes.map((pass, index) => (
              <li key={`${pass.name}-${index}`} className="flex justify-between gap-3">
                <span className="min-w-0 font-semibold text-heading">{pass.name}</span>
                <span className="shrink-0 text-fg">{formatMxn(pass.priceCents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between gap-3 border-t border-line pt-3 font-extrabold text-heading">
            <span>Total</span>
            <span>{formatMxn(reserved.totalCents)} MXN</span>
          </p>
        </section>
        <div className="w-full text-left">
          <Notice>
            El pago en línea estará disponible pronto. Tu lugar queda apartado mientras tanto; no
            necesitas hacer nada más por ahora.
          </Notice>
        </div>
        <Link to={home} className={`${continueButtonClass} w-full sm:w-auto`}>
          Volver al inicio
        </Link>
      </main>
    </PublicFrame>
  );
}
