import type { PassClass } from '@/events/pass-type-admin/pass-type-admin.types';

export const FULL_INCLUDES_GENERAL_MESSAGE = 'A full pass already includes general entry';

// A full pass includes general entry, so one registration never holds both classes. The rule is
// about pass classes, never pass names; callers pass every class held plus the ones being added.
export function combinesGeneralWithFull(passClasses: readonly PassClass[]): boolean {
  return passClasses.includes('general') && passClasses.includes('full');
}

// Assignment check for one pass. Only adding a general or full pass can create the combination, so
// an add-on is never blocked by a registration recorded before this rule existed.
export function addingCombinesGeneralWithFull(
  heldClasses: readonly PassClass[],
  addedClass: PassClass,
): boolean {
  return addedClass !== 'add_on' && combinesGeneralWithFull([...heldClasses, addedClass]);
}
