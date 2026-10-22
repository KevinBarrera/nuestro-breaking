import { LegalDocumentPage } from '@/pages/legal-document';
import { NotFoundPage } from '@/pages/not-found';
import {
  PublicBuyerPage,
  PublicCompetitionsPage,
  PublicHomePage,
  PublicPassesPage,
  PublicPaymentReturnPage,
  PublicPurchaseLayout,
  PublicReviewPage,
} from '@/pages/public-purchase';
import { legalDocuments, routes } from '@/shared/config';
import {
  createBrowserRouter,
  generatePath,
  Navigate,
  useParams,
  type RouteObject,
} from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { RoleAreaBoundary } from './role-area-boundary';
import { RouteLoadError } from './route-load-error';

// Old bookmarks of the pass list keep working; the redirect replaces the history entry.
function LegacyPassTypesRedirect() {
  const { eventId = '' } = useParams<'eventId'>();
  return <Navigate replace to={generatePath(routes.adminEventPasses, { eventId })} />;
}

// D7: the admin and dancer areas load on demand (route `lazy`), so buyers on the public flow
// never download them. The router resolves a lazy route before rendering it; on a first load
// it shows this blank page meanwhile, and `RouteLoadError` (with "Recargar") when the chunk fails.
const routeFallback = <div aria-busy="true" className="min-h-dvh" />;
const routeError = <RouteLoadError />;

type AdminPages = typeof import('@/pages/admin');
const adminPage = (name: keyof AdminPages) => ({
  hydrateFallbackElement: routeFallback,
  errorElement: routeError,
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
      { path: routes.publicCompetitions, element: <PublicCompetitionsPage /> },
      { path: routes.publicBuyer, element: <PublicBuyerPage /> },
      { path: routes.publicReview, element: <PublicReviewPage /> },
    ],
  },
  // Mercado Pago's return (#177), outside the purchase layout so it needs no catalog.
  { path: routes.publicPayment, element: <PublicPaymentReturnPage /> },
  // The legal documents the buyer accepts before paying (#180), static and outside the layout.
  ...legalDocuments.map((document) => ({
    path: document.path,
    element: <LegalDocumentPage document={document} />,
  })),
  // Admin account activation (#214), public: the invitee has no session yet.
  {
    path: routes.activateAccount,
    hydrateFallbackElement: routeFallback,
    errorElement: routeError,
    lazy: async () => ({
      Component: (await import('@/pages/account-activation')).AccountActivationPage,
    }),
  },
  { path: routes.adminEventPassTypesLegacy, element: <LegacyPassTypesRedirect /> },
  {
    hydrateFallbackElement: routeFallback,
    errorElement: routeError,
    lazy: async () => ({
      Component: (await import('./admin-session-boundary')).AdminSessionBoundary,
    }),
    children: [
      { path: routes.admin, ...adminPage('AdminPage') },
      { path: routes.adminEventNew, ...adminPage('AdminEventNewPage') },
      { path: routes.adminEventOverview, ...adminPage('AdminEventOverviewPage') },
      { path: routes.adminEventFoundation, ...adminPage('AdminEventDetailsPage') },
      { path: routes.adminEventCheckIn, ...adminPage('AdminCheckInPage') },
      { path: routes.adminEventPaymentsReview, ...adminPage('AdminPaymentsReviewPage') },
      { path: routes.adminEventLists, ...adminPage('AdminListsPage') },
      { path: routes.adminEventHistory, ...adminPage('AdminHistoryPage') },
      { path: routes.adminEventRegistrations, ...adminPage('AdminRegistrationsPage') },
      { path: routes.adminEventRegistrationNew, ...adminPage('AdminRegistrationNewPage') },
      { path: routes.adminEventRegistration, ...adminPage('AdminRegistrationPage') },
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
      { path: routes.adminTeam, ...adminPage('AdminTeamPage') },
      { path: routes.adminTeamNew, ...adminPage('AdminTeamNewPage') },
    ],
  },
  {
    element: <RoleAreaBoundary allowedRoles={['dancer'] as const} />,
    children: [
      {
        path: routes.dancer,
        hydrateFallbackElement: routeFallback,
        errorElement: routeError,
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
