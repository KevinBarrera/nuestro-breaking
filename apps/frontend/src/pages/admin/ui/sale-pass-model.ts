import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  HeldPass,
} from '@/entities/admin-registration';
import {
  formatMxn,
  type CatalogPassType,
  type PassClass,
  type RequiredPassClass,
} from '@/entities/event-catalog';

// Pass picker of the in-person sale (#105): which passes can still be added and why the others
// cannot. It mirrors the backend's add-pass checks, in the same order, so the operator sees the
// reason before sending; the backend stays the authority.

export type SalePassOption = {
  passTypeId: string;
  name: string;
  passClass: PassClass;
  priceCents: number;
  // Why the backend would reject adding it, or null when it can be added.
  reason: string | null;
};

const requiresMessages: Record<RequiredPassClass, string> = {
  full: 'Primero agrega un pase completo.',
  general: 'Primero agrega una entrada general.',
};

function unavailableReason(passType: CatalogPassType, held: readonly HeldPass[]): string | null {
  if (held.some((pass) => pass.passTypeId === passType.id)) return 'Ya tiene este pase.';
  // Held passes of archived pass types count too: the rules are about what was purchased.
  const heldClasses = new Set(held.map((pass) => pass.passClass));
  if (passType.passClass === 'general' && heldClasses.has('full'))
    return 'El pase completo ya incluye la entrada general.';
  if (passType.passClass === 'full' && heldClasses.has('general'))
    return 'Ya tiene entrada general y el pase completo la incluye.';
  const required = passType.requiresPassClass;
  if (required && !heldClasses.has(required)) return requiresMessages[required];
  return null;
}

// The event's active pass types in catalog order; archived ones are not for sale.
export const salePassOptions = (
  passTypes: readonly CatalogPassType[],
  held: readonly HeldPass[],
): SalePassOption[] =>
  passTypes
    .filter((passType) => passType.status === 'active')
    .map((passType) => ({
      passTypeId: passType.id,
      name: passType.name,
      passClass: passType.passClass,
      priceCents: passType.priceCents,
      reason: unavailableReason(passType, held),
    }));

// No endpoint removes a pass yet (#256), so adding one is confirmed first (product owner,
// 2026-10-19).
export const addPassConfirmation = (option: SalePassOption) => ({
  title: `¿Agregar «${option.name}» por ${formatMxn(option.priceCents)}?`,
  consequence:
    'Después no podrás quitarlo desde esta pantalla. El cobro se hace al confirmar el pago.',
});

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const ruleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  registration_not_pending:
    'Esta inscripción ya no está pendiente de pago. Recarga para ver su estado.',
  registration_voided: 'Esta inscripción está anulada. Recarga para ver su estado.',
  pass_type_archived: 'Este pase ya no está a la venta. Recarga para ver los pases actuales.',
  pass_already_held: 'La inscripción ya tiene este pase. Recarga para ver sus pases actuales.',
  full_includes_general:
    'El pase completo ya incluye la entrada general. Recarga para ver sus pases actuales.',
  add_on_requires_full: 'Este pase requiere un pase completo. Recarga para ver sus pases actuales.',
  add_on_requires_general:
    'Este pase requiere una entrada general. Recarga para ver sus pases actuales.',
};

// The inline message of a failed add. `reload` offers "Recargar": a rule answer means the screen
// is stale, and a lost answer may have added the pass, so it is never retried blindly.
export function addPassFailure(failure: AdminRegistrationFailure): {
  message: string;
  reload: boolean;
} {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return {
        message: 'Sin acceso: tu cuenta no puede agregar pases en este evento.',
        reload: false,
      };
    case 'unknown':
      return {
        message:
          'No pudimos confirmar si el pase se agregó. Recarga la inscripción antes de intentarlo de nuevo.',
        reload: true,
      };
    case 'rule':
      return { message: ruleMessages[failure.code] ?? staleMessage, reload: true };
    case 'not_found':
      return {
        message: 'No encontramos este pase o la inscripción. Recarga para ver los datos actuales.',
        reload: true,
      };
    default:
      return { message: 'No pudimos agregar el pase. Intenta de nuevo.', reload: false };
  }
}
