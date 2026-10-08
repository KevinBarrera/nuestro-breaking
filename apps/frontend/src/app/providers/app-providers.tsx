import type { PropsWithChildren } from 'react';

// The router is created in `app/router` as a data router (`createBrowserRouter`), so no
// router provider wraps the app here.
export function AppProviders({ children }: PropsWithChildren) {
  return <>{children}</>;
}
