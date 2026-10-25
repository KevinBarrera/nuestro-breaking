import {
  centsToInput,
  eventDayKey,
  formatEventClock,
  formatEventTime,
  fromZonedInput,
  parseMxnToCents,
  toZonedInput,
  type CatalogActivity,
  type CatalogPassType,
  type EventWindow,
  type PassClass,
  type PassTypeActivity,
  type PassTypeInput,
  type RequiredPassClass,
} from '@/entities/event-catalog';
import type { ChangeRow } from '@/shared/ui';
import { agendaDays, type AgendaDay } from './activity-agenda-model';
import { historyClockLabel } from './history-feed-model';
import { savedChoices, type AccessChoice, type AccessChoices } from './pass-access-model';
import { passAccessRows, passFieldRows } from './pass-changes';
import { passPriceLabel } from './pass-catalog-model';

// Pure derivations for the pass create and edit screens (#373): one draft holds the fields and
// the access, so both are reviewed and saved together.

export type PassDraft = {
  name: string;
  passClass: PassClass;
  price: string;
  // '' is no required class; only add-ons send one.
  requires: RequiredPassClass | '';
  // false follows the event's online sale ("Mientras el evento venda").
  closes: boolean;
  // `YYYY-MM-DD` and `HH:mm` on the event clock, kept while `closes` is off.
  closeDay: string;
  closeTime: string;
  choices: AccessChoices;
};

const dayMs = 24 * 60 * 60 * 1000;
const keyDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
const keyOf = (date: Date) => date.toISOString().slice(0, 10);
const shiftDay = (key: string, days: number) =>
  keyOf(new Date(keyDate(key).getTime() + days * dayMs));

// The day before the event at 23:59 is the usual presale close, so a new draft starts there.
const defaultCloseDay = (eventWindow: EventWindow | null, timeZone: string) =>
  eventWindow ? shiftDay(eventDayKey(eventWindow.startsAt, timeZone), -1) : '';

export function passDraft(
  passType: CatalogPassType | undefined,
  timeZone: string,
  eventWindow: EventWindow | null,
): PassDraft {
  const closesAt = passType?.onlineSalesClosesAt;
  const zoned = closesAt ? toZonedInput(closesAt, timeZone) : null;
  return {
    name: passType?.name ?? '',
    passClass: passType?.passClass ?? 'full',
    price: passType ? centsToInput(passType.priceCents) : '',
    requires: passType?.requiresPassClass ?? '',
    closes: zoned !== null,
    closeDay: zoned ? zoned.slice(0, 10) : defaultCloseDay(eventWindow, timeZone),
    closeTime: zoned ? zoned.slice(11) : '23:59',
    choices: passType ? savedChoices(passType.activities) : {},
  };
}

export type ClosePreset = { label: string; day: string; time: string };

// "Atajos" for the close date; none without event dates.
export function closePresets(eventWindow: EventWindow | null, timeZone: string): ClosePreset[] {
  if (!eventWindow) return [];
  return [
    {
      label: 'Un día antes del evento',
      day: defaultCloseDay(eventWindow, timeZone),
      time: '23:59',
    },
    {
      label: 'Al empezar el evento',
      day: eventDayKey(eventWindow.startsAt, timeZone),
      time: formatEventClock(eventWindow.startsAt, timeZone),
    },
  ];
}

export type CloseCheck =
  | { kind: 'none' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ok'; at: string; sentence: string; note: string; afterEvent: boolean };

const closeInvalid = 'Elige el día y escribe la hora, por ejemplo 23:59.';

const dayParts = (key: string) => {
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(keyDate(key));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return { weekday: part('weekday'), day: part('day'), month: part('month') };
};

// "21 y 22 de noviembre", "del 21 al 23 de noviembre" or "del 30 de noviembre al 1 de diciembre".
function eventRange(eventWindow: EventWindow, timeZone: string) {
  const first = dayParts(eventDayKey(eventWindow.startsAt, timeZone));
  const lastKey = eventDayKey(eventWindow.endsAt, timeZone);
  const last = dayParts(lastKey);
  const days = Math.round(
    (keyDate(lastKey).getTime() - keyDate(eventDayKey(eventWindow.startsAt, timeZone)).getTime()) /
      dayMs,
  );
  if (days === 0) return `${first.day} de ${first.month}`;
  if (first.month !== last.month)
    return `del ${first.day} de ${first.month} al ${last.day} de ${last.month}`;
  if (days === 1) return `${first.day} y ${last.day} de ${first.month}`;
  return `del ${first.day} al ${last.day} de ${first.month}`;
}

// The close date as the person reads it, or why it cannot be read. A date after the event is
// allowed (it simply never applies) but warned about.
export function checkClose(
  draft: PassDraft,
  timeZone: string,
  eventWindow: EventWindow | null,
): CloseCheck {
  if (!draft.closes) return { kind: 'none' };
  const at =
    /^\d{4}-\d{2}-\d{2}$/.test(draft.closeDay) && /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.closeTime)
      ? fromZonedInput(`${draft.closeDay}T${draft.closeTime}`, timeZone)
      : null;
  if (!at) return { kind: 'invalid', message: closeInvalid };
  const { weekday, day, month } = dayParts(draft.closeDay);
  const afterEvent = eventWindow !== null && Date.parse(at) > Date.parse(eventWindow.endsAt);
  return {
    kind: 'ok',
    at,
    sentence: `Se deja de vender en línea el ${weekday} ${day} de ${month} a las ${draft.closeTime}.`,
    note:
      afterEvent && eventWindow
        ? `Esa fecha es después del evento (${eventRange(eventWindow, timeZone)}): no tendrá efecto.`
        : `${historyClockLabel(timeZone).replace(/^Horas/, 'Hora')}. En mesa se sigue vendiendo.`,
    afterEvent,
  };
}

