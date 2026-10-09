import { formatMxn } from '@/entities/event-catalog';
import { createRegistration, publicEventFailure } from '@/entities/public-event';
import {
  buildRegistrationRequest,
  localIsoDate,
  payFailure,
  purchaseTotals,
  reservedPurchase,
  reviewBuyer,
  reviewLines,
  validateBuyer,
  type PayFailure,
  type PayFix,
} from '@/features/public-purchase';
import { CheckboxField, Notice } from '@/shared/ui';
import { continueButtonClass, PublicFrame, StepBar, StepProgress } from '@/widgets/public-layout';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { clearStoredDraft, sessionDraftStorage, storeReserved } from './draft-storage';
import { usePurchase } from './purchase-context';
import {
  purchaseStepCount,
  reservedPath,
  stepNumber,
  stepPath,
  stepRedirect,
} from './purchase-steps';

const overlapNotice =
  'Algunas competencias o workshops pueden coincidir en horario. Puedes elegir libremente a cuáles asistir; intentaremos evitar cruces entre competencias, pero no podemos garantizarlos. Open Styles no coincidirá con competencias de pase completo, aunque podría coincidir parcialmente con workshops.';

// D5: the documents are placeholders until #180, and acceptance is not sent to the backend yet.
const documentLink = (label: string) => (
  <a
    href="#"
    className="font-semibold text-link underline underline-offset-2 hover:text-link-hover"
  >
    {label}
  </a>
);

const legalDocuments = [
  { id: 'rules', label: <>Leí y acepto el {documentLink('Reglamento oficial')}.</> },
  {
    id: 'privacy',
    label: <>Leí el {documentLink('Aviso de privacidad')} y acepto el uso de mis datos.</>,
  },
  { id: 'cancellation', label: <>Leí y acepto la {documentLink('Política de cancelación')}.</> },
] as const;

type LegalId = (typeof legalDocuments)[number]['id'];

const fixLabels: Record<PayFix, string> = {
  home: 'Volver al inicio',
  passes: 'Cambiar mis pases',
  competitions: 'Cambiar mis competencias',
  buyer: 'Corregir mis datos',
};

const linkClass =
  'inline-flex min-h-11 items-center font-semibold text-link underline underline-offset-2 hover:text-link-hover focus-visible:outline-2 focus-visible:outline-focus';

