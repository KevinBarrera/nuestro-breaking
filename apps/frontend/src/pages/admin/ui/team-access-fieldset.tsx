import { CheckboxField } from '@/shared/ui';
import { useId } from 'react';
import type { AccessDraft } from './team-form-model';
import type { TeamEventsState } from './use-team-events';

type AccessFieldsetProps = {
  value: AccessDraft;
  onChange: (value: AccessDraft) => void;
  events: TeamEventsState;
  onRetryEvents: () => void;
  error?: string | null;
  disabled?: boolean;
};

const optionClass =
  'flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 has-checked:border-2 has-checked:border-heading has-checked:p-[15px] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus';

// "Acceso": all events (a global admin, who also manages the team) or some events, chosen with
// checkboxes from the admin event list.
export function AccessFieldset({
  value,
  onChange,
  events,
  onRetryEvents,
  error,
  disabled = false,
}: AccessFieldsetProps) {
  const name = useId();
  const errorId = useId();
  const toggle = (eventId: string, checked: boolean) =>
    onChange({
      scope: 'events',
      eventIds: checked
        ? [...value.eventIds, eventId]
        : value.eventIds.filter((id) => id !== eventId),
    });

  return (
    <fieldset
      className="min-w-0 space-y-3"
      aria-describedby={error ? errorId : undefined}
      disabled={disabled}
    >
      <legend className="mb-3 text-lg font-extrabold text-heading">Acceso</legend>
      <label className={optionClass}>
        <input
          type="radio"
          name={name}
          checked={value.scope === 'global'}
          onChange={() => onChange({ ...value, scope: 'global' })}
          className="mt-0.5 size-5 shrink-0 accent-primary outline-none"
        />
        <span className="space-y-1">
          <span className="block font-bold">Todos los eventos</span>
          <span className="block text-sm text-muted">
            Opera cualquier evento, crea eventos nuevos y administra el equipo. Para coordinación
            principal.
          </span>
        </span>
      </label>
      <label className={optionClass}>
        <input
          type="radio"
          name={name}
          checked={value.scope === 'events'}
          onChange={() => onChange({ ...value, scope: 'events' })}
          className="mt-0.5 size-5 shrink-0 accent-primary outline-none"
        />
        <span className="space-y-1">
          <span className="block font-bold">Solo algunos eventos</span>
          <span className="block text-sm text-muted">
            Opera los eventos que elijas: check-in, registro en efectivo, catálogo y venta. No ve el
            equipo ni crea eventos.
          </span>
        </span>
      </label>
      {value.scope === 'events' && (
        <div role="group" aria-label="Eventos" className="space-y-1 pl-2">
          {events.status === 'loading' && <p role="status">Cargando eventos…</p>}
          {events.status === 'failed' && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-danger-fg">
              <p>No se pudieron cargar los eventos.</p>
              <button
                type="button"
                onClick={onRetryEvents}
                className="min-h-11 rounded-lg border border-line px-4 font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Reintentar
              </button>
            </div>
          )}
          {events.status === 'ready' &&
            (events.events.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay eventos.</p>
            ) : (
              events.events.map((event) => (
                <CheckboxField
                  key={event.id}
                  label={event.name}
                  checked={value.eventIds.includes(event.id)}
                  onChange={(change) => toggle(event.id, change.currentTarget.checked)}
                />
              ))
            ))}
        </div>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-fg">
          {error}
        </p>
      )}
    </fieldset>
  );
}