export type DraftErrors = Partial<Record<'name' | 'price' | 'close', string>>;

export function draftInput(
  draft: PassDraft,
  timeZone: string,
  eventWindow: EventWindow | null,
): { ok: true; input: PassTypeInput } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Escribe el nombre del pase.';
  const priceCents = parseMxnToCents(draft.price);
  if (draft.price.trim() === '') errors.price = 'Escribe el precio. Usa 0 si es sin costo.';
  else if (priceCents === null)
    errors.price =
      'Escribe un precio válido en pesos, sin separadores de miles y con hasta 2 decimales, por ejemplo 1500 o 1500,50.';
  const close = checkClose(draft, timeZone, eventWindow);
  if (close.kind === 'invalid') errors.close = close.message;
  if (Object.keys(errors).length > 0 || priceCents === null) return { ok: false, errors };
  return {
    ok: true,
    input: {
      name,
      passClass: draft.passClass,
      priceCents,
      // The backend rejects a required class on anything but an add-on.
      requiresPassClass: draft.passClass === 'add_on' && draft.requires ? draft.requires : null,
      onlineSalesClosesAt: close.kind === 'ok' ? close.at : null,
    },
  };
}

const sameChoices = (left: AccessChoices, right: AccessChoices) =>
  [...new Set([...Object.keys(left), ...Object.keys(right)])].every(
    (id) => (left[id] ?? 'none') === (right[id] ?? 'none'),
  );

// Whether the draft differs from where it started (the stored pass, or an empty new one). The
// close date and time only count while the date is on.
export function isDraftDirty(start: PassDraft, draft: PassDraft) {
  return (
    start.name !== draft.name ||
    start.passClass !== draft.passClass ||
    start.price !== draft.price ||
    (draft.passClass === 'add_on' && start.requires !== draft.requires) ||
    start.closes !== draft.closes ||
    (draft.closes && (start.closeDay !== draft.closeDay || start.closeTime !== draft.closeTime)) ||
    !sameChoices(start.choices, draft.choices)
  );
}

// The activities a pass can link (active ones), by day on the event clock.
export const accessDays = (activities: CatalogActivity[], timeZone: string): AgendaDay[] =>
  agendaDays(activities, { tab: 'active', kind: null, query: '' }, timeZone);

const searchable = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();

// "Buscar actividad" and "Solo con acceso"; days left with no activity are dropped.
export function filterAccessDays(
  days: AgendaDay[],
  choices: AccessChoices,
  query: string,
  onlyWithAccess: boolean,
): AgendaDay[] {
  const wanted = searchable(query);
  return days
    .map((day) => ({
      ...day,
      activities: day.activities.filter(
        (activity) =>
          (!wanted || searchable(activity.name).includes(wanted)) &&
          (!onlyWithAccess || (choices[activity.id] ?? 'none') !== 'none'),
      ),
    }))
    .filter((day) => day.activities.length > 0);
}

// "Todas elegibles" / "Quitar acceso" for one day; other days keep their choices.
export const setDayAccess = (
  day: AgendaDay,
  choices: AccessChoices,
  choice: AccessChoice,
): AccessChoices => ({
  ...choices,
  ...Object.fromEntries(day.activities.map((activity) => [activity.id, choice])),
});

const listed = (days: AgendaDay[]) => days.flatMap((day) => day.activities);

const countOf = (days: AgendaDay[], choices: AccessChoices, access: AccessChoice) =>
  listed(days).filter((activity) => (choices[activity.id] ?? 'none') === access).length;

// "1 incluida · 3 elegibles de 16", over the active activities.
export function accessCounter(days: AgendaDay[], choices: AccessChoices) {
  const included = countOf(days, choices, 'included');
  const selectable = countOf(days, choices, 'selectable');
  return `${included} ${included === 1 ? 'incluida' : 'incluidas'} · ${selectable} ${
    selectable === 1 ? 'elegible' : 'elegibles'
  } de ${listed(days).length}`;
}

