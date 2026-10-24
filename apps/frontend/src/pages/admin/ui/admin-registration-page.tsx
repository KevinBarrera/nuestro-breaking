import {
  adminRegistrationFailure,
  getRegistrationEntitlements,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import {
  formatMxn,
  listActivities,
  listPassTypes,
  type CatalogActivity,
  type CatalogPassType,
} from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { Breadcrumbs, buttonClass, Notice } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { generatePath, Link, useLocation, useParams } from 'react-router';
import { CashCorrectionDialog } from './cash-correction';
import { canCorrectCash } from './cash-correction-model';
import { passClassLabels } from './catalog-copy';
import { CompetitionsDialog } from './confirmed-competitions-editor';
import { editableCompetitionPass } from './confirmed-competitions-model';
import { DisciplineSwapDialog } from './discipline-swap';
import { canSwapDiscipline, disciplineSwapOptions, swapSourcePass } from './discipline-swap-model';
import { ParticipantCorrectionDialog } from './participant-correction';
import { canCorrectParticipant } from './participant-correction-model';
import { statusTone } from './payments-review-model';
import { akaLine, cashDifference, heldPassCompetitions } from './registration-detail-model';
import {
  readRegistrationContext,
  registrationLoadMessage,
  registrationStatusLabel,
  type RegistrationContext,
} from './registration-model';
import { RegistrationVoid } from './registration-void';
import { canVoidRegistration } from './registration-void-model';
import { cashTotalCents, registrationViewMode } from './sale-cash-model';
import { StatusPill } from './team-list';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  // `passTypes` and `activities` are null when the event's catalog could not be read.
  | {
      status: 'ready';
      entitlements: RegistrationEntitlements;
      passTypes: CatalogPassType[] | null;
      activities: CatalogActivity[] | null;
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

// One registration (#105): what it holds and, while it is pending payment, a "Continuar venta"
// link to Nueva inscripción's pass and cash steps (#346), where its passes, competitions and
// payment are sold; an in-person one can also be voided with a reason (#104).
// A confirmed registration, led by its folio, only lets
// the operator change a pass's competitions with a reason (#170) and, when paid in cash, shows
// the amount and receipt and corrects them with a reason after checking the receipt (#104). Both can have the participant's
// name and AKA corrected with a reason (#104), and their only full pass swapped for another
// discipline of the same price with a reason (#104); a voided one is read-only. The
// name and status come from the entitlements read, so a reload keeps them; the screen that linked
// here passes them along to show before that read answers. The #345 layout leads with a summary
// strip and groups the data in cards whose corrections open two-step modals.
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
  // The revision whose read last answered; behind `revision` while a reload is on its way.
  const [answered, setAnswered] = useState(0);
  const passesTitleId = useId();
  const paymentTitleId = useId();
  const participantTitleId = useId();
  const saleTitleId = useId();

  // A reload keeps the current data on screen until the new read answers.
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getRegistrationEntitlements(eventId, registrationId, controller.signal),
      listPassTypes(eventId, controller.signal).catch(() => null),
      listActivities(eventId, controller.signal).catch(() => null),
    ])
      .then(([entitlements, passTypes, activities]) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', entitlements, passTypes, activities });
        setAnswered(revision);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAnswered(revision);
        setState({
          status: 'failed',
          message: registrationLoadMessage(adminRegistrationFailure(error).kind),
        });
      });
    return () => controller.abort();
  }, [eventId, registrationId, revision]);

  // Writes answer with the registration's current entitlements, which replace the shown ones.
  const updateEntitlements = (entitlements: RegistrationEntitlements) =>
    setState((previous) =>
      previous.status === 'ready' ? { ...previous, entitlements } : previous,
    );
  const reload = () => setRevision((value) => value + 1);
  const reloading = state.status === 'ready' && answered !== revision;
  // Corrections wait for a reload, which may show that the last write landed after a lost answer.
  const correctionsLocked = reloading;
  // The correction modal that is open, and the success notice the last one left in its card.
  const [correcting, setCorrecting] = useState<Correcting | null>(null);
  const [cardNotice, setCardNotice] = useState<CardNotice | null>(null);
  // The card button that opened the modal; the focus goes back to it when the modal closes.
  const opener = useRef<HTMLElement | null>(null);
  const openCorrection = (next: Correcting, event: MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget;
    setCardNotice(null);
    setCorrecting(next);
  };
  const closeCorrection = () => setCorrecting(null);
  // Once the modal is gone; the next frame wins over the modal's own focus restore.
  useEffect(() => {
    const trigger = opener.current;
    if (correcting !== null || !trigger) return;
    opener.current = null;
    trigger.focus();
    const frame = requestAnimationFrame(() => trigger.focus());
    return () => cancelAnimationFrame(frame);
  }, [correcting]);
  // Set when this screen voided the registration, whose void action is then gone (#104).
  const [voidedHere, setVoidedHere] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The action that opened the void dialog is gone once it renders, so the heading takes focus.
  useEffect(() => {
    if (voidedHere) headingRef.current?.focus();
  }, [voidedHere]);

  const summary = state.status === 'ready' ? state.entitlements.registration : null;
  const ready = state.status === 'ready' ? state : null;
  const swapSource =
    ready && canSwapDiscipline(ready.entitlements) ? swapSourcePass(ready.entitlements) : null;
  const swapOptions =
    ready && swapSource
      ? disciplineSwapOptions(swapSource, ready.passTypes, ready.activities)
      : null;
  // A confirmed registration's passes with competitions to change (#170).
  const editablePasses =
    ready && registrationViewMode(ready.entitlements.registration.status) === 'confirmed'
      ? ready.entitlements.passes.flatMap((pass) => {
          const editable = editableCompetitionPass(pass, ready.passTypes, ready.activities);
          return editable ? [editable] : [];
        })
      : [];
  const editingPass =
    correcting?.kind === 'competitions'
      ? (editablePasses.find((pass) => pass.registrationPassId === correcting.passId) ?? null)
      : null;
  const participantName = summary?.participant.fullName ?? context?.participantName ?? null;
  const mode = summary ? registrationViewMode(summary.status) : null;
  const saleState: RegistrationContext | null = summary
    ? { participantName: summary.participant.fullName, status: summary.status }
    : null;

  const corrected =
    (card: CardNotice['card'], text: string) => (next: RegistrationEntitlements) => {
      updateEntitlements(next);
      setCardNotice({ card, text });
    };

  return (
    <main aria-busy={reloading} className="px-4 py-8 text-fg sm:px-8 lg:pt-10 lg:pb-16">
      <div className="@container mx-auto max-w-[1080px] space-y-5">
        <Breadcrumbs
          items={[
            {
              label: 'Inscripciones',
              to: generatePath(routes.adminEventRegistrations, { eventId }),
            },
            { label: participantName ?? 'Inscripción' },
          ]}
        />
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 space-y-1">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight break-words text-heading focus:outline-none"
            >
              {participantName ?? 'Inscripción'}
            </h1>
            {summary && <p className="text-muted">{akaLine(summary.participant.stageName)}</p>}
          </div>
          <Link
            to={generatePath(routes.adminEventCheckIn, { eventId })}
            className={buttonClass('secondary', 'inline-flex items-center gap-2')}
          >
            <svg {...svg} width="16" height="16" strokeWidth="1.75">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
            Ir a check-in
          </Link>
        </header>
        {state.status === 'loading' && <p role="status">Cargando inscripción…</p>}
        {/* Shown next to the current data, which stays until the new read answers. */}
        <p role="status" className="text-sm text-muted empty:hidden">
          {reloading ? 'Actualizando…' : ''}
        </p>
        {state.status === 'failed' && <Notice tone="danger">{state.message}</Notice>}
        {state.status === 'ready' && (
          <>
            {mode === 'voided' && (
              <Notice title="Inscripción anulada">
                {voidedHere
                  ? 'Se anuló la inscripción. Sus pases quedan como historial y ya no admite pases, competencias ni pagos.'
                  : 'Esta inscripción está anulada: no admite pases, competencias ni pagos.'}
              </Notice>
            )}
            <SummaryStrip entitlements={state.entitlements} />
            {mode === 'sale' && (
              <section
                aria-labelledby={saleTitleId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface px-6 py-5"
              >
                <div className="min-w-0 flex-[1_1_320px] space-y-1">
                  <h2 id={saleTitleId} className="text-lg font-bold text-heading">
                    Venta pendiente
                  </h2>
                  <p className="text-sm text-muted">
                    Esta inscripción aún no está pagada. Sus pases, competencias y cobro se
                    registran en los pasos de Nueva inscripción.
                  </p>
                </div>
                <Link
                  to={generatePath(routes.adminEventRegistrationSale, { eventId, registrationId })}
                  state={saleState}
                  className={buttonClass('primary', 'inline-flex items-center gap-2')}
                >
                  Continuar venta
                  <svg {...svg} width="16" height="16" strokeWidth="2">
                    <path d="M8 5l5 5-5 5" />
                  </svg>
                </Link>
              </section>
            )}
            <DetailCard
              titleId={passesTitleId}
              title="Pases"
              actions={
                <>
                  {swapSource && swapOptions && swapOptions.status !== 'unavailable' && (
                    <button
                      type="button"
                      disabled={correctionsLocked}
                      className={buttonClass('secondary')}
                      onClick={(event) => openCorrection({ kind: 'discipline' }, event)}
                    >
                      Cambiar disciplina
                    </button>
                  )}
                  {editablePasses.map((pass) => (
                    <button
                      key={pass.registrationPassId}
                      type="button"
                      disabled={correctionsLocked}
                      className={buttonClass('secondary')}
                      aria-label={`Editar competencias de «${pass.name}»`}
                      onClick={(event) =>
                        openCorrection(
                          {
                            kind: 'competitions',
                            passId: pass.registrationPassId,
                          },
                          event,
                        )
                      }
                    >
                      {editablePasses.length > 1
                        ? `Editar competencias de ${pass.name}`
                        : 'Editar competencias'}
                    </button>
                  ))}
                </>
              }
            >
              {cardNotice?.card === 'passes' && <CardSuccess text={cardNotice.text} />}
              <HeldPassList ready={state} />
            </DetailCard>
            {state.entitlements.registration.cash && (
              <DetailCard
                titleId={paymentTitleId}
                title="Pago en efectivo"
                actions={
                  canCorrectCash(state.entitlements.registration) && (
                    <button
                      type="button"
                      disabled={correctionsLocked}
                      className={buttonClass('secondary')}
                      onClick={(event) => openCorrection({ kind: 'cash' }, event)}
                    >
                      Corregir pago
                    </button>
                  )
                }
              >
                {cardNotice?.card === 'cash' && <CardSuccess text={cardNotice.text} />}
                <CashFacts entitlements={state.entitlements} />
              </DetailCard>
            )}
            <DetailCard
              titleId={participantTitleId}
              title="Participante"
              actions={
                canCorrectParticipant(state.entitlements.registration) && (
                  <button
                    type="button"
                    disabled={correctionsLocked}
                    className={buttonClass('secondary')}
                    onClick={(event) => openCorrection({ kind: 'participant' }, event)}
                  >
                    Corregir nombre o AKA
                  </button>
                )
              }
            >
              {cardNotice?.card === 'participant' && <CardSuccess text={cardNotice.text} />}
              <dl className="grid gap-x-6 gap-y-4 @2xl:grid-cols-2">
                <Fact label="Nombre completo">
                  {state.entitlements.registration.participant.fullName}
                </Fact>
                <Fact label="AKA">
                  {state.entitlements.registration.participant.stageName ?? 'Sin AKA'}
                </Fact>
              </dl>
            </DetailCard>
            {canVoidRegistration(state.entitlements.registration) && (
              <RegistrationVoid
                eventId={eventId}
                entitlements={state.entitlements}
                onVoided={(entitlements) => {
                  updateEntitlements(entitlements);
                  setVoidedHere(true);
                }}
                onReload={reload}
              />
            )}
            <p className="flex items-start gap-2 text-sm text-muted">
              <svg {...svg} width="16" height="16" strokeWidth="1.75" className="mt-0.5 shrink-0">
                <circle cx="10" cy="10" r="7.5" />
                <path d="M10 9v4.5M10 6.5v.01" />
              </svg>
              <span>
                Cada corrección pide un motivo y una revisión antes de guardarse. Queda en el{' '}
                <Link
                  to={generatePath(routes.adminEventHistory, { eventId })}
                  className="text-link underline underline-offset-3"
                >
                  historial
                </Link>{' '}
                con tu nombre.
              </span>
            </p>
            {correcting?.kind === 'cash' && state.entitlements.registration.cash && (
              <CashCorrectionDialog
                eventId={eventId}
                entitlements={state.entitlements}
                cash={state.entitlements.registration.cash}
                onCorrected={corrected(
                  'cash',
                  'Se corrigió el pago en efectivo. El pago original queda en el historial.',
                )}
                onReload={reload}
                onClose={closeCorrection}
              />
            )}
            {correcting?.kind === 'competitions' && editingPass && (
              <CompetitionsDialog
                eventId={eventId}
                registrationId={state.entitlements.registration.id}
                pass={editingPass}
                onSaved={corrected(
                  'passes',
                  `Se cambiaron las competencias de «${editingPass.name}».`,
                )}
                onReload={reload}
                onClose={closeCorrection}
              />
            )}
            {correcting?.kind === 'discipline' &&
              swapSource &&
              swapOptions &&
              swapOptions.status !== 'unavailable' && (
                <DisciplineSwapDialog
                  eventId={eventId}
                  entitlements={state.entitlements}
                  held={swapSource}
                  options={swapOptions}
                  onSwapped={(entitlements, targetName) => {
                    updateEntitlements(entitlements);
                    setCardNotice({
                      card: 'passes',
                      text: `Se cambió a «${targetName}». El monto cobrado no cambia.`,
                    });
                  }}
                  onReload={reload}
                  onClose={closeCorrection}
                />
              )}
            {correcting?.kind === 'participant' && (
              <ParticipantCorrectionDialog
                eventId={eventId}
                entitlements={state.entitlements}
                onCorrected={corrected('participant', 'Se corrigió el nombre de la inscripción.')}
                onReload={reload}
                onClose={closeCorrection}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

type Correcting =
  { kind: 'cash' | 'participant' | 'discipline' } | { kind: 'competitions'; passId: string };

type CardNotice = { card: 'passes' | 'cash' | 'participant'; text: string };

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const labelClass = 'text-xs leading-4 font-semibold text-muted';

// Folio, status, the pass total and the cash charged against it, before any card.
function SummaryStrip({ entitlements }: { entitlements: RegistrationEntitlements }) {
  const { registration, passes } = entitlements;
  const total = cashTotalCents(passes);
  const difference = registration.cash
    ? cashDifference(total, registration.cash.amountCents)
    : null;
  const cell = 'flex flex-col gap-1 px-5 py-4';
  return (
    <section aria-label="Resumen">
      <dl className="grid grid-cols-2 rounded-xl border border-line bg-surface @2xl:grid-cols-4 [&>div]:border-line @max-2xl:[&>div:nth-child(n+3)]:border-t [&>div:nth-child(even)]:border-l @2xl:[&>div:nth-child(3)]:border-l">
        <div className={cell}>
          <dt className={labelClass}>Folio</dt>
          <dd
            className={
              registration.folio
                ? 'font-mono text-[22px] leading-7 font-medium tracking-[0.03em] break-all text-heading'
                : 'text-muted'
            }
          >
            {registration.folio ?? 'Sin folio'}
          </dd>
        </div>
        <div className={`${cell} items-start`}>
          <dt className={labelClass}>Estado</dt>
          <dd>
            <StatusPill tone={statusTone(registration.status)}>
              {registrationStatusLabel(registration.status)}
            </StatusPill>
          </dd>
        </div>
        <div className={cell}>
          <dt className={labelClass}>Total de pases</dt>
          <dd className="font-mono text-lg leading-7 text-heading">{formatMxn(total)}</dd>
        </div>
        <div className={cell}>
          <dt className={labelClass}>Cobrado en efectivo</dt>
          {registration.cash && difference ? (
            <dd>
              <span className="block font-mono text-lg leading-7 text-heading">
                {formatMxn(registration.cash.amountCents)}
              </span>
              <span
                className={`block text-xs leading-4 font-semibold ${difference.tone === 'success' ? 'text-success-fg' : 'text-warning-fg'}`}
              >
                {difference.short}
              </span>
            </dd>
          ) : (
            <dd className="text-sm leading-7 text-muted">Sin cobro en efectivo</dd>
          )}
        </div>
      </dl>
    </section>
  );
}

function DetailCard({
  titleId,
  title,
  actions,
  children,
}: {
  titleId: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <h2 id={titleId} className="text-lg font-bold text-heading">
          {title}
        </h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="space-y-4 px-6 py-5">{children}</div>
    </section>
  );
}

function CardSuccess({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg border border-success-fg bg-success px-3.5 py-2.5 text-sm font-semibold text-success-fg"
    >
      <svg {...svg} width="16" height="16" strokeWidth="2" className="shrink-0">
        <path d="M4.5 10.5l3.5 3.5 7.5-8" />
      </svg>
      {text}
    </p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className={labelClass}>{label}</dt>
      <dd className="text-base break-words text-heading">{children}</dd>
    </div>
  );
}

function CashFacts({ entitlements }: { entitlements: RegistrationEntitlements }) {
  const { registration, passes } = entitlements;
  const cash = registration.cash;
  if (!cash) return null;
  const { notice } = cashDifference(cashTotalCents(passes), cash.amountCents);
  return (
    <>
      <dl className="grid gap-x-6 gap-y-4 @2xl:grid-cols-2">
        <Fact label="Monto cobrado">
          <span className="font-mono">{formatMxn(cash.amountCents)}</span>
        </Fact>
        <Fact label="Número de recibo">
          {cash.receipt ? (
            <span className="font-mono break-all">{cash.receipt}</span>
          ) : (
            <span className="text-sm text-muted">
              Sin número de recibo: se registró antes de pedirlo.
            </span>
          )}
        </Fact>
      </dl>
      {notice && (
        <p className="flex items-start gap-2 rounded-lg border border-warning-fg bg-warning px-3.5 py-2.5 text-sm text-warning-fg">
          <svg {...svg} width="16" height="16" strokeWidth="1.75" className="mt-0.5 shrink-0">
            <path d="M10 3l8 14H2z" />
            <path d="M10 8.5v3.5M10 14.5v.01" />
          </svg>
          {notice}
        </p>
      )}
    </>
  );
}

function HeldPassList({ ready }: { ready: Extract<LoadState, { status: 'ready' }> }) {
  if (ready.entitlements.passes.length === 0)
    return <p className="text-muted">Aún no tiene pases.</p>;
  return (
    <ul className="divide-y divide-line">
      {ready.entitlements.passes.map((pass) => (
        <PassRow
          key={pass.registrationPassId}
          pass={pass}
          competitions={heldPassCompetitions(pass, ready.passTypes, ready.activities)}
        />
      ))}
    </ul>
  );
}

function PassRow({
  pass,
  competitions,
}: {
  pass: HeldPass;
  competitions: ReturnType<typeof heldPassCompetitions>;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3 py-3.5 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block font-bold break-words text-heading">{pass.name}</span>
        <span className="block text-sm text-muted">{passClassLabels[pass.passClass]}</span>
      </span>
      <span className="font-mono">{formatMxn(pass.priceCents)}</span>
      {competitions &&
        ('text' in competitions ? (
          <CompetitionChips label="Competencias" names={[]} count={competitions.text} />
        ) : (
          <>
            {competitions.included.length > 0 && (
              <CompetitionChips label="Competencias incluidas" names={competitions.included} />
            )}
            {competitions.chosen && (
              <CompetitionChips
                label={competitions.included.length > 0 ? 'Competencias elegidas' : 'Competencias'}
                names={competitions.chosen}
                empty="Sin competencias elegidas."
              />
            )}
          </>
        ))}
    </li>
  );
}

function CompetitionChips({
  label,
  names,
  empty,
  count,
}: {
  label: string;
  names: readonly string[];
  empty?: string;
  // Shown instead of the chips when only the number chosen is known.
  count?: string;
}) {
  return (
    <div className="flex basis-full flex-col gap-2">
      <span className={labelClass}>{label}</span>
      {names.length > 0 ? (
        <ul aria-label={label} className="flex flex-wrap gap-2">
          {names.map((name, index) => (
            <li
              key={`${name}-${index}`}
              className="rounded-full border border-line bg-chip px-3 py-1 text-sm font-semibold text-heading"
            >
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <span className={count ? 'text-sm text-fg' : 'text-sm text-muted'}>{count ?? empty}</span>
      )}
    </div>
  );
}
