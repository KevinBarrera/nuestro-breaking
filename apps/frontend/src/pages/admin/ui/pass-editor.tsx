import {
  passClasses,
  requiredPassClasses,
  type CatalogPassType,
  type NewPassTypeInput,
  type PassClass,
  type PassTypeActivity,
  type PassTypeInput,
  type RequiredPassClass,
} from '@/entities/event-catalog';
import {
  Breadcrumbs,
  CheckIcon,
  Modal,
  Select,
  UnsavedChangesGuard,
  buttonClass,
  type ChangeRow,
} from '@/shared/ui';
import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';
import { formatTimeRange } from './activity-agenda-model';
import { WarningIcon } from './activity-icons';
import { accessLabels, passClassLabels, styles } from './catalog-copy';
import { droppedLinks, type AccessChoice } from './pass-access-model';
import { isAccessRow } from './pass-changes';
import { saleLabel, saleOpen, soldLabel } from './pass-catalog-model';
import {
  accessCounter,
  accessDays,
  accessWarning,
  archiveBuyers,
  checkClose,
  closePresets,
  draftAccess,
  draftChangeRows,
  draftInput,
  filterAccessDays,
  isDraftDirty,
  passDraft,
  passPreview,
  priceNote,
  setDayAccess,
  type DraftErrors,
  type PassDraft,
} from './pass-editor-model';
import { InfoIcon } from './pass-list';
import { passListPath, usePassesContext, type SaveResult } from './passes-context';

type PassEditorProps =
  | {
      mode: 'new';
      // Resolves to whether the pass was created; the screen then moves to it.
      onCreate: (input: NewPassTypeInput) => Promise<boolean>;
    }
  | {
      mode: 'edit';
      passType: CatalogPassType;
      onSave: (
        input: PassTypeInput | null,
        access: PassTypeActivity[] | null,
      ) => Promise<SaveResult>;
      onArchive: () => Promise<boolean>;
    };

const classHelp: Record<PassClass, string> = {
  full: 'Da acceso a actividades. Es el pase de quien compite.',
  general: 'Solo la entrada al evento, sin actividades.',
  add_on: 'Se compra junto con un pase completo y suma actividades.',
};

// "Ninguno" stands for no required class (stored as ''), so it gets an explicit key.
const requiredOptions = [
  { id: 'none', label: 'Ninguno' },
  ...requiredPassClasses.map((value) => ({ id: value, label: passClassLabels[value] })),
];

const sectionClass = 'min-w-0 space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6';
const chipClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input-line bg-surface px-3.5 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-chip-selected aria-pressed:bg-chip-selected aria-pressed:text-chip-selected-fg aria-pressed:hover:bg-chip-selected';

