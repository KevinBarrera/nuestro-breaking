import { eventDayKey, formatEventClock, formatEventDay, formatMxn } from '@/entities/event-catalog';
import type { HistoryCashValues, HistoryItem } from '@/entities/registration-history';
import {
  cashLine,
  changedFieldsLabel,
  historyActorLabel,
  historyDetailLine,
  historyTitle,
  statusLabel,
} from './history-model';

// Historial redesign (#357): the loaded history pages as day groups of entries, with on-site
// registrations collapsed into one entry and corrections as Antes / Después rows.

// Pill and icon of an entry: corrections, registrations (on-site or online), complimentary passes,
// and the rest (expiries, unknown operations) without a pill.
export type HistoryKind = 'correction' | 'registration' | 'complimentary' | 'other';

// One Antes / Después row; `before` is null for a row that only names what changed.
export type HistoryDiffRow = { label: string; before: string | null; after: string; mono?: true };

export type HistoryCompetitions = { passName: string | null; added: string[]; removed: string[] };

// One original operation inside a grouped "Inscripción en mesa".
export type HistoryStep = { id: string; time: string; label: string; detail: string | null };

export type HistoryEntry = {
  id: string;
  time: string;
  title: string;
  kind: HistoryKind;
  registration: HistoryItem['registration'];
  actor: string;
  summary: string | null;
  diff: HistoryDiffRow[];
  competitions: HistoryCompetitions | null;
  reason: string | null;
  steps: HistoryStep[];
};

export type HistoryDay = {
  key: string;
  label: string;
  countLabel: string;
  day: number;
  month: string;
  entries: HistoryEntry[];
};

const CORRECTIONS = new Set([
  'registration_void',
  'registration_correction',
  'registration_discipline_swap',
  'cash_correction',
]);
// Operations that join their on-site registration within this window (#357).
const GROUP_WINDOW_MS = 15 * 60 * 1000;
const GROUPED = new Set(['pass_assignment', 'cash_confirmation']);

export const movementsLabel = (count: number) =>
  count === 1 ? '1 movimiento' : `${count} movimientos`;

const competitionNames = (names: string[]) =>
  names.length > 0 ? names.join(', ') : 'Sin competencias';
const receiptName = (receipt: string | null) => receipt ?? 'Sin recibo';
const amountName = (amountCents: number | null) =>
  amountCents === null ? 'Sin monto' : formatMxn(amountCents);

// A selection change needs a reason only once the registration is confirmed (#170), so a reason
// marks the corrections the "Correcciones" filter keeps.
function kindOf(item: HistoryItem): HistoryKind {
  const { kind } = item.details;
  if (CORRECTIONS.has(kind)) return 'correction';
  if (kind === 'pass_selection_change') return item.reason ? 'correction' : 'registration';
  if (kind === 'complimentary_confirmation') return 'complimentary';
  if (kind === 'registration_expiry' || kind === 'other') return 'other';
  return 'registration';
}

function cashRows(previous: HistoryCashValues, current: HistoryCashValues) {
  const diff: HistoryDiffRow[] = [];
  const unchanged: string[] = [];
  if (previous.amountCents !== current.amountCents)
    diff.push({
      label: 'Monto',
      before: amountName(previous.amountCents),
      after: amountName(current.amountCents),
      mono: true,
    });
  else unchanged.push(`Monto ${amountName(current.amountCents)}, sin cambios`);
  if (previous.receipt !== current.receipt)
    diff.push({
      label: 'Recibo',
      before: receiptName(previous.receipt),
      after: receiptName(current.receipt),
      mono: true,
    });
  else unchanged.push(current.receipt ? `Recibo ${current.receipt}, sin cambios` : 'Sin recibo');
  return { diff, summary: unchanged.length > 0 ? unchanged.join(' · ') : null };
}

// What an operation changed: rows, competitions or a one-line summary.
function changes(item: HistoryItem): Pick<HistoryEntry, 'summary' | 'diff' | 'competitions'> {
  const none = { summary: null, diff: [], competitions: null };
  const { details } = item;
  switch (details.kind) {
    case 'cash_correction':
      return { ...none, ...cashRows(details.previous, details.current) };
    case 'registration_discipline_swap': {
      const diff: HistoryDiffRow[] = [
        {
          label: 'Pase',
          before: details.fromPassTypeName ?? 'Pase desconocido',
          after: details.toPassTypeName ?? 'Pase desconocido',
        },
      ];
      if (details.fromActivityNames.length > 0 || details.toActivityNames.length > 0)
        diff.push({
          label: 'Competencias',
          before: competitionNames(details.fromActivityNames),
          after: competitionNames(details.toActivityNames),
        });
      return { ...none, diff };
    }
    case 'registration_void':
    case 'registration_expiry':
      return details.fromStatus && details.toStatus
        ? {
            ...none,
            diff: [
              {
                label: 'Estado',
                before: statusLabel(details.fromStatus),
                after: statusLabel(details.toStatus),
              },
            ],
          }
        : none;
    case 'registration_correction': {
      const fields = changedFieldsLabel(details.changedFields);
      return fields ? { ...none, diff: [{ label: 'Cambió', before: null, after: fields }] } : none;
    }
    case 'pass_selection_change': {
      const { fromActivityNames: from, toActivityNames: to } = details;
      const added = to.filter((name) => !from.includes(name));
      const removed = from.filter((name) => !to.includes(name));
      if (added.length === 0 && removed.length === 0)
        return { ...none, summary: 'Sin cambios en las competencias' };
      return { ...none, competitions: { passName: details.passTypeName, added, removed } };
    }
    case 'complimentary_confirmation':
      return { ...none, summary: 'Pase sin costo' };
    default:
      return { ...none, summary: historyDetailLine(details) };
  }
}

