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
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { styles } from './catalog-copy';
import {
  createInput,
  emptyEventDraft,
  eventFieldOrder,
  eventServerErrors,
  previewUrl,
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

const createDenied = 'Sin acceso: solo quien tiene acceso a todos los eventos puede crear eventos.';
const mayExistMessage =
  'Es posible que el evento sí se haya creado. Revisa la lista de eventos antes de intentarlo de nuevo.';

// Nuevo evento (#213): name, address, folio prefix, time zone and optional dates, with a live
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
    <main className="px-4 py-8 text-fg sm:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <Breadcrumbs
          variant="link"
          items={[{ label: 'Eventos', to: routes.admin }, { label: 'Nuevo evento' }]}
        />
        <header className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Nuevo evento</h1>
          <p className="max-w-2xl text-muted">
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <UnsavedChangesGuard when={dirty && !sending} />
            <form
              ref={formRef}
              aria-label="Nuevo evento"
              noValidate
              onSubmit={(event) => void submit(event)}
              className={`${styles.card} space-y-6 sm:p-8`}
            >
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
              <TextField
                label="Nombre del evento"
                name="name"
                autoComplete="off"
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
              <TextField
                label="Dirección de la página de compra"
                name="slug"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                prefix={`${window.location.host}/e/`}
                hint={slugHint}
                hintPlacement="below"
                value={draft.slug}
                error={errors.slug}
                disabled={sending}
                onChange={(event) => {
                  setSlugEdited(true);
                  set({ slug: event.currentTarget.value });
                }}
              />
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:items-start">
                <TextField
                  label="Prefijo de folio"
                  name="folioPrefix"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={FOLIO_PREFIX_MAX}
                  hint={folioPrefixHint}
                  hintPlacement="below"
                  value={draft.folioPrefix}
                  error={errors.folioPrefix}
                  disabled={sending}
                  onChange={(event) =>
                    set({ folioPrefix: event.currentTarget.value.toUpperCase() })
                  }
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
                    value={draft.startsAt}
                    error={errors.startsAt}
                    disabled={sending}
                    onChange={(event) => set({ startsAt: event.currentTarget.value })}
                  />
                  <TextField
                    label="Fin"
                    name="endsAt"
                    type="datetime-local"
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
              <p className="rounded-xl bg-surface-inner p-4 text-sm text-fg">
                El evento se crea con la venta en línea cerrada. La abres desde el resumen del
                evento cuando el catálogo esté listo.
              </p>
              <div className="flex flex-col-reverse gap-3 border-t border-row pt-5 sm:flex-row sm:justify-end">
                <Link
                  to={routes.admin}
                  className={`${styles.secondary} inline-flex items-center justify-center`}
                >
                  Cancelar
                </Link>
                <button type="submit" disabled={sending} className={styles.primary}>
                  {sending ? 'Creando evento…' : 'Crear evento'}
                </button>
              </div>
            </form>
            <EventPreview slug={draft.slug} folioPrefix={draft.folioPrefix} />
          </div>
        )}
      </div>
    </main>
  );
}

// "Así se verá": what the address and prefix will look like once the event exists.
function EventPreview({ slug, folioPrefix }: { slug: string; folioPrefix: string }) {
  return (
    <aside aria-label="Vista previa" className="space-y-4">
      <div className={`${styles.card} space-y-4`}>
        <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Así se verá</p>
        <dl className="space-y-4">
          <div className="space-y-1">
            <dt className="text-sm font-semibold text-fg">Página de compra</dt>
            <dd className="font-mono text-sm break-all text-heading">
              {previewUrl(window.location.origin, slug)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm font-semibold text-fg">Folio de una inscripción confirmada</dt>
            <dd className="font-mono text-lg font-bold break-all text-heading">
              {sampleFolio(folioPrefix)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="space-y-2 rounded-xl bg-surface-inner p-5">
        <p className="text-sm font-bold text-fg">Qué se fija al crear</p>
        <p className="text-sm text-fg">
          La dirección y el prefijo no cambian: la dirección puede estar ya compartida y los folios
          emitidos usan ese prefijo. Nombre, zona horaria y fechas se pueden editar después.
        </p>
      </div>
    </aside>
  );
}
