import {
  activityWindowErrors,
  endInputMin,
  formatEventWindow,
  fromZonedInput,
  isActivityKind,
  toZonedInput,
  windowErrorMessages,
  windowInputBounds,
  type ActivityInput,
  type ActivityWindowProblem,
  type CatalogActivity,
  type CatalogVenue,
  type EventWindow,
  type WindowField,
  type WindowFieldErrors,
} from '@/entities/event-catalog';
import { Select, type ChangeRow } from '@/shared/ui';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { activityChangeRows } from './activity-changes';
import { ActivityWindowField } from './activity-window-field';
import { activityKindOptions, styles } from './catalog-copy';

type ActivityFormProps = {
  // The form's accessible name; the surrounding dialog shows it as its title.
  title: string;
  // Lets the dialog's footer buttons submit this form (`<button form={id}>`).
  id: string;
  activity?: CatalogActivity;
  venues: CatalogVenue[];
  timeZone: string;
  // The event's dates for a bounded event; the pickers stay inside them. Null: any time.
  eventWindow: EventWindow | null;
  // A server answer that named the failing fields; a new object marks them again.
  windowProblem: ActivityWindowProblem | null;
  busy: boolean;
  // A valid submit hands over the input and its change rows for "Revisar cambios".
  onReview: (input: ActivityInput, rows: ChangeRow[]) => void;
};

