import type {
  PublicEventFailure,
  PublicPass,
  PublicSalesClosedReason,
  RegistrationRequest,
  RegistrationRuleCode,
} from '@/entities/public-event';
import {
  buyerFields,
  buyerMaxLength,
  buyerMessages,
  buyerPayload,
  type BuyerErrors,
  type BuyerField,
  type BuyerForm,
} from './buyer-form';
import { normalizeSelection, type PurchaseSelection } from './purchase-selection';

// The POST body: chosen passes in catalog order, each with its picked competitions when any.
export function buildRegistrationRequest(
  passes: PublicPass[],
  selection: PurchaseSelection,
  buyer: BuyerForm,
): RegistrationRequest {
  const normalized = normalizeSelection(passes, selection);
  return {
    buyer: buyerPayload(buyer),
    passes: normalized.passTypeIds.map((passTypeId) => {
      const picked = normalized.selectedActivityIds[passTypeId];
      return picked ? { passTypeId, selectedActivityIds: picked } : { passTypeId };
    }),
  };
}

function buyerMessage(field: BuyerField, code: string): string {
  const limit = buyerMaxLength[field];
  if (code === 'required') return buyerMessages.required[field] ?? buyerMessages.fallback;
  if (code === 'invalid' && field in buyerMessages.invalid)
    return buyerMessages.invalid[field as keyof typeof buyerMessages.invalid];
  if (code === 'too_long' && limit) return buyerMessages.tooLong(limit);
  if (code === 'in_future') return buyerMessages.inFuture;
  return buyerMessages.fallback;
}

export type ServerErrors = {
  buyer: BuyerErrors;
  // One message for any problem under `passes`, and one for anything else (`body`, unknown keys).
  passes: string | null;
  other: string | null;
};

const isBuyerField = (value: string): value is BuyerField =>
  buyerFields.some((field) => field === value);

/** Maps a 400 `fieldErrors` record (path → code) to the messages the screens show. */
export function serverErrors(fieldErrors: Record<string, string>): ServerErrors {
  const errors: ServerErrors = { buyer: {}, passes: null, other: null };
  for (const [path, code] of Object.entries(fieldErrors)) {
    const field = path.startsWith('buyer.') ? path.slice('buyer.'.length) : null;
    if (field && isBuyerField(field) && code !== 'unknown_field')
      errors.buyer[field] = buyerMessage(field, code);
    else if (path === 'passes' || path.startsWith('passes['))
      errors.passes = 'Algo cambió en tus pases. Vuelve a elegirlos e intenta de nuevo.';
    else errors.other = 'No pudimos procesar tu compra. Revisa tus datos e intenta de nuevo.';
  }
  return errors;
}

const salesClosedMessages: Record<PublicSalesClosedReason, string> = {
  disabled: 'La venta en línea está cerrada por ahora.',
  not_yet_open: 'La venta en línea todavía no abre.',
  ended: 'La venta en línea ya terminó.',
};

const ruleMessages: Record<RegistrationRuleCode, string> = {
  pass_type_unavailable: 'Uno de tus pases ya no está disponible. Vuelve a elegir tus pases.',
  general_with_full:
    'La entrada general ya está incluida en los pases completos. Quítala para continuar.',
  required_pass_missing:
    'Uno de tus pases adicionales requiere un pase completo. Agrega uno o quita el adicional.',
  selection_unavailable:
    'Una de tus competencias ya no está disponible. Vuelve a elegir tus competencias.',
};

// One Spanish sentence per failure, for notices on the purchase screens.
export function failureMessage(failure: PublicEventFailure): string {
  switch (failure.kind) {
    case 'not-found':
      return 'No encontramos este evento.';
    case 'sales-closed':
      return salesClosedMessages[failure.reason];
    case 'invalid':
      return 'Revisa los datos marcados.';
    case 'rule':
      return ruleMessages[failure.code];
    case 'unavailable':
      return 'No podemos completar esta inscripción en línea. Comunícate con la organización.';
    case 'not-payable':
      return 'Esta inscripción ya no se puede pagar en línea. Si ya pagaste, revisa tu correo; si no, comunícate con la organización.';
    case 'provider-unavailable':
      return 'Mercado Pago no respondió. Intenta de nuevo en un momento.';
    case 'rate-limited':
      return 'Hiciste muchos intentos seguidos. Espera un minuto e intenta de nuevo.';
    case 'error':
      return 'No pudimos completar la solicitud. Revisa tu conexión e intenta de nuevo.';
  }
}
