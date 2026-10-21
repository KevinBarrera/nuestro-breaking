import { orderPassTypes } from './attendee-lists.ordering';
import type { AttendeeListPassType } from './attendee-lists.types';

const pass = (
  id: string,
  name: string,
  passClass: AttendeeListPassType['passClass'],
): AttendeeListPassType => ({ id, name, passClass, status: 'active' });

describe('orderPassTypes', () => {
  it('orders full, general and add-on passes, then by name', () => {
    const ordered = orderPassTypes([
      pass('a', 'Open Styles', 'add_on'),
      pass('b', 'General', 'general'),
      pass('c', 'Full popping', 'full'),
      pass('d', 'antiguo pase', 'full'),
    ]);

    expect(ordered.map((passType) => passType.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('lists a pass type held several times once and breaks name ties by id', () => {
    const ordered = orderPassTypes([
      pass('2', 'Full', 'full'),
      pass('1', 'Full', 'full'),
      pass('2', 'Full', 'full'),
    ]);

    expect(ordered.map((passType) => passType.id)).toEqual(['1', '2']);
  });
});
