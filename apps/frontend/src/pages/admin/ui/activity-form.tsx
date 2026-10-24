import type { CatalogVenue, WindowField } from '@/entities/event-catalog';
import { CheckboxField, CheckIcon, FieldError, Select } from '@/shared/ui';
import { type FormEvent, type Ref, useId } from 'react';
import {
  durationLabel,
  type ActivityDraft,
  type DayOption,
  type TimeCheck,
} from './activity-form-model';
import { PersonIcon, WarningIcon } from './activity-icons';
import { activityKindOptions, styles } from './catalog-copy';

type ActivityFormProps = {
  // Lets the dialog's footer buttons submit this form (`<button form={id}>`).
  id: string;
  // The form's accessible name; the surrounding dialog shows it as its title.
  title: string;
  draft: ActivityDraft;
  onChange: (patch: Partial<ActivityDraft>) => void;
  // The event days for "Día"; empty for an event without dates, which asks for a date.
  days: DayOption[];
  venues: CatalogVenue[];
  // Errors show after the first submit; a wrong time order shows right away.
  tried: boolean;
  times: TimeCheck;
  // Event-window messages for "Empieza" and "Termina", from the form's check or the server.
  windowMessages: Partial<Record<WindowField, string>>;
  // "Locking 3v3 (15:00–16:00)" when the times overlap another activity in the same venue.
  overlap: string;
  // The edit summary of inscritos and passes; empty when creating or unknown.
  summary: string;
  startRef: Ref<HTMLInputElement>;
  endRef: Ref<HTMLInputElement>;
  onSubmit: () => void;
};

const fieldLabel = 'flex flex-col gap-1.5 text-sm font-semibold text-fg';
// The catalog field classes without their top margin: the label's gap spaces them.
const control = styles.field.replace('mt-1 ', '');
const invalidControl = styles.fieldInvalid.replace('mt-1 ', '');

export function ActivityForm({
  id,
  title,
  draft,
  onChange,
  days,
  venues,
  tried,
  times,
  windowMessages,
  overlap,
  summary,
  startRef,
  endRef,
  onSubmit,
}: ActivityFormProps) {
  const nameError = tried && !draft.name.trim() ? 'Escribe el nombre de la actividad.' : null;
  const kindError =
    tried && !activityKindOptions.some((option) => option.id === draft.kind)
      ? 'Elige un tipo.'
      : null;
  const noVenues = venues.length === 0;
  const venueError =
    tried && !noVenues && !venues.some((venue) => venue.id === draft.venueId)
      ? 'Elige la sede de la actividad.'
      : null;
  const timeId = useId();
  const nameErrorId = useId();
  const windowMessage = windowMessages.startsAt ?? windowMessages.endsAt;
  const timeError =
    windowMessage ??
    (times.kind === 'order'
      ? 'La hora de fin debe ser después del inicio.'
      : times.kind === 'skipped'
        ? 'Esa hora no existe en el evento por el cambio de horario. Elige otra.'
        : tried && times.kind === 'missing'
          ? 'Escribe a qué hora empieza y termina.'
          : null);
  const timeNote = timeError ?? (times.kind === 'ok' ? durationLabel(times.minutes) : null);
  // A skipped time cannot be told apart from here, so both fields are marked.
  const skipped = times.kind === 'skipped';
  const startInvalid =
    !!windowMessages.startsAt || skipped || (tried && times.kind === 'missing' && !draft.start);
  const endInvalid =
    !!windowMessages.endsAt ||
    skipped ||
    times.kind === 'order' ||
    (tried && times.kind === 'missing' && !draft.end);
  const laterDays = days.filter((day) => day.key > draft.day);
  // "Termina otro día" only where another day exists, or when the activity already ends on one.
  const canEndOtherDay = days.length === 0 || laterDays.length > 0 || draft.endsOtherDay;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form id={id} aria-label={title} noValidate onSubmit={submit} className="space-y-5">
      {summary && (
        <p className="flex items-start gap-2.5 rounded-lg bg-surface-inner px-3.5 py-3 text-sm text-fg">
          <PersonIcon />
          {summary}
        </p>
      )}
      <label className={fieldLabel}>
        Nombre
        <input
          className={nameError ? invalidControl : control}
          value={draft.name}
          maxLength={200}
          autoComplete="off"
          placeholder="Ej. Breaking 1v1 Toprock"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? nameErrorId : undefined}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        {nameError && <FieldError id={nameErrorId}>{nameError}</FieldError>}
      </label>
      <Segmented
        legend="Tipo"
        name={`${id}-kind`}
        value={draft.kind}
        error={kindError}
        options={activityKindOptions.map((option) => ({ value: option.id, label: option.label }))}
        onChange={(kind) => onChange({ kind })}
      />
      {days.length > 0 ? (
        <Segmented
          legend="Día"
          name={`${id}-day`}
          value={draft.day}
          options={days.map((day) => ({ value: day.key, label: day.label, sub: day.sub }))}
          onChange={(day) =>
            onChange({ day, endDay: day >= draft.endDay ? nextDay(days, day) : draft.endDay })
          }
        />
      ) : (
        <DateField label="Día" value={draft.day} onChange={(day) => onChange({ day })} />
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <TimeField
          label="Empieza"
          value={draft.start}
          invalid={startInvalid}
          describedBy={timeNote ? timeId : undefined}
          inputRef={startRef}
          onChange={(start) => onChange({ start })}
        />
        <TimeField
          label="Termina"
          value={draft.end}
          invalid={endInvalid}
          describedBy={timeNote ? timeId : undefined}
          inputRef={endRef}
          onChange={(end) => onChange({ end })}
        />
        <div>
          <Select
            label="Sede"
            options={venues.map((venue) => ({ id: venue.id, label: venue.name }))}
            selectedKey={venues.some((venue) => venue.id === draft.venueId) ? draft.venueId : ''}
            isDisabled={noVenues}
            placeholder={noVenues ? 'Sin sedes' : 'Elige una sede'}
            errorMessage={venueError}
            onSelectionChange={(venueId) => onChange({ venueId })}
          />
        </div>
      </div>
      {timeNote && (
        <p
          id={timeId}
          role={timeError ? 'alert' : 'status'}
          className={`-mt-2 text-sm ${timeError ? 'font-semibold text-danger-fg' : 'text-muted'}`}
        >
          {timeNote}
        </p>
      )}
      {canEndOtherDay && (
        <div className="-mt-2 space-y-2">
          <CheckboxField
            label="Termina otro día"
            checked={draft.endsOtherDay}
            onChange={(event) =>
              onChange({
                endsOtherDay: event.target.checked,
                endDay: draft.endDay > draft.day ? draft.endDay : nextDay(days, draft.day),
              })
            }
          />
          {draft.endsOtherDay &&
            (days.length > 0 ? (
              <Segmented
                legend="Día en que termina"
                name={`${id}-end-day`}
                value={draft.endDay}
                options={laterDays.map((day) => ({
                  value: day.key,
                  label: day.label,
                  sub: day.sub,
                }))}
                onChange={(endDay) => onChange({ endDay })}
              />
            ) : (
              <DateField
                label="Día en que termina"
                value={draft.endDay}
                onChange={(endDay) => onChange({ endDay })}
              />
            ))}
        </div>
      )}
      {overlap && (
        <p className="flex items-start gap-2.5 rounded-lg border border-warning-fg bg-warning px-3.5 py-3 text-sm text-warning-fg">
          <span className="mt-px shrink-0">
            <WarningIcon size={18} />
          </span>
          <span>
            <b>Se empalma con {overlap}</b> en la misma sede. Puedes guardarla así si es a
            propósito.
          </span>
        </p>
      )}
      {noVenues && (
        <p className="text-sm text-warning-fg">
          El evento aún no tiene sedes. Agrega una sede al evento antes de guardar actividades.
        </p>
      )}
    </form>
  );
}

