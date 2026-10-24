import {
  addRegistrationPass,
  adminRegistrationFailure,
  confirmCashPayment,
  confirmComplimentary,
  getRegistrationEntitlements,
  removeRegistrationPass,
  setPassSelections,
  type AdminRegistrationFailure,
  type HeldPass,
  type RegistrationEntitlements,
} from '@/entities/admin-registration';
import {
  centsToInput,
  formatMxn,
  listActivities,
  listPassTypes,
  parseMxnToCents,
} from '@/entities/event-catalog';
import { routes } from '@/shared/config';
import { buttonClass, CheckboxField, FieldError, Notice, TextField } from '@/shared/ui';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { generatePath, Link, useLocation, useParams } from 'react-router';
import {
  stepHeading,
  stepLead,
  StepperIcon,
  stepSection,
  StepFailure,
  StepperFooter,
  StepperFrame,
} from './new-registration-layout';
import {
  addOnState,
  chooseBase,
  cobroFormErrors,
  cobroLines,
  cobroPaymentInput,
  confirmedLead,
  contactLine,
  draftFromHeld,
  draftTotalCents,
  emptyPassDraft,
  passIncludes,
  passPlan,
  passSummary,
  receivedAmountHint,
  selectionPayload,
  stepperPasses,
  toggleAddOn,
  toggleChoice,
  type CobroErrors,
  type CobroForm,
  type PassDraft,
  type StepperPass,
  type StepperPasses,
} from './new-registration-model';
import {
  readRegistrationContext,
  registrationLoadMessage,
  type RegistrationContact,
  type RegistrationContext,
} from './registration-model';
import {
  cashTotalCents,
  confirmCashFailure,
  confirmedEntitlements,
  noteMaxLength,
  receiptMaxLength,
} from './sale-cash-model';
import {
  complimentaryReasonError,
  complimentaryReasonHint,
  confirmComplimentaryFailure,
  isComplimentarySale,
  reasonMaxLength,
} from './sale-complimentary-model';
import { saveCompetitionsFailure } from './sale-competitions-model';
import { addPassFailure } from './sale-pass-model';
import { removePassFailure } from './sale-pass-removal-model';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  // `options` is null when the event's pass types or activities could not be read.
  | { status: 'ready'; entitlements: RegistrationEntitlements; options: StepperPasses | null };

type Step = 1 | 2 | 3 | 4;

type Failure = { message: string; reload: boolean };

// What step 4 shows once the registration is confirmed.
type Confirmed = { folio: string; passes: HeldPass[]; totalCents: number };

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

export function AdminRegistrationSalePage() {
  const { eventId, registrationId } = useParams<'eventId' | 'registrationId'>();
  if (!eventId || !registrationId) return null;
  return (
    <RegistrationSale
      key={`${eventId}/${registrationId}`}
      eventId={eventId}
      registrationId={registrationId}
    />
  );
}

