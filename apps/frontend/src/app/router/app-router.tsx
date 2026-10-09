import { NotFoundPage } from '@/pages/not-found';
import {
  PublicHomePage,
  PublicPassesPage,
  PublicPurchaseLayout,
  PurchaseStepPage,
} from '@/pages/public-purchase';
import { routes } from '@/shared/config';
import {
  createBrowserRouter,
  generatePath,
  Navigate,
  useParams,
  type RouteObject,
} from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { RoleAreaBoundary } from './role-area-boundary';

// Old bookmarks of the pass list keep working; the redirect replaces the history entry.
function LegacyPassTypesRedirect() {
  const { eventId = '' } = useParams<'eventId'>();
  return <Navigate replace to={generatePath(routes.adminEventPasses, { eventId })} />;
}

// D7: the admin and dancer areas load on demand (route `lazy`), so buyers on the public flow
// never download them. The router resolves a lazy route before rendering it; on a first load
// it shows this blank page meanwhile.
const routeFallback = <div aria-busy="true" className="min-h-dvh" />;

type AdminPages = typeof import('@/pages/admin');
const adminPage = (name: keyof AdminPages) => ({
  hydrateFallbackElement: routeFallback,
  lazy: async () => ({ Component: (await import('@/pages/admin'))[name] }),
});

// A data router, so screens can use data-router APIs such as `useBlocker`.
const appRoutes: RouteObject[] = [
  {
    // Public purchase (#176), outside every session boundary.
    element: <PublicPurchaseLayout />,
    children: [
      { path: routes.publicHome, element: <PublicHomePage /> },
      { path: routes.publicEvent, element: <PublicHomePage /> },
      { path: routes.publicPasses, element: <PublicPassesPage /> },
      {
        path: routes.publicCompetitions,
        element: <PurchaseStepPage key="competitions" step="competitions" />,
      },
      { path: routes.publicBuyer, element: <PurchaseStepPage key="buyer" step="buyer" /> },
      { path: routes.publicReview, element: <PurchaseStepPage key="review" step="review" /> },
    ],
  },
  { path: routes.adminEventPassTypesLegacy, element: <LegacyPassTypesRedirect /> },
  {
    hydrateFallbackElement: routeFallback,
    lazy: async () => ({
      Component: (await import('./admin-session-boundary')).AdminSessionBoundary,
    }),
    children: [
      { path: routes.admin, ...adminPage('AdminPage') },
      { path: routes.adminEventOverview, ...adminPage('AdminEventOverviewPage') },
      { path: routes.adminEventFoundation, ...adminPage('AdminEventFoundationPage') },
      { path: routes.adminEventCheckIn, ...adminPage('AdminCheckInPage') },
      { path: routes.adminEventActivities, ...adminPage('AdminEventActivitiesPage') },
      {
        // The passes layout loads the catalog once for the list, create and detail screens.
        path: routes.adminEventPasses,
        ...adminPage('AdminEventPassesPage'),
        children: [
          { index: true, ...adminPage('PassListScreen') },
          { path: routes.adminEventPassNew, ...adminPage('PassCreateScreen') },
          { path: routes.adminEventPass, ...adminPage('PassDetailScreen') },
        ],
      },
    ],
  },
  {
    element: <RoleAreaBoundary allowedRoles={['dancer'] as const} />,
    children: [
      {
        path: routes.dancer,
        hydrateFallbackElement: routeFallback,
        lazy: async () => ({ Component: (await import('@/pages/dancer')).DancerPage }),
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

const router = createBrowserRouter(appRoutes);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