export function accessWarning(passClass: PassClass, days: AgendaDay[], choices: AccessChoices) {
  if (passClass === 'general') return null;
  if (countOf(days, choices, 'included') + countOf(days, choices, 'selectable') > 0) return null;
  return passClass === 'add_on'
    ? 'Un adicional sin actividades no suma nada al pase completo. Marca al menos una como incluida.'
    : 'Un pase completo sin actividades no da acceso a ninguna competencia. Marca las que puede escoger o las que incluye.';
}

// The whole desired access list: active activities only (the backend rejects archived ones),
// and "Sin acceso" sends nothing.
export const draftAccess = (days: AgendaDay[], choices: AccessChoices): PassTypeActivity[] =>
  listed(days).flatMap((activity) => {
    const access = choices[activity.id] ?? 'none';
    return access === 'none' ? [] : [{ activityId: activity.id, access }];
  });

// The review rows: changed fields, then each activity whose access changes in the access list
// order. A link to an archived activity is not a change by itself (the editor cannot list it),
// but a save of the access drops it, so once the access changes its drop is listed last.
export function draftChangeRows(
  passType: CatalogPassType,
  input: PassTypeInput,
  choices: AccessChoices,
  days: AgendaDay[],
  activities: CatalogActivity[],
  timeZone: string,
): ChangeRow[] {
  const shown = listed(days);
  const ids = new Set(shown.map((activity) => activity.id));
  const after = draftAccess(days, choices);
  const changed =
    passAccessRows(
      shown,
      passType.activities.filter((link) => ids.has(link.activityId)),
      after,
    ).length > 0;
  const order = [...shown, ...activities.filter((activity) => activity.status !== 'active')];
  return [
    ...passFieldRows(passType, input, timeZone),
    ...(changed ? passAccessRows(order, passType.activities, after) : []),
  ];
}

const salesNote = 'El nuevo precio aplica a las ventas siguientes.';

// The review note for a price change; `sold` is undefined when the snapshot is unknown.
export function priceNote(sold: number | undefined) {
  if (sold === undefined) return `Quien ya lo compró conserva el precio que pagó. ${salesNote}`;
  if (sold === 0) return salesNote;
  if (sold === 1) return `La persona que ya lo compró conserva el precio que pagó. ${salesNote}`;
  return `Las ${sold} personas que ya lo compraron conservan el precio que pagaron. ${salesNote}`;
}

// The archive dialog's buyers line; nothing to say when nobody bought it.
export function archiveBuyers(sold: number | undefined) {
  if (sold === undefined) return 'Quien ya lo compró lo conserva.';
  if (sold === 0) return null;
  if (sold === 1) return 'La persona que lo compró lo conserva.';
  return `Las ${sold} personas que lo compraron lo conservan.`;
}

export type PassPreview = {
  classLabel: string;
  name: string;
  // false while the name is still the placeholder.
  named: boolean;
  price: string;
  requires: string | null;
  included: string[];
  selectableTitle: string | null;
  selectable: string | null;
  empty: string | null;
  sale: string;
};

const previewClass: Record<PassClass, string> = {
  full: 'Pase completo',
  general: 'Entrada general',
  add_on: 'Adicional',
};
const previewRequires: Record<RequiredPassClass, string> = {
  full: 'Requiere un pase completo',
  general: 'Requiere entrada general',
};

const shortList = (names: string[]) =>
  names.length > 4 ? `${names.slice(0, 4).join(', ')} y ${names.length - 4} más` : names.join(', ');

// "Así se ve en la página de compra": what the draft would show buyers.
export function passPreview(
  draft: PassDraft,
  days: AgendaDay[],
  timeZone: string,
  eventWindow: EventWindow | null,
): PassPreview {
  const name = draft.name.trim();
  const cents = parseMxnToCents(draft.price);
  const included = listed(days).filter((activity) => draft.choices[activity.id] === 'included');
  const selectable = listed(days).filter((activity) => draft.choices[activity.id] === 'selectable');
  const close = checkClose(draft, timeZone, eventWindow);
  return {
    classLabel: previewClass[draft.passClass],
    name: name || 'Nombre del pase',
    named: name !== '',
    price: cents === null ? '$—' : passPriceLabel(cents),
    requires:
      draft.passClass === 'add_on' && draft.requires ? previewRequires[draft.requires] : null,
    included: included.map((activity) => activity.name),
    selectableTitle: selectable.length
      ? `Escoge entre ${selectable.length} ${selectable.length === 1 ? 'competencia' : 'competencias'}`
      : null,
    selectable: selectable.length ? shortList(selectable.map((activity) => activity.name)) : null,
    empty:
      included.length + selectable.length > 0
        ? null
        : draft.passClass === 'general'
          ? 'Entrada al evento.'
          : 'Sin actividades todavía.',
    sale:
      close.kind === 'ok'
        ? `Venta en línea: hasta el ${formatEventTime(close.at, timeZone)}.`
        : close.kind === 'invalid'
          ? 'Venta en línea: hasta una fecha por definir.'
          : 'Venta en línea: mientras el evento venda.',
  };
}