// Nueva inscripción, steps 2 to 4 (#346): the pass step keeps a local draft that "Continuar al
// cobro" writes to the pending registration (removals, then adds, then competitions), the cash
// step confirms it once, in cash or without payment when its passes total $0 (#263), and the
// last step shows the folio. A pending registration's "Continuar venta" opens it at "Pases". The
// contact line comes from the participant step in the navigation state; a reload loses it.
function RegistrationSale({
  eventId,
  registrationId,
}: {
  eventId: string;
  registrationId: string;
}) {
  const context = readRegistrationContext(useLocation().state);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const [step, setStep] = useState<Step>(2);
  const [draft, setDraft] = useState<PassDraft>(emptyPassDraft);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const listsPath = generatePath(routes.adminEventRegistrations, { eventId });
  const registrationPath = generatePath(routes.adminEventRegistration, {
    eventId,
    registrationId,
  });

  // The first read starts the draft from what is held; a "Recargar" keeps the operator's choice,
  // as the competition checks did (#277), and the next writes follow from the fresh read.
  const drafted = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getRegistrationEntitlements(eventId, registrationId, controller.signal),
      listPassTypes(eventId, controller.signal).catch(() => null),
      listActivities(eventId, controller.signal).catch(() => null),
    ])
      .then(([entitlements, passTypes, activities]) => {
        if (controller.signal.aborted) return;
        const options = passTypes && activities ? stepperPasses(passTypes, activities) : null;
        setLoad({ status: 'ready', entitlements, options });
        if (!drafted.current) setDraft(draftFromHeld(entitlements.passes));
        drafted.current = true;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          status: 'failed',
          message: registrationLoadMessage(adminRegistrationFailure(error).kind),
        });
      });
    return () => controller.abort();
  }, [eventId, registrationId, revision]);

  // A new step takes the focus to its heading, so the change is announced; the first one does not.
  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
  }, [step]);
  const goTo = (next: Step) => {
    moved.current = true;
    setStep(next);
  };

  const reload = () => setRevision((value) => value + 1);
  const updateEntitlements = (entitlements: RegistrationEntitlements) =>
    setLoad((previous) => (previous.status === 'ready' ? { ...previous, entitlements } : previous));

  const ready = load.status === 'ready' ? load : null;
  const summary = ready?.entitlements.registration ?? null;
  const fullName = summary?.participant.fullName ?? context?.participantName ?? '';
  const pending = summary?.status === 'pending_payment';

  let body;
  if (load.status === 'loading') body = <p role="status">Cargando inscripción…</p>;
  else if (load.status === 'failed') body = <Notice tone="danger">{load.message}</Notice>;
  else if (step === 4 && confirmed)
    body = (
      <ConfirmedStep
        headingRef={headingRef}
        fullName={fullName}
        email={context?.contact?.email ?? null}
        confirmed={confirmed}
        registrationPath={registrationPath}
        newPath={generatePath(routes.adminEventRegistrationNew, { eventId })}
      />
    );
  else if (!pending)
    body = (
      <Notice title="Sin venta pendiente">
        <p>
          Esta inscripción ya no está pendiente de pago, así que no admite pases ni cobro.{' '}
          <Link
            to={registrationPath}
            className="inline-flex min-h-11 items-center font-bold text-link underline"
          >
            Ver inscripción
          </Link>
        </p>
      </Notice>
    );
  else if (load.options === null)
    body = (
      <Notice tone="danger">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>No pudimos cargar los pases del evento.</p>
          <button type="button" className={buttonClass('secondary')} onClick={reload}>
            Recargar
          </button>
        </div>
      </Notice>
    );
  else if (step === 1)
    body = (
      <ParticipantStep
        headingRef={headingRef}
        entitlements={load.entitlements}
        contact={context?.contact ?? null}
        listsPath={listsPath}
        registrationPath={registrationPath}
        onNext={() => goTo(2)}
      />
    );
  else if (step === 2)
    body = (
      <PassStep
        headingRef={headingRef}
        eventId={eventId}
        entitlements={load.entitlements}
        options={load.options}
        draft={draft}
        onDraftChange={setDraft}
        onWritten={updateEntitlements}
        onBack={() => goTo(1)}
        onNext={() => goTo(3)}
        onReload={reload}
      />
    );
  else
    body = (
      <CobroStep
        // A fresh read with another total starts the cash form again, prefilled with it.
        key={cashTotalCents(load.entitlements.passes)}
        headingRef={headingRef}
        eventId={eventId}
        entitlements={load.entitlements}
        options={load.options}
        contact={context?.contact ?? null}
        onBack={() => goTo(2)}
        onConfirmed={(entitlements, folio) => {
          updateEntitlements(entitlements);
          setConfirmed({
            folio,
            passes: entitlements.passes,
            totalCents: cashTotalCents(entitlements.passes),
          });
          goTo(4);
        }}
        onReload={reload}
      />
    );

  return (
    <StepperFrame listsPath={listsPath} step={step === 4 && confirmed ? 4 : step}>
      {body}
    </StepperFrame>
  );
}

type HeadingRef = RefObject<HTMLHeadingElement | null>;

