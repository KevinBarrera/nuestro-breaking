import {
  adminRegistrationFailure,
  createManualRegistration,
  type ManualRegistrationInput,
  type PossibleDuplicate,
} from '@/entities/admin-registration';
import {
  detailsHaveError,
  emptyParticipantForm,
  firstInvalidField,
  localIsoDate,
  participantFieldLabels,
  participantFields,
  participantMaxLength,
  type ParticipantErrors,
  type ParticipantField,
  type ParticipantForm,
} from '@/entities/participant';
import { routes } from '@/shared/config';
import { FieldError, Notice, TextField, UnsavedChangesGuard } from '@/shared/ui';
import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react';
import { generatePath, Link, useNavigate, useParams } from 'react-router';
import { styles } from './catalog-copy';
import {
  stepHeading,
  stepLead,
  StepperIcon,
  stepSection,
  StepperFooter,
  StepperFrame,
} from './new-registration-layout';
import { RegistrationDuplicatesDialog } from './registration-duplicates-dialog';
import {
  createFailureMessage,
  participantDisplayName,
  registrationServerErrors,
  type DuplicateMatchRow,
  type RegistrationContext,
} from './registration-model';
import {
  defaultSalePhoneMode,
  saleParticipantPayload,
  validateSaleParticipant,
  type SalePhoneMode,
} from './sale-participant-model';

type FieldSetup = Omit<ComponentProps<typeof TextField>, 'value' | 'onChange' | 'error'>;

// The operator types someone else's data, so browser autofill stays off. The labels follow the
// #346 artboard; the rules and messages are the participant form's.
const fieldSetup: Record<ParticipantField, FieldSetup> = {
  firstName: { label: participantFieldLabels.firstName },
  firstLastName: { label: participantFieldLabels.firstLastName },
  secondLastName: { label: 'Segundo apellido', optional: true },
  stageName: {
    label: 'AKA o nombre artístico',
    optional: true,
    placeholder: 'Como lo anuncian en la batalla',
  },
  email: {
    label: participantFieldLabels.email,
    type: 'email',
    placeholder: 'nombre@correo.com',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  phone: { label: participantFieldLabels.phone, type: 'tel', inputMode: 'tel' },
  city: { label: participantFieldLabels.city, optional: true },
  instagram: { label: participantFieldLabels.instagram, optional: true, placeholder: '@usuario' },
  level: { label: participantFieldLabels.level, optional: true },
  birthDate: { label: participantFieldLabels.birthDate, optional: true, type: 'date' },
};

const phoneSetup: Record<SalePhoneMode, { placeholder: string; hint: string }> = {
  mx: { placeholder: '55 1234 5678', hint: '10 dígitos, sin lada de país.' },
  international: {
    placeholder: '+1 555 123 4567',
    hint: 'Incluye la lada del país, por ejemplo +1.',
  },
};

const phoneModeLabels: Record<SalePhoneMode, string> = {
  mx: 'México +52',
  international: 'Otro país',
};

const inputId = (field: ParticipantField) => `registration-${field}`;

// A server error stays until its field is edited.
function withoutField(errors: ParticipantErrors, field: ParticipantField): ParticipantErrors {
  const rest = { ...errors };
  delete rest[field];
  return rest;
}

type FormNotice = { message: string; unknownOutcome: boolean };
type Leave = { to: string; state: RegistrationContext };

// The phone input mirrors the TextField frame; the country switch sits on the same row.
const phoneFrame =
  'flex min-h-11 flex-[1_1_220px] items-stretch overflow-hidden rounded-lg border bg-input text-base text-fg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus';

export function AdminRegistrationNewPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <NewRegistration key={eventId} eventId={eventId} />;
}

