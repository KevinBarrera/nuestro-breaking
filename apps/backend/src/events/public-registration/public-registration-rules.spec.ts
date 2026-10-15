import { FULL_INCLUDES_GENERAL_MESSAGE } from '@/events/registration-entitlements/pass-class-rules';
import { type CatalogPassType, passRuleViolation } from './public-registration-rules';

const full: CatalogPassType = { passClass: 'full', requiresPassClass: null, status: 'active' };
const general: CatalogPassType = {
  passClass: 'general',
  requiresPassClass: null,
  status: 'active',
};
const openStyles: CatalogPassType = {
  passClass: 'add_on',
  requiresPassClass: 'full',
  status: 'active',
};
const catalog = new Map<string, CatalogPassType>([
  ['full', full],
  ['general', general],
  ['open-styles', openStyles],
  ['archived', { ...full, status: 'archived' }],
]);
const check = (...ids: string[]) => passRuleViolation(ids, catalog);

describe('passRuleViolation', () => {
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
