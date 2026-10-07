import type {
  ActivityAccess,
  CatalogFailure,
  CatalogStatus,
  PassClass,
} from '@/entities/event-catalog';

// Spanish copy and shared styles for the admin catalog screens.
export const failureMessages: Record<CatalogFailure, string> = {
  denied: 'Sin acceso: tu cuenta no puede administrar el catálogo de este evento.',
  'not-found': 'No se encontró el evento o el registro. Recarga la página e inténtalo de nuevo.',
  conflict:
    'Conflicto: otra persona cambió este registro o ya existe uno activo con ese nombre. Recarga la lista e inténtalo de nuevo.',
  invalid: 'Datos inválidos. Revisa los campos e inténtalo de nuevo.',
  error: 'No se pudo completar la operación. Inténtalo de nuevo más tarde.',
};

export const activityStatusLabels: Record<CatalogStatus, string> = {
  active: 'Activa',
  archived: 'Archivada',
};

export const passStatusLabels: Record<CatalogStatus, string> = {
  active: 'Activo',
  archived: 'Archivado',
};

export const passClassLabels: Record<PassClass, string> = {
  full: 'Completo',
  general: 'General',
  add_on: 'Adicional',
};

export const accessLabels: Record<ActivityAccess, string> = {
  selectable: 'Elegible',
  included: 'Incluida',
};

const activityKindLabels: Record<string, string> = {
  battle: 'Batalla',
  competition: 'Competencia',
  workshop: 'Taller',
  social: 'Social',
};

// Known kinds read in Spanish; any other kind is shown as stored.
export const activityKindLabel = (kind: string) => activityKindLabels[kind] ?? kind;

export const styles = {
  primary:
    'min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50',
  secondary:
    'min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-fg hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50',
  danger:
    'min-h-11 rounded-lg border border-danger-fg px-4 py-2 text-sm font-semibold text-danger-fg hover:bg-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50',
  field:
    'mt-1 block min-h-11 w-full rounded-lg border border-input-line bg-input px-3 py-2 text-base text-fg focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
  label: 'block text-sm font-semibold text-fg',
  card: 'rounded-xl border border-line bg-surface p-5',
};
