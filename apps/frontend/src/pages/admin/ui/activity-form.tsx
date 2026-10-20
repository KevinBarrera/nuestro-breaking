import {
  fromZonedInput,
  isActivityKind,
  toZonedInput,
  type ActivityInput,
  type CatalogActivity,
  type CatalogVenue,
} from '@/entities/event-catalog';
import { Select, type ChangeRow } from '@/shared/ui';
import { type FormEvent, useState } from 'react';
import { activityChangeRows } from './activity-changes';
import { activityKindOptions, styles } from './catalog-copy';

type ActivityFormProps = {
  // The form's accessible name; the surrounding dialog shows it as its title.
  title: string;
  // Lets the dialog's footer buttons submit this form (`<button form={id}>`).
  id: string;
  activity?: CatalogActivity;
  venues: CatalogVenue[];
  timeZone: string;
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
  const noVenues = venues.length === 0;
  // A saved venue that is no longer among the event venues (e.g. archived) counts as unselected.
  const selectedVenueId = venues.some((venue) => venue.id === venueId) ? venueId : '';
  // Likewise a stored kind outside the list counts as unselected, so it cannot be saved again.
  const selectedKind = isActivityKind(kind) ? kind : '';

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
    if (Date.parse(end) <= Date.parse(start)) {
      setError('El fin debe ser posterior al inicio.');
      return;
    }
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
    onReview(input, rows);
  }

  return (
    <form id={id} aria-label={title} onSubmit={submit} className="space-y-4">
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
        <label className={styles.label}>
          Inicio
          <input
            className={`${styles.field} font-mono`}
            type="datetime-local"
            value={startsAt}
            required
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Fin
          <input
            className={`${styles.field} font-mono`}
            type="datetime-local"
            value={endsAt}
            required
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </label>
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