// The create and edit screens share this editor: the fields and the access live in one draft,
// so an edit is reviewed and saved once. A new pass saves directly with "Crear pase".
export function PassEditor(props: PassEditorProps) {
  const context = usePassesContext();
  const { eventId, timeZone, eventWindow, activities, busy, notices } = context;
  const passType = props.mode === 'edit' ? props.passType : undefined;
  const start = passDraft(passType, timeZone, eventWindow);
  const [draft, setDraft] = useState<PassDraft>(start);
  const [tried, setTried] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const days = accessDays(activities, timeZone);
  const result = draftInput(draft, timeZone, eventWindow);
  const errors: DraftErrors = tried && !result.ok ? result.errors : {};
  const rows: ChangeRow[] | null =
    passType && result.ok
      ? draftChangeRows(passType, result.input, draft.choices, days, activities, timeZone)
      : null;
  // An edit counts its changes once the draft reads as valid; until then any edit shows the bar.
  const dirty = rows ? rows.length > 0 : isDraftDirty(start, draft);
  const sold = passType && context.sold ? (context.sold.get(passType.id) ?? 0) : undefined;
  const title = passType ? passType.name : 'Nuevo pase';

  const update = (patch: Partial<PassDraft>) => setDraft((current) => ({ ...current, ...patch }));

  // After a save or a failure the notice under the title says what happened.
  function focusHeading() {
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function invalidFirst() {
    setTried(true);
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!result.ok) return invalidFirst();
    if (props.mode === 'edit') {
      if (rows && rows.length > 0) setReviewing(true);
      return;
    }
    // A successful create leaves this screen; the guard must not hold that navigation.
    setLeaving(true);
    const created = await props.onCreate({
      ...result.input,
      activities: draftAccess(days, draft.choices),
    });
    if (!created) {
      setLeaving(false);
      focusHeading();
    }
  }

  async function save() {
    if (props.mode !== 'edit' || !result.ok || !passType) return;
    const fieldsChanged = passFieldsChanged(rows ?? []);
    const access = draftAccess(days, draft.choices);
    const accessChanged = (rows ?? []).some(isAccessRow);
    const saved = await props.onSave(
      fieldsChanged ? result.input : null,
      accessChanged ? access : null,
    );
    setReviewing(false);
    if (saved.status === 'saved') {
      setDraft(passDraft(saved.passType, timeZone, eventWindow));
      setTried(false);
    } else if (saved.status === 'partial') {
      // The fields are saved; the access edits stay for another try.
      setDraft({ ...passDraft(saved.passType, timeZone, eventWindow), choices: draft.choices });
    }
    focusHeading();
  }

  async function archive() {
    if (props.mode !== 'edit') return;
    setLeaving(true);
    if (!(await props.onArchive())) {
      setLeaving(false);
      setArchiving(false);
      focusHeading();
    }
  }

  const priceRow = rows?.some((row) => row.key === 'price');

  return (
    <>
      <header className="space-y-3">
        <Breadcrumbs items={[{ label: 'Pases', to: passListPath(eventId) }, { label: title }]} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-extrabold tracking-tight break-words text-heading outline-none"
          >
            {title}
          </h1>
          {passType && <EditStatus passType={passType} sold={sold} />}
        </div>
      </header>
      {notices}
      <form
        ref={formRef}
        aria-label={passType ? 'Editar pase' : 'Nuevo pase'}
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <div className="@container">
          <div className="grid items-start gap-6 @min-[980px]:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-5">
              <PassFields draft={draft} errors={errors} editing={!!passType} onChange={update} />
              <AccessSection draft={draft} passType={passType} days={days} onChange={update} />
              {passType && (
                <section
                  aria-labelledby="pass-archive"
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-line bg-surface p-5 sm:p-6"
                >
                  <div className="min-w-0 flex-[1_1_320px] space-y-1">
                    <h2 id="pass-archive" className="text-lg font-bold text-heading">
                      Archivar pase
                    </h2>
                    <p className="text-sm text-muted">
                      Deja de venderse en línea y en mesa. Quien ya lo compró lo conserva. Puedes
                      restaurarlo desde Archivados.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.secondary}
                    onClick={() => setArchiving(true)}
                  >
                    Archivar pase
                  </button>
                </section>
              )}
            </div>
            <PassPreviewCard draft={draft} />
          </div>
        </div>
        {(passType ? dirty : true) && (
          <div
            role="region"
            aria-label={passType ? 'Cambios sin guardar' : 'Crear pase'}
            // The bar spans the whole content column, flush with its bottom edge: 100cqw is the
            // width of the page's <main> (the nearest container), and the negative margins
            // cancel its padding.
            className="sticky bottom-0 z-10 mx-[calc(50%-50cqw-1rem)] mt-8 -mb-8 border-t border-input-line bg-surface px-4 py-3 sm:mx-[calc(50%-50cqw-2rem)] sm:px-8 lg:-mb-16"
          >
            <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-3">
              {passType ? (
                <>
                  <p className="flex flex-[1_1_220px] items-center gap-2.5 text-sm font-semibold">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-link" />
                    {rows ? (
                      <span>
                        <span className="font-mono font-medium">{rows.length}</span>{' '}
                        {rows.length === 1 ? 'cambio' : 'cambios'} sin guardar
                      </span>
                    ) : (
                      <span>Cambios sin guardar</span>
                    )}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.secondary}
                    onClick={() => {
                      setDraft(start);
                      setTried(false);
                    }}
                  >
                    Descartar
                  </button>
                  <button type="submit" disabled={busy} className={styles.primary}>
                    Revisar cambios
                  </button>
                </>
              ) : (
                <>
                  <p className="flex-[1_1_220px] text-sm font-semibold">
                    El pase queda en venta al crearlo.
                  </p>
                  <Link
                    to={passListPath(eventId)}
                    className={`${styles.secondary} inline-flex items-center`}
                  >
                    Cancelar
                  </Link>
                  <button type="submit" disabled={busy} className={styles.primary}>
                    {busy ? 'Creando…' : 'Crear pase'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </form>
      {reviewing && rows && (
        <ReviewDialog
          name={draft.name.trim()}
          rows={rows}
          note={priceRow ? priceNote(sold) : null}
          busy={busy}
          onCancel={() => setReviewing(false)}
          onConfirm={() => void save()}
        />
      )}
      {archiving && passType && (
        <Modal
          role="alertdialog"
          layout="sectioned"
          title={`¿Archivar ${passType.name}?`}
          description={[
            'Ya no se podrá asignar a nuevas inscripciones: deja de venderse en línea y en mesa.',
            archiveBuyers(sold),
          ]
            .filter(Boolean)
            .join(' ')}
          isOpen
          onOpenChange={(open) => !open && !busy && setArchiving(false)}
          isKeyboardDismissDisabled={busy}
          actions={
            <>
              <Button
                className={buttonClass('secondary')}
                isDisabled={busy}
                onPress={() => setArchiving(false)}
              >
                Cancelar
              </Button>
              <Button
                className={buttonClass('primary')}
                isDisabled={busy}
                onPress={() => void archive()}
              >
                {busy ? 'Archivando…' : 'Archivar'}
              </Button>
            </>
          }
        />
      )}
      <UnsavedChangesGuard when={dirty && !busy && !leaving} />
    </>
  );
}

const passFieldsChanged = (rows: ChangeRow[]) => rows.some((row) => !isAccessRow(row));

function EditStatus({ passType, sold }: { passType: CatalogPassType; sold: number | undefined }) {
  const { sales } = usePassesContext();
  // The pill compares the close date with the time the screen opened.
  const [now] = useState(() => Date.now());
  const open = saleOpen(passType, sales, now);
  return (
    <>
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
          open ? 'border-success-fg bg-success text-success-fg' : 'border-line bg-row text-muted'
        }`}
      >
        {saleLabel(open)}
      </span>
      {sold !== undefined && (
        <span className="text-sm text-muted">
          <span className="font-mono font-medium text-heading">{sold}</span> {soldLabel(sold)}
        </span>
      )}
    </>
  );
}

type FieldsProps = {
  draft: PassDraft;
  errors: DraftErrors;
  editing: boolean;
  onChange: (patch: Partial<PassDraft>) => void;
};

function PassFields({ draft, errors, editing, onChange }: FieldsProps) {
  const { timeZone, eventWindow, busy } = usePassesContext();
  const id = useId();
  const presets = closePresets(eventWindow, timeZone);
  const close = checkClose(draft, timeZone, eventWindow);
  const closeError = errors.close !== undefined;
  return (
    <section aria-labelledby={`${id}-datos`} className={sectionClass}>
      <h2 id={`${id}-datos`} className="text-lg font-bold text-heading">
        Datos del pase
      </h2>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className={styles.label}>
          Nombre
        </label>
        <input
          id={`${id}-name`}
          className={`${errors.name ? styles.fieldInvalid : styles.field} mt-0`}
          value={draft.name}
          maxLength={200}
          autoComplete="off"
          placeholder="Ej. Pase completo Breaking"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={`${id}-name-hint`}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <p
          id={`${id}-name-hint`}
          className={`text-sm ${errors.name ? 'font-semibold text-danger-fg' : 'text-muted'}`}
        >
          {errors.name ?? 'Así aparece en la página de compra, el recibo y Check-in.'}
        </p>
      </div>

      <OptionCards
        legend="Clase"
        name={`${id}-class`}
        value={draft.passClass}
        options={passClasses.map((value) => ({
          value,
          label: passClassLabels[value],
          help: classHelp[value],
        }))}
        onChange={(value) => onChange({ passClass: value })}
      />

      {draft.passClass === 'add_on' && (
        <div className="max-w-[320px]">
          <Select
            label="Requiere pase"
            options={requiredOptions}
            selectedKey={draft.requires || 'none'}
            onSelectionChange={(key) =>
              onChange({ requires: key === 'none' ? '' : (key as RequiredPassClass) })
            }
          />
          <p className="mt-1 text-sm text-muted">
            Qué pase hay que tener para poder comprar este adicional.
          </p>
        </div>
      )}

      <div className="max-w-[320px] space-y-1.5">
        <label htmlFor={`${id}-price`} className={styles.label}>
          Precio
        </label>
        <div
          className={`flex min-h-11 items-center gap-1.5 rounded-lg border bg-input px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
            errors.price ? 'border-danger-fg' : 'border-input-line'
          }`}
        >
          <span aria-hidden="true" className="font-mono font-medium text-muted">
            $
          </span>
          <input
            id={`${id}-price`}
            className="min-h-11 min-w-0 flex-1 bg-transparent font-mono text-base font-medium text-fg outline-none placeholder:text-muted"
            value={draft.price}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={`${id}-price-hint`}
            onChange={(event) => onChange({ price: event.target.value })}
          />
          <span aria-hidden="true" className="text-muted">
            MXN
          </span>
        </div>
        <p
          id={`${id}-price-hint`}
          className={`text-sm ${errors.price ? 'font-semibold text-danger-fg' : 'text-muted'}`}
        >
          {errors.price ??
            (editing
              ? 'Cambiar el precio no afecta lo ya vendido.'
              : 'Usa 0 para un pase sin costo, como una cortesía.')}
        </p>
      </div>

      <div className="space-y-3">
        <OptionCards
          legend="Venta en línea"
          name={`${id}-sale`}
          value={draft.closes ? 'date' : 'event'}
          options={[
            {
              value: 'event',
              label: 'Mientras el evento venda',
              help: 'Sigue el periodo de venta del evento (Resumen › Venta en línea).',
            },
            {
              value: 'date',
              label: 'Hasta una fecha',
              help: 'Para preventas o precios de lanzamiento.',
            },
          ]}
          wide
          onChange={(value) => onChange({ closes: value === 'date' })}
        />
        {draft.closes ? (
          <div className="space-y-3.5 rounded-lg bg-surface-inner p-4">
            {presets.length > 0 && (
              <div className="space-y-1.5">
                <p id={`${id}-presets`} className="text-[13px] font-semibold text-muted">
                  Atajos
                </p>
                <div
                  role="group"
                  aria-labelledby={`${id}-presets`}
                  className="flex flex-wrap gap-2"
                >
                  {presets.map((preset) => {
                    const on = draft.closeDay === preset.day && draft.closeTime === preset.time;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={on}
                        disabled={busy}
                        className={chipClass}
                        onClick={() => onChange({ closeDay: preset.day, closeTime: preset.time })}
                      >
                        {on && <CheckIcon />}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid max-w-[420px] grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
              <label className={styles.label}>
                Día
                <input
                  type="date"
                  className={`${closeError || (close.kind === 'ok' && close.afterEvent) ? styles.fieldInvalid : styles.field} font-mono`}
                  value={draft.closeDay}
                  aria-invalid={closeError ? true : undefined}
                  aria-describedby={`${id}-close`}
                  onChange={(event) => onChange({ closeDay: event.target.value })}
                />
              </label>
              <label className={styles.label}>
                Hora
                <span
                  className={`mt-1 flex min-h-11 items-center gap-1.5 rounded-lg border bg-input px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
                    closeError ? 'border-danger-fg' : 'border-input-line'
                  }`}
                >
                  <input
                    className="min-h-11 w-full min-w-0 bg-transparent font-mono text-base font-medium text-fg outline-none placeholder:text-muted"
                    value={draft.closeTime}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={5}
                    placeholder="23:59"
                    aria-invalid={closeError ? true : undefined}
                    aria-describedby={`${id}-close`}
                    onChange={(event) => onChange({ closeTime: event.target.value })}
                  />
                  <span
                    aria-hidden="true"
                    className="text-[13px] font-normal whitespace-nowrap text-muted"
                  >
                    24 h
                  </span>
                </span>
              </label>
            </div>
            <p
              id={`${id}-close`}
              role="status"
              className={`flex items-start gap-2 text-sm ${
                closeError
                  ? 'font-semibold text-danger-fg'
                  : close.kind === 'ok' && close.afterEvent
                    ? 'text-warning-fg'
                    : 'text-fg'
              }`}
            >
              <ClockIcon />
              {close.kind === 'ok' ? (
                <span>
                  <b>{close.sentence}</b> {close.note}
                </span>
              ) : (
                <span>
                  <b>{close.kind === 'invalid' ? close.message : ''}</b>
                </span>
              )}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">En mesa se sigue vendiendo durante el evento.</p>
        )}
      </div>
    </section>
  );
}

type OptionCardsProps<T extends string> = {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; help: string }[];
  // Two wider cards instead of three.
  wide?: boolean;
  onChange: (value: T) => void;
};

// Radio cards: each option is a card around a visually hidden radio named by its label and
// described by its one-line meaning, so arrow keys move between them.
function OptionCards<T extends string>({
  legend,
  name,
  value,
  options,
  wide = false,
  onChange,
}: OptionCardsProps<T>) {
  const id = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-fg">{legend}</legend>
      <div
        className={`grid gap-3 ${wide ? 'grid-cols-[repeat(auto-fit,minmax(240px,1fr))]' : 'grid-cols-[repeat(auto-fit,minmax(180px,1fr))]'}`}
      >
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={`relative flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border bg-surface p-3.5 hover:bg-surface-inner has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${
                checked
                  ? 'border-link shadow-[inset_0_0_0_1px_var(--color-link)]'
                  : 'border-input-line'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                aria-labelledby={`${id}-${option.value}`}
                aria-describedby={`${id}-${option.value}-help`}
                onChange={() => onChange(option.value)}
                className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-lg"
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  checked ? 'border-link' : 'border-input-line'
                }`}
              >
                {checked && <span className="size-2.5 rounded-full bg-link" />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span id={`${id}-${option.value}`} className="text-[15px] font-bold text-heading">
                  {option.label}
                </span>
                <span id={`${id}-${option.value}-help`} className="text-[13px] text-muted">
                  {option.help}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const legend: { access: string; label: string; help: string }[] = [
  { access: 'none', label: 'Sin acceso', help: 'No aparece en este pase.' },
  { access: 'selectable', label: 'Elegible', help: 'La persona puede escogerla al comprar.' },
  { access: 'included', label: 'Incluida', help: 'Viene con el pase, sin escoger.' },
];

const accessOptions: { id: AccessChoice; label: string }[] = [
  { id: 'none', label: 'Sin acceso' },
  { id: 'selectable', label: accessLabels.selectable },
  { id: 'included', label: accessLabels.included },
];

// Sin acceso is light, Elegible a dark indigo fill and Incluida the magenta primary, and the
// checked one adds a check icon, so the three differ in lightness and icon, not hue alone.
const accessTone: Record<AccessChoice, string> = {
  none: 'has-checked:bg-row has-checked:text-fg',
  selectable: 'has-checked:bg-chip-selected has-checked:text-chip-selected-fg',
  included: 'has-checked:bg-primary has-checked:text-primary-fg',
};

type AccessSectionProps = {
  draft: PassDraft;
  passType: CatalogPassType | undefined;
  days: ReturnType<typeof accessDays>;
  onChange: (patch: Partial<PassDraft>) => void;
};

function AccessSection({ draft, passType, days, onChange }: AccessSectionProps) {
  const { timeZone, busy } = usePassesContext();
  const id = useId();
  const [query, setQuery] = useState('');
  const [onlyWithAccess, setOnlyWithAccess] = useState(false);
  const shown = filterAccessDays(days, draft.choices, query, onlyWithAccess);
  const warning = accessWarning(draft.passClass, days, draft.choices);
  const dropped = passType ? droppedLinks(passType.activities, days) : 0;
  const setChoices = (choices: PassDraft['choices']) => onChange({ choices });

  return (
    <section aria-labelledby={`${id}-title`} className={`${sectionClass} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-title`} className="text-lg font-bold text-heading">
          Acceso a actividades
        </h2>
        {days.length > 0 && (
          <p role="status" className="text-sm font-semibold">
            {accessCounter(days, draft.choices)}
          </p>
        )}
      </div>
      {days.length === 0 ? (
        <p className="text-muted">No hay actividades activas en este evento.</p>
      ) : (
        <>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 text-[13px]">
            {legend.map((entry) => (
              <div key={entry.access} className="rounded-lg bg-surface-inner px-3 py-2.5">
                <dt className="font-bold">{entry.label}</dt>
                <dd className="text-muted">{entry.help}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-lg border border-input-line bg-input px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
              <SearchIcon />
              <span className="sr-only">Buscar actividad</span>
              <input
                type="search"
                placeholder="Buscar actividad"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-muted"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              aria-pressed={onlyWithAccess}
              className={chipClass}
              onClick={() => setOnlyWithAccess((value) => !value)}
            >
              {onlyWithAccess && <CheckIcon />}
              Solo con acceso
            </button>
          </div>
          {shown.map((day) => {
            const headingId = `${id}-${day.key}`;
            const full = days.find((entry) => entry.key === day.key) ?? day;
            return (
              <div key={day.key} role="group" aria-labelledby={headingId}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-1">
                  <h3 id={headingId} className="text-[15px] font-bold text-heading">
                    {day.label}
                  </h3>
                  <div className="flex gap-1">
                    <DayAction
                      label="Todas elegibles"
                      describedBy={headingId}
                      busy={busy}
                      onClick={() => setChoices(setDayAccess(full, draft.choices, 'selectable'))}
                    />
                    <DayAction
                      label="Quitar acceso"
                      describedBy={headingId}
                      busy={busy}
                      onClick={() => setChoices(setDayAccess(full, draft.choices, 'none'))}
                    />
                  </div>
                </div>
                <ul className="divide-y divide-line">
                  {day.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="grid grid-cols-1 items-center gap-x-4 gap-y-2 py-2.5 @min-[560px]:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[15px] font-semibold break-words">
                          {activity.name}
                        </span>
                        <span className="font-mono text-[13px] text-muted">
                          {formatTimeRange(activity, timeZone)}
                        </span>
                      </span>
                      <AccessControl
                        activityName={activity.name}
                        choice={draft.choices[activity.id] ?? 'none'}
                        busy={busy}
                        onChange={(choice) =>
                          setChoices({ ...draft.choices, [activity.id]: choice })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {shown.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">
              {onlyWithAccess && !query.trim()
                ? 'Este pase todavía no da acceso a ninguna actividad.'
                : 'Ninguna actividad coincide con la búsqueda.'}
            </p>
          )}
          {warning && (
            <p className="flex items-start gap-2.5 rounded-lg border border-warning-fg bg-warning px-3.5 py-3 text-sm text-warning-fg">
              <span className="mt-px shrink-0">
                <WarningIcon size={18} />
              </span>
              {warning}
            </p>
          )}
        </>
      )}
      {dropped > 0 && (
        <p className="text-sm text-warning-fg">
          {dropped === 1
            ? 'Este pase tiene 1 actividad archivada vinculada; se quitará al guardar el acceso, porque solo se pueden asignar actividades activas.'
            : `Este pase tiene ${dropped} actividades archivadas vinculadas; se quitarán al guardar el acceso, porque solo se pueden asignar actividades activas.`}
        </p>
      )}
    </section>
  );
}

function DayAction({
  label,
  describedBy,
  busy,
  onClick,
}: {
  label: string;
  describedBy: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      aria-describedby={describedBy}
      onClick={onClick}
      className="min-h-11 rounded-lg px-2 text-[13px] font-semibold text-link underline underline-offset-[3px] hover:text-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50"
    >
      {label}
    </button>
  );
}

type AccessControlProps = {
  activityName: string;
  choice: AccessChoice;
  busy: boolean;
  onChange: (choice: AccessChoice) => void;
};

// Sin acceso / Elegible / Incluida as one radio group named after the activity, so arrow keys
// move between the three options.
function AccessControl({ activityName, choice, busy, onChange }: AccessControlProps) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={`Acceso a ${activityName}`}
      className="grid grid-cols-3 gap-0.5 rounded-lg border border-input-line bg-input p-[3px] @min-[560px]:w-[312px]"
    >
      {accessOptions.map((option) => (
        <label
          key={option.id}
          className={`relative flex min-h-11 items-center justify-center gap-1 rounded-md px-2.5 text-[13px] font-semibold text-fg hover:bg-row has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-disabled:cursor-wait has-disabled:opacity-50 ${accessTone[option.id]}`}
        >
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={choice === option.id}
            disabled={busy}
            onChange={() => onChange(option.id)}
            className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-md disabled:cursor-wait"
          />
          {choice === option.id && option.id !== 'none' && <CheckIcon />}
          {option.label}
        </label>
      ))}
    </div>
  );
}

function PassPreviewCard({ draft }: { draft: PassDraft }) {
  const { activities, timeZone, eventWindow } = usePassesContext();
  const preview = passPreview(draft, accessDays(activities, timeZone), timeZone, eventWindow);
  return (
    <aside
      aria-labelledby="pass-preview"
      className="min-w-0 space-y-2.5 @min-[980px]:sticky @min-[980px]:top-6"
    >
      <h2 id="pass-preview" className="px-1 text-sm font-semibold text-muted">
        Así se ve en la página de compra
      </h2>
      <div className="space-y-3.5 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-muted">{preview.classLabel}</span>
          <span
            className={`text-xl font-extrabold break-words ${preview.named ? 'text-heading' : 'text-muted'}`}
          >
            {preview.name}
          </span>
          <span className="font-mono text-2xl font-medium text-heading">{preview.price}</span>
        </div>
        {preview.requires && (
          <span className="inline-flex rounded-full border border-line bg-row px-2.5 py-0.5 text-xs font-semibold text-heading">
            {preview.requires}
          </span>
        )}
        {preview.included.length > 0 && (
          <PreviewBlock title="Incluye">
            <ul className="space-y-1">
              {preview.included.map((name) => (
                <li key={name} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-success-fg">
                    <CheckIcon />
                  </span>
                  {name}
                </li>
              ))}
            </ul>
          </PreviewBlock>
        )}
        {preview.selectableTitle && (
          <PreviewBlock title={preview.selectableTitle}>
            <p className="text-muted">{preview.selectable}</p>
          </PreviewBlock>
        )}
        {preview.empty && <p className="text-sm text-muted">{preview.empty}</p>}
        <p className="border-t border-line pt-3 text-[13px] text-muted">{preview.sale}</p>
      </div>
    </aside>
  );
}

function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 text-sm">
      <p className="font-bold">{title}</p>
      {children}
    </div>
  );
}

type ReviewDialogProps = {
  name: string;
  rows: ChangeRow[];
  note: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

// One review for the fields and the access; "Volver a editar" keeps the draft.
function ReviewDialog({ name, rows, note, busy, onCancel, onConfirm }: ReviewDialogProps) {
  return (
    <Modal
      layout="sectioned"
      size="lg"
      title="Revisa los cambios"
      description={`${name} · se guardan juntos, datos y acceso.`}
      isOpen
      onOpenChange={(open) => !open && !busy && onCancel()}
      isKeyboardDismissDisabled={busy}
      actions={
        <>
          <Button className={buttonClass('secondary')} isDisabled={busy} onPress={onCancel}>
            Volver a editar
          </Button>
          <Button className={buttonClass('primary')} isDisabled={busy} onPress={onConfirm}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <dl className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-1 gap-x-3 gap-y-1 px-3.5 py-3 text-sm sm:grid-cols-[minmax(96px,0.8fr)_minmax(0,1.6fr)]"
          >
            <dt className="text-muted">{row.label}</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <span className={`text-muted line-through ${row.key === 'price' ? 'font-mono' : ''}`}>
                <span className="sr-only">Antes: </span>
                {row.before}
              </span>
              <ArrowRight />
              <span className={`font-bold ${row.key === 'price' ? 'font-mono' : ''}`}>
                <span className="sr-only">Después: </span>
                {row.after}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="mt-4 flex items-start gap-2.5 rounded-lg bg-surface-inner px-3.5 py-3 text-sm">
          <InfoIcon />
          {note}
        </p>
      )}
    </Modal>
  );
}

const svg = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ClockIcon = () => (
  <svg {...svg} width="18" height="18" className="mt-px shrink-0">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6v4l2.5 2" />
  </svg>
);

const SearchIcon = () => (
  <svg {...svg} width="16" height="16" className="shrink-0 text-muted">
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13 13l4 4" />
  </svg>
);

const ArrowRight = () => (
  <svg {...svg} width="16" height="16" className="shrink-0 text-muted">
    <path d="M4 10h12M11 5l5 5-5 5" />
  </svg>
);
