import { describe, expect, it } from 'vitest';
import { stepAfterPasses, stepBefore, stepNumber, stepPath, stepRedirect } from './purchase-steps';
import type { PublicPass } from '@/entities/public-event';

const pass = (id: string, competitions: number): PublicPass => ({
  id,
  name: id,
  passClass: competitions > 0 ? 'full' : 'general',
  priceCents: 100000,
  requiresPassClass: null,
  selectableActivities: Array.from({ length: competitions }, (_, index) => ({
    id: `${id}-${index}`,
    name: `${id} ${index}`,
    kind: 'competition',
    startsAt: '2026-11-21T18:00:00.000Z',
    endsAt: '2026-11-21T19:00:00.000Z',
  })),
  includedActivities: [],
});
const passes = [pass('breaking', 2), pass('general', 0)];
const chosen = (...ids: string[]) => ({ passTypeIds: ids, selectedActivityIds: {} });

describe('purchase steps', () => {
  it('builds each step address under the event', () => {
    expect(stepPath('nov', 'home')).toBe('/e/nov');
    expect(stepPath('nov', 'passes')).toBe('/e/nov/pases');
    expect(stepPath('nov', 'competitions')).toBe('/e/nov/competencias');
    expect(stepPath('nov', 'buyer')).toBe('/e/nov/datos');
    expect(stepPath('nov', 'review')).toBe('/e/nov/revisar');
  });

  it('numbers the four steps', () => {
    expect(
      ['passes', 'competitions', 'buyer', 'review'].map((step) => stepNumber(step as never)),
    ).toEqual([1, 2, 3, 4]);
  });

  it('goes to competitions only when a chosen pass has some to pick', () => {
    expect(stepAfterPasses(passes, chosen('breaking'))).toBe('competitions');
    expect(stepAfterPasses(passes, chosen('general'))).toBe('buyer');
  });

  it('goes back past a skipped competitions step', () => {
    expect(stepBefore('passes', passes, chosen('general'))).toBe('home');
    expect(stepBefore('competitions', passes, chosen('breaking'))).toBe('passes');
    expect(stepBefore('buyer', passes, chosen('general'))).toBe('passes');
    expect(stepBefore('buyer', passes, chosen('breaking'))).toBe('competitions');
    expect(stepBefore('review', passes, chosen('general'))).toBe('buyer');
  });

  it('sends a step without chosen passes back to pases, and skips competitions when none apply', () => {
    for (const step of ['competitions', 'buyer', 'review'] as const)
      expect(stepRedirect(step, passes, chosen())).toBe('passes');
    expect(stepRedirect('passes', passes, chosen())).toBeNull();
    expect(stepRedirect('competitions', passes, chosen('general'))).toBe('buyer');
    expect(stepRedirect('competitions', passes, chosen('breaking'))).toBeNull();
    expect(stepRedirect('buyer', passes, chosen('general'))).toBeNull();
    expect(stepRedirect('review', passes, chosen('breaking'))).toBeNull();
  });
});

describe('review guard', () => {
  it('sends review to datos when the buyer data is not ready', () => {
    expect(stepRedirect('review', passes, chosen('breaking'), false)).toBe('buyer');
    expect(stepRedirect('review', passes, chosen(), false)).toBe('passes');
    expect(stepRedirect('buyer', passes, chosen('breaking'), false)).toBeNull();
  });
});
