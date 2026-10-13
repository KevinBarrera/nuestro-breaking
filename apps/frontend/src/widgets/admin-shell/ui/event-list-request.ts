// The shell's links to the event list carry this history state, so the landing shows the
// list even when its one-event redirect would otherwise send the admin straight back (#213).
export const eventListRequest = { eventList: true } as const;

export function isEventListRequest(state: unknown): boolean {
  return (
    typeof state === 'object' && state !== null && 'eventList' in state && state.eventList === true
  );
}
