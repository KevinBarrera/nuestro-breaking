export const routes = {
  // Public purchase (#176): `/` is the configured event (`VITE_PUBLIC_EVENT_SLUG`), `/e/:slug`
  // any event; the steps always live under `/e/:slug`.
  publicHome: '/',
  publicEvent: '/e/:slug',
  publicPasses: '/e/:slug/pases',
  publicCompetitions: '/e/:slug/competencias',
  publicBuyer: '/e/:slug/datos',
  publicReview: '/e/:slug/revisar',
  // Temporary "Reservamos tu inscripción" screen (D1 of #176); #177 replaces it.
  publicReserved: '/e/:slug/reservada',
  admin: '/admin',
  adminEventOverview: '/admin/events/:eventId',
  adminEventFoundation: '/admin/events/:eventId/foundation',
  adminEventCheckIn: '/admin/events/:eventId/check-in',
  adminEventActivities: '/admin/events/:eventId/activities',
  adminEventPasses: '/admin/events/:eventId/passes',
  adminEventPassNew: '/admin/events/:eventId/passes/new',
  adminEventPass: '/admin/events/:eventId/passes/:passTypeId',
  // Former address of the pass list; it redirects to `adminEventPasses` for old bookmarks.
  adminEventPassTypesLegacy: '/admin/events/:eventId/pass-types',
  dancer: '/dancer',
} as const;
