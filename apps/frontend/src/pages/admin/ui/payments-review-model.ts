import { flaggedPaymentReasons, type FlaggedPaymentReason } from '@/entities/flagged-payments';
import type { StatusTone } from './team-model';

type ReasonCopy = { chip: string; title: string; detail: string; action: string };

// Plain Spanish for each flagged reason (#230, #340): the chip label, the case title, what
// happened and what coordination does next. Refunds happen in Mercado Pago; this screen changes
// nothing.
export const reasonCopy: Record<FlaggedPaymentReason, ReasonCopy> = {
  approved_after_expiry_duplicate: {
    chip: 'Pagó dos veces',
    title: 'Pagó dos veces',
    detail:
      'El pago llegó cuando la inscripción ya había vencido, y la persona ya tiene otra inscripción en el evento.',
    // Refund the flagged payment only: refunding the other one would leave a confirmed
    // registration whose money was returned, and a confirmation is never undone.
    action:
      'Reembolsa en Mercado Pago el pago de esta lista. No toques el de su otra inscripción: esa se conserva.',
  },
  approved_after_expiry_event_ended: {
    chip: 'Después del evento',
    title: 'Pagó después del evento',
    detail: 'El pago llegó cuando la inscripción ya había vencido y el evento ya había terminado.',
    action: 'Contacta a la persona y reembolsa el pago en Mercado Pago.',
  },
  approved_after_confirmation: {
    chip: 'Pago de más',
    title: 'Pago de más en una inscripción confirmada',
    detail: 'La inscripción ya estaba confirmada por otro pago o en efectivo.',
    action: 'Reembolsa este pago en Mercado Pago.',
  },
  approved_after_void: {
    chip: 'Inscripción anulada',
    title: 'Pagó una inscripción anulada',
    detail: 'La inscripción se anuló antes de que llegara el pago.',
    action:
      'Decide con coordinación si la persona se inscribe de nuevo o si reembolsas el pago en Mercado Pago.',
  },
};

type CasePayment = { reason: FlaggedPaymentReason; amountCents: number };

export type ReviewCase<T extends CasePayment> = {
  reason: FlaggedPaymentReason;
  payments: T[];
  amountCents: number;
};

export type CaseFilter = 'all' | FlaggedPaymentReason;

export const totalAmountCents = (payments: readonly CasePayment[]) =>
  payments.reduce((sum, payment) => sum + payment.amountCents, 0);

// One case per reason present, in a fixed order, so each action is written once (#230 L2). The
// payments keep the list order inside their case.
export function reviewCases<T extends CasePayment>(payments: readonly T[]): ReviewCase<T>[] {
  return flaggedPaymentReasons
    .map((reason) => {
      const inCase = payments.filter((payment) => payment.reason === reason);
      return { reason, payments: inCase, amountCents: totalAmountCents(inCase) };
    })
    .filter(({ payments: inCase }) => inCase.length > 0);
}

export function caseChips(
  cases: readonly ReviewCase<CasePayment>[],
): { id: CaseFilter; label: string; count: number }[] {
  return [
    {
      id: 'all',
      label: 'Todos los casos',
      count: cases.reduce((sum, { payments }) => sum + payments.length, 0),
    },
    ...cases.map(({ reason, payments }) => ({
      id: reason,
      label: reasonCopy[reason].chip,
      count: payments.length,
    })),
  ];
}

export function visibleCases<T extends CasePayment>(
  cases: readonly ReviewCase<T>[],
  filter: CaseFilter,
): ReviewCase<T>[] {
  return cases.filter(({ reason }) => filter === 'all' || filter === reason);
}

// A long list opens with its cases closed, so the case cards and their actions fit first.
export const startsCollapsed = (paymentCount: number) => paymentCount > 8;

export const paymentCountText = (count: number) => (count === 1 ? '1 pago' : `${count} pagos`);

const statusLabels: Record<string, string> = {
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmada',
  voided: 'Anulada',
};

export function registrationStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

export function statusTone(status: string): StatusTone {
  if (status === 'confirmed') return 'success';
  if (status === 'pending_payment') return 'warning';
  return 'neutral';
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
