import type {
  AttendeeListActivityKind,
  AttendeeListRegistration,
  AttendeeLists,
} from '@/entities/attendee-list';
import { formatCheckInTime } from './admin-check-in-model';
import { matchesQuery } from './check-in-roster-model';

// Listas de respaldo (#65, #362): the printable, contact-free lists built from one snapshot.
export type AttendeeListRow = {
  registrationId: string;
  fullName: string;
  stageName: string | null;
  folio: string | null;
  // `pending_payment`: listed so the paper fallback knows them, shown with a pill (#362).
  pending: boolean;
  // Event check-in on the event and pass lists; that activity's check-in on an activity list.
  checkedInAt: string | null;
  passes: string[];
};

export type AttendeeListGroupId = 'event' | 'pass' | AttendeeListActivityKind;

export type AttendeeListView = {
  id: string;
  group: AttendeeListGroupId;
  title: string;
  // Only the event list names each person's passes.
  showPasses: boolean;
  rows: AttendeeListRow[];
};

export const eventListId = 'event';

const byName = (a: AttendeeListRow, b: AttendeeListRow) =>
  a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' });

// Lists in print order: the whole event, each pass type (in the backend's order, archived ones
// marked), then each activity. Names come from the event's own catalog; rows go by name.
export function buildAttendeeLists(data: AttendeeLists): AttendeeListView[] {
  const passNames = new Map(data.passTypes.map((pass) => [pass.id, pass.name]));
  const people = [...data.registrations].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }),
  );
  const row = (registration: AttendeeListRegistration, checkedInAt: string | null) => ({
    registrationId: registration.registrationId,
    fullName: registration.fullName,
    stageName: registration.stageName,
    folio: registration.folio,
    pending: registration.status === 'pending_payment',
    checkedInAt,
    passes: registration.passTypeIds.flatMap((id) => passNames.get(id) ?? []),
  });
  const eventRow = (registration: AttendeeListRegistration) =>
    row(registration, registration.eventCheckedInAt);

  return [
    {
      id: eventListId,
      group: 'event' as const,
      title: 'Evento completo',
      showPasses: true,
      rows: people.map(eventRow),
    },
    ...data.passTypes.map((pass) => ({
      id: `pass:${pass.id}`,
      group: 'pass' as const,
      title: `${pass.name}${pass.archived ? ' (archivado)' : ''}`,
      showPasses: false,
      rows: people
        .filter((registration) => registration.passTypeIds.includes(pass.id))
        .map(eventRow),
    })),
    ...data.activities.map((activity) => ({
      id: `activity:${activity.id}`,
      group: activity.kind,
      title: activity.name,
      showPasses: false,
      rows: people
        .flatMap((registration) => {
          const access = registration.activities.find((entry) => entry.activityId === activity.id);
          return access ? [row(registration, access.checkedInAt)] : [];
        })
        .sort(byName),
    })),
  ];
}

const groups: { id: AttendeeListGroupId; label: string; kind: string }[] = [
  { id: 'event', label: 'Evento', kind: 'Evento' },
  { id: 'pass', label: 'Pases', kind: 'Pase' },
  { id: 'competition', label: 'Competencias', kind: 'Competencia' },
  { id: 'workshop', label: 'Talleres', kind: 'Taller' },
];

export type AttendeeListGroup = {
  id: AttendeeListGroupId;
  label: string;
  lists: AttendeeListView[];
};

// The "Qué imprimir" groups, without the empty ones.
export function groupAttendeeLists(lists: AttendeeListView[]): AttendeeListGroup[] {
  return groups.flatMap(({ id, label }) => {
    const members = lists.filter((list) => list.group === id);
    if (members.length === 0) return [];
    return [
      { id, label: members.length > 1 ? `${label} · ${members.length}` : label, lists: members },
    ];
  });
}

const kindOf = (group: AttendeeListGroupId) =>
  groups.find((entry) => entry.id === group)?.kind ?? '';

// "Competencia", or "Pase · Pase completo" style prefixes for the printout.
export const listKind = (list: AttendeeListView) => kindOf(list.group);

export function listKindLabel(list: AttendeeListView): string {
  const kind = listKind(list);
  if (list.group === 'competition' || list.group === 'workshop')
    return `${kind} · la entrada se cuenta por ${kind.toLowerCase()}`;
  return kind;
}

// After "Actualizar datos", a list that is gone drops out of the selection.
export const keptSelection = (selection: string[], lists: AttendeeListView[]) =>
  selection.filter((id) => lists.some((list) => list.id === id));

export function printLabel(count: number): string {
  if (count === 0) return 'Elige una lista para imprimir';
  return `Imprimir ${count} ${count === 1 ? 'lista' : 'listas'}`;
}