const cardClass = 'rounded-xl border border-line bg-surface';

// Step 1 once the registration exists: the saved participant, read-only.
function ParticipantStep({
  headingRef,
  entitlements,
  contact,
  listsPath,
  registrationPath,
  onNext,
}: {
  headingRef: HeadingRef;
  entitlements: RegistrationEntitlements;
  contact: RegistrationContact | null;
  listsPath: string;
  registrationPath: string;
  onNext: () => void;
}) {
  const titleId = useId();
  const { participant } = entitlements.registration;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onNext();
  };
  return (
    <form aria-labelledby={titleId} noValidate onSubmit={submit} className={cardClass}>
      <section className={stepSection}>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className={stepHeading}>
          ¿Quién se inscribe?
        </h2>
        <dl className="grid gap-4 @min-[641px]:grid-cols-2">
          <ReadOnlyFact label="Nombre completo">{participant.fullName}</ReadOnlyFact>
          <ReadOnlyFact label="AKA">{participant.stageName ?? 'Sin AKA'}</ReadOnlyFact>
          {contact && <ReadOnlyFact label="Contacto">{contactLine(contact)}</ReadOnlyFact>}
        </dl>
        <p className="rounded-lg bg-surface-inner px-4 py-3 text-sm text-fg">
          La inscripción ya está guardada. Para corregir el nombre o el AKA, usa «Corregir nombre o
          AKA» en la{' '}
          <Link to={registrationPath} className="font-semibold text-link underline">
            inscripción
          </Link>
          .
        </p>
      </section>
      <StepperFooter
        back={{ kind: 'cancel', to: listsPath }}
        totalCents={null}
        next={{ label: 'Continuar a pases', pendingLabel: 'Continuar a pases', pending: false }}
      />
    </form>
  );
}

function ReadOnlyFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="break-words text-heading">{children}</dd>
    </div>
  );
}