// The day after `key` among the event days, or `key` itself on the last day (or without days).
function nextDay(days: DayOption[], key: string) {
  return days.find((day) => day.key > key)?.key ?? key;
}

type SegmentedProps = {
  legend: string;
  name: string;
  value: string;
  options: { value: string; label: string; sub?: string }[];
  error?: string | null;
  onChange: (value: string) => void;
};

// A segmented radio group: each option is a bordered label around a visually hidden radio, so
// arrow keys move between options and the whole segment is the target. The checked one is a
// solid fill with a check mark.
function Segmented({ legend, name, value, options, error, onChange }: SegmentedProps) {
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="min-w-0 space-y-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={`relative flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-center hover:bg-row has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${
                option.sub
                  ? 'min-h-12 flex-[1_1_160px] flex-col gap-0 py-1'
                  : 'min-h-11 flex-[1_1_120px]'
              } ${
                checked
                  ? 'border-chip-selected bg-chip-selected text-chip-selected-fg hover:bg-chip-selected'
                  : error
                    ? 'border-danger-fg bg-input text-fg'
                    : 'border-input-line bg-input text-fg'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                aria-invalid={error ? true : undefined}
                onChange={() => onChange(option.value)}
                className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-lg"
              />
              {option.sub ? (
                <>
                  <span className="text-sm font-bold">{option.label}</span>
                  <span className="text-xs">{option.sub}</span>
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {checked && <CheckIcon />}
                  {option.label}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  );
}

type TimeFieldProps = {
  label: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
};

function TimeField({ label, value, invalid, describedBy, inputRef, onChange }: TimeFieldProps) {
  return (
    <label className={fieldLabel}>
      {label}
      <input
        ref={inputRef}
        type="time"
        step={300}
        className={`${invalid ? invalidControl : control} font-mono font-medium`}
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DateField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={fieldLabel}>
      {props.label}
      <input
        type="date"
        className={control}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}
