import { routes } from '@/shared/config';
import { Link } from 'react-router';

type CatalogPageHeaderProps = {
  eventId: string;
  title: string;
  current: 'activities' | 'pass-types';
};

const tab =
  'inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-cyan-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 aria-[current=page]:bg-cyan-950 aria-[current=page]:text-cyan-100';

export function CatalogPageHeader({ eventId, title, current }: CatalogPageHeaderProps) {
  return (
    <header className="border-b border-slate-700 pb-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
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
