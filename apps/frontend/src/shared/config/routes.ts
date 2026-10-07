export const routes = {
  admin: '/admin',
  adminEventOverview: '/admin/events/:eventId',
  adminEventFoundation: '/admin/events/:eventId/foundation',
  adminEventCheckIn: '/admin/events/:eventId/check-in',
  adminEventActivities: '/admin/events/:eventId/activities',
  adminEventPassTypes: '/admin/events/:eventId/pass-types',
  dancer: '/dancer',
} as const;
