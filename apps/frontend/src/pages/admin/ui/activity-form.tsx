import {
  fromZonedInput,
  toZonedInput,
  type ActivityInput,
  type CatalogActivity,
  type CatalogVenue,
} from '@/entities/event-catalog';
import { type FormEvent, useId, useState } from 'react';
import { styles } from './catalog-copy';

type ActivityFormProps = {
  title: string;
  activity?: CatalogActivity;
  venues: CatalogVenue[];
  timeZone: string;
  busy: boolean;
  onSubmit: (input: ActivityInput) => void;
  onCancel: () => void;
};

const kindSuggestions = ['battle', 'competition', 'workshop', 'social'];

export function ActivityForm({
  title,
  activity,
  venues,
  timeZone,
  busy,
  onSubmit,
  onCancel,
}: ActivityFormProps) {
  const id = useId();
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

  function instant(value: string, initial: string, stored: string | undefined) {
    return stored !== undefined && value === initial ? stored : fromZonedInput(value, timeZone);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || noVenues) return;
    const start = instant(startsAt, initialStartsAt, activity?.startsAt);
    const end = instant(endsAt, initialEndsAt, activity?.endsAt);
    if (!name.trim() || !kind.trim() || !venueId) {
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
    setError(null);
    onSubmit({ name: name.trim(), kind: kind.trim(), venueId, startsAt: start, endsAt: end });
  }

  return (
    <form aria-label={title} onSubmit={submit} className={`${styles.card} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-heading">{title}</h2>
        {activity && (
          <span className="font-mono text-sm text-muted">
            <span className="sr-only">Versión </span>v{activity.version}
          </span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
        <label className={styles.label}>
          Tipo
          <input
            className={styles.field}
            value={kind}
            maxLength={100}
            required
            list={`${id}-kinds`}
            onChange={(event) => setKind(event.target.value)}
          />
          <datalist id={`${id}-kinds`}>
            {kindSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </label>
        <label className={`${styles.label} sm:col-span-2 lg:col-span-1`}>
          Sede
          <select
            className={styles.field}
            value={venueId}
            required
            disabled={noVenues}
            onChange={(event) => setVenueId(event.target.value)}
          >
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </label>
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
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || noVenues} className={styles.primary}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={styles.secondary}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