// Screen 5 (Revisa y paga). "Pagar" creates the pending registration (D1): while it is sent the
// button is disabled and says so; on success the draft is cleared and the temporary reserved
// screen shows the response. Failures keep the draft and show a notice here, with a link to the
// screen that fixes them (server field errors too: the buyer data passed the same validation on
// datos, so a list with "Corregir mis datos" is clearer than sending the buyer back unasked).
export function PublicReviewPage() {
  const { slug, catalog, selection, buyer } = usePurchase();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState<Record<LegalId, boolean>>({
    rules: false,
    privacy: false,
    cancellation: false,
  });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PayFailure | null>(null);
  // Synchronous guard: two clicks in one frame must not send two requests.
  const sending = useRef(false);
  const request = useRef<AbortController | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const hintId = useId();

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (failure) failureRef.current?.scrollIntoView({ block: 'nearest' });
  }, [failure]);

  const buyerReady = Object.keys(validateBuyer(buyer, localIsoDate(new Date()))).length === 0;
  const redirect = stepRedirect('review', catalog.passes, selection, buyerReady);
  if (redirect) return <Navigate replace to={stepPath(slug, redirect)} />;

  const lines = reviewLines(catalog.passes, selection);
  const { totalCents } = purchaseTotals(catalog.passes, selection);
  const person = reviewBuyer(buyer);
  const allAccepted = legalDocuments.every(({ id }) => accepted[id]);
  const backTo = stepPath(slug, 'buyer');

  const pay = async () => {
    if (sending.current || !allAccepted) return;
    sending.current = true;
    setPending(true);
    setFailure(null);
    const controller = new AbortController();
    request.current = controller;
    try {
      const registration = await createRegistration(
        slug,
        buildRegistrationRequest(catalog.passes, selection, buyer),
        controller.signal,
      );
      const reserved = reservedPurchase(registration, buyer.email);
      const storage = sessionDraftStorage();
      storeReserved(storage, slug, reserved);
      clearStoredDraft(storage, slug);
      void navigate(reservedPath(slug), { replace: true, state: reserved });
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure(payFailure(publicEventFailure(error)));
      sending.current = false;
      setPending(false);
    }
  };

  return (
    <PublicFrame backTo={backTo}>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-5">
        <StepProgress step={stepNumber('review')} total={purchaseStepCount} />
        <h1 className="text-[26px] leading-tight font-extrabold text-heading">Revisa y paga</h1>

        <Card title="Tus pases" change={{ to: stepPath(slug, 'passes'), label: 'Cambiar pases' }}>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <li key={line.passId} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-heading">{line.name}</p>
                  {line.competitions.length > 0 ? (
                    <p className="text-sm text-muted">{line.competitions.join(', ')}</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold text-fg">{formatMxn(line.priceCents)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3 font-extrabold text-heading">
            <span>Total</span>
            <span>{formatMxn(totalCents)} MXN</span>
          </p>
        </Card>

        <Card title="Tus datos" change={{ to: backTo, label: 'Cambiar datos' }}>
          <p className="font-bold break-words text-heading">
            {person.stageName ? `${person.name} · ${person.stageName}` : person.name}
          </p>
          <p className="text-sm break-words text-muted">
            {person.email} · {person.phone}
          </p>
        </Card>

        <p
          role="note"
          className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-fg"
        >
          {overlapNotice}
        </p>

        <fieldset className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-4 py-3">
          <legend className="px-1 text-lg font-extrabold text-heading">
            Documentos y políticas
          </legend>
          {legalDocuments.map(({ id, label }) => (
            <CheckboxField
              key={id}
              name={id}
              required
              checked={accepted[id]}
              disabled={pending}
              onChange={(event) =>
                setAccepted((current) => ({ ...current, [id]: event.target.checked }))
              }
              label={label}
            />
          ))}
        </fieldset>

        {failure ? (
          <div ref={failureRef}>
            <Notice tone="danger" title={failure.details.length > 0 ? failure.message : undefined}>
              {failure.details.length > 0 ? (
                <ul className="list-disc pl-5">
                  {failure.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : (
                <p>{failure.message}</p>
              )}
              {failure.fix ? <FixLink slug={slug} fix={failure.fix} /> : null}
            </Notice>
          </div>
        ) : null}

        {!allAccepted ? (
          <p id={hintId} className="text-sm font-medium text-muted">
            Marca las tres casillas para poder pagar.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Te llevaremos a Mercado Pago para pagar de forma segura y después volverás aquí.
        </p>
      </main>
      <StepBar backTo={backTo}>
        <button
          type="button"
          disabled={!allAccepted || pending}
          aria-describedby={allAccepted ? undefined : hintId}
          onClick={() => void pay()}
          className={continueButtonClass}
        >
          {pending
            ? 'Reservando tu inscripción…'
            : `Pagar ${formatMxn(totalCents)} con Mercado Pago`}
        </button>
      </StepBar>
    </PublicFrame>
  );
}

type CardProps = { title: string; change: { to: string; label: string }; children: ReactNode };

// A summary card with its heading and a "Cambiar" link to the step that edits it.
function Card({ title, change, children }: CardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-surface px-4 pt-2 pb-4"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-extrabold text-heading">
          {title}
        </h2>
        <Link to={change.to} aria-label={change.label} className={linkClass}>
          Cambiar
        </Link>
      </div>
      {children}
    </section>
  );
}

// The way out of a failed payment. Home is a full page load, so the catalog (and the sales
// state that just closed) is read again.
function FixLink({ slug, fix }: { slug: string; fix: PayFix }) {
  if (fix === 'home')
    return (
      <a href={stepPath(slug, 'home')} className={linkClass}>
        {fixLabels.home}
      </a>
    );
  return (
    <Link to={stepPath(slug, fix)} className={linkClass}>
      {fixLabels[fix]}
    </Link>
  );
}
