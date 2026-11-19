// Admin requests carry the browser's single session cookie (#392). A `401` means that session
// ended (signed out in another tab, replaced by another sign-in, or expired), which is not a
// permission problem: listeners such as the admin session boundary return to sign-in.
const sessionEvents = new EventTarget();
const sessionEnded = 'session-ended';

export function onSessionEnded(listener: () => void): () => void {
  sessionEvents.addEventListener(sessionEnded, listener);
  return () => sessionEvents.removeEventListener(sessionEnded, listener);
}

/** `fetch` for authenticated admin APIs; reports an ended session on `401`. */
export async function adminFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) sessionEvents.dispatchEvent(new Event(sessionEnded));
  return response;
}
