import { describe, expect, it } from 'vitest';
import { changedRows, hasChanges, type ChangeField } from './review-changes-model';

const price = (cents: unknown) => `$${(Number(cents) / 100).toFixed(2)}`;

describe('changedRows', () => {
  it('keeps only the fields whose displayed value changed, in order', () => {
    const fields: ChangeField[] = [
      { key: 'name', label: 'Nombre', before: 'Batalla', after: 'Batalla final' },
      { key: 'kind', label: 'Tipo', before: 'battle', after: 'battle' },
      { key: 'capacity', label: 'Cupo', before: 20, after: 32 },
    ];

    expect(changedRows(fields)).toEqual([
      { key: 'name', label: 'Nombre', before: 'Batalla', after: 'Batalla final' },
      { key: 'capacity', label: 'Cupo', before: '20', after: '32' },
    ]);
  });

  it('compares formatted values, so equal displays are not a change', () => {
    const fields: ChangeField[] = [
      { key: 'price', label: 'Precio', before: 15000, after: '15000', format: price },
    ];

    expect(changedRows(fields)).toEqual([]);
  });

  it('does not trim text: a whitespace edit is a change', () => {
    const fields: ChangeField[] = [
      { key: 'name', label: 'Nombre', before: 'Pase', after: 'Pase ' },
    ];

    expect(changedRows(fields)).toHaveLength(1);
  });

  it('shows empty values as a dash and lists arrays and booleans readably', () => {
    const fields: ChangeField[] = [
      { key: 'notes', label: 'Notas', before: null, after: 'Traer tenis' },
      { key: 'tags', label: 'Etiquetas', before: ['a', 'b'], after: ['a', 'b'] },
      { key: 'open', label: 'Abierta', before: false, after: true },
      { key: 'venue', label: 'Sede', before: 'Centro', after: '' },
    ];

    expect(changedRows(fields)).toEqual([
      { key: 'notes', label: 'Notas', before: '—', after: 'Traer tenis' },
      { key: 'open', label: 'Abierta', before: 'No', after: 'Sí' },
      { key: 'venue', label: 'Sede', before: 'Centro', after: '—' },
    ]);
  });
});

describe('hasChanges', () => {
  it('is false when every displayed value matches and true otherwise', () => {
    expect(hasChanges([{ key: 'a', label: 'A', before: ['x'], after: ['x'] }])).toBe(false);
    expect(hasChanges([{ key: 'a', label: 'A', before: 'x', after: 'y' }])).toBe(true);
    expect(hasChanges([])).toBe(false);
  });
});
