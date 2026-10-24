import type { CashPaymentInput, HeldPass } from '@/entities/admin-registration';
import {
  formatMxn,
  parseMxnToCents,
  type CatalogActivity,
  type CatalogPassType,
  type PassClass,
  type RequiredPassClass,
} from '@/entities/event-catalog';
import type { RegistrationContact } from './registration-model';
import { cashFormErrors } from './sale-cash-model';

// Nueva inscripción en mesa (#346): the 3-step flow's pure rules. The participant step creates the
// registration; the pass step keeps a local draft that is written to it on "Continuar al cobro"
// (add, remove, competitions), and the cash step confirms it. The backend stays the authority on
// every rule; these mirror them only to guide the operator.

export type StepperChoice = { activityId: string; name: string };

export type StepperPass = {
  passTypeId: string;
  name: string;
  passClass: PassClass;
  priceCents: number;
  requiresPassClass: RequiredPassClass | null;
  // Active competitions the type includes, by start.
  included: string[];
  // Active competitions to choose, by start.
  choices: StepperChoice[];
};

export type StepperPasses = { bases: StepperPass[]; addOns: StepperPass[] };

const byStart = (left: CatalogActivity, right: CatalogActivity) =>
  left.startsAt.localeCompare(right.startsAt) || left.name.localeCompare(right.name, 'es');

// The event's active pass types in catalog order: general and full passes are the base choice
// (one per registration), add-ons are added on top.
export function stepperPasses(
  passTypes: readonly CatalogPassType[],
  activities: readonly CatalogActivity[],
): StepperPasses {
  const competitions = activities
    .filter((activity) => activity.kind === 'competition' && activity.status === 'active')
    .sort(byStart);
  const toPass = (passType: CatalogPassType): StepperPass => {
    const access = new Map(passType.activities.map((link) => [link.activityId, link.access]));
    return {
      passTypeId: passType.id,
      name: passType.name,
      passClass: passType.passClass,
      priceCents: passType.priceCents,
      requiresPassClass: passType.requiresPassClass,
      included: competitions
        .filter((activity) => access.get(activity.id) === 'included')
        .map((activity) => activity.name),
      choices: competitions
        .filter((activity) => access.get(activity.id) === 'selectable')
        .map((activity) => ({ activityId: activity.id, name: activity.name })),
    };
  };
  const active = passTypes.filter((passType) => passType.status === 'active').map(toPass);
  return {
    bases: active.filter((pass) => pass.passClass !== 'add_on'),
    addOns: active.filter((pass) => pass.passClass === 'add_on'),
  };
}

// The line under a pass's name in the pass step.
export function passIncludes(pass: StepperPass): string {
  if (pass.choices.length > 0) return 'Competencias a elegir';
  if (pass.included.length > 0) return pass.included.join(', ');
  return pass.passClass === 'general'
    ? 'Solo entrada al evento, sin competencias'
    : 'Sin competencias';
}

const requiredNames: Record<RequiredPassClass, string> = {
  full: 'un pase completo',
  general: 'una entrada general',
};

const joinsNames: Record<RequiredPassClass, string> = {
  full: 'al pase completo',
  general: 'a la entrada general',
};

// Whether an add-on can be chosen with the chosen base pass, and the line under it.
export function addOnState(
  addOn: StepperPass,
  base: StepperPass | null,
): { available: boolean; hint: string } {
  const required = addOn.requiresPassClass;
  const available = !required || base?.passClass === required;
  if (!available) return { available, hint: `Requiere ${requiredNames[required]}.` };
  const joins = required ? `Se suma ${joinsNames[required]}.` : 'Se suma a la inscripción.';
  return {
    available,
    hint: addOn.included.length > 0 ? `${addOn.included.join(', ')}. ${joins}` : joins,
  };
}

// The pass step's choice: one base pass, its add-ons and the competitions of each, by pass type.
export type PassDraft = {
  baseId: string | null;
  addOnIds: string[];
  selections: Readonly<Record<string, readonly string[]>>;
};

export const emptyPassDraft: PassDraft = { baseId: null, addOnIds: [], selections: {} };

