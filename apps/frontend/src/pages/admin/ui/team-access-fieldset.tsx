import { useId, type ReactNode } from 'react';
import type { AccessDraft } from './team-form-model';
import type { TeamEventsState } from './use-team-events';

type AccessFieldsetProps = {
  value: AccessDraft;
  onChange: (value: AccessDraft) => void;
  events: TeamEventsState;
  onRetryEvents: () => void;
  error?: string | null;
  disabled?: boolean;
  // `dialog` (Cambiar acceso): a small "Acceso" label and "Todos los eventos" first.
  // `form` (Agregar administrador): an "Acceso" heading with a hint and "Solo algunos eventos"
  // first, the safer choice for a new person.
  variant: 'dialog' | 'form';
};

// The selected card gets the pink border plus an inner 1px ring, so it reads as selected
// without a tint: there is no pink tint token, and a translucent one would leave the text
// contrast unmeasured.
const cardClass = (selected: boolean) =>
  `rounded-lg bg-surface ${selected ? 'border border-link ring-1 ring-link ring-inset' : 'border border-line'}`;

const optionClass =
  'flex cursor-pointer items-start gap-3 rounded-lg p-4 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus';

const radioClass = 'mt-0.5 size-5 shrink-0 accent-link outline-none';

// "Acceso": all events (a global admin, who also manages the team) or some events, chosen with
// checkboxes from the admin event list. The checkboxes sit inside the "Solo algunos eventos"
// card, under a count and an "Elegir todos" / "Quitar todos" switch, while it is selected.
export function AccessFieldset({
  value,
  onChange,
  events,
  onRetryEvents,
  error,
  disabled = false,
  variant,
}: AccessFieldsetProps) {
  const name = useId();
  const errorId = useId();
  const countId = useId();
  const hintId = useId();
  const toggle = (eventId: string, checked: boolean) =>
    onChange({
      scope: 'events',
      eventIds: checked
        ? [...value.eventIds, eventId]
        : value.eventIds.filter((id) => id !== eventId),
    });
  const ready = events.status === 'ready' ? events.events : [];
  const allChosen = ready.length > 0 && ready.every((event) => value.eventIds.includes(event.id));
  const someSelected = value.scope === 'events';

  const option = (scope: AccessDraft['scope'], title: string, text: string, extra?: ReactNode) => (
    <div className={cardClass(value.scope === scope)}>
      <label className={optionClass}>
        <input
          type="radio"
          name={name}
          checked={value.scope === scope}
          onChange={() => onChange({ ...value, scope })}
          className={radioClass}
        />
        <span className="space-y-0.5">
          <span className="block text-[15px] leading-[22px] font-bold text-heading">{title}</span>
          <span className="block text-sm text-muted">{text}</span>
        </span>
      </label>
      {extra}
    </div>
  );

  const global = option(
    'global',
    'Todos los eventos',
    'Opera cualquier evento, crea eventos nuevos y administra el equipo. Para coordinación principal.',
  );
  const some = option(
    'events',
    'Solo algunos eventos',
    'Opera los eventos que elijas: check-in, registro en efectivo, catálogo y venta. No ve el equipo ni crea eventos.',
    someSelected && (
      <div className="-mt-2 mr-4 mb-4 ml-12 flex flex-col gap-1">
        {events.status === 'loading' && (
          <p role="status" className="text-sm">
            Cargando eventos…
          </p>
        )}
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
          (ready.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay eventos.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span id={countId} className="text-muted">
                  {value.eventIds.length} de {ready.length} eventos elegidos
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      scope: 'events',
                      eventIds: allChosen ? [] : ready.map((event) => event.id),
                    })
                  }
                  className="min-h-11 rounded px-1 font-semibold text-link underline underline-offset-[3px] hover:text-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {allChosen ? 'Quitar todos' : 'Elegir todos'}
                </button>
              </div>
              <div
                role="group"
                aria-label="Eventos"
                aria-describedby={countId}
                className="flex max-h-58 flex-col gap-0.5 overflow-y-auto"
              >
                {ready.map((event) => (
                  <label
                    key={event.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-fg hover:bg-row has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus"
                  >
                    <input
                      type="checkbox"
                      checked={value.eventIds.includes(event.id)}
                      onChange={(change) => toggle(event.id, change.currentTarget.checked)}
                      className="size-5 shrink-0 accent-link outline-none"
                    />
                    {event.name}
                  </label>
                ))}
              </div>
            </>
          ))}
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-sm font-semibold text-danger-fg">
            {error}
          </p>
        )}
      </div>
    ),
  );

  return (
    <fieldset
      className="min-w-0"
      aria-describedby={
        [variant === 'form' ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
        undefined
      }
      disabled={disabled}
    >
      {variant === 'form' ? (
        <>
          <legend className="text-lg font-bold text-heading">Acceso</legend>
          <p id={hintId} className="mt-1 mb-4 text-sm text-muted">
            Dale solo lo que necesita. Lo puedes cambiar después desde Equipo.
          </p>
        </>
      ) : (
        <legend className="mb-3 text-sm font-semibold text-heading">Acceso</legend>
      )}
      <div className="flex flex-col gap-3">
        {variant === 'form' ? (
          <>
            {some}
            {global}
          </>
        ) : (
          <>
            {global}
            {some}
          </>
        )}
      </div>
      {error && !someSelected && (
        <p id={errorId} role="alert" className="mt-2 text-sm font-semibold text-danger-fg">
          {error}
        </p>
      )}
    </fieldset>
  );
}
