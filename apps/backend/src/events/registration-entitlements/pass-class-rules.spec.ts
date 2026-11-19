import {
  FULL_INCLUDES_GENERAL_MESSAGE,
  addingCombinesGeneralWithFull,
  combinesGeneralWithFull,
  holdsGeneralEntryOnly,
  type PassRequirement,
  passesRequiringRemoved,
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

describe('holdsGeneralEntryOnly', () => {
  it('is true when every held pass is general entry', () => {
    expect(holdsGeneralEntryOnly(['general'])).toBe(true);
    expect(holdsGeneralEntryOnly(['general', 'general'])).toBe(true);
  });

  it('is false without passes or with any full or add-on pass', () => {
    expect(holdsGeneralEntryOnly([])).toBe(false);
    expect(holdsGeneralEntryOnly(['full'])).toBe(false);
    expect(holdsGeneralEntryOnly(['general', 'add_on'])).toBe(false);
    expect(holdsGeneralEntryOnly(['add_on'])).toBe(false);
  });
});

describe('passesRequiringRemoved', () => {
  const full: PassRequirement = {
    registrationPassId: 'a',
    name: 'Full',
    passClass: 'full',
    requiresPassClass: null,
  };
  const other: PassRequirement = { ...full, registrationPassId: 'b', name: 'Other full' };
  const addOn: PassRequirement = {
    registrationPassId: 'c',
    name: 'Open Styles',
    passClass: 'add_on',
    requiresPassClass: 'full',
  };

  it('names the held passes that would lose their only pass of the required class', () => {
    expect(passesRequiringRemoved([full, addOn], 'a')).toEqual(['Open Styles']);
  });

  it('allows the removal when another held pass keeps the class or nothing requires it', () => {
    expect(passesRequiringRemoved([full, other, addOn], 'a')).toEqual([]);
    expect(passesRequiringRemoved([full, addOn], 'c')).toEqual([]);
    expect(passesRequiringRemoved([full], 'a')).toEqual([]);
    // An add-on already missing its class (legacy data) does not block an unrelated removal.
    const general: PassRequirement = { ...full, registrationPassId: 'd', passClass: 'general' };
    expect(passesRequiringRemoved([general, addOn, other], 'd')).toEqual([]);
    expect(passesRequiringRemoved([general, addOn], 'd')).toEqual([]);
  });
});
