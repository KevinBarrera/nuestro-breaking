import { ThemeToggle } from '@/features/theme-toggle';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

type PublicFrameProps = {
  // Address of the 44px "Volver" link in the header, on the purchase steps.
  backTo?: string;
  // Short context on the right of the header from sm up, such as the event dates.
  aside?: string | null;
  children: ReactNode;
};

// The public purchase frame (#176): brand bar, navy header with the theme toggle, and a page
// background that follows the theme (the body gradient is admin-dark in both themes).
export function PublicFrame({ backTo, aside, children }: PublicFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-fg">
      <div aria-hidden="true" className="h-[5px] shrink-0 bg-brand-bar" />
      <header className="bg-header text-header-fg">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1 py-2 pr-3 pl-2 sm:pr-5 lg:px-12">
          {backTo ? (
            <Link
              to={backTo}
              aria-label="Volver"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-header-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-header-fg"
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
          ) : null}
          <span
            className={`min-w-0 flex-1 text-[15px] font-extrabold tracking-[0.06em] uppercase ${backTo ? '' : 'pl-3'}`}
          >
            Los más pesados
          </span>
          {aside ? (
            <span className="hidden text-sm text-header-muted sm:inline">{aside}</span>
          ) : null}
          <ThemeToggle className="ml-2 border-header-line text-header-fg hover:bg-header-control focus-visible:outline-header-fg" />
        </div>
      </header>
      {children}
    </div>
  );
}