// Nueva inscripción, step 1 "Participante" (#105, #346): the participant registered in person. A
// registration exists only once the backend answers; possible duplicates are confirmed in a
// dialog first (#125). "Continuar a pases" creates it and the passes and the cash payment follow
// on its sale route, which gets the name and contact line this screen typed.
function NewRegistration({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<ParticipantForm>(emptyParticipantForm);
  const [phoneMode, setPhoneMode] = useState<SalePhoneMode>(defaultSalePhoneMode);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ParticipantErrors>({});
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // A new object per failed attempt, so focus moves on every attempt but not while typing.
  const [focusRequest, setFocusRequest] = useState<{ field: ParticipantField } | null>(null);
  const [sending, setSending] = useState(false);
  // The body that got possible duplicates, resent as is once they are confirmed.
  const [duplicates, setDuplicates] = useState<{
    input: ManualRegistrationInput;
    matches: PossibleDuplicate[];
  } | null>(null);
  const [leave, setLeave] = useState<Leave | null>(null);
  const pending = useRef(false);
  const listsPath = generatePath(routes.adminEventRegistrations, { eventId });

  const clientErrors = submitted
    ? validateSaleParticipant(form, localIsoDate(new Date()), phoneMode)
    : {};
  const errors: ParticipantErrors = { ...serverErrors, ...clientErrors };
  const dirty = participantFields.some((field) => form[field] !== emptyParticipantForm[field]);

  // Focus once the form is enabled again, after the render that shows the errors.
  useEffect(() => {
    if (focusRequest && !sending) document.getElementById(inputId(focusRequest.field))?.focus();
  }, [focusRequest, sending]);

  // Leaving for an existing registration waits for the render that turns the guard off.
  useEffect(() => {
    if (leave) void navigate(leave.to, { state: leave.state });
  }, [leave, navigate]);

  const salePath = (registrationId: string) =>
    generatePath(routes.adminEventRegistrationSale, { eventId, registrationId });

  function showErrors(found: ParticipantErrors) {
    const field = firstInvalidField(found);
    if (!field) return false;
    if (detailsHaveError(found)) setDetailsOpen(true);
    setFocusRequest({ field });
    return true;
  }

  async function send(input: ManualRegistrationInput, confirmed?: PossibleDuplicate[]) {
    if (pending.current) return;
    pending.current = true;
    setSending(true);
    setNotice(null);
    try {
      const created = await createManualRegistration(
        eventId,
        input,
        confirmed
          ? { confirmedDuplicateRegistrationIds: confirmed.map((match) => match.registrationId) }
          : {},
      );
      // Navigating before `sending` clears keeps the unsaved-changes guard off.
      const state: RegistrationContext = {
        participantName: participantDisplayName(form),
        status: created.status,
        contact: { email: input.email, phone: input.phone },
      };
      void navigate(salePath(created.registrationId), { state });
    } catch (error) {
      const failure = adminRegistrationFailure(error);
      if (failure.kind === 'possible_duplicates') {
        setDuplicates({ input, matches: failure.matches });
        return;
      }
      setDuplicates(null);
      if (failure.kind === 'invalid') {
        const placed = registrationServerErrors(failure.fieldErrors, phoneMode);
        setServerErrors(placed.errors);
        if (showErrors(placed.errors) && !placed.unmapped) return;
      }
      setNotice({
        message: createFailureMessage(failure),
        unknownOutcome: failure.kind === 'unknown',
      });
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setSubmitted(true);
    setServerErrors({});
    setNotice(null);
    if (showErrors(validateSaleParticipant(form, localIsoDate(new Date()), phoneMode))) return;
    void send(saleParticipantPayload(form, phoneMode));
  }

  function edit(field: ParticipantField, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setServerErrors((previous) => withoutField(previous, field));
  }

  // A pending match goes on to its pass step, as "Continuar venta" does.
  function continueWith(match: DuplicateMatchRow) {
    setLeave({
      to: salePath(match.registrationId),
      state: { participantName: match.fullName, status: 'pending_payment' },
    });
  }

  const input = (field: ParticipantField) => (
    <TextField
      {...fieldSetup[field]}
      id={inputId(field)}
      name={field}
      autoComplete="off"
      maxLength={participantMaxLength[field]}
      value={form[field]}
      disabled={sending}
      onChange={(event) => edit(field, event.target.value)}
      error={errors[field]}
    />
  );
  const listed = participantFields.filter((field) => errors[field]);
  const phoneId = inputId('phone');
  const phoneDescribedBy = [
    phoneMode === 'mx' ? `${phoneId}-prefix` : null,
    `${phoneId}-hint`,
    errors.phone ? `${phoneId}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <StepperFrame listsPath={listsPath} step={1}>
      <UnsavedChangesGuard when={dirty && !sending && !leave} />
      <form
        aria-label="Nueva inscripción"
        noValidate
        autoComplete="off"
        onSubmit={submit}
        className="rounded-xl border border-line bg-surface"
      >
        {(notice || listed.length > 0) && (
          <div className="flex flex-col gap-3 px-5 pt-5 sm:px-7 sm:pt-7">
            {notice && (
              <Notice tone="danger">
                {notice.message}
                {notice.unknownOutcome && (
                  <>
                    {' '}
                    <Link
                      to={listsPath}
                      className="inline-flex min-h-11 items-center font-bold underline"
                    >
                      Ir a Inscripciones
                    </Link>
                  </>
                )}
              </Notice>
            )}
            {listed.length > 0 && (
              <Notice tone="danger" title="Revisa estos datos:">
                <ul className="list-disc pl-5">
                  {listed.map((field) => (
                    <li key={field}>
                      {fieldSetup[field].label}: {errors[field]}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
          </div>
        )}
        <section aria-labelledby="registration-who" className={stepSection}>
          <h2 id="registration-who" className={stepHeading}>
            ¿Quién se inscribe?
          </h2>
          <div className="grid gap-4 *:min-w-0 @min-[641px]:grid-cols-3">
            {input('firstName')}
            {input('firstLastName')}
            {input('secondLastName')}
          </div>
          {input('stageName')}
        </section>
        <section
          aria-labelledby="registration-contact"
          className={`${stepSection} border-t border-line`}
        >
          <div className="flex flex-col gap-0.5">
            <h2 id="registration-contact" className={stepHeading}>
              Contacto
            </h2>
            <p className={stepLead}>Al correo le llegan la confirmación y el folio.</p>
          </div>
          {input('email')}
          <div>
            <label htmlFor={phoneId} className={styles.label}>
              {fieldSetup.phone.label}
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <fieldset className="min-w-0 flex-none">
                <legend className="sr-only">País del teléfono</legend>
                <div className="flex gap-1 rounded-lg border border-input-line bg-input p-1">
                  {(['mx', 'international'] as const).map((mode) => (
                    <label key={mode} className={`${styles.segment} px-3`}>
                      <input
                        type="radio"
                        name="phoneMode"
                        value={mode}
                        checked={phoneMode === mode}
                        disabled={sending}
                        onChange={() => {
                          setPhoneMode(mode);
                          setServerErrors((previous) => withoutField(previous, 'phone'));
                        }}
                        className={styles.segmentInput}
                      />
                      {phoneModeLabels[mode]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div
                className={`${phoneFrame} ${errors.phone ? 'border-danger-fg' : 'border-input-line'}`}
              >
                {phoneMode === 'mx' && (
                  <span
                    id={`${phoneId}-prefix`}
                    className="flex items-center border-r border-input-line bg-surface-inner px-3 font-mono text-muted"
                  >
                    +52
                  </span>
                )}
                <input
                  type="tel"
                  inputMode="tel"
                  id={phoneId}
                  name="phone"
                  autoComplete="off"
                  maxLength={participantMaxLength.phone}
                  placeholder={phoneSetup[phoneMode].placeholder}
                  value={form.phone}
                  disabled={sending}
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={phoneDescribedBy}
                  onChange={(event) => edit('phone', event.target.value)}
                  className="min-h-11 min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-fg outline-none placeholder:text-muted disabled:opacity-60"
                />
              </div>
            </div>
            <p id={`${phoneId}-hint`} className="mt-1 text-sm text-muted">
              {phoneSetup[phoneMode].hint}
            </p>
            {errors.phone ? <FieldError id={`${phoneId}-error`}>{errors.phone}</FieldError> : null}
          </div>
        </section>
        <details
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          className="group border-t border-line"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 px-5 text-[15px] font-bold text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-7 [&::-webkit-details-marker]:hidden">
            <StepperIcon
              size={16}
              strokeWidth={2}
              className="flex-none -rotate-90 transition-transform group-open:rotate-0"
            >
              <path d="M5 8l5 5 5-5" />
            </StepperIcon>
            <span className="flex-1">
              Más datos{' '}
              <span className="font-normal text-muted">
                (opcional) · ciudad, Instagram, nivel y fecha de nacimiento
              </span>
            </span>
          </summary>
          <div className="grid gap-4 px-5 pb-5 *:min-w-0 sm:px-7 sm:pb-7 @min-[641px]:grid-cols-2">
            {input('city')}
            {input('instagram')}
            {input('level')}
            {input('birthDate')}
          </div>
        </details>
        <StepperFooter
          back={{ kind: 'cancel', to: listsPath }}
          totalCents={null}
          next={{ label: 'Continuar a pases', pendingLabel: 'Registrando…', pending: sending }}
        />
      </form>
      <RegistrationDuplicatesDialog
        matches={duplicates?.matches ?? null}
        pending={sending}
        onCancel={() => setDuplicates(null)}
        onConfirm={() => duplicates && void send(duplicates.input, duplicates.matches)}
        onContinue={continueWith}
      />
    </StepperFrame>
  );
}