// Step 2: one base pass (with its competitions) and the add-ons it allows, written on "Continuar
// al cobro". Each write answers with the registration's entitlements, which replace the shown
// ones, so a failure halfway leaves the screen on what was saved. A failure whose outcome only a
// fresh read can tell locks the step until "Recargar"; it is never retried blindly.
function PassStep({
  headingRef,
  eventId,
  entitlements,
  options,
  draft,
  onDraftChange,
  onWritten,
  onBack,
  onNext,
  onReload,
}: {
  headingRef: HeadingRef;
  eventId: string;
  entitlements: RegistrationEntitlements;
  options: StepperPasses;
  draft: PassDraft;
  onDraftChange: (draft: PassDraft) => void;
  onWritten: (entitlements: RegistrationEntitlements) => void;
  onBack: () => void;
  onNext: () => void;
  onReload: () => void;
}) {
  const titleId = useId();
  const [missingBase, setMissingBase] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second run from a fast double click.
  const sending = useRef(false);
  const registrationId = entitlements.registration.id;
  const base = options.bases.find((pass) => pass.passTypeId === draft.baseId) ?? null;
  const firstName =
    entitlements.registration.participant.firstName ??
    entitlements.registration.participant.fullName;

  const change = (next: PassDraft) => {
    onDraftChange(next);
    if (next.baseId) setMissingBase(false);
    if (failure && !failure.reload) setFailure(null);
  };

  async function write() {
    if (sending.current || failure?.reload) return;
    if (!draft.baseId) {
      setMissingBase(true);
      return;
    }
    sending.current = true;
    setPending(true);
    setFailure(null);
    const plan = passPlan(entitlements.passes, draft);
    let current = entitlements;
    let explain: (failure: AdminRegistrationFailure) => Failure = removePassFailure;
    try {
      for (const pass of plan.remove) {
        current = await removeRegistrationPass(eventId, registrationId, pass.registrationPassId);
        onWritten(current);
      }
      explain = addPassFailure;
      for (const passTypeId of plan.add) {
        current = await addRegistrationPass(eventId, registrationId, passTypeId);
        onWritten(current);
      }
      explain = saveCompetitionsFailure;
      for (const selection of plan.selections) {
        const held = current.passes.find((pass) => pass.passTypeId === selection.passTypeId);
        if (!held) {
          setFailure({ message: staleMessage, reload: true });
          return;
        }
        current = await setPassSelections(
          eventId,
          registrationId,
          held.registrationPassId,
          selectionPayload(options, selection.passTypeId, selection.activityIds),
        );
        onWritten(current);
      }
      onNext();
    } catch (error) {
      setFailure(explain(adminRegistrationFailure(error)));
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void write();
  };
  const reload = () => {
    setFailure(null);
    onReload();
  };
  const errorId = `${titleId}-error`;

  return (
    <form aria-labelledby={titleId} noValidate onSubmit={submit} className={cardClass}>
      <section className={stepSection}>
        <div className="flex flex-col gap-0.5">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className={stepHeading}>
            Pase de {firstName}
          </h2>
          <p className={stepLead}>Elige un pase. Si es completo, marca sus competencias.</p>
        </div>
        {options.bases.length === 0 ? (
          <p className="text-muted">Este evento no tiene pases a la venta.</p>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby={titleId}
            aria-describedby={missingBase ? errorId : undefined}
            className="flex flex-col gap-2"
          >
            {options.bases.map((pass) => (
              <BaseOption
                key={pass.passTypeId}
                pass={pass}
                selected={draft.baseId === pass.passTypeId}
                chosen={draft.selections[pass.passTypeId] ?? []}
                disabled={pending}
                onChoose={() => change(chooseBase(draft, pass.passTypeId, options))}
                onToggleChoice={(activityId) =>
                  change(toggleChoice(draft, pass.passTypeId, activityId))
                }
              />
            ))}
          </div>
        )}
        {missingBase && (
          <p id={errorId} role="alert" className="text-sm font-semibold text-danger-fg">
            Elige un pase para continuar.
          </p>
        )}
        {options.addOns.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <h3 className="font-bold text-heading">Adicional</h3>
            {options.addOns.map((addOn) => (
              <AddOnOption
                key={addOn.passTypeId}
                addOn={addOn}
                state={addOnState(addOn, base)}
                selected={draft.addOnIds.includes(addOn.passTypeId)}
                chosen={draft.selections[addOn.passTypeId] ?? []}
                disabled={pending}
                onToggle={() => change(toggleAddOn(draft, addOn.passTypeId, options))}
                onToggleChoice={(activityId) =>
                  change(toggleChoice(draft, addOn.passTypeId, activityId))
                }
              />
            ))}
          </div>
        )}
        {failure && (
          <StepFailure message={failure.message} onReload={failure.reload ? reload : null} />
        )}
      </section>
      <StepperFooter
        back={{ kind: 'back', onBack, disabled: pending }}
        totalCents={draft.baseId ? draftTotalCents(draft, options) : null}
        next={{
          label: 'Continuar al cobro',
          pendingLabel: 'Guardando pases…',
          pending,
          disabled: failure?.reload,
        }}
      />
    </form>
  );
}

const optionCard = 'rounded-lg border bg-surface';
const optionLabel =
  'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 hover:bg-surface-inner has-disabled:cursor-not-allowed has-disabled:opacity-60 has-disabled:hover:bg-transparent';
const optionInput =
  'size-5 flex-none accent-focus outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function BaseOption({
  pass,
  selected,
  chosen,
  disabled,
  onChoose,
  onToggleChoice,
}: {
  pass: StepperPass;
  selected: boolean;
  chosen: readonly string[];
  disabled: boolean;
  onChoose: () => void;
  onToggleChoice: (activityId: string) => void;
}) {
  const id = useId();
  return (
    <div
      className={`${optionCard} ${selected ? 'border-focus shadow-[inset_0_0_0_1px_var(--color-focus)]' : 'border-line'}`}
    >
      <label htmlFor={id} className={optionLabel}>
        <input
          id={id}
          type="radio"
          name="base-pass"
          value={pass.passTypeId}
          checked={selected}
          disabled={disabled}
          aria-describedby={`${id}-includes`}
          onChange={onChoose}
          className={optionInput}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold break-words text-heading">{pass.name}</span>
          <span id={`${id}-includes`} className="text-sm text-muted">
            {passIncludes(pass)}
          </span>
        </span>
        <span className="font-mono text-[15px] font-medium text-heading">
          {formatMxn(pass.priceCents)}
        </span>
      </label>
      {selected && pass.choices.length > 0 && (
        <Competitions
          name={pass.name}
          pass={pass}
          chosen={chosen}
          disabled={disabled}
          onToggle={onToggleChoice}
        />
      )}
    </div>
  );
}

