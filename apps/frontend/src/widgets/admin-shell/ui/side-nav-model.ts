import type { EventSection } from './admin-location';

// The event sections of the side navigation (#313), in collapsible groups.
export type NavGroupId = 'operation' | 'catalog' | 'settings';
export type NavItem = { label: string; section: EventSection };
export type NavGroup = { id: NavGroupId; title: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    id: 'operation',
    title: 'Operación',
    items: [
      { label: 'Resumen', section: 'overview' },
      { label: 'Check-in', section: 'check-in' },
      { label: 'Pagos por revisar', section: 'payments-review' },
      { label: 'Inscripciones', section: 'registrations' },
      { label: 'Historial', section: 'history' },
      { label: 'Listas de respaldo', section: 'lists' },
    ],
  },
  {
    id: 'catalog',
    title: 'Catálogo',
    items: [
      { label: 'Actividades', section: 'activities' },
      { label: 'Pases', section: 'passes' },
    ],
  },
  // Datos del evento (#213 D2), the former "Fundamentos del evento" route.
  {
    id: 'settings',
    title: 'Configuración',
    items: [{ label: 'Datos del evento', section: 'foundation' }],
  },
];

export function groupOfSection(section: EventSection | undefined): NavGroupId | undefined {
  return navGroups.find((group) => group.items.some((item) => item.section === section))?.id;
}

// The group holding the current section opens; groups the admin opened stay open. The same set
// comes back when nothing changes, so React skips the update.
export function openGroupsFor(
  open: ReadonlySet<NavGroupId>,
  section: EventSection | undefined,
): ReadonlySet<NavGroupId> {
  const group = groupOfSection(section);
  if (!group || open.has(group)) return open;
  return new Set([...open, group]);
}
