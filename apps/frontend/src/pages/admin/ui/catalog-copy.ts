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
  selectable: 'Seleccionable',
  included: 'Incluida',
};

export const styles = {
  primary:
    'min-h-11 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-50',
  secondary:
    'min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-50',
  danger:
    'min-h-11 rounded-lg border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:cursor-wait disabled:opacity-50',
  field:
    'mt-1 block min-h-11 w-full rounded-lg border border-slate-500 bg-slate-950 px-3 py-2 text-base text-white focus-visible:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
  label: 'block text-sm font-semibold text-slate-200',
  card: 'rounded-xl border border-slate-700 bg-slate-900 p-5',
};