function AddOnOption({
  addOn,
  state,
  selected,
  chosen,
  disabled,
  onToggle,
  onToggleChoice,
}: {
  addOn: StepperPass;
  state: { available: boolean; hint: string };
  selected: boolean;
  chosen: readonly string[];
  disabled: boolean;
  onToggle: () => void;
  onToggleChoice: (activityId: string) => void;
}) {
  const id = useId();
  return (
    <div className={`${optionCard} border-line`}>
      <label htmlFor={id} className={optionLabel}>
        <input
          id={id}
          type="checkbox"
          checked={selected}
          disabled={disabled || !state.available}
          aria-describedby={`${id}-hint`}
          onChange={onToggle}
          className={optionInput}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold break-words text-heading">{addOn.name}</span>
          <span id={`${id}-hint`} className="text-sm text-muted">
            {state.hint}
          </span>
        </span>
        <span className="font-mono text-[15px] font-medium text-heading">
          +{formatMxn(addOn.priceCents)}
        </span>
      </label>
      {selected && addOn.choices.length > 0 && (
        <Competitions
          name={addOn.name}
          pass={addOn}
          chosen={chosen}
          disabled={disabled}
          onToggle={onToggleChoice}
        />
      )}
    </div>
  );
}

function Competitions({
  name,
  pass,
  chosen,
  disabled,
  onToggle,
}: {
  name: string;
  pass: StepperPass;
  chosen: readonly string[];
  disabled: boolean;
  onToggle: (activityId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Competencias de ${name}`}
      className="mx-4 mb-3 flex flex-col border-t border-line pt-2 sm:ml-12"
    >
      <span className="py-1 text-xs font-semibold text-muted">Competencias</span>
      {pass.choices.map((choice) => (
        <CheckboxField
          key={choice.activityId}
          label={choice.name}
          checked={chosen.includes(choice.activityId)}
          disabled={disabled}
          onChange={() => onToggle(choice.activityId)}
        />
      ))}
    </div>
  );
}

const hintTones = {
  success: 'font-semibold text-success-fg',
  warning: 'font-semibold text-warning-fg',
  muted: 'text-muted',
};

// The textarea keeps the 44px target; it mirrors the TextField frame.
const reasonFrame =
  'mt-1 block min-h-24 w-full rounded-lg border bg-input px-3 py-2 text-base text-fg placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus disabled:opacity-60';

// Step 3: the summary of what is held and the confirmation, sent once. In cash the operator types
// the amount received (prefilled with the total; a difference only warns, #104) and the paper
// receipt; a $0 registration is confirmed without payment with a reason instead (#263). A failure
// that needs a reload locks the button, so a lost answer is never sent twice.
function CobroStep({
  headingRef,
  eventId,
  entitlements,
  options,
  contact,
  onBack,
  onConfirmed,
  onReload,
}: {
  headingRef: HeadingRef;
  eventId: string;
  entitlements: RegistrationEntitlements;
  options: StepperPasses;
  contact: RegistrationContact | null;
  onBack: () => void;
  onConfirmed: (entitlements: RegistrationEntitlements, folio: string) => void;
  onReload: () => void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const { registration, passes } = entitlements;
  const totalCents = cashTotalCents(passes);
  const complimentary = isComplimentarySale(passes);
  const [form, setForm] = useState<CobroForm>({
    amount: centsToInput(totalCents),
    receipt: '',
    note: '',
  });
  const [errors, setErrors] = useState<CobroErrors>({});
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land on the next render; the ref blocks a second POST from a fast double click.
  const sending = useRef(false);
  const locked = failure?.reload ?? false;
  const amountHint = receivedAmountHint(parseMxnToCents(form.amount), totalCents);

  const edit = (field: keyof CobroForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (failure && !failure.reload) setFailure(null);
  };

  const confirmCash = () => {
    const found = cobroFormErrors(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const input = cobroPaymentInput(form);
    sending.current = true;
    setPending(true);
    setFailure(null);
    confirmCashPayment(eventId, registration.id, input)
      .then((confirmation) =>
        onConfirmed(
          confirmedEntitlements(entitlements, confirmation, {
            amountCents: input.amountCents,
            receipt: input.receipt,
          }),
          confirmation.folio,
        ),
      )
      .catch((error: unknown) => {
        const next = confirmCashFailure(adminRegistrationFailure(error));
        if (next.field) setErrors({ [next.field]: next.message });
        else setFailure(next);
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  const confirmFree = () => {
    const found = complimentaryReasonError(reason);
    setReasonError(found);
    if (found) return;
    sending.current = true;
    setPending(true);
    setFailure(null);
    confirmComplimentary(eventId, registration.id, { reason: reason.trim() })
      .then((confirmation) =>
        onConfirmed(confirmedEntitlements(entitlements, confirmation), confirmation.folio),
      )
      .catch((error: unknown) => {
        const next = confirmComplimentaryFailure(adminRegistrationFailure(error));
        if (next.field) setReasonError(next.message);
        else setFailure(next);
      })
      .finally(() => {
        sending.current = false;
        setPending(false);
      });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sending.current || locked) return;
    if (complimentary) confirmFree();
    else confirmCash();
  };
  const reload = () => {
    setFailure(null);
    onReload();
  };
  const reasonHintId = `${reasonId}-hint`;
  const reasonErrorId = `${reasonId}-error`;

  return (
    <form aria-labelledby={titleId} noValidate onSubmit={submit} className={cardClass}>
      <section className={stepSection}>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className={stepHeading}>
          {complimentary ? 'Confirmación sin cobro' : 'Cobro en efectivo'}
        </h2>
        <div className="rounded-xl border border-line bg-surface-inner">
          <div className="flex flex-col border-b border-line px-5 py-4">
            <span className="text-[15px] font-bold break-words text-heading">
              {registration.participant.fullName}
            </span>
            {contact && (
              <span className="text-sm break-words text-muted">{contactLine(contact)}</span>
            )}
          </div>
          <ul aria-label="Pases" className="flex flex-col px-5 py-2">
            {cobroLines(passes, options).map((line) => (
              <li key={line.key} className="flex justify-between gap-4 py-2 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold break-words text-heading">{line.name}</span>
                  <span className="text-muted">{line.detail}</span>
                </span>
                <span className="font-mono text-heading">{formatMxn(line.priceCents)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line px-5 py-3.5">
            <span className="font-bold text-heading">Total a cobrar</span>
            <span className="font-mono text-2xl font-medium text-heading">
              {formatMxn(totalCents)}
            </span>
          </div>
        </div>
        {complimentary ? (
          <div>
            <p className="mb-3 text-sm text-muted">
              Los pases de esta inscripción no tienen costo. Escribe el motivo y confírmala sin
              cobro.
            </p>
            <label htmlFor={reasonId} className="block text-sm font-semibold text-fg">
              Motivo
            </label>
            <p id={reasonHintId} className="mt-0.5 text-sm text-muted">
              {complimentaryReasonHint(reason)}
            </p>
            <textarea
              id={reasonId}
              value={reason}
              rows={3}
              maxLength={reasonMaxLength}
              placeholder="Ej. Golden ticket, ganador de …"
              required
              disabled={pending}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${reasonHintId} ${reasonErrorId}` : reasonHintId}
              className={`${reasonFrame} ${reasonError ? 'border-danger-fg' : 'border-input-line'}`}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(undefined);
                if (failure && !failure.reload) setFailure(null);
              }}
            />
            {reasonError ? <FieldError id={reasonErrorId}>{reasonError}</FieldError> : null}
          </div>
        ) : (
          <>
            <div className="grid gap-4 *:min-w-0 @min-[641px]:grid-cols-2">
              <TextField
                label="Monto recibido (MXN)"
                prefix="$"
                inputMode="decimal"
                autoComplete="off"
                inputClassName="font-mono"
                value={form.amount}
                disabled={pending}
                error={errors.amount}
                hintPlacement="below"
                hint={<span className={hintTones[amountHint.tone]}>{amountHint.text}</span>}
                onChange={(event) => edit('amount', event.target.value)}
              />
              <TextField
                label="Número de recibo"
                placeholder="Ej. 08564"
                autoComplete="off"
                inputClassName="font-mono"
                maxLength={receiptMaxLength}
                required
                value={form.receipt}
                disabled={pending}
                error={errors.receipt}
                hintPlacement="below"
                hint="El número impreso en el recibo en papel."
                onChange={(event) => edit('receipt', event.target.value)}
              />
            </div>
            <TextField
              label="Nota"
              optional
              autoComplete="off"
              maxLength={noteMaxLength}
              value={form.note}
              disabled={pending}
              error={errors.note}
              onChange={(event) => edit('note', event.target.value)}
            />
          </>
        )}
        {failure && (
          <StepFailure message={failure.message} onReload={failure.reload ? reload : null} />
        )}
      </section>
      <StepperFooter
        back={{ kind: 'back', onBack, disabled: pending }}
        totalCents={totalCents}
        next={{
          label: 'Confirmar inscripción',
          pendingLabel: 'Confirmando…',
          pending,
          disabled: locked,
        }}
      />
    </form>
  );
}

