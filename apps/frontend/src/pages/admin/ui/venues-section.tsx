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
import { SettingsSection, settingsCard } from './settings-section';

type VenuesSectionProps = {
  eventId: string;
  venues: AdminVenue[];
  editable: boolean;
  // Applied to the latest venues of `eventId`, so overlapping writes all count.
  onChange: (eventId: string, update: (venues: AdminVenue[]) => AdminVenue[]) => void;
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
    if (failure.kind === 'rule' && failure.code === 'event_archived') {
      // The event is read-only now, so the open form closes.
      setAdding(false);
      setRenaming(null);
      onArchived();
    }
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
      onChange(eventId, (current) => [...current, venue]);
      done(`Se agregó la sede «${venue.name}».`);
    } catch (error) {
      failed(error);
    }
  }

  async function rename(venueId: string, name: string) {
    try {
      const venue = await renameVenue(eventId, venueId, name);
      onChange(eventId, (current) =>
        current.map((existing) => (existing.id === venue.id ? venue : existing)),
      );
      done(`La sede ahora se llama «${venue.name}».`);
    } catch (error) {
      failed(error);
    }
  }

  return (
    <SettingsSection
      headingId={headingId}
      headingRef={heading}
      title="Sedes"
      description="Los lugares donde suceden las actividades. Cada actividad se programa en una sede."
    >
      <div className={`${settingsCard} overflow-hidden`}>
        {message && (
          <div className="border-b border-line p-4">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        )}
        {venues.length === 0 ? (
          <p className="border-b border-line px-6 py-4 text-muted">
            Aún no hay sedes. Agrega la primera para poder programar actividades.
          </p>
        ) : (
          <ul aria-label="Sedes del evento">
            {venues.map((venue) => (
              <li key={venue.id} className="border-b border-line">
                {editable && renaming === venue.id ? (
                  <div className="p-4">
                    <VenueForm
                      formLabel={`Renombrar ${venue.name}`}
                      submitLabel="Guardar nombre"
                      sendingLabel="Guardando…"
                      initialName={venue.name}
                      onSubmit={(name) => rename(venue.id, name)}
                      onCancel={() => setRenaming(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-3 pr-4 pl-5 sm:pl-6">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-chip text-heading"
                    >
                      <PlaceIcon />
                    </span>
                    <span className="min-w-0 flex-1 text-[15px] leading-[22px] font-semibold break-words text-heading">
                      {venue.name}
                    </span>
                    {editable && !formOpen && (
                      <button
                        type="button"
                        aria-label={`Renombrar ${venue.name}`}
                        className={ghostButton}
                        onClick={() => {
                          setMessage(null);
                          setRenaming(venue.id);
                        }}
                      >
                        <PencilIcon />
                        Renombrar
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && adding && (
          <div className="p-4">
            <VenueForm
              formLabel="Agregar sede"
              submitLabel="Agregar"
              sendingLabel="Agregando…"
              initialName=""
              onSubmit={add}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
        {editable && !formOpen && (
          <button
            type="button"
            className="flex min-h-[52px] w-full items-center gap-2.5 px-5 text-left text-sm font-semibold text-heading hover:bg-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus sm:px-6"
            onClick={() => {
              setMessage(null);
              setAdding(true);
            }}
          >
            <PlusIcon />
            Agregar sede
          </button>
        )}
      </div>
    </SettingsSection>
  );
}

const ghostButton =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-heading hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'shrink-0',
} as const;

const PlaceIcon = () => (
  <svg {...iconProps} width="18" height="18">
    <path d="M10 17.5s5.5-4.8 5.5-9a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9 5.5 9z" />
    <circle cx="10" cy="8.5" r="2" />
  </svg>
);

const PencilIcon = () => (
  <svg {...iconProps} width="16" height="16">
    <path d="M12.5 4.5l3 3L7 16H4v-3z" />
  </svg>
);

const PlusIcon = () => (
  <svg {...iconProps} width="18" height="18" strokeWidth={2}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

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
