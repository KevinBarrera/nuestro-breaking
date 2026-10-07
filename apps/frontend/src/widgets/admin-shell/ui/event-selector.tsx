import { useNavigate } from 'react-router';
import { eventSectionPath, type AdminLocation } from './admin-location';
import type { AdminEvent } from './use-admin-events';

type EventSelectorProps = { events: AdminEvent[]; location: AdminLocation };

// Only shown inside an event the account can manage; switching keeps the current section.
export function EventSelector({ events, location }: EventSelectorProps) {
  const navigate = useNavigate();
  const { eventId, section } = location;
  if (!eventId || !section || !events.some((event) => event.id === eventId)) return null;

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-header-muted">
      Evento
      <select
        value={eventId}
        onChange={(change) => void navigate(eventSectionPath(change.target.value, section))}
        className="min-h-11 max-w-[60vw] min-w-0 truncate rounded-md border border-header-line bg-header-control px-3 font-semibold text-header-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-header-fg"
      >
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
          </option>
        ))}
      </select>
    </label>
  );
}