// Step 4: the folio from the confirmation answer, what was sold and where to go next.
function ConfirmedStep({
  headingRef,
  fullName,
  email,
  confirmed,
  registrationPath,
  newPath,
}: {
  headingRef: HeadingRef;
  fullName: string;
  email: string | null;
  confirmed: Confirmed;
  registrationPath: string;
  newPath: string;
}) {
  const lead = confirmedLead(fullName, email);
  const viewState: RegistrationContext = { participantName: fullName, status: 'confirmed' };
  return (
    <section
      className={`${cardClass} flex flex-col items-center gap-5 px-5 py-10 text-center sm:px-7`}
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full border border-success-fg bg-success text-success-fg"
      >
        <StepperIcon size={28} strokeWidth={2}>
          <path d="M4.5 10.5l3.5 3.5 7.5-8" />
        </StepperIcon>
      </span>
      <div role="status" className="flex flex-col gap-1.5">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-extrabold text-heading focus:outline-none"
        >
          Inscripción confirmada
        </h2>
        <p className="break-words text-muted">
          {lead.text}
          {lead.email && (
            <>
              <strong className="text-heading">{lead.email}</strong>.
            </>
          )}
        </p>
      </div>
      <div className="flex max-w-full flex-col items-center gap-0.5 rounded-xl border border-line bg-surface-inner px-8 py-4">
        <span className="text-xs font-semibold text-muted">Folio</span>
        <span className="font-mono text-[32px] leading-10 font-medium tracking-[0.04em] break-all text-heading">
          {confirmed.folio}
        </span>
        <span className="text-sm break-words text-muted">
          {passSummary(confirmed.passes)} ·{' '}
          <span className="font-mono">{formatMxn(confirmed.totalCents)}</span>
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to={registrationPath}
          state={viewState}
          className={buttonClass('secondary', 'inline-flex items-center')}
        >
          Ver inscripción
        </Link>
        <Link to={newPath} className={buttonClass('primary', 'inline-flex items-center gap-2')}>
          <StepperIcon size={16} strokeWidth={2}>
            <path d="M10 4.5v11M4.5 10h11" />
          </StepperIcon>
          Inscribir a otra persona
        </Link>
      </div>
    </section>
  );
}
