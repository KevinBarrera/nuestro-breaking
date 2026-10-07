import { routes } from '@/shared/config';
import { matchPath } from 'react-router';

export type EventSection = 'foundation' | 'check-in' | 'activities' | 'pass-types';

const sectionRoutes: Record<EventSection, string> = {
  foundation: routes.adminEventFoundation,
  'check-in': routes.adminEventCheckIn,
  activities: routes.adminEventActivities,
  'pass-types': routes.adminEventPassTypes,
};

export type AdminLocation = { eventId?: string; section?: EventSection };

export function readAdminLocation(pathname: string): AdminLocation {
  for (const [section, pattern] of Object.entries(sectionRoutes) as [EventSection, string][]) {
    const match = matchPath({ path: pattern, end: true }, pathname);
    if (match?.params.eventId) return { eventId: match.params.eventId, section };
  }
  return {};
}

export function eventSectionPath(eventId: string, section: EventSection) {
  return sectionRoutes[section].replace(':eventId', eventId);
}