// The snapshot stays "al día" for this long; after that the notice asks to refresh (#362).
const freshMinutes = 30;

const ago = (minutes: number) => {
  const unit = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (minutes < 60) return unit(minutes, 'minuto', 'minutos');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, 'hora', 'horas');
  return unit(Math.floor(hours / 24), 'día', 'días');
};

export type Freshness = { tone: 'success' | 'warning'; title: string; text: string };

export function freshness(generatedAt: string, now: Date, timeZone?: string): Freshness {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(generatedAt)) / 60_000));
  const at = `Al ${formatGeneratedAt(generatedAt, timeZone)}.`;
  if (minutes < freshMinutes)
    return {
      tone: 'success',
      title: 'Datos al día',
      text: `${at} Imprime ahora para llevar la versión más reciente.`,
    };
  return {
    tone: 'warning',
    title: `Datos de hace ${ago(minutes)}`,
    text: `${at} Actualiza antes de imprimir para incluir las inscripciones y entradas más recientes.`,
  };
}

export function listProgress(list: AttendeeListView) {
  const total = list.rows.length;
  const entered = list.rows.filter((row) => row.checkedInAt).length;
  const people = total === 1 ? 'persona ya entró' : 'personas ya entraron';
  return {
    entered,
    total,
    percent: total ? Math.round((entered * 100) / total) : 0,
    label: `${entered} de ${total} ${people} · ${total - entered} por entrar`,
  };
}

export const searchList = (list: AttendeeListView, query: string) =>
  list.rows.filter((row) => matchesQuery(row, query));

// Staff are at the venue, so the browser zone is the default, as on the check-in screen.
export const entryLabel = (checkedInAt: string | null, timeZone?: string) =>
  checkedInAt ? `Entró ${formatCheckInTime(checkedInAt, timeZone)}` : 'Sin entrar';

export const folioLabel = (folio: string | null) => folio ?? '—';

export function formatGeneratedAt(iso: string, timeZone?: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone }).format(date);
  return `${day}, ${formatCheckInTime(iso, timeZone)}`;
}

export const peopleCount = (count: number) => `${count} ${count === 1 ? 'persona' : 'personas'}`;

// The printout (#363): what the "Opciones del PDF" card turns on.
export type PrintOptions = { cover: boolean; paper: boolean; sheetPerList: boolean };

export const defaultPrintOptions: PrintOptions = { cover: true, paper: true, sheetPerList: false };

// About 30 lines fit a letter sheet; each list also takes about 3 for its title and header row.
const linesPerSheet = 30;
const listHeaderLines = 3;
const sheetsFor = (lines: number) => Math.ceil(lines / linesPerSheet);

// "Tamaño aproximado": an estimate only, the browser decides the real breaks.
export function estimateSheets(lists: AttendeeListView[], options: PrintOptions): number {
  if (lists.length === 0) return 0;
  const lines = lists.map((list) => list.rows.length + listHeaderLines);
  const sheets = options.sheetPerList
    ? lines.reduce((total, count) => total + Math.max(1, sheetsFor(count)), 0)
    : Math.max(1, sheetsFor(lines.reduce((total, count) => total + count, 0)));
  return sheets + (options.cover ? 1 : 0) + (options.paper ? 1 : 0);
}

export function sheetsLabel(sheets: number): string {
  if (sheets === 0) return 'Sin listas';
  return `${sheets} ${sheets === 1 ? 'hoja carta' : 'hojas carta'}`;
}

// "Evento completo", or the list with its kind ("Pase · Pase completo").
export const printTitle = (list: AttendeeListView) =>
  list.group === 'event' ? list.title : `${listKind(list)} · ${list.title}`;

export const paperSheetTitle = 'Inscripciones en papel';

// The cover's index. Sheet numbers are left out: only the browser knows where pages break.
export function printIndex(lists: AttendeeListView[], paper: boolean) {
  return [
    ...lists.map((list) => ({ label: printTitle(list), people: String(list.rows.length) })),
    ...(paper ? [{ label: paperSheetTitle, people: '—' }] : []),
  ];
}

export function printMeta(list: AttendeeListView): string {
  const entered = listProgress(list).entered;
  return `${peopleCount(list.rows.length)} · ${entered} ${entered === 1 ? 'ya entró' : 'ya entraron'}`;
}

// "23/10/2026 15:24" for the sheet header and footer.
export function formatSnapshotStamp(iso: string, timeZone?: string) {
  const day = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
  return `${day} ${formatCheckInTime(iso, timeZone)}`;
}

// A CSS string literal for `content`, so an event name can't end the rule.
export const cssString = (text: string) =>
  `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`;