const findPass = (options: StepperPasses, id: string | null) =>
  [...options.bases, ...options.addOns].find((pass) => pass.passTypeId === id) ?? null;

// A new base pass drops the previous one's competitions and the add-ons it no longer allows.
export function chooseBase(draft: PassDraft, baseId: string, options: StepperPasses): PassDraft {
  if (draft.baseId === baseId) return draft;
  const base = findPass(options, baseId);
  const addOnIds = draft.addOnIds.filter((id) => {
    const addOn = findPass(options, id);
    return addOn !== null && addOnState(addOn, base).available;
  });
  const selections = Object.fromEntries(
    Object.entries(draft.selections).filter(([id]) => addOnIds.includes(id)),
  );
  return { baseId, addOnIds, selections };
}

export function toggleAddOn(draft: PassDraft, addOnId: string, options: StepperPasses): PassDraft {
  if (draft.addOnIds.includes(addOnId)) {
    const selections = { ...draft.selections };
    delete selections[addOnId];
    return { ...draft, addOnIds: draft.addOnIds.filter((id) => id !== addOnId), selections };
  }
  const addOn = findPass(options, addOnId);
  if (!addOn || !addOnState(addOn, findPass(options, draft.baseId)).available) return draft;
  return { ...draft, addOnIds: [...draft.addOnIds, addOnId] };
}

export function toggleChoice(draft: PassDraft, passTypeId: string, activityId: string): PassDraft {
  const current = draft.selections[passTypeId] ?? [];
  const next = current.includes(activityId)
    ? current.filter((id) => id !== activityId)
    : [...current, activityId];
  return { ...draft, selections: { ...draft.selections, [passTypeId]: next } };
}

// What a resumed registration already holds, as a draft.
export function draftFromHeld(held: readonly HeldPass[]): PassDraft {
  const base = held.find((pass) => pass.passClass !== 'add_on') ?? null;
  return {
    baseId: base?.passTypeId ?? null,
    addOnIds: held.filter((pass) => pass.passClass === 'add_on').map((pass) => pass.passTypeId),
    selections: Object.fromEntries(held.map((pass) => [pass.passTypeId, pass.selections])),
  };
}

export function draftTotalCents(draft: PassDraft, options: StepperPasses): number {
  return [draft.baseId, ...draft.addOnIds].reduce(
    (total, id) => total + (findPass(options, id)?.priceCents ?? 0),
    0,
  );
}

const sameSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

export type PassPlan = {
  // Add-ons first, so no removal leaves an add-on without the pass it requires.
  remove: HeldPass[];
  // The base first, for the same reason.
  add: string[];
  // Only the passes whose competitions change, by pass type.
  selections: { passTypeId: string; activityIds: string[] }[];
};

// The writes that turn what the registration holds into the draft.
export function passPlan(held: readonly HeldPass[], draft: PassDraft): PassPlan {
  const wanted = [draft.baseId, ...draft.addOnIds].filter((id): id is string => id !== null);
  const remove = held
    .filter((pass) => !wanted.includes(pass.passTypeId))
    .sort(
      (left, right) => Number(right.passClass === 'add_on') - Number(left.passClass === 'add_on'),
    );
  const add = wanted.filter((id) => !held.some((pass) => pass.passTypeId === id));
  const selections = wanted.flatMap((passTypeId) => {
    const activityIds = [...(draft.selections[passTypeId] ?? [])];
    const saved = held.find((pass) => pass.passTypeId === passTypeId)?.selections ?? [];
    return sameSet(activityIds, saved) ? [] : [{ passTypeId, activityIds }];
  });
  return { remove, add, selections };
}

export type CobroLine = { key: string; name: string; detail: string; priceCents: number };

