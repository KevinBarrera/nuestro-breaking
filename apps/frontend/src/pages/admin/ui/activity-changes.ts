import type { ActivityInput, CatalogActivity, CatalogVenue } from '@/entities/event-catalog';
import { changedRows, type ChangeRow } from '@/shared/ui';
import { scheduleLabel } from './activity-form-model';
import { activityKindLabel } from './catalog-copy';

const empty = '—';

// Rows for "Revisa los cambios": each changed field as label and before → after, in the words
// the organizer reads on the agenda (kind label, the day and times as one "Horario", venue name).
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
  const schedule = (window?: { startsAt: string; endsAt: string }) =>
    window ? scheduleLabel(window.startsAt, window.endsAt, timeZone) : empty;

  return changedRows([
    { key: 'name', label: 'Nombre', before: before?.name, after: after.name },
    { key: 'kind', label: 'Tipo', before: before?.kind, after: after.kind, format: kind },
    {
      key: 'schedule',
      label: 'Horario',
      before: before && { startsAt: before.startsAt, endsAt: before.endsAt },
      after: { startsAt: after.startsAt, endsAt: after.endsAt },
      format: schedule,
    },
    {
      key: 'venue',
      label: 'Sede',
      before: before?.venueId,
      after: after.venueId,
      format: venueName,
    },
  ]);
}
