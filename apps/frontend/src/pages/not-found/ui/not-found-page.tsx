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
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          to={routes.admin}
        >
          Admin area
        </Link>
        <Link
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900"
          to={routes.dancer}
        >
          Dancer area
        </Link>
      </nav>
    </PageShell>
  );
}
