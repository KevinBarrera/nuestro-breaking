import { FOLIO_ALPHABET, generateFolio } from './registration-folio';

describe('registration folio generator', () => {
  it('builds the folio from the event prefix and four characters of the folio alphabet', () => {
    const folio = generateFolio('LMP');
    expect(folio).toMatch(/^LMP-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  });

  it('excludes look-alike characters from the alphabet', () => {
    expect(FOLIO_ALPHABET).toHaveLength(31);
    for (const character of ['0', 'O', '1', 'I', 'L'])
      expect(FOLIO_ALPHABET).not.toContain(character);
  });

  it('is deterministic for a stubbed random source and asks it for alphabet positions', () => {
    const positions = [0, 30, 5, 9];
    const requested: number[] = [];
    const folio = generateFolio('EV', (max) => {
      requested.push(max);
      return positions[requested.length - 1];
    });
    expect(folio).toBe('EV-2Z7B');
    expect(requested).toEqual([31, 31, 31, 31]);
  });

  it('rejects prefixes that the events check would reject', () => {
    for (const prefix of ['', 'L', 'lmp', '1MP', 'LMP-', 'TOOLONG', 'LÑP'])
      expect(() => generateFolio(prefix)).toThrow(/folio prefix/i);
  });

  it('rejects a random source that returns a position outside the alphabet', () => {
    expect(() => generateFolio('LMP', () => 31)).toThrow(/random source/i);
    expect(() => generateFolio('LMP', () => -1)).toThrow(/random source/i);
    expect(() => generateFolio('LMP', () => 1.5)).toThrow(/random source/i);
  });
});
