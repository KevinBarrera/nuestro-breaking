import type { ActivityInput, CatalogActivity, CatalogVenue } from '@/entities/event-catalog';
import { changedRows, type ChangeRow } from '@/shared/ui';
import { scheduleLabel } from './activity-form-model';
import { activityKindLabel } from './catalog-copy';

// Rows for "Revisa los cambios": each changed field as label and before → after, in the words
// the organizer reads on the agenda (kind label, the day and times as one "Horario", venue name).
export function activityChangeRows(
  before: CatalogActivity,
  after: ActivityInput,
  venues: CatalogVenue[],
  timeZone: string,
): ChangeRow[] {
  const venueName = (id: string) =>
    venues.find((venue) => venue.id === id)?.name ?? 'Sede no disponible';
  const schedule = (window: { startsAt: string; endsAt: string }) =>
    scheduleLabel(window.startsAt, window.endsAt, timeZone);

  return changedRows([
    { key: 'name', label: 'Nombre', before: before.name, after: after.name },
    {
      key: 'kind',
      label: 'Tipo',
      before: before.kind,
      after: after.kind,
      format: activityKindLabel,
    },
    {
      key: 'schedule',
      label: 'Horario',
      before: { startsAt: before.startsAt, endsAt: before.endsAt },
      after: { startsAt: after.startsAt, endsAt: after.endsAt },
      format: schedule,
    },
    {
      key: 'venue',
      label: 'Sede',
      before: before.venueId,
      after: after.venueId,
      format: venueName,
    },
  ]);
}