export function ActivityForm({
  title,
  id,
  activity,
  venues,
  timeZone,
  eventWindow,
  windowProblem,
  busy,
  onReview,
}: ActivityFormProps) {
  const [name, setName] = useState(activity?.name ?? '');
  const [kind, setKind] = useState(activity?.kind ?? '');
  const [venueId, setVenueId] = useState(activity?.venueId ?? venues[0]?.id ?? '');
  // The input only holds minutes; remember the shown values so an untouched time keeps the
  // stored instant (including seconds) instead of being silently truncated.
  const [initialStartsAt] = useState(() =>
    activity ? toZonedInput(activity.startsAt, timeZone) : '',
  );
  const [initialEndsAt] = useState(() => (activity ? toZonedInput(activity.endsAt, timeZone) : ''));
  const [startsAt, setStartsAt] = useState(initialStartsAt);
  const [endsAt, setEndsAt] = useState(initialEndsAt);
  const [error, setError] = useState<string | null>(null);
  const [windowErrors, setWindowErrors] = useState<WindowFieldErrors>({});
  const [focusRequest, setFocusRequest] = useState<{ field: WindowField } | null>(null);
  const [seenProblem, setSeenProblem] = useState(windowProblem);
  const hintId = useId();
  const inputs = {
    startsAt: useRef<HTMLInputElement>(null),
    endsAt: useRef<HTMLInputElement>(null),
  };
  const noVenues = venues.length === 0;
  // A saved venue that is no longer among the event venues (e.g. archived) counts as unselected.
  const selectedVenueId = venues.some((venue) => venue.id === venueId) ? venueId : '';
  // Likewise a stored kind outside the list counts as unselected, so it cannot be saved again.
  const selectedKind = isActivityKind(kind) ? kind : '';

  // The server's field errors replace whatever the form showed, during render so the marks and
  // the new limits appear together.
  if (windowProblem !== seenProblem) {
    setSeenProblem(windowProblem);
    if (windowProblem) markWindowErrors(windowProblem.fieldErrors);
  }

  // After the dialog that submitted has closed, the first wrong field takes the focus.
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => inputs[focusRequest.field].current?.focus());
    return () => cancelAnimationFrame(frame);
    // `inputs` holds stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  function markWindowErrors(errors: WindowFieldErrors) {
    setWindowErrors(errors);
    const first = errors.startsAt ? 'startsAt' : errors.endsAt ? 'endsAt' : null;
    if (first) setFocusRequest({ field: first });
  }

  // Returns true when a date is wrong, after marking the offending fields only.
  function rejectWindow(start: string, end: string) {
    const errors = activityWindowErrors({ startsAt: start, endsAt: end }, eventWindow);
    if (!errors.startsAt && !errors.endsAt) return false;
    setError(null);
    markWindowErrors(errors);
    return true;
  }

  function edit(field: WindowField, value: string) {
    if (field === 'startsAt') setStartsAt(value);
    else setEndsAt(value);
    setWindowErrors((current) => ({ ...current, [field]: undefined }));
  }

  // The pickers' own limits make the browser block the submit before `submit` runs. The same
  // check then marks the fields instead of the browser's unlocalized bubble.
  function blockedByBrowser(event: FormEvent<HTMLFormElement>) {
    if (event.target !== inputs.startsAt.current && event.target !== inputs.endsAt.current) return;
    const start = instant(startsAt, initialStartsAt, activity?.startsAt);
    const end = instant(endsAt, initialEndsAt, activity?.endsAt);
    if (start && end && rejectWindow(start, end)) event.preventDefault();
  }

  function instant(value: string, initial: string, stored: string | undefined) {
    return stored !== undefined && value === initial ? stored : fromZonedInput(value, timeZone);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || noVenues) return;
    const start = instant(startsAt, initialStartsAt, activity?.startsAt);
    const end = instant(endsAt, initialEndsAt, activity?.endsAt);
    if (!name.trim() || !selectedKind || !selectedVenueId) {
      setError('Completa nombre, tipo y sede.');
      return;
    }
    if (!start || !end) {
      setError('Revisa la fecha y hora de inicio y fin.');
      return;
    }
    if (rejectWindow(start, end)) return;
    const input = {
      name: name.trim(),
      kind: selectedKind,
      venueId: selectedVenueId,
      startsAt: start,
      endsAt: end,
    };
    const rows = activityChangeRows(activity, input, venues, timeZone);
    // "Guardar" stays enabled and explains itself: a disabled button is skipped by the keyboard
    // and would not tell anyone why nothing can be saved.
    if (rows.length === 0) {
      setError('No hay cambios para guardar.');
      return;
    }
    setError(null);
    setWindowErrors({});
    onReview(input, rows);
  }

  const bounds = eventWindow ? windowInputBounds(eventWindow, timeZone) : null;
  const hint = eventWindow ? formatEventWindow(eventWindow, timeZone) : null;
  const messages = windowErrorMessages(windowErrors);

  return (
    <form
      id={id}
      aria-label={title}
      onSubmit={submit}
      onInvalidCapture={blockedByBrowser}
      className="space-y-4"
    >
      {activity && (
        <p className="font-mono text-sm text-muted">
          <span className="sr-only">Versión </span>v{activity.version}
        </p>
      )}
      <div className="grid gap-4">
        <label className={styles.label}>
          Nombre
          <input
            className={styles.field}
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <Select
          label="Tipo"
          options={activityKindOptions}
          selectedKey={selectedKind}
          isRequired
          requiredMessage="Elige el tipo de la actividad."
          placeholder="Elige un tipo"
          onSelectionChange={setKind}
        />
        <Select
          label="Sede"
          options={venues.map((venue) => ({ id: venue.id, label: venue.name }))}
          selectedKey={selectedVenueId}
          isDisabled={noVenues}
          isRequired
          requiredMessage="Elige la sede de la actividad."
          placeholder={noVenues ? 'Sin sedes' : 'Elige una sede'}
          onSelectionChange={setVenueId}
        />
        <ActivityWindowField
          label="Inicio"
          value={startsAt}
          min={bounds?.min}
          max={bounds?.max}
          error={messages.startsAt}
          hintId={hint ? hintId : undefined}
          inputRef={inputs.startsAt}
          onChange={(value) => edit('startsAt', value)}
        />
        <ActivityWindowField
          label="Fin"
          value={endsAt}
          min={bounds ? endInputMin(bounds, startsAt) : undefined}
          max={bounds?.max}
          error={messages.endsAt}
          hintId={hint ? hintId : undefined}
          inputRef={inputs.endsAt}
          onChange={(value) => edit('endsAt', value)}
        />
        {hint && (
          <p id={hintId} className="text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
      {noVenues && (
        <p className="text-sm text-warning-fg">
          El evento aún no tiene sedes. Agrega una sede al evento antes de guardar actividades.
        </p>
      )}
      <p className="text-xs text-muted">Horarios en la zona horaria del evento: {timeZone}.</p>
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}
    </form>
  );
}
