import {
  formatMxn,
  type CatalogActivity,
  type CatalogPassType,
  type PassTypeActivity,
  type PassTypeInput,
} from '@/entities/event-catalog';
import { changedRows, type ChangeRow } from '@/shared/ui';
import { accessLabels, passClassLabels } from './catalog-copy';

const empty = '—';
const noAccess = 'Sin acceso';

// Rows for "Revisar cambios" on a pass: each changed field in the words the organizer reads on
// the pass screens (class label, price in pesos, required class). A new pass has no `before`,
// so its fields are listed against "—"; it starts with no required class, so "Ninguno" is only
// listed when an add-on actually requires one.
export function passFieldRows(
  before: CatalogPassType | undefined,
  after: PassTypeInput,
): ChangeRow[] {
  const classLabel = (value: unknown) =>
    value === undefined ? empty : passClassLabels[value as PassTypeInput['passClass']];
  const price = (value: unknown) => (value === undefined ? empty : formatMxn(value as number));
  const required = (value: unknown) =>
    value ? passClassLabels[value as PassTypeInput['passClass']] : 'Ninguno';

  return changedRows([
    { key: 'name', label: 'Nombre', before: before?.name, after: after.name },
    {
      key: 'passClass',
      label: 'Clase',
      before: before?.passClass,
      after: after.passClass,
      format: classLabel,
    },
    {
      key: 'price',
      label: 'Precio',
      before: before?.priceCents,
      after: after.priceCents,
      format: price,
    },
    {
      key: 'requiresPassClass',
      label: 'Requiere pase',
      before: before ? before.requiresPassClass : null,
      after: after.requiresPassClass,
      format: required,
    },
  ]);
}

// One row per activity whose access changes, labeled with the activity name and read as
// "Sin acceso → Incluida". Rows follow `activities` (the access list order); a link to an
// activity that is not in it is listed last under a generic name.
export function passAccessRows(
  activities: CatalogActivity[],
  before: PassTypeActivity[],
  after: PassTypeActivity[],
): ChangeRow[] {
  const order = new Map(activities.map((activity, index) => [activity.id, index]));
  const name = (id: string) =>
    activities.find((activity) => activity.id === id)?.name ?? 'Actividad no disponible';
  const label = (links: PassTypeActivity[], id: string) => {
    const access = links.find((link) => link.activityId === id)?.access;
    return access ? accessLabels[access] : noAccess;
  };
  const ids = [...new Set([...before, ...after].map((link) => link.activityId))].sort(
    (left, right) =>
      (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
  return changedRows(
    ids.map((id) => ({
      key: `access:${id}`,
      label: name(id),
      before: label(before, id),
      after: label(after, id),
    })),
  );
}