export function historyEntry(item: HistoryItem, timeZone: string): HistoryEntry {
  return {
    id: item.id,
    time: formatEventClock(item.occurredAt, timeZone),
    title: historyTitle(item.details.kind),
    kind: kindOf(item),
    registration: item.registration,
    actor: historyActorLabel(item.actor),
    ...changes(item),
    reason: item.reason?.trim() || null,
    steps: [],
  };
}

const sameActor = (a: HistoryItem['actor'], b: HistoryItem['actor']) =>
  a.kind === b.kind && a.name === b.name;

// The passes and cash payment that belong to an on-site registration: same registration and
// actor, added within the window after it.
function companions(lead: HistoryItem, page: HistoryItem[]) {
  const start = Date.parse(lead.occurredAt);
  return page.filter((other) => {
    if (!GROUPED.has(other.details.kind)) return false;
    if (other.registration.id !== lead.registration.id || !sameActor(other.actor, lead.actor))
      return false;
    const elapsed = Date.parse(other.occurredAt) - start;
    return elapsed >= 0 && elapsed <= GROUP_WINDOW_MS;
  });
}

function onSiteEntry(lead: HistoryItem, members: HistoryItem[], timeZone: string): HistoryEntry {
  // Oldest first, as the operations happened; the API sends equal times newest id first.
  const steps = [lead, ...[...members].reverse()];
  const passes = steps.flatMap((step) =>
    step.details.kind === 'pass_assignment'
      ? [step.details.passTypeName ?? 'Pase desconocido']
      : [],
  );
  const cash = steps.flatMap((step) =>
    step.details.kind === 'cash_confirmation'
      ? [
          `${amountName(step.details.amountCents)} en efectivo, ${step.details.receipt === null ? 'sin recibo' : `recibo ${step.details.receipt}`}`,
        ]
      : [],
  );
  const summary = [passes.join(' + '), ...cash].filter(Boolean).join(' · ');
  return {
    ...historyEntry(lead, timeZone),
    title: 'Inscripción en mesa',
    summary: summary || null,
    steps: steps.map((step) => ({
      id: step.id,
      time: formatEventClock(step.occurredAt, timeZone),
      label: historyTitle(step.details.kind),
      detail:
        step.details.kind === 'pass_assignment'
          ? (step.details.passTypeName ?? 'Pase desconocido')
          : step.details.kind === 'cash_confirmation'
            ? cashLine(step.details)
            : null,
    })),
  };
}

// One page's entries in order; a group sits where its registration is. A group never reaches
// into another page, so one that crosses a page boundary shows split.
function pageEntries(page: HistoryItem[], timeZone: string) {
  const grouped = new Map<string, HistoryItem[]>();
  const taken = new Set<string>();
  for (const lead of page) {
    if (lead.details.kind !== 'manual_registration') continue;
    const members = companions(lead, page).filter((member) => !taken.has(member.id));
    if (members.length === 0) continue;
    grouped.set(lead.id, members);
    for (const member of members) taken.add(member.id);
  }
  return page.flatMap((item) => {
    if (taken.has(item.id)) return [];
    const members = grouped.get(item.id);
    return [
      {
        occurredAt: item.occurredAt,
        entry: members ? onSiteEntry(item, members, timeZone) : historyEntry(item, timeZone),
      },
    ];
  });
}

function dayParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone,
    day: 'numeric',
    month: 'long',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return { day: Number(part('day')), month: part('month') };
}

// The loaded pages, newest first, grouped by day on the event's clock. "Hoy" marks today.
export function historyDays(pages: HistoryItem[][], timeZone: string, now: Date): HistoryDay[] {
  const today = eventDayKey(now.toISOString(), timeZone);
  const days: HistoryDay[] = [];
  for (const { occurredAt, entry } of pages.flatMap((page) => pageEntries(page, timeZone))) {
    const key = eventDayKey(occurredAt, timeZone);
    let day = days.at(-1);
    if (day?.key !== key) {
      const heading = formatEventDay(occurredAt, timeZone);
      day = {
        key,
        label:
          key === today ? `Hoy · ${heading.charAt(0).toLowerCase()}${heading.slice(1)}` : heading,
        countLabel: '',
        ...dayParts(occurredAt, timeZone),
        entries: [],
      };
      days.push(day);
    }
    day.entries.push(entry);
  }
  for (const day of days) day.countLabel = movementsLabel(day.entries.length);
  return days;
}

// "Mostrando del 20 al 23 de octubre · 9 movimientos" for the loaded days.
export function historyRangeLabel(days: HistoryDay[]): string {
  const newest = days.at(0);
  const oldest = days.at(-1);
  if (!newest || !oldest) return '';
  const count = movementsLabel(days.reduce((total, day) => total + day.entries.length, 0));
  if (newest === oldest) return `Mostrando el ${newest.day} de ${newest.month} · ${count}`;
  const from = oldest.month === newest.month ? `${oldest.day}` : `${oldest.day} de ${oldest.month}`;
  return `Mostrando del ${from} al ${newest.day} de ${newest.month} · ${count}`;
}

// Spanish city names for the zones the events use; other zones show their own city name.
const cityNames: Record<string, string> = {
  Mexico_City: 'Ciudad de México',
  Cancun: 'Cancún',
  Merida: 'Mérida',
  Mazatlan: 'Mazatlán',
};

export function historyClockLabel(timeZone: string | null): string {
  if (!timeZone) return 'Horas de este dispositivo';
  const city = timeZone.split('/').at(-1) ?? timeZone;
  return `Horas de ${cityNames[city] ?? city.replace(/_/g, ' ')}`;
}
