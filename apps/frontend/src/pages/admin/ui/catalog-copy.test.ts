import { describe, expect, it } from 'vitest';
import { activityKindLabel, activityKindOptions } from './catalog-copy';

describe('activityKindOptions', () => {
  it('offers every kind with its Spanish label, in a stable order', () => {
    expect(activityKindOptions).toEqual([
      { id: 'competition', label: 'Competencia' },
      { id: 'workshop', label: 'Taller' },
      { id: 'social', label: 'Social' },
    ]);
  });
});

describe('activityKindLabel', () => {
  it('reads a known kind in Spanish and shows any other value as stored', () => {
    expect(activityKindLabel('workshop')).toBe('Taller');
    expect(activityKindLabel('cypher')).toBe('cypher');
  });
});
