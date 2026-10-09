// The event `/` sells (D2). Unset or blank means no event is on sale at the root address.
export const configuredEventSlug: string | null =
  import.meta.env.VITE_PUBLIC_EVENT_SLUG?.trim() || null;
