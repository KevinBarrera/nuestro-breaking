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

// General entry grants no activity, so a registration holding only general passes keeps the
// standalone "arrived at the event" action (#126). No passes at all is not general entry.
export function holdsGeneralEntryOnly(heldClasses: readonly PassClass[]): boolean {
  return heldClasses.length > 0 && heldClasses.every((passClass) => passClass === 'general');
}

export type PassRequirement = {
  registrationPassId: string;
  name: string;
  passClass: PassClass;
  requiresPassClass: PassClass | null;
};

// Removal check for one pass (#282): names the other held passes that require the removed pass's
// class when no other held pass keeps it. No cascade; the caller removes those passes first.
export function passesRequiringRemoved(
  held: readonly PassRequirement[],
  removedId: string,
): string[] {
  const removed = held.find((pass) => pass.registrationPassId === removedId);
  if (!removed) return [];
  const remaining = held.filter((pass) => pass !== removed);
  if (remaining.some((pass) => pass.passClass === removed.passClass)) return [];
  return remaining
    .filter((pass) => pass.requiresPassClass === removed.passClass)
    .map((pass) => pass.name);
}
