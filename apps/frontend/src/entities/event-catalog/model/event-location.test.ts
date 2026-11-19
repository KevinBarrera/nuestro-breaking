import { describe, expect, it } from 'vitest';
import { eventLocation } from './event-location';

describe('eventLocation', () => {
  it('names the city and state, and the country outside Mexico', () => {
    expect(eventLocation({ city: 'Guadalajara', state: 'Jalisco', country: 'MX' })).toBe(
      'Guadalajara, Jalisco',
    );
    expect(
      eventLocation({ city: 'Ciudad de México', state: 'Ciudad de México', country: 'MX' }),
    ).toBe('Ciudad de México');
    expect(eventLocation({ city: 'Bogotá', state: 'Cundinamarca', country: 'CO' })).toBe(
      'Bogotá, Cundinamarca, Colombia',
    );
  });

  it('is empty without a location, never the time zone', () => {
    expect(eventLocation({ city: null, state: null, country: null })).toBeNull();
    // A public catalog from before #330 carries no location fields at all.
    expect(eventLocation({})).toBeNull();
  });
});
