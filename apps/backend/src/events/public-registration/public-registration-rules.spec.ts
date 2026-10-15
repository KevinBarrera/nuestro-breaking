import { FULL_INCLUDES_GENERAL_MESSAGE } from '@/events/registration-entitlements/pass-class-rules';
import { type CatalogPassType, passRuleViolation } from './public-registration-rules';

const full: CatalogPassType = {
  passClass: 'full',
  requiresPassClass: null,
  status: 'active',
  onlineSalesClosesAt: null,
};
const general: CatalogPassType = {
  passClass: 'general',
  requiresPassClass: null,
  status: 'active',
  onlineSalesClosesAt: null,
};
const openStyles: CatalogPassType = {
  passClass: 'add_on',
  requiresPassClass: 'full',
  status: 'active',
  onlineSalesClosesAt: null,
};
const now = new Date('2026-11-17T15:00:00Z');
const catalog = new Map<string, CatalogPassType>([
  ['full', full],
  ['general', general],
  ['open-styles', openStyles],
  ['archived', { ...full, status: 'archived' }],
  ['closed-now', { ...general, onlineSalesClosesAt: now }],
  ['closes-later', { ...full, onlineSalesClosesAt: new Date(now.getTime() + 1) }],
]);
const check = (...ids: string[]) => passRuleViolation(ids, catalog, now);

describe('passRuleViolation', () => {
  it('rejects a pass whose online sales close time has been reached (#240)', () => {
    expect(check('full', 'closed-now')).toEqual({
      code: 'pass_type_sales_closed',
      message: 'Online sales of this pass are closed',
      path: 'passes[1].passTypeId',
    });
    expect(check('closes-later')).toBeNull();
  });

  it('accepts valid pass sets', () => {
    expect(check('full')).toBeNull();
    expect(check('general')).toBeNull();
    expect(check('full', 'open-styles')).toBeNull();
    expect(check('open-styles', 'full')).toBeNull();
  });

  it('rejects a pass type that is missing from the event or archived', () => {
    expect(check('full', 'elsewhere')).toEqual({
      code: 'pass_type_unavailable',
      message: 'Pass type is not available',
      path: 'passes[1].passTypeId',
    });
    expect(check('archived')).toEqual({
      code: 'pass_type_unavailable',
      message: 'Pass type is not available',
      path: 'passes[0].passTypeId',
    });
  });

  it('rejects general entry together with a full pass (D1)', () => {
    expect(check('general', 'full')).toEqual({
      code: 'general_with_full',
      message: FULL_INCLUDES_GENERAL_MESSAGE,
      path: 'passes',
    });
  });

  it('rejects an add-on whose required pass class is not requested', () => {
    expect(check('open-styles')).toEqual({
      code: 'required_pass_missing',
      message: 'Add-on requires a full pass',
      path: 'passes[0].passTypeId',
    });
    expect(check('general', 'open-styles')).toMatchObject({ code: 'required_pass_missing' });
  });
});
