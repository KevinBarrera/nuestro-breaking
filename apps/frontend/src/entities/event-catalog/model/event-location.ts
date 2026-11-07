const countryName = new Intl.DisplayNames(['es-MX'], { type: 'region' });

// The country's name in Spanish (`CO` is "Colombia").
export const countryLabel = (country: string) => countryName.of(country) ?? country;

// Where an event happens (#322, #330): the city and its state, then the country outside Mexico.
// The state is left out when it repeats the city ("Ciudad de México"). Null without a location,
// so the admin and public screens hide the line instead of showing the time zone.
export function eventLocation(event: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string | null {
  const { city, state, country } = event;
  if (!city || !state || !country) return null;
  const parts = [city];
  if (state.localeCompare(city, 'es', { sensitivity: 'base' }) !== 0) parts.push(state);
  if (country !== 'MX') parts.push(countryLabel(country));
  return parts.join(', ');
}
