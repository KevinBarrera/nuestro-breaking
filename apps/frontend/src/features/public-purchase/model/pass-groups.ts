import type { PublicPassClass } from '@/entities/public-event';
import type { PassOption } from './purchase-selection';

export type PassGroup = { passClass: PublicPassClass; title: string; options: PassOption[] };

// Screen order and headings: full passes first, then add-ons, then entry without competing.
const groupOrder: { passClass: PublicPassClass; title: string }[] = [
  { passClass: 'full', title: 'Pases completos' },
  { passClass: 'add_on', title: 'Adicional' },
  { passClass: 'general', title: 'Solo asistir' },
];

// Splits the pass options by class for the home and Pases screens; empty classes are left out.
export function passGroups(options: PassOption[]): PassGroup[] {
  return groupOrder
    .map((group) => ({
      ...group,
      options: options.filter((option) => option.pass.passClass === group.passClass),
    }))
    .filter((group) => group.options.length > 0);
}
