import {
  formatEventTime,
  type ActivityInput,
  type CatalogActivity,
  type CatalogVenue,
} from '@/entities/event-catalog';
import { changedRows, type ChangeRow } from '@/shared/ui';
import { activityKindLabel } from './catalog-copy';

const empty = '—';

// Rows for "Revisar cambios": each changed field as label and before → after, in the words the
// organizer reads on the agenda (kind label, venue name, date and time on the event's clock).
// A new activity has no `before`, so every field is listed against "—".
export function activityChangeRows(
  before: CatalogActivity | undefined,
  after: ActivityInput,
  venues: CatalogVenue[],
  timeZone: string,
): ChangeRow[] {
  const venueName = (id?: string) =>
    id === undefined
      ? empty
      : (venues.find((venue) => venue.id === id)?.name ?? 'Sede no disponible');
  const kind = (value?: string) => (value === undefined ? empty : activityKindLabel(value));
  const time = (iso?: string) => (iso === undefined ? empty : formatEventTime(iso, timeZone));

  return changedRows([
    { key: 'name', label: 'Nombre', before: before?.name, after: after.name },
    { key: 'kind', label: 'Tipo', before: before?.kind, after: after.kind, format: kind },
    {
      key: 'venue',
      label: 'Sede',
      before: before?.venueId,
      after: after.venueId,
      format: venueName,
    },
    {
      key: 'startsAt',
      label: 'Inicio',
      before: before?.startsAt,
      after: after.startsAt,
      format: time,
    },
    { key: 'endsAt', label: 'Fin', before: before?.endsAt, after: after.endsAt, format: time },
  ]);
}
