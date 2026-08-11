import { localOrganizationId, type EventOrganizationView } from './model';

export async function getEventOrganizationView(): Promise<EventOrganizationView> {
  const response = await fetch(`/api/organizations/${localOrganizationId}/events`);

  if (!response.ok) {
    throw new Error('Unable to load the event organization.');
  }

  return (await response.json()) as EventOrganizationView;
}
