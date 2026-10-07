import { routes } from '@/shared/config';
import { Link } from 'react-router';

type CatalogPageHeaderProps = {
  eventId: string;
  title: string;
  current: 'activities' | 'pass-types';
};

const tab =
  'inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-link hover:bg-row focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[current=page]:bg-chip aria-[current=page]:text-link';

export function CatalogPageHeader({ eventId, title, current }: CatalogPageHeaderProps) {
  return (
    <header className="border-b border-line pb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-link">
        Nuestro Breaking · Catálogo del evento
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
      <nav aria-label="Catálogo del evento" className="mt-4 flex flex-wrap gap-2">
        <Link
          className={tab}
          aria-current={current === 'activities' ? 'page' : undefined}
          to={routes.adminEventActivities.replace(':eventId', eventId)}
        >
          Actividades
        </Link>
        <Link
          className={tab}
          aria-current={current === 'pass-types' ? 'page' : undefined}
          to={routes.adminEventPassTypes.replace(':eventId', eventId)}
        >
          Pases
        </Link>
      </nav>
    </header>
  );
}
