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
  const [startsAt, setStartsAt] = useState(
    activity ? toZonedInput(activity.startsAt, timeZone) : '',
  );
  const [endsAt, setEndsAt] = useState(activity ? toZonedInput(activity.endsAt, timeZone) : '');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const start = fromZonedInput(startsAt, timeZone);
    const end = fromZonedInput(endsAt, timeZone);
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
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className={`${styles.label} sm:col-span-2`}>
          Sede
          <select
            className={styles.field}
            value={venueId}
            required
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
            className={styles.field}
            type="datetime-local"
            value={startsAt}
            required
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Fin
          <input
            className={styles.field}
            type="datetime-local"
            value={endsAt}
            required
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-slate-400">Horarios en la zona horaria del evento: {timeZone}.</p>
      {error && (
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={styles.primary}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={styles.secondary}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
