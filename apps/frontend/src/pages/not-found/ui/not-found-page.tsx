import { routes } from '@/shared/config';
import { PageShell } from '@/shared/ui';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <PageShell
      title="Page not found"
      description="Choose one of the currently defined public route areas."
    >
      <nav className="flex flex-wrap justify-center gap-3" aria-label="Available route areas">
        <Link
          className="rounded-md bg-[var(--event-cyan)] px-4 py-2 text-sm font-medium text-[var(--event-ink)]"
          to={routes.admin}
        >
          Admin area
        </Link>
        <Link
          className="rounded-md border border-[var(--event-orange)] px-4 py-2 text-sm font-medium text-[var(--event-cream)]"
          to={routes.dancer}
        >
          Dancer area
        </Link>
      </nav>
    </PageShell>
  );
}
