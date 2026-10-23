import { routes } from '@/shared/config';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { eventSectionPath, type AdminLocation } from './admin-location';
import { eventListRequest } from './event-list-request';
import {
  CalendarIcon,
  CatalogIcon,
  ChevronIcon,
  LockIcon,
  OperationIcon,
  SettingsIcon,
  TeamIcon,
} from './nav-icons';
import { navGroups, openGroupsFor, type NavGroup, type NavGroupId } from './side-nav-model';
import { useFlaggedPaymentsCount } from './use-flagged-payments-count';

const groupIcons: Record<NavGroupId, () => ReactNode> = {
  operation: OperationIcon,
  catalog: CatalogIcon,
  settings: SettingsIcon,
};

const rowClass =
  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
const linkClass = `${rowClass} text-fg hover:bg-row aria-[current=page]:bg-nav-active aria-[current=page]:font-semibold aria-[current=page]:text-nav-active-fg`;
const sectionTitle = 'px-3 text-xs font-semibold text-muted';

type AdminSideNavProps = {
  location: AdminLocation;
  // The event list landing (`/admin`, `/admin/events/new`) marks Todos los eventos current.
  onLanding: boolean;
  // Equipo (#214) is only for global admins; `onTeam` marks it current on its screens.
  showTeam: boolean;
  onTeam: boolean;
};

export function AdminSideNav({ location, onLanding, showTeam, onTeam }: AdminSideNavProps) {
  const hintId = useId();
  return (
    <nav
      aria-label="Navegación administrativa"
      className="flex flex-col gap-5 border-b border-sidenav-line bg-sidenav px-3 py-5 md:w-72 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0 md:pb-6 print:hidden"
    >
      <div className="flex flex-col gap-0.5">
        <p className={`${sectionTitle} pb-1.5`}>General</p>
        <ul className="flex flex-col gap-0.5">
          {/* The way back to the event list (Crear evento, Archivados) from any screen, for
              every admin; its state keeps the one-event redirect from bouncing them back. */}
          <li>
            <Link
              to={routes.admin}
              state={eventListRequest}
              aria-current={onLanding ? 'page' : undefined}
              className={`${linkClass} font-semibold`}
            >
              <CalendarIcon />
              Todos los eventos
            </Link>
          </li>
          {showTeam && (
            <li>
              <Link
                to={routes.adminTeam}
                aria-current={onTeam ? 'page' : undefined}
                className={`${linkClass} font-semibold`}
              >
                <TeamIcon />
                Equipo
              </Link>
            </li>
          )}
        </ul>
      </div>
      <div aria-hidden="true" className="mx-3 h-px bg-line" />
      <div className="flex flex-col gap-2">
        <p className={sectionTitle}>Evento</p>
        {location.eventId ? (
          <EventGroups eventId={location.eventId} location={location} />
        ) : (
          <>
            {/* Event sections need an event in the URL; Todos los eventos lists them. */}
            <p id={hintId} className="px-3 pb-1 text-sm text-muted">
              Elige un evento de la lista para usar estas secciones.
            </p>
            <ul className="flex flex-col gap-0.5">
              {navGroups.map((group) => {
                const GroupIcon = groupIcons[group.id];
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      disabled
                      aria-describedby={hintId}
                      className={`${rowClass} font-semibold text-fg opacity-50`}
                    >
                      <GroupIcon />
                      <span className="flex-1">{group.title}</span>
                      <LockIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </nav>
  );
}

function EventGroups({ eventId, location }: { eventId: string; location: AdminLocation }) {
  const [open, setOpen] = useState(() => openGroupsFor(new Set(), location.section));
  // Moving to a section in a closed group opens that group.
  const [shownSection, setShownSection] = useState(location.section);
  if (shownSection !== location.section) {
    setShownSection(location.section);
    setOpen(openGroupsFor(open, location.section));
  }
  const flagged = useFlaggedPaymentsCount(eventId);

  function toggle(id: NavGroupId) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {navGroups.map((group) => (
        <li key={group.id}>
          <EventGroup
            group={group}
            expanded={open.has(group.id)}
            onToggle={() => toggle(group.id)}
            eventId={eventId}
            location={location}
            flagged={flagged}
          />
        </li>
      ))}
    </ul>
  );
}

type EventGroupProps = {
  group: NavGroup;
  expanded: boolean;
  onToggle: () => void;
  eventId: string;
  location: AdminLocation;
  flagged: number;
};

function EventGroup({ group, expanded, onToggle, eventId, location, flagged }: EventGroupProps) {
  const listId = useId();
  const GroupIcon = groupIcons[group.id];
  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={onToggle}
        className={`${rowClass} cursor-pointer font-semibold text-fg hover:bg-row`}
      >
        <GroupIcon />
        <span className="flex-1">{group.title}</span>
        <span
          className={`text-muted transition-transform motion-reduce:transition-none ${expanded ? '' : '-rotate-90'}`}
        >
          <ChevronIcon />
        </span>
      </button>
      {expanded && (
        <ul
          id={listId}
          className="mt-0.5 mb-1 ml-5 flex flex-col gap-0.5 border-l border-line pl-2"
        >
          {group.items.map((item) => (
            <li key={item.section}>
              <Link
                to={eventSectionPath(eventId, item.section)}
                aria-current={item.section === location.section ? 'page' : undefined}
                className={`${linkClass} justify-between`}
              >
                {item.label}
                {item.section === 'payments-review' && flagged > 0 && (
                  <span className="rounded-full border border-warning-fg bg-warning px-2 text-xs leading-4 font-semibold text-warning-fg">
                    <span aria-hidden="true">{flagged}</span>
                    <span className="sr-only">({flagged} pendientes)</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
