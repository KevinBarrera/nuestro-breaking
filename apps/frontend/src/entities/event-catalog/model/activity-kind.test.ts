import { describe, expect, it } from 'vitest';
import { activityKinds, isActivityKind } from './activity-kind';

describe('activityKinds', () => {
  it('lists the four kinds the API accepts, in a stable order', () => {
    expect(activityKinds).toEqual(['battle', 'competition', 'workshop', 'social']);
  });

  it('accepts only an exact kind code', () => {
    expect(activityKinds.every(isActivityKind)).toBe(true);
    expect(isActivityKind('Taller')).toBe(false);
    expect(isActivityKind(' workshop ')).toBe(false);
    expect(isActivityKind('')).toBe(false);
  });
});
