// Public address of an event. Mirrors the `events_slug_ck` check: lowercase kebab-case, at most 80
// characters.
export const EVENT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const EVENT_SLUG_MAX_LENGTH = 80;

export function isEventSlug(value: string): boolean {
  return value.length <= EVENT_SLUG_MAX_LENGTH && EVENT_SLUG_PATTERN.test(value);
}
