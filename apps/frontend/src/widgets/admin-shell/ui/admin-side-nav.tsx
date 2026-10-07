import { routes } from '@/shared/config';
import { Link } from 'react-router';
import { eventSectionPath, type AdminLocation, type EventSection } from './admin-location';

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
      { label: 'Pases', section: 'pass-types' },
    ],
  },
];

const itemClass =
  'flex min-h-11 items-center justify-between gap-2 rounded-md px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

type AdminSideNavProps = { location: AdminLocation; onLanding: boolean };

export function AdminSideNav({ location, onLanding }: AdminSideNavProps) {
  function renderItem(item: NavItem) {
    // Without an event in the URL, Resumen falls back to the event list landing.
    const overview = item.section === 'overview';
    const target =
      item.section && location.eventId
        ? eventSectionPath(location.eventId, item.section)
        : overview
          ? routes.admin
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
    const active = item.section === location.section || (overview && onLanding);
    return (
      <Link
        to={target}
        aria-current={active ? 'page' : undefined}
        className={`${itemClass} font-medium text-fg hover:bg-row aria-[current=page]:bg-nav-active aria-[current=page]:font-semibold aria-[current=page]:text-nav-active-fg`}
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
    </nav>
  );
}
