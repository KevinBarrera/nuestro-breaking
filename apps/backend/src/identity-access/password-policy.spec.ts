import { verify } from 'argon2';
import {
  failedPasswordRules,
  hashPassword,
  hasControlCharacters,
  isStrongPassword,
} from './password-policy';

describe('password policy', () => {
  it('accepts a password that meets every rule', () => {
    expect(failedPasswordRules('SufficientlyStrong1!')).toEqual([]);
    expect(isStrongPassword('SufficientlyStrong1!')).toBe(true);
  });

  it.each([
    ['', ['min_length', 'lowercase', 'uppercase', 'digit', 'symbol']],
    ['Short1!a', ['min_length']],
    [`Aa1!${'a'.repeat(1021)}`, ['max_length']],
    ['ALLUPPERCASE1!', ['lowercase']],
    ['alllowercase1!', ['uppercase']],
    ['NoDigitsHere!!', ['digit']],
    ['NoSymbolsHere12', ['symbol']],
    ['Spaces Only 12a', ['symbol']],
    ['Control\u0007Char1!x', ['no_control_characters']],
  ])('reports the failing rules for %j', (password, rules) => {
    expect(failedPasswordRules(password)).toEqual(rules);
    expect(isStrongPassword(password)).toBe(false);
  });

  it('accepts the length boundaries', () => {
    expect(failedPasswordRules('Abcdefghij1!')).toEqual([]);
    expect(failedPasswordRules(`Aa1!${'a'.repeat(1020)}`)).toEqual([]);
  });

  it('detects control characters', () => {
    expect(hasControlCharacters('plain text')).toBe(false);
    expect(hasControlCharacters('line\n')).toBe(true);
    expect(hasControlCharacters('del\u007f')).toBe(true);
  });

  it('hashes with Argon2id and verifies the original password', async () => {
    const phc = await hashPassword('SufficientlyStrong1!');
    expect(phc).toMatch(/^\$argon2id\$/);
    expect(await verify(phc, 'SufficientlyStrong1!')).toBe(true);
    expect(await verify(phc, 'SufficientlyStrong1?')).toBe(false);
  });
});
