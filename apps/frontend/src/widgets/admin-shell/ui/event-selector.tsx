import { Select } from '@/shared/ui';
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
    <Select
      label="Evento"
      variant="header"
      options={events.map((event) => ({ id: event.id, label: event.name }))}
      selectedKey={eventId}
      onSelectionChange={(id) => void navigate(eventSectionPath(id, section))}
    />
  );
}
