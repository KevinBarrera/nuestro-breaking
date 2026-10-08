import { ThemeToggle } from '@/features/theme-toggle';
import { routes } from '@/shared/config';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { readAdminLocation } from './admin-location';
import { AdminSideNav } from './admin-side-nav';
import { EventSelector } from './event-selector';
import { useAdminEvents } from './use-admin-events';

type AdminShellProps = PropsWithChildren<{
  signingOut: boolean;
  signOutFailed: boolean;
  onSignOut: () => void;
}>;

const headerControl =
  'min-h-11 rounded-md border border-header-line px-3 text-sm font-semibold text-header-fg hover:bg-header-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-header-fg';

export function AdminShell({ signingOut, signOutFailed, onSignOut, children }: AdminShellProps) {
  const { pathname } = useLocation();
  const location = readAdminLocation(pathname);
  const events = useAdminEvents();
  const content = useRef<HTMLDivElement>(null);

  // The content column, not the window, scrolls from md up, so a new route starts at its top.
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    // From md up the shell fills the viewport: the header, brand bar and side navigation stay
    // in place and only the content column scrolls. Below md the page scrolls as one column.
    <div className="flex min-h-dvh flex-col bg-page font-sans text-fg md:h-dvh md:overflow-hidden">
      <header
        aria-label="Espacio de administración"
        className="shrink-0 bg-header px-4 py-3 sm:px-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-header-fg">
            <span className="text-base font-extrabold tracking-[0.08em]">LOS MÁS PESADOS</span>
            <span className="rounded border border-header-line px-2 py-0.5 text-xs font-semibold tracking-[0.06em] text-header-muted">
              ADMIN
            </span>
            {location.section === 'foundation' && (
              <span className="text-sm text-header-muted">Fundamentos del evento</span>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <EventSelector events={events} location={location} />
            <ThemeToggle className="border-header-line text-header-fg hover:bg-header-control focus-visible:outline-header-fg" />
            <button
              type="button"
              disabled={signingOut}
              onClick={onSignOut}
              className={`${headerControl} disabled:cursor-wait disabled:opacity-60`}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
        {signOutFailed && (
          <p role="alert" className="mt-3 text-sm text-header-fg">
            No se pudo cerrar sesión.
          </p>
        )}
      </header>
      <div aria-hidden="true" className="h-[5px] shrink-0 bg-brand-bar" />
      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <AdminSideNav location={location} onLanding={pathname === routes.admin} />
        <div ref={content} className="min-w-0 flex-1 md:overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
