import {
  adminEventFailure,
  createVenue,
  renameVenue,
  type AdminVenue,
} from '@/entities/admin-event';
import { Notice, TextField } from '@/shared/ui';
import { useId, useRef, useState, type FormEvent } from 'react';
import { styles } from './catalog-copy';
import { validateVenueName, venueFailureMessage } from './event-details-model';

type VenuesSectionProps = {
  eventId: string;
  venues: AdminVenue[];
  editable: boolean;
  onChange: (venues: AdminVenue[]) => void;
  // A write was refused with `event_archived`.
  onArchived: () => void;
};

type Message = { tone: 'info' | 'danger'; text: string };

// "Sedes" on Datos del evento (#213 D8): the event's venues, where its activities happen.
// Admins add a venue or rename one in place; there is no delete. A venue another event also
// uses cannot be renamed here (`venue_shared`).
export function VenuesSection({
  eventId,
  venues,
  editable,
  onChange,
  onArchived,
}: VenuesSectionProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const formOpen = adding || renaming !== null;

  function failed(error: unknown) {
    const failure = adminEventFailure(error);
    if (failure.kind === 'rule' && failure.code === 'event_archived') onArchived();
    setMessage({ tone: 'danger', text: venueFailureMessage(failure) });
  }

  // After a write the form closes, so focus moves to the stable heading.
  function done(text: string) {
    setAdding(false);
    setRenaming(null);
    setMessage({ tone: 'info', text });
    heading.current?.focus();
  }

  async function add(name: string) {
    try {
      const venue = await createVenue(eventId, name);
      onChange([...venues, venue]);
      done(`Se agregó la sede «${venue.name}».`);
    } catch (error) {
      failed(error);
    }
  }

  async function rename(venueId: string, name: string) {
    try {
      const venue = await renameVenue(eventId, venueId, name);
      onChange(venues.map((current) => (current.id === venue.id ? venue : current)));
      done(`La sede ahora se llama «${venue.name}».`);
    } catch (error) {
      failed(error);
    }
  }

  return (
    <section aria-labelledby={headingId} className={`${styles.card} space-y-5 sm:p-8`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 basis-72 space-y-1">
          <h2
            ref={heading}
            id={headingId}
            tabIndex={-1}
            className="text-lg font-extrabold text-heading outline-none"
          >
            Sedes
          </h2>
          <p className="text-sm text-muted">
            Los lugares donde suceden las actividades. Cada actividad se programa en una sede.
          </p>
        </div>
        {editable && !formOpen && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setMessage(null);
              setAdding(true);
            }}
          >
            Agregar sede
          </button>
        )}
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {adding && (
        <VenueForm
          formLabel="Agregar sede"
          submitLabel="Agregar"
          sendingLabel="Agregando…"
          initialName=""
          onSubmit={add}
          onCancel={() => setAdding(false)}
        />
      )}
      {venues.length === 0 ? (
        <p className="text-muted">
          Aún no hay sedes. Agrega la primera para poder programar actividades.
        </p>
      ) : (
        <ul aria-label="Sedes del evento" className="divide-y divide-row">
          {venues.map((venue) => (
            <li key={venue.id} className="py-3 first:pt-0 last:pb-0">
              {renaming === venue.id ? (
                <VenueForm
                  formLabel={`Renombrar ${venue.name}`}
                  submitLabel="Guardar nombre"
                  sendingLabel="Guardando…"
                  initialName={venue.name}
                  onSubmit={(name) => rename(venue.id, name)}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 font-semibold break-words text-fg">{venue.name}</span>
                  {editable && !formOpen && (
                    <button
                      type="button"
                      aria-label={`Renombrar ${venue.name}`}
                      className={styles.secondary}
                      onClick={() => {
                        setMessage(null);
                        setRenaming(venue.id);
                      }}
                    >
                      Renombrar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type VenueFormProps = {
  formLabel: string;
  submitLabel: string;
  sendingLabel: string;
  initialName: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

// One venue name, checked with the backend rule before sending. An unchanged rename just
// closes the form.
function VenueForm({
  formLabel,
  submitLabel,
  sendingLabel,
  initialName,
  onSubmit,
  onCancel,
}: VenueFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const input = event.currentTarget.querySelector<HTMLInputElement>('input[name="venueName"]');
    const found = validateVenueName(name);
    setError(found);
    if (found) return input?.focus();
    if (initialName && name.trim() === initialName) return onCancel();
    setSending(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      aria-label={formLabel}
      noValidate
      onSubmit={(event) => void submit(event)}
      className="space-y-3 rounded-xl bg-surface-inner p-4"
    >
      <TextField
        label="Nombre de la sede"
        name="venueName"
        autoComplete="off"
        autoFocus
        value={name}
        error={error}
        readOnly={sending}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" disabled={sending} onClick={onCancel} className={styles.secondary}>
          Cancelar
        </button>
        <button type="submit" disabled={sending} className={styles.primary}>
          {sending ? sendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
