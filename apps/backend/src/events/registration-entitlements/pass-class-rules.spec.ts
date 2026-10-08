import {
  FULL_INCLUDES_GENERAL_MESSAGE,
  addingCombinesGeneralWithFull,
  combinesGeneralWithFull,
} from './pass-class-rules';

describe('combinesGeneralWithFull', () => {
  it('rejects general entry together with a full pass in either order', () => {
    expect(combinesGeneralWithFull(['full', 'general'])).toBe(true);
    expect(combinesGeneralWithFull(['general', 'full'])).toBe(true);
    expect(combinesGeneralWithFull(['full', 'add_on', 'general'])).toBe(true);
  });

  it('accepts sets without that combination', () => {
    expect(combinesGeneralWithFull([])).toBe(false);
    expect(combinesGeneralWithFull(['general'])).toBe(false);
    expect(combinesGeneralWithFull(['full', 'full', 'add_on'])).toBe(false);
    expect(combinesGeneralWithFull(['general', 'add_on'])).toBe(false);
  });

  it('exposes a clear rejection message', () => {
    expect(FULL_INCLUDES_GENERAL_MESSAGE).toBe('A full pass already includes general entry');
  });
});

describe('addingCombinesGeneralWithFull', () => {
  it('rejects adding general to a full holder and full to a general holder', () => {
    expect(addingCombinesGeneralWithFull(['full'], 'general')).toBe(true);
    expect(addingCombinesGeneralWithFull(['general', 'add_on'], 'full')).toBe(true);
  });

  it('accepts other additions, and does not block an add-on on data that predates the rule', () => {
    expect(addingCombinesGeneralWithFull(['full'], 'full')).toBe(false);
    expect(addingCombinesGeneralWithFull([], 'general')).toBe(false);
    expect(addingCombinesGeneralWithFull(['general', 'full'], 'add_on')).toBe(false);
  });
});
