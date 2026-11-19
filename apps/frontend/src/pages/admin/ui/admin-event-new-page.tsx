import { adminEventFailure, createEvent } from '@/entities/admin-event';
import { useSessionStore } from '@/entities/session';
import { routes } from '@/shared/config';
import {
  Breadcrumbs,
  FieldError,
  Notice,
  Select,
  TextField,
  UnsavedChangesGuard,
} from '@/shared/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { styles } from './catalog-copy';
import {
  countryOptions,
  createInput,
  emptyEventDraft,
  eventFieldOrder,
  eventServerErrors,
  sampleFolio,
  slugify,
  slugTakenMessage,
  slugHint,
  folioPrefixHint,
  FOLIO_PREFIX_MAX,
  timeZoneOptions,
  validateEvent,
  type EventDraft,
  type EventErrors,
} from './event-form-model';
import { eventFailureMessage } from './event-model';
import { LocationFields } from './location-fields';

const createDenied = 'Sin acceso: solo quien tiene acceso a todos los eventos puede crear eventos.';
const mayExistMessage =
  'Es posible que el evento sí se haya creado. Revisa la lista de eventos antes de intentarlo de nuevo.';

// Nuevo evento (#213): name, location (#322), address, folio prefix, time zone and optional dates, with a live
// preview of the purchase address and a sample folio. Global admins only. On success it opens
// the new event's overview, where the next steps (activities, passes, sales) start.
export function AdminEventNewPage() {
  const allowed = useSessionStore((state) => state.session.user?.globalAdmin === true);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EventDraft>(emptyEventDraft);
  // Once the address is edited by hand, the name no longer suggests it.
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<EventErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [mayExist, setMayExist] = useState(false);
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  // The address of a create whose answer was lost: a retry with it may get `slug_taken`
  // because that first create did go through.
  const unknownSlug = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // A field to focus once the form is enabled again after a refused request.
  const focusAfterSend = useRef<string | null>(null);
  const dirty = (Object.keys(draft) as (keyof EventDraft)[]).some(
    (field) => draft[field] !== emptyEventDraft[field],
  );

  const set = (changes: Partial<EventDraft>) =>
    setDraft((previous) => ({ ...previous, ...changes }));

  useEffect(() => {
    if (sending || !focusAfterSend.current) return;
    formRef.current?.querySelector<HTMLElement>(`input[name="${focusAfterSend.current}"]`)?.focus();
    focusAfterSend.current = null;
  }, [sending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const firstError = (found: EventErrors) => eventFieldOrder.find((field) => found[field]);
    const found = validateEvent(draft);
    setErrors(found);
    setFailure(null);
    setMayExist(false);
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLElement>(`input[name="${firstError(found)}"]`)?.focus();
      return;
    }
    pending.current = true;
    setSending(true);
    try {
      const created = await createEvent(createInput(draft));
      // Navigating before `sending` clears keeps the unsaved-changes guard off.
      void navigate(routes.adminEventOverview.replace(':eventId', created.id));
    } catch (error) {
      const reason = adminEventFailure(error);
      const sameSlug = unknownSlug.current === draft.slug;
      if (reason.kind === 'unknown') unknownSlug.current = draft.slug;
      if (
        reason.kind === 'unknown' ||
        (sameSlug && reason.kind === 'rule' && reason.code === 'slug_taken')
      ) {
        setMayExist(true);
        return;
      }
      if (reason.kind === 'rule' && reason.code === 'slug_taken') {
        setErrors({ slug: slugTakenMessage });
        focusAfterSend.current = 'slug';
        return;
      }
      if (reason.kind === 'invalid') {
        const fromServer = eventServerErrors(reason.fieldErrors);
        setErrors(fromServer);
        focusAfterSend.current = firstError(fromServer) ?? null;
      }
      setFailure(eventFailureMessage(reason));
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  return (
    <main className="px-4 py-8 text-fg sm:px-8">
      <div className="mx-auto max-w-[760px] space-y-6">
        <Breadcrumbs
          variant="link"
          items={[{ label: 'Eventos', to: routes.admin }, { label: 'Nuevo evento' }]}
        />
        <header className="space-y-1.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Nuevo evento</h1>
          <p className="text-muted">
            Lo indispensable para empezar. Actividades, pases y venta se configuran después.
          </p>
        </header>
        {!allowed ? (
          <p
            role="alert"
            className="rounded-lg border border-warning-fg bg-warning p-4 text-warning-fg"
          >
            {createDenied}
          </p>
        ) : (
          <form
            ref={formRef}
            aria-label="Nuevo evento"
            noValidate
            onSubmit={(event) => void submit(event)}
            className="rounded-xl border border-line bg-surface"
          >
            <UnsavedChangesGuard when={dirty && !sending} />
            <div className="space-y-6 px-5 pt-7 pb-2 sm:px-7">
              {failure && <Notice tone="danger">{failure}</Notice>}
              {mayExist && (
                <Notice tone="danger">
                  {mayExistMessage}{' '}
                  <Link
                    to={routes.admin}
                    className="inline-flex min-h-11 items-center font-bold underline"
                  >
                    Ir a Eventos
                  </Link>
                </Notice>
              )}
              <h2 className="text-lg font-bold text-heading">Datos generales</h2>
              <TextField
                label="Nombre del evento"
                name="name"
                autoComplete="off"
                placeholder="Ej. Los más pesados 2027"
                hint="Así aparece en el panel, en la página de compra y en los correos."
                hintPlacement="below"
                value={draft.name}
                error={errors.name}
                disabled={sending}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  set(slugEdited ? { name } : { name, slug: slugify(name) });
                }}
              />
              <LocationFields
                value={draft}
                errors={errors}
                countries={countryOptions}
                locked={sending}
                lockMode="disabled"
                onChange={set}
              />
              <div>
                <Select
                  label="Zona horaria"
                  name="timeZone"
                  options={timeZoneOptions}
                  selectedKey={draft.timeZone}
                  onSelectionChange={(timeZone) => set({ timeZone })}
                  isDisabled={sending}
                />
                <p className="mt-1 text-sm text-muted">
                  Los horarios del evento se muestran en esta zona.
                </p>
                {errors.timeZone && <FieldError>{errors.timeZone}</FieldError>}
              </div>
              {/* `min-w-0`: a fieldset defaults to its content width, and datetime inputs are wide. */}
              <fieldset className="min-w-0 space-y-3">
                <legend className="text-sm font-semibold text-fg">
                  Fechas del evento <span className="font-normal text-muted">(opcional)</span>
                </legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    label="Inicio"
                    name="startsAt"
                    type="datetime-local"
                    inputClassName="font-mono"
                    value={draft.startsAt}
                    error={errors.startsAt}
                    disabled={sending}
                    onChange={(event) => set({ startsAt: event.currentTarget.value })}
                  />
                  <TextField
                    label="Fin"
                    name="endsAt"
                    type="datetime-local"
                    inputClassName="font-mono"
                    value={draft.endsAt}
                    error={errors.endsAt}
                    disabled={sending}
                    onChange={(event) => set({ endsAt: event.currentTarget.value })}
                  />
                </div>
                <p className="text-sm text-muted">
                  Llena las dos o déjalas vacías y defínelas cuando la agenda esté confirmada.
                </p>
              </fieldset>
            </div>
            <PermanentIdentifiers
              draft={draft}
              errors={errors}
              sending={sending}
              onSlug={(slug) => {
                setSlugEdited(true);
                set({ slug });
              }}
              onFolioPrefix={(folioPrefix) => set({ folioPrefix })}
            />
            <p className="mx-5 mt-5 flex items-start gap-2.5 text-sm text-fg sm:mx-7">
              <InfoIcon />
              El evento se crea con la venta en línea cerrada. La abres desde el resumen cuando el
              catálogo esté listo.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
              <Link
                to={routes.admin}
                className={`${styles.secondary} inline-flex items-center justify-center bg-surface`}
              >
                Cancelar
              </Link>
              <button type="submit" disabled={sending} className={styles.primary}>
                {sending ? 'Creando evento…' : 'Crear evento'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

type PermanentIdentifiersProps = {
  draft: EventDraft;
  errors: EventErrors;
  sending: boolean;
  onSlug: (slug: string) => void;
  onFolioPrefix: (prefix: string) => void;
};

// "Identificadores permanentes": the address and folio prefix are suggested from the name and
// fixed once the event exists, with a sample folio built from the prefix.
function PermanentIdentifiers({
  draft,
  errors,
  sending,
  onSlug,
  onFolioPrefix,
}: PermanentIdentifiersProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="mx-5 mt-6 space-y-5 rounded-xl border border-line bg-surface-inner p-5 sm:mx-7 sm:p-6"
    >
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip text-heading"
        >
          <LockIcon />
        </span>
        <div className="space-y-0.5">
          <h2 id={titleId} className="text-lg font-bold text-heading">
            Identificadores permanentes
          </h2>
          <p className="text-sm text-muted">
            Se sugieren a partir del nombre. No se pueden cambiar después: la dirección puede estar
            ya compartida y los folios emitidos usan el prefijo.
          </p>
        </div>
      </div>
      <TextField
        label="Dirección de la página de compra"
        name="slug"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        prefix="/e/"
        placeholder="los-mas-pesados-2027"
        inputClassName="font-mono"
        hint={slugHint}
        hintPlacement="below"
        value={draft.slug}
        error={errors.slug}
        disabled={sending}
        onChange={(event) => onSlug(event.currentTarget.value)}
      />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <TextField
          className="flex-[0_1_200px]"
          label="Prefijo de folio"
          name="folioPrefix"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={FOLIO_PREFIX_MAX}
          placeholder="LMP27"
          inputClassName="font-mono"
          hint={folioPrefixHint}
          hintPlacement="below"
          value={draft.folioPrefix}
          error={errors.folioPrefix}
          disabled={sending}
          onChange={(event) => onFolioPrefix(event.currentTarget.value.toUpperCase())}
        />
        <SampleFolio prefix={draft.folioPrefix} />
      </div>
    </section>
  );
}

function SampleFolio({ prefix }: { prefix: string }) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 text-sm">
      <span id={labelId} className="font-semibold text-fg">
        Así se verá un folio
      </span>
      <output
        aria-labelledby={labelId}
        aria-live="off"
        className="flex min-h-11 items-center gap-2.5 rounded-lg border border-dashed border-input-line bg-surface px-3.5"
      >
        <TicketIcon />
        <span
          className={`font-mono text-base font-medium break-all ${prefix ? 'text-heading' : 'text-muted'}`}
        >
          {sampleFolio(prefix)}
        </span>
      </output>
      <span className="text-muted">Aparece en los recibos y en el check-in.</span>
    </div>
  );
}

const iconProps = {
  'aria-hidden': true,
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'shrink-0',
} as const;

const LockIcon = () => (
  <svg {...iconProps}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </svg>
);

const InfoIcon = () => (
  <svg {...iconProps} className="mt-px shrink-0">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v4.5M10 6.5v.01" />
  </svg>
);

const TicketIcon = () => (
  <svg {...iconProps} className="shrink-0 text-muted">
    <path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 17 6.5v1.8a1.8 1.8 0 0 0 0 3.4v1.8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 13.5v-1.8a1.8 1.8 0 0 0 0-3.4z" />
  </svg>
);
