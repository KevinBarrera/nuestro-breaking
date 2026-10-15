import type { PublicActivity, PublicPass, PublicPassClass } from '@/entities/public-event';

// What the buyer chose: pass type ids, and per chosen pass the competitions picked from its
// `selectableActivities`. Rules come from `passClass`/`requiresPassClass`, never from names.
export type PurchaseSelection = {
  passTypeIds: string[];
  selectedActivityIds: Record<string, string[]>;
};

export const emptySelection: PurchaseSelection = { passTypeIds: [], selectedActivityIds: {} };

export type PassOption = {
  pass: PublicPass;
  selected: boolean;
  disabled: boolean;
  hint: string | null;
};

export type CompetitionGroup = {
  pass: PublicPass;
  selectable: { activity: PublicActivity; selected: boolean }[];
  included: PublicActivity[];
};

const requirementCopy: Record<PublicPassClass, string> = {
  full: 'un pase completo',
  general: 'la entrada general',
  add_on: 'un pase adicional',
};

const chosenPasses = (passes: PublicPass[], selection: PurchaseSelection) =>
  passes.filter((pass) => selection.passTypeIds.includes(pass.id));

const holdsClass = (chosen: PublicPass[], passClass: PublicPassClass) =>
  chosen.some((pass) => pass.passClass === passClass);

// Why a pass cannot be chosen right now, or null when it can.
function blockedReason(pass: PublicPass, chosen: PublicPass[]): string | null {
  if (pass.passClass === 'general' && holdsClass(chosen, 'full'))
    return 'Ya incluida en tus pases completos';
  if (pass.requiresPassClass && !holdsClass(chosen, pass.requiresPassClass))
    return `Requiere ${requirementCopy[pass.requiresPassClass]}`;
  return null;
}

/**
 * Keeps only what the catalog and the rules allow, in catalog order: unknown passes go, general
 * entry goes when a full pass is chosen, an add-on goes when its required class is missing, and
 * picked competitions must be selectable for their chosen pass. Used after every change and when
 * a saved draft is restored against a fresh catalog.
 */
export function normalizeSelection(
  passes: PublicPass[],
  selection: PurchaseSelection,
): PurchaseSelection {
  const known = chosenPasses(passes, selection);
  const withoutGeneral = known.filter(
    (pass) => !(pass.passClass === 'general' && holdsClass(known, 'full')),
  );
  const chosen = withoutGeneral.filter(
    (pass) => !pass.requiresPassClass || holdsClass(withoutGeneral, pass.requiresPassClass),
  );
  const selectedActivityIds: Record<string, string[]> = {};
  for (const pass of chosen) {
    const picked = selection.selectedActivityIds[pass.id] ?? [];
    const ids = pass.selectableActivities
      .map((activity) => activity.id)
      .filter((id) => picked.includes(id));
    if (ids.length > 0) selectedActivityIds[pass.id] = ids;
  }
  return { passTypeIds: chosen.map((pass) => pass.id), selectedActivityIds };
}

// Chooses or removes a pass. A pass that is blocked right now is left unchosen.
export function togglePass(
  passes: PublicPass[],
  selection: PurchaseSelection,
  passId: string,
): PurchaseSelection {
  const pass = passes.find((entry) => entry.id === passId);
  if (!pass) return selection;
  if (selection.passTypeIds.includes(passId))
    return normalizeSelection(passes, {
      ...selection,
      passTypeIds: selection.passTypeIds.filter((id) => id !== passId),
    });
  if (blockedReason(pass, chosenPasses(passes, selection))) return selection;
  return normalizeSelection(passes, {
    ...selection,
    passTypeIds: [...selection.passTypeIds, passId],
  });
}

// Picks or unpicks one competition of a chosen pass; anything else leaves the selection as is.
export function toggleActivity(
  passes: PublicPass[],
  selection: PurchaseSelection,
  passId: string,
  activityId: string,
): PurchaseSelection {
  const pass = passes.find((entry) => entry.id === passId);
  const selectable = pass?.selectableActivities.some((activity) => activity.id === activityId);
  if (!selection.passTypeIds.includes(passId) || !selectable) return selection;
  const picked = selection.selectedActivityIds[passId] ?? [];
  const next = picked.includes(activityId)
    ? picked.filter((id) => id !== activityId)
    : [...picked, activityId];
  return normalizeSelection(passes, {
    ...selection,
    selectedActivityIds: { ...selection.selectedActivityIds, [passId]: next },
  });
}

function describePass(pass: PublicPass, chosen: PublicPass[]): string | null {
  if (pass.requiresPassClass && holdsClass(chosen, pass.requiresPassClass))
    return `Disponible porque elegiste ${requirementCopy[pass.requiresPassClass]}`;
  const choices = pass.selectableActivities.length;
  if (choices > 0)
    return choices === 1 ? '1 competencia para elegir' : `${choices} competencias para elegir`;
  if (pass.includedActivities.length > 0)
    return `Incluye: ${pass.includedActivities.map((activity) => activity.name).join(', ')}`;
  return null;
}

// One entry per catalog pass for the Pases screen, with the reason it is blocked or a short hint.
export function passOptions(passes: PublicPass[], selection: PurchaseSelection): PassOption[] {
  const chosen = chosenPasses(passes, selection);
  return passes.map((pass) => {
    const selected = selection.passTypeIds.includes(pass.id);
    const blocked = selected ? null : blockedReason(pass, chosen);
    return {
      pass,
      selected,
      disabled: blocked !== null,
      hint: blocked ?? describePass(pass, chosen),
    };
  });
}

// The Competencias screen: chosen passes with competitions to pick or included ones to show.
export function competitionGroups(
  passes: PublicPass[],
  selection: PurchaseSelection,
): CompetitionGroup[] {
  return chosenPasses(passes, selection)
    .filter((pass) => pass.selectableActivities.length + pass.includedActivities.length > 0)
    .map((pass) => {
      const picked = selection.selectedActivityIds[pass.id] ?? [];
      return {
        pass,
        selectable: pass.selectableActivities.map((activity) => ({
          activity,
          selected: picked.includes(activity.id),
        })),
        included: pass.includedActivities,
      };
    });
}

// D6: the competitions step is skipped when no chosen pass offers competitions to pick.
export function competitionsStepApplies(
  passes: PublicPass[],
  selection: PurchaseSelection,
): boolean {
  return chosenPasses(passes, selection).some((pass) => pass.selectableActivities.length > 0);
}

export function purchaseTotals(passes: PublicPass[], selection: PurchaseSelection) {
  const chosen = chosenPasses(passes, selection);
  return {
    passCount: chosen.length,
    totalCents: chosen.reduce((sum, pass) => sum + pass.priceCents, 0),
  };
}
