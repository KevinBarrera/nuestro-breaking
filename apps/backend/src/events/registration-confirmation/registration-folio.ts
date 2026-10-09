import { randomInt } from 'node:crypto';

// Registration folio (D2, D3 of #174): `<PREFIX>-<CODE>`, for example `LMP-7K3Q`. The code is random,
// not consecutive, and drawn from an alphabet without look-alike characters (no 0/O, 1/I/L) so it can
// be read aloud or typed at the door. It is distinct from the paper cash-receipt folio.
export const FOLIO_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// Four characters give 31^4 ≈ 923k codes per prefix. Collisions become likely after about a thousand
// registrations sharing a prefix (birthday bound), but each one only costs a retry: at 50k
// registrations on one prefix a candidate collides about 5% of the time, so five attempts fail with
// probability ≈ 3e-7. A short code is easier to dictate than a fifth character would be.
export const FOLIO_CODE_LENGTH = 4;

// Mirrors the `events_folio_prefix_ck` check.
export const FOLIO_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

// Returns an integer in [0, maxExclusive). Production uses `crypto.randomInt`; tests inject a stub.
export type RandomSource = (maxExclusive: number) => number;

export function generateFolio(prefix: string, random: RandomSource = randomInt): string {
  if (!FOLIO_PREFIX_PATTERN.test(prefix)) throw new Error(`Invalid folio prefix: ${prefix}`);
  let code = '';
  for (let index = 0; index < FOLIO_CODE_LENGTH; index += 1) {
    const position = random(FOLIO_ALPHABET.length);
    if (!Number.isInteger(position) || position < 0 || position >= FOLIO_ALPHABET.length)
      throw new Error('The random source returned a position outside the folio alphabet');
    code += FOLIO_ALPHABET[position];
  }
  return `${prefix}-${code}`;
}
