import { Select } from '@/shared/ui';
import { useNavigate } from 'react-router';
import { eventSectionPath, type AdminLocation } from './admin-location';
import type { ShellEvent } from './use-admin-events';

type EventSelectorProps = { events: ShellEvent[]; location: AdminLocation };

// The side navigation's event picker (#313). Inside an event, switching keeps the current
// section; without one, it reads "Elige un evento" and a choice opens that event's Resumen.
// It stays hidden until the list loads, and inside an event the list lacks.
export function EventSelector({ events, location }: EventSelectorProps) {
  const navigate = useNavigate();
  const { eventId, section } = location;
  if (events.length === 0) return null;
  if (eventId && !events.some((event) => event.id === eventId)) return null;

  return (
    <Select
      label="Evento"
      hideLabel
      variant="nav"
      placeholder="Elige un evento"
      options={events.map((event) => ({ id: event.id, label: event.name }))}
      selectedKey={eventId ?? ''}
      onSelectionChange={(id) => void navigate(eventSectionPath(id, section ?? 'overview'))}
    />
  );
}
