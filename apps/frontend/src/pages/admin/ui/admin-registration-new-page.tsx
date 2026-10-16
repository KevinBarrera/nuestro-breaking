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
import { Breadcrumbs, buttonClass, Notice, TextField, UnsavedChangesGuard } from '@/shared/ui';
import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react';
import { generatePath, Link, useNavigate, useParams } from 'react-router';
import { styles } from './catalog-copy';
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
import { useEventName } from './use-event-name';

type FieldSetup = Omit<ComponentProps<typeof TextField>, 'value' | 'onChange' | 'error'>;

// The operator types someone else's data, so browser autofill stays off.
const fieldSetup: Record<ParticipantField, FieldSetup> = {
  firstName: { label: participantFieldLabels.firstName },
  firstLastName: { label: participantFieldLabels.firstLastName },
  secondLastName: { label: participantFieldLabels.secondLastName, optional: true },
  stageName: { label: participantFieldLabels.stageName, optional: true },
  email: {
    label: participantFieldLabels.email,
    hint: 'Ahí le llegan la confirmación y el folio.',
    type: 'email',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  phone: { label: participantFieldLabels.phone, type: 'tel', inputMode: 'tel' },
  city: { label: participantFieldLabels.city, optional: true },
  instagram: { label: participantFieldLabels.instagram, optional: true, placeholder: '@usuario' },
  level: { label: participantFieldLabels.level, optional: true },
  birthDate: { label: participantFieldLabels.birthDate, optional: true, type: 'date' },
};

const phoneSetup: Record<SalePhoneMode, Partial<FieldSetup>> = {
  mx: { prefix: '+52', hint: '10 dígitos.' },
  international: { hint: 'Con clave de país, por ejemplo +1 555 123 4567.' },
};

const phoneModeLabels: Record<SalePhoneMode, string> = {
  mx: 'México (+52)',
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

export function AdminRegistrationNewPage() {
  const { eventId } = useParams<'eventId'>();
  if (!eventId) return null;
  return <NewRegistration key={eventId} eventId={eventId} />;
}

// Nueva inscripción (#105): the participant registered in person. A registration exists only
// once the backend answers; possible duplicates are confirmed in a dialog first (#125). Passes
// and the cash payment follow on the registration's own screen.
function NewRegistration({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const { name: eventName } = useEventName(eventId);
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

  const registrationPath = (registrationId: string) =>
    generatePath(routes.adminEventRegistration, { eventId, registrationId });

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
      };
      void navigate(registrationPath(created.registrationId), { state });
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

  function continueWith(match: DuplicateMatchRow) {
    setLeave({
      to: registrationPath(match.registrationId),
      state: { participantName: match.fullName, status: 'pending_payment' },
    });
  }

  const input = (field: ParticipantField) => (
    <TextField
      {...fieldSetup[field]}
      {...(field === 'phone' ? phoneSetup[phoneMode] : {})}
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

  return (
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <Breadcrumbs
          items={[{ label: 'Inscripciones', to: listsPath }, { label: 'Nueva inscripción' }]}
        />
        <header className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Nueva inscripción</h1>
          {eventName && <p className="text-muted">{eventName}</p>}
          <p className="text-muted">
            Los datos del participante. Los pases y el cobro se registran en el siguiente paso.
          </p>
        </header>
        <UnsavedChangesGuard when={dirty && !sending && !leave} />
        <form
          aria-label="Nueva inscripción"
          noValidate
          onSubmit={submit}
          className={`${styles.card} flex flex-col gap-4 sm:p-8`}
        >
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
          {input('firstName')}
          <div className="grid grid-cols-2 gap-3 *:min-w-0">
            {input('firstLastName')}
            {input('secondLastName')}
          </div>
          {input('stageName')}
          {input('email')}
          <fieldset className="min-w-0">
            <legend className={styles.label}>País del teléfono</legend>
            <div className={`mt-1 ${styles.segments.replace('grid-cols-3', 'grid-cols-2')}`}>
              {(['mx', 'international'] as const).map((mode) => (
                <label key={mode} className={styles.segment}>
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
          {input('phone')}
          <details
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            className="rounded-xl border border-line bg-surface px-4"
          >
            <summary className="flex min-h-12 cursor-pointer items-center font-bold text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Más datos (opcional): ciudad, Instagram, nivel
            </summary>
            <div className="flex flex-col gap-4 pb-4">
              {input('city')}
              {input('instagram')}
              {input('level')}
              {input('birthDate')}
            </div>
          </details>
          <div className="flex flex-col-reverse gap-3 border-t border-row pt-5 sm:flex-row sm:justify-end">
            <Link
              to={listsPath}
              className={buttonClass('secondary', 'inline-flex items-center justify-center')}
            >
              Cancelar
            </Link>
            <button type="submit" disabled={sending} className={buttonClass('primary')}>
              {sending ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
        </form>
        <RegistrationDuplicatesDialog
          matches={duplicates?.matches ?? null}
          pending={sending}
          onCancel={() => setDuplicates(null)}
          onConfirm={() => duplicates && void send(duplicates.input, duplicates.matches)}
          onContinue={continueWith}
        />
      </div>
    </main>
  );
}
