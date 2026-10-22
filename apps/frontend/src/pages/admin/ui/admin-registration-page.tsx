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
import { Breadcrumbs, Notice } from '@/shared/ui';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { generatePath, useLocation, useParams } from 'react-router';
import { passClassLabels, styles } from './catalog-copy';
import { ConfirmedCompetitions } from './confirmed-competitions';
import { DisciplineSwap } from './discipline-swap';
import { canSwapDiscipline, swapSourcePass } from './discipline-swap-model';
import { ParticipantCorrection } from './participant-correction';
import { canCorrectParticipant } from './participant-correction-model';
import { readRegistrationContext, registrationStatusLabel } from './registration-model';
import { RegistrationVoid } from './registration-void';
import { canVoidRegistration } from './registration-void-model';
import { SaleCash } from './sale-cash';
import { registrationViewMode } from './sale-cash-model';
import { SaleComplimentary } from './sale-complimentary';
import { isComplimentarySale } from './sale-complimentary-model';
import { SaleCompetitions } from './sale-competitions';
import {
  passCompetitionLines,
  unsavedCompetitionPasses,
  unsavedCompetitionsHint,
  withDraft,
  type CompetitionDrafts,
  type SaleCompetitionPass,
} from './sale-competitions-model';
import { SalePassPicker } from './sale-pass-picker';
import { SalePassRemoval } from './sale-pass-remove';

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

// One registration (#105): what it holds and, while it is pending payment, the passes it can
// still get, the competitions of each held pass and the cash payment, or the confirmation without
// payment when its passes total $0 (#263); an in-person one can also be voided with a reason (#104).
// A confirmed registration, led by its folio, only lets
// the operator change a pass's competitions with a reason (#170). Both can have the participant's
// name and AKA corrected with a reason (#104), and their only full pass swapped for another
// discipline of the same price with a reason (#104); a voided one is read-only. The
// name and status come from the entitlements read, so a reload keeps them; the screen that linked
// here passes them along to show before that read answers.
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
  }, [eventId, registrationId, revision]);

  // Writes answer with the registration's current entitlements, which replace the shown ones.
  const updateEntitlements = (entitlements: RegistrationEntitlements) =>
    setState((previous) =>
      previous.status === 'ready' ? { ...previous, entitlements } : previous,
    );
  const reload = () => setRevision((value) => value + 1);
  const reloading = state.status === 'ready' && answered !== revision;
  // What this screen just recorded, announced over the folio.
  const [confirmedBy, setConfirmedBy] = useState<ConfirmedBy | null>(null);
  // Set when this screen voided the registration, whose void action is then gone (#104).
  const [voidedHere, setVoidedHere] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The action that opened the void dialog is gone once it renders, so the heading takes focus.
  useEffect(() => {
    if (voidedHere) headingRef.current?.focus();
  }, [voidedHere]);
  // Unsaved competition checks by held pass; refreshes and reloads leave them untouched (#277).
  const [drafts, setDrafts] = useState<CompetitionDrafts>({});
  const changeDraft = (pass: SaleCompetitionPass, next: readonly string[] | null) =>
    setDrafts((current) => withDraft(current, pass, next));
  // A removed pass takes its unsaved checks with it (#282).
  const removePassDraft = (pass: HeldPass) =>
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([passId]) => passId !== pass.registrationPassId),
      ),
    );

  const summary = state.status === 'ready' ? state.entitlements.registration : null;
  const swapSource = state.status === 'ready' ? swapSourcePass(state.entitlements) : null;
  const participantName = summary?.participant.fullName ?? context?.participantName ?? null;
  const status = summary?.status ?? context?.status ?? null;
  const mode = summary ? registrationViewMode(summary.status) : null;
  // Confirming waits until every held pass's checks are saved or discarded (#277).
  const unsavedCompetitions =
    state.status === 'ready'
      ? unsavedCompetitionsHint(unsavedCompetitionPasses(state.entitlements.passes, drafts))
      : null;

  return (
    <main aria-busy={reloading} className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <Breadcrumbs
          items={[
            {
              label: 'Inscripciones',
              to: generatePath(routes.adminEventRegistrations, { eventId }),
            },
            { label: participantName ?? 'Inscripción' },
          ]}
        />
        <header className="space-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-extrabold tracking-tight break-words text-heading focus:outline-none"
          >
            {participantName ? `Inscripción de ${participantName}` : 'Inscripción'}
          </h1>
          {status && (
            <p className="inline-flex rounded bg-chip px-2 py-1 text-sm font-semibold text-fg">
              {registrationStatusLabel(status)}
            </p>
          )}
        </header>
        {state.status === 'loading' && <p role="status">Cargando inscripción…</p>}
        {/* Shown next to the current data, which stays until the new read answers. */}
        <p role="status" className="text-sm text-muted empty:hidden">
          {reloading ? 'Actualizando…' : ''}
        </p>
        {state.status === 'failed' && <Notice tone="danger">{state.message}</Notice>}
        {state.status === 'ready' && (
          <>
            {mode === 'confirmed' && (
              <ConfirmedNotice
                folio={state.entitlements.registration.folio}
                confirmedBy={confirmedBy}
              />
            )}
            {mode === 'voided' && (
              <Notice title="Inscripción anulada">
                {voidedHere
                  ? 'Se anuló la inscripción. Sus pases quedan como historial y ya no admite pases, competencias ni pagos.'
                  : 'Esta inscripción está anulada: no admite pases, competencias ni pagos.'}
              </Notice>
            )}
            <section aria-labelledby={passesTitleId} className={`${styles.card} space-y-3`}>
              <h2 id={passesTitleId} className="text-lg font-bold text-heading">
                Pases
              </h2>
              {mode === 'sale' ? (
                <SalePassRemoval
                  eventId={eventId}
                  entitlements={state.entitlements}
                  passTypes={state.passTypes}
                  onRemoved={(entitlements, removed) => {
                    updateEntitlements(entitlements);
                    removePassDraft(removed);
                  }}
                  onReload={reload}
                >
                  {(removeAction) => (
                    <HeldPassList
                      ready={state}
                      // While selling, the competitions section shows them with their controls.
                      showSelected={false}
                      action={removeAction}
                    />
                  )}
                </SalePassRemoval>
              ) : mode === 'confirmed' ? (
                <ConfirmedCompetitions
                  eventId={eventId}
                  entitlements={state.entitlements}
                  passTypes={state.passTypes}
                  activities={state.activities}
                  onSaved={updateEntitlements}
                  onReload={reload}
                >
                  {(editAction) => <HeldPassList ready={state} showSelected action={editAction} />}
                </ConfirmedCompetitions>
              ) : (
                <HeldPassList ready={state} showSelected />
              )}
            </section>
            {mode === 'sale' && (
              <>
                <SalePassPicker
                  eventId={eventId}
                  entitlements={state.entitlements}
                  passTypes={state.passTypes}
                  onAdded={updateEntitlements}
                  onReload={reload}
                />
                <SaleCompetitions
                  eventId={eventId}
                  entitlements={state.entitlements}
                  passTypes={state.passTypes}
                  activities={state.activities}
                  drafts={drafts}
                  onDraftChange={changeDraft}
                  onSaved={updateEntitlements}
                  onReload={reload}
                />
                {isComplimentarySale(state.entitlements.passes) ? (
                  <SaleComplimentary
                    eventId={eventId}
                    entitlements={state.entitlements}
                    unsavedCompetitions={unsavedCompetitions}
                    onConfirmed={(entitlements) => {
                      updateEntitlements(entitlements);
                      setConfirmedBy('complimentary');
                    }}
                    onReload={reload}
                  />
                ) : (
                  <SaleCash
                    eventId={eventId}
                    entitlements={state.entitlements}
                    unsavedCompetitions={unsavedCompetitions}
                    onConfirmed={(entitlements) => {
                      updateEntitlements(entitlements);
                      setConfirmedBy('cash');
                    }}
                    onReload={reload}
                  />
                )}
              </>
            )}
            {canSwapDiscipline(state.entitlements) && swapSource && (
              <DisciplineSwap
                eventId={eventId}
                entitlements={state.entitlements}
                held={swapSource}
                passTypes={state.passTypes}
                activities={state.activities}
                onSwapped={(entitlements) => {
                  updateEntitlements(entitlements);
                  // The held pass keeps its id, so its unsaved checks belong to the old pass.
                  removePassDraft(swapSource);
                }}
                onReload={reload}
              />
            )}
            {canCorrectParticipant(state.entitlements.registration) && (
              <ParticipantCorrection
                eventId={eventId}
                entitlements={state.entitlements}
                onCorrected={updateEntitlements}
                onReload={reload}
              />
            )}
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
          </>
        )}
      </div>
    </main>
  );
}

