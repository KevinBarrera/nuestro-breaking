import type {
  AttendeeListActivityKind,
  AttendeeListRegistration,
  AttendeeLists,
  AttendeeListStatus,
} from '@/entities/attendee-list';
import { formatCheckInTime } from './admin-check-in-model';

// Listas de respaldo (#65): the printable, contact-free lists built from one snapshot.
export type AttendeeListRow = {
  registrationId: string;
  fullName: string;
  stageName: string | null;
  folio: string | null;
  status: string;
  // Event check-in on the event and pass lists; that activity's check-in on an activity list.
  checkedInAt: string | null;
  passes: string[];
};

export type AttendeeListView = {
  id: string;
  title: string;
  // Only the event list names each person's passes.
  showPasses: boolean;
  rows: AttendeeListRow[];
};

export const allListsOption = 'all';

const statusLabels: Record<AttendeeListStatus, string> = {
  confirmed: 'Confirmada',
  pending_payment: 'Pendiente de pago',
};

const kindLabels: Record<AttendeeListActivityKind, string> = {
  competition: 'Competencia',
  workshop: 'Taller',
};

// Lists in print order: the whole event, each pass type (in the backend's order, archived ones
// marked), then each activity. Names come from the event's own catalog.
export function buildAttendeeLists(data: AttendeeLists): AttendeeListView[] {
  const passNames = new Map(data.passTypes.map((pass) => [pass.id, pass.name]));
  const row = (registration: AttendeeListRegistration, checkedInAt: string | null) => ({
    registrationId: registration.registrationId,
    fullName: registration.fullName,
    stageName: registration.stageName,
    folio: registration.folio,
    status: statusLabels[registration.status],
    checkedInAt,
    passes: registration.passTypeIds.flatMap((id) => passNames.get(id) ?? []),
  });
  const eventRow = (registration: AttendeeListRegistration) =>
    row(registration, registration.eventCheckedInAt);

  return [
    {
      id: 'event',
      title: 'Evento completo',
      showPasses: true,
      rows: data.registrations.map(eventRow),
    },
    ...data.passTypes.map((pass) => ({
      id: `pass:${pass.id}`,
      title: `Pase · ${pass.name}${pass.archived ? ' (archivado)' : ''}`,
      showPasses: false,
      rows: data.registrations
        .filter((registration) => registration.passTypeIds.includes(pass.id))
        .map(eventRow),
    })),
    ...data.activities.map((activity) => ({
      id: `activity:${activity.id}`,
      title: `${kindLabels[activity.kind]} · ${activity.name}`,
      showPasses: false,
      rows: data.registrations.flatMap((registration) => {
        const access = registration.activities.find((entry) => entry.activityId === activity.id);
        return access ? [row(registration, access.checkedInAt)] : [];
      }),
    })),
  ];
}

// A choice that no longer exists after "Actualizar" shows every list instead of none.
export function visibleLists(lists: AttendeeListView[], selection: string) {
  const chosen = lists.filter((list) => list.id === selection);
  return chosen.length > 0 ? chosen : lists;
}

// Staff are at the venue, so the browser zone is the default, as on the check-in screen.
export function attendanceLabel(checkedInAt: string | null, timeZone?: string) {
  return checkedInAt ? `Registrada ${formatCheckInTime(checkedInAt, timeZone)}` : '—';
}

export const folioLabel = (folio: string | null) => folio ?? '—';

export function formatGeneratedAt(iso: string, timeZone?: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone }).format(date);
  return `${day}, ${formatCheckInTime(iso, timeZone)}`;
}

export const peopleCount = (count: number) => `${count} ${count === 1 ? 'persona' : 'personas'}`;
