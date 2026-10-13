import { routes } from '@/shared/config';
import { Link } from 'react-router';
import { eventSectionPath, type AdminLocation, type EventSection } from './admin-location';
import { eventListRequest } from './event-list-request';

type NavItem = { label: string; section?: EventSection; upcoming?: boolean };

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: 'OPERACIÓN',
    items: [
      { label: 'Resumen', section: 'overview' },
      { label: 'Check-in', section: 'check-in' },
      { label: 'Inscripciones', upcoming: true },
      { label: 'Listas de respaldo', upcoming: true },
    ],
  },
  {
    title: 'CATÁLOGO',
    items: [
      { label: 'Actividades', section: 'activities' },
      { label: 'Pases', section: 'passes' },
    ],
  },
  // Datos del evento (#213 D2), the former "Fundamentos del evento" route.
  { title: 'EVENTO', items: [{ label: 'Datos del evento', section: 'foundation' }] },
];

const itemClass =
  'flex min-h-11 items-center justify-between gap-2 rounded-md px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type AdminSideNavProps = {
  location: AdminLocation;
  // The event list landing (`/admin`, `/admin/events/new`) marks Todos los eventos current.
  onLanding: boolean;
  // Equipo (#214) is only for global admins; `onTeam` marks it current on its screens.
  showTeam: boolean;
  onTeam: boolean;
};

const linkClass = `${itemClass} font-medium text-fg hover:bg-row aria-[current=page]:bg-nav-active aria-[current=page]:font-semibold aria-[current=page]:text-nav-active-fg`;

export function AdminSideNav({ location, onLanding, showTeam, onTeam }: AdminSideNavProps) {
  function renderItem(item: NavItem) {
    // Event sections, Resumen included, need an event in the URL; the event list itself is
    // "Todos los eventos" at the top.
    const target =
      item.section && location.eventId
        ? eventSectionPath(location.eventId, item.section)
        : undefined;
    if (!target)
      return (
        <a
          role="link"
          aria-disabled="true"
          className={`${itemClass} cursor-not-allowed text-muted`}
        >
          {item.label}
          {item.upcoming && (
            <span className="rounded bg-chip px-1.5 py-0.5 text-xs font-medium">Próximamente</span>
          )}
        </a>
      );
    return (
      <Link
        to={target}
        aria-current={item.section === location.section ? 'page' : undefined}
        className={linkClass}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <nav
      aria-label="Navegación administrativa"
      className="border-b border-sidenav-line bg-sidenav px-4 py-5 md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0 md:py-6"
    >
      {/* The way back to the event list (Crear evento, Archivados) from any screen, for every
          admin; its state keeps the one-event redirect from bouncing them straight back. */}
      <ul className="mb-4 flex flex-col gap-1">
        <li>
          <Link
            to={routes.admin}
            state={eventListRequest}
            aria-current={onLanding ? 'page' : undefined}
            className={linkClass}
          >
            Todos los eventos
          </Link>
        </li>
      </ul>
      {groups.map((group) => (
        <div key={group.title} className="mb-4 last:mb-0">
          <p className="px-3 pb-2 text-xs font-bold tracking-[0.08em] text-muted">{group.title}</p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.label}>{renderItem(item)}</li>
            ))}
          </ul>
        </div>
      ))}
      {showTeam && (
        <div className="mb-4 last:mb-0">
          <p className="px-3 pb-2 text-xs font-bold tracking-[0.08em] text-muted">ADMINISTRACIÓN</p>
          <ul className="flex flex-col gap-1">
            <li>
              <Link
                to={routes.adminTeam}
                aria-current={onTeam ? 'page' : undefined}
                className={linkClass}
              >
                Equipo
              </Link>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}