type ConfirmedBy = 'cash' | 'complimentary';

const confirmedMessages: Record<ConfirmedBy, string> = {
  cash: 'Pago registrado. La inscripción quedó confirmada.',
  complimentary: 'La inscripción quedó confirmada sin cobro.',
};

// The folio is what the participant shows at check-in, so it leads the confirmed view.
// `confirmedBy` is set right after this screen confirmed the registration.
function ConfirmedNotice({
  folio,
  confirmedBy,
}: {
  folio: string | null;
  confirmedBy: ConfirmedBy | null;
}) {
  return (
    <section
      aria-label="Folio"
      className="rounded-xl border border-success-fg bg-success p-5 text-success-fg"
    >
      {confirmedBy && (
        <p role="status" className="font-semibold">
          {confirmedMessages[confirmedBy]}
        </p>
      )}
      <p className="text-sm font-semibold">Folio</p>
      <p className="font-mono text-3xl font-extrabold tracking-wider break-all">
        {folio ?? 'Sin folio'}
      </p>
      <p className="mt-1 text-sm">
        Inscripción confirmada: sus competencias solo cambian con un motivo.
      </p>
    </section>
  );
}

function HeldPassList({
  ready,
  showSelected,
  action,
}: {
  ready: Extract<LoadState, { status: 'ready' }>;
  showSelected: boolean;
  action?: (pass: HeldPass) => ReactNode;
}) {
  if (ready.entitlements.passes.length === 0)
    return <p className="text-muted">Aún no tiene pases.</p>;
  return (
    <ul className="divide-y divide-row">
      {ready.entitlements.passes.map((pass) => {
        const lines = passCompetitionLines(pass, ready.passTypes, ready.activities);
        return (
          <PassRow
            key={pass.registrationPassId}
            pass={pass}
            included={lines.included}
            selected={showSelected ? lines.selected : null}
            action={action?.(pass)}
          />
        );
      })}
    </ul>
  );
}

function PassRow({
  pass,
  included,
  selected,
  action,
}: {
  pass: HeldPass;
  included: string | null;
  selected: string | null;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
      <span className="min-w-0">
        <span className="block font-semibold break-words text-heading">{pass.name}</span>
        <span className="block text-sm text-muted">{passClassLabels[pass.passClass]}</span>
        {included && (
          <span className="block text-sm break-words text-fg">
            Competencias incluidas: {included}
          </span>
        )}
        {selected && (
          <span className="block text-sm break-words text-fg">
            Competencias elegidas: {selected}
          </span>
        )}
      </span>
      <span className="font-mono font-medium">{formatMxn(pass.priceCents)}</span>
      {action}
    </li>
  );
}
