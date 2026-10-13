import type { AdminEvent, AdminEventFailure, AdminVenue } from '@/entities/admin-event';

// What Datos del evento shows for one event. `saves` counts the event answers applied, so the
// form can start again from the saved event.
export type DetailsLoad =
  | { status: 'loading' }
  | { status: 'failed'; failure: AdminEventFailure }
  | { status: 'ready'; event: AdminEvent; venues: AdminVenue[]; saves: number };

export type DetailsState = { eventId: string; load: DetailsLoad };

// Writes can overlap (a venue added while the details save is pending) and the admin can switch
// events before an answer arrives. Each answer is applied to the latest state, and only while
// the event it belongs to is the one loaded; an answer for another event changes nothing.

export function withEvent(state: DetailsState, event: AdminEvent): DetailsState {
  if (state.eventId !== event.id || state.load.status !== 'ready') return state;
  return { ...state, load: { ...state.load, event, saves: state.load.saves + 1 } };
}

export function withVenues(
  state: DetailsState,
  eventId: string,
  update: (venues: AdminVenue[]) => AdminVenue[],
): DetailsState {
  if (state.eventId !== eventId || state.load.status !== 'ready') return state;
  return { ...state, load: { ...state.load, venues: update(state.load.venues) } };
}
