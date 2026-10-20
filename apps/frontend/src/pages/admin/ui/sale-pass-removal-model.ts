import type {
  AdminRegistrationFailure,
  AdminRegistrationRuleCode,
  HeldPass,
} from '@/entities/admin-registration';
import { formatMxn, type CatalogPassType } from '@/entities/event-catalog';

// Removing a held pass during the in-person sale (#282). It mirrors the backend's dependent
// add-on check so the operator sees what to remove first; the backend stays the authority.

// The held add-ons that require the removed pass's class when no other held pass keeps it.
// Without the event's pass types the requirement is unknown and the backend decides.
export function removalBlockers(
  held: readonly HeldPass[],
  removed: HeldPass,
  passTypes: readonly CatalogPassType[] | null,
): string[] {
  if (!passTypes) return [];
  const remaining = held.filter((pass) => pass.registrationPassId !== removed.registrationPassId);
  if (remaining.some((pass) => pass.passClass === removed.passClass)) return [];
  const requires = (pass: HeldPass) =>
    passTypes.find((passType) => passType.id === pass.passTypeId)?.requiresPassClass ?? null;
  return remaining.filter((pass) => requires(pass) === removed.passClass).map((pass) => pass.name);
}

export function removalBlockersHint(blockers: readonly string[]): string | null {
  if (blockers.length === 0) return null;
  const names = blockers.map((name) => `«${name}»`);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'requiere' : 'requieren';
  return `Quita primero ${list}, que ${verb} este pase.`;
}

export const removePassConfirmation = (pass: HeldPass) => ({
  title: `¿Quitar «${pass.name}»?`,
  consequence: `Se descuentan ${formatMxn(pass.priceCents)} del total. También se quitan las competencias elegidas con este pase.`,
});

const staleMessage = 'La inscripción cambió. Recarga para ver su estado.';

const ruleMessages: Partial<Record<AdminRegistrationRuleCode, string>> = {
  registration_not_pending:
    'Esta inscripción ya no está pendiente de pago. Recarga para ver su estado.',
  online_registration_pass_locked:
    'Esta inscripción se hizo en línea: sus pases no se pueden quitar.',
  pass_required_by_add_on:
    'Un pase adicional requiere este pase. Recarga para ver cuál quitar primero.',
};

// The inline message of a failed removal. `reload` offers "Recargar": a rule answer means the
// screen is stale, and a lost answer may have removed the pass, so it is never retried blindly.
export function removePassFailure(failure: AdminRegistrationFailure): {
  message: string;
  reload: boolean;
} {
  switch (failure.kind) {
    case 'unauthorized':
    case 'forbidden':
      return {
        message: 'Sin acceso: tu cuenta no puede quitar pases en este evento.',
        reload: false,
      };
    case 'unknown':
      return {
        message:
          'No pudimos confirmar si el pase se quitó. Recarga la inscripción antes de intentarlo de nuevo.',
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
      return { message: 'No pudimos quitar el pase. Intenta de nuevo.', reload: false };
  }
}
