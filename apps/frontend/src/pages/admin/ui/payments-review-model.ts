import type { FlaggedPaymentReason } from '@/entities/flagged-payments';

type ReasonCopy = { title: string; detail: string; action: string };

// Plain Spanish for each flagged reason (#230): what happened and what coordination does next.
// Refunds happen in Mercado Pago; this screen changes nothing.
export const reasonCopy: Record<FlaggedPaymentReason, ReasonCopy> = {
  approved_after_expiry_duplicate: {
    title: 'Pagó dos veces',
    detail:
      'El pago llegó cuando la inscripción ya había vencido y la persona ya tiene otra inscripción en el evento.',
    action: 'Revisa la otra inscripción y reembolsa uno de los pagos en Mercado Pago.',
  },
  approved_after_expiry_event_ended: {
    title: 'Pagó después del evento',
    detail: 'El pago llegó cuando la inscripción ya había vencido y el evento ya había terminado.',
    action: 'Contacta a la persona y reembolsa el pago en Mercado Pago.',
  },
  approved_after_confirmation: {
    title: 'Pago de más en una inscripción confirmada',
    detail: 'La inscripción ya estaba confirmada por otro pago o en efectivo.',
    action: 'Reembolsa este pago en Mercado Pago.',
  },
  approved_after_void: {
    title: 'Pagó una inscripción anulada',
    detail: 'La inscripción se anuló antes de que llegara el pago.',
    action:
      'Decide con coordinación si la persona se inscribe de nuevo o reembolsa el pago en Mercado Pago.',
  },
};

const statusLabels: Record<string, string> = {
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmada',
  voided: 'Anulada',
};

export function registrationStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

export function formatReceivedAt(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  })
    .format(new Date(iso))
    .replace('.', '');
}
