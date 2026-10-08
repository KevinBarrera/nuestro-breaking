import {
  AdminCheckInPage,
  AdminEventActivitiesPage,
  AdminEventFoundationPage,
  AdminEventOverviewPage,
  AdminEventPassesPage,
  AdminPage,
  PassCreateScreen,
  PassDetailScreen,
  PassListScreen,
} from '@/pages/admin';
import { DancerPage } from '@/pages/dancer';
import { NotFoundPage } from '@/pages/not-found';
import { routes } from '@/shared/config';
import {
  createBrowserRouter,
  generatePath,
  Navigate,
  useParams,
  type RouteObject,
} from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AdminSessionBoundary } from './admin-session-boundary';
import { RoleAreaBoundary } from './role-area-boundary';

// Old bookmarks of the pass list keep working; the redirect replaces the history entry.
function LegacyPassTypesRedirect() {
  const { eventId = '' } = useParams<'eventId'>();
  return <Navigate replace to={generatePath(routes.adminEventPasses, { eventId })} />;
}

// A data router, so screens can use data-router APIs such as `useBlocker`.
const appRoutes: RouteObject[] = [
  { path: routes.adminEventPassTypesLegacy, element: <LegacyPassTypesRedirect /> },
  {
    element: <AdminSessionBoundary />,
    children: [
      { path: routes.admin, element: <AdminPage /> },
      { path: routes.adminEventOverview, element: <AdminEventOverviewPage /> },
      { path: routes.adminEventFoundation, element: <AdminEventFoundationPage /> },
      { path: routes.adminEventCheckIn, element: <AdminCheckInPage /> },
      { path: routes.adminEventActivities, element: <AdminEventActivitiesPage /> },
      {
        // The passes layout loads the catalog once for the list, create and detail screens.
        path: routes.adminEventPasses,
        element: <AdminEventPassesPage />,
        children: [
          { index: true, element: <PassListScreen /> },
          { path: routes.adminEventPassNew, element: <PassCreateScreen /> },
          { path: routes.adminEventPass, element: <PassDetailScreen /> },
        ],
      },
    ],
  },
  {
    element: <RoleAreaBoundary allowedRoles={['dancer'] as const} />,
    children: [{ path: routes.dancer, element: <DancerPage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
];

const router = createBrowserRouter(appRoutes);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