// The cash step's summary: each held pass with its competitions and the price it was charged.
export function cobroLines(held: readonly HeldPass[], options: StepperPasses): CobroLine[] {
  return held.map((pass) => {
    const type = findPass(options, pass.passTypeId);
    const chosen = (type?.choices ?? [])
      .filter((choice) => pass.selections.includes(choice.activityId))
      .map((choice) => choice.name);
    const missing = pass.selections.length - chosen.length;
    const names = [...chosen, ...Array<string>(missing).fill('Competencia no disponible')];
    let detail: string;
    if (names.length > 0) detail = names.join(', ');
    else if (type && type.included.length > 0) detail = type.included.join(', ');
    else if (pass.passClass === 'general') detail = 'Entrada al evento';
    else detail = 'Sin competencias elegidas';
    return { key: pass.registrationPassId, name: pass.name, detail, priceCents: pass.priceCents };
  });
}

// "Monto recibido": prefilled with the total and only explained when it differs (#104 allows it).
export function receivedAmountHint(
  amountCents: number | null,
  totalCents: number,
): { tone: 'success' | 'warning' | 'muted'; text: string } {
  if (amountCents === null) return { tone: 'muted', text: 'Lo que recibiste en efectivo.' };
  if (amountCents === totalCents) return { tone: 'success', text: 'Coincide con el total.' };
  return {
    tone: 'warning',
    text: `No coincide con el total (${formatMxn(totalCents)}). Puedes continuar si así dice el recibo.`,
  };
}

export type StepperStep = { label: string; state: 'done' | 'current' | 'pending' };

const stepLabels = ['Participante', 'Pases', 'Cobro'];

export const stepperSteps = (current: 1 | 2 | 3): StepperStep[] =>
  stepLabels.map((label, index) => ({
    label,
    state: index + 1 < current ? 'done' : index + 1 === current ? 'current' : 'pending',
  }));

// A pass's competitions as the PUT sends them: in the order shown, only the ones still offered.
// A saved choice that is no longer selectable is dropped instead of being rejected again.
export function selectionPayload(
  options: StepperPasses,
  passTypeId: string,
  activityIds: readonly string[],
): string[] {
  const choices = findPass(options, passTypeId)?.choices ?? [];
  return choices.map((choice) => choice.activityId).filter((id) => activityIds.includes(id));
}

export type CobroForm = { amount: string; receipt: string; note: string };
export type CobroErrors = Partial<Record<keyof CobroForm, string>>;

const cobroMessages = {
  amount: 'Escribe un monto válido, por ejemplo 1500 o 1500.50.',
  zero: 'El monto debe ser mayor que $0.',
  receipt: 'Escribe el número impreso en el recibo.',
};

// The cash step's checks: a readable amount above $0 (it may differ from the total, #104) and the
// existing receipt and note limits of the cash confirmation.
export function cobroFormErrors(form: CobroForm): CobroErrors {
  const errors: CobroErrors = {};
  const amountCents = parseMxnToCents(form.amount);
  if (amountCents === null) errors.amount = cobroMessages.amount;
  else if (amountCents === 0) errors.amount = cobroMessages.zero;
  const cash = cashFormErrors({ receipt: form.receipt, note: form.note });
  if (!form.receipt.trim()) errors.receipt = cobroMessages.receipt;
  else if (cash.receipt) errors.receipt = cash.receipt;
  if (cash.note) errors.note = cash.note;
  return errors;
}

// The cash confirmation body with the typed amount. Call it once `cobroFormErrors` is empty.
export function cobroPaymentInput(form: CobroForm): CashPaymentInput {
  const input: CashPaymentInput = {
    amountCents: parseMxnToCents(form.amount) ?? 0,
    receipt: form.receipt.trim(),
  };
  const note = form.note.trim();
  if (note) input.note = note;
  return input;
}

export const contactLine = (contact: RegistrationContact) => `${contact.email} · ${contact.phone}`;

// The held passes in one line, for the confirmed folio card.
export const passSummary = (held: readonly HeldPass[]) => held.map((pass) => pass.name).join(' + ');

// The confirmed step's sentence. The email is shown apart, in bold, when this screen knows it.
export function confirmedLead(
  fullName: string,
  email: string | null,
): { text: string; email: string | null } {
  const lead = `La inscripción de ${fullName} quedó lista. Le enviamos la confirmación y el folio a `;
  return email ? { text: lead, email } : { text: `${lead}su correo.`, email: null };
}
